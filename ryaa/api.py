from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Literal
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ryaa.auth import current_user, verify_google_id_token
from ryaa.crypto import encrypt
from ryaa.db import get_session, init_db
from ryaa.db_models import ProviderConnection, User
from ryaa.factory import build_scheduler_for
from ryaa.orchestrator import ProposeResult, Scheduler, ScheduleResult
from ryaa.providers.base import Message
from ryaa.providers.openai_provider import OpenAIProvider
from ryaa.session import issue_session
from ryaa.tools.calendar_tool import EventDetails

logger = logging.getLogger(__name__)

load_dotenv()

PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
GOOGLE_SCOPES = (
    "openid email profile "
    "https://www.googleapis.com/auth/calendar.events "
    "https://www.googleapis.com/auth/tasks"
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()  # create tables on startup; create_all is a no-op if they already exist
    yield


app = FastAPI(
    title="RYAA API",
    description="API for the RYAA scheduling assistant",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID")
voice_provider = OpenAIProvider()


class TranscribeResult(BaseModel):
    text: str


class SpeakRequest(BaseModel):
    text: str


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ProposeRequest(BaseModel):
    messages: list[ChatTurn] = Field(
        description="The whole transcript the browser holds"
    )


class ConfirmRequest(BaseModel):
    action: Literal["create", "modify"] = "create"
    event: EventDetails
    event_id: str | None = None  # the event to change (when action == "modify")


class ConnectRequest(BaseModel):
    code: str
    redirect_uri: str
    code_verifier: str | None = (
        None  # PKCE (Expo app sends this); optional for manual testing
    )
    timezone: str | None = (
        None  # client's IANA tz (calendar.events can't read calendar metadata)
    )


def _connect_with_code(
    code: str,
    redirect_uri: str,
    session: Session,
    timezone: str | None = None,
    code_verifier: str | None = None,
) -> User:
    """Exchange an auth code, upsert the user + encrypted refresh token, return the User."""
    data = {
        "code": code,
        "client_id": os.environ["GOOGLE_CLIENT_SECRET"],
        "client_secret": os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }

    if code_verifier:
        data["code_verifier"] = code_verifier
    resp = requests.post("https://oauth2.googleapis.com/token", data=data)

    if resp.status_code != 200:
        raise HTTPException(400, f"Token exchange failed: {resp.text}")
    tokens = resp.json()

    refresh_token = tokens.get("refresh_token")

    if not refresh_token:
        raise HTTPException(
            400, "No refresh token; re-consent with offline access + prompt=consent."
        )

    id_token = tokens.get("id_token")
    if not id_token:
        raise HTTPException(400, "No id_token returned from Google.")

    claims = verify_google_id_token(id_token)
    sub = claims["sub"]
    user = session.exec(
        select(User).where(User.auth_provider == "google", User.provider_subject == sub)
    ).first()

    if user is None:
        user = User(
            auth_provider="google", provider_subject=sub, email=claims.get("email")
        )
        session.add(user)
        session.commit()
        session.refresh(user)

    conn = session.exec(
        select(ProviderConnection).where(
            ProviderConnection.user_id == user.id,
            ProviderConnection.provider == "google",
        )
    ).first()
    if conn is None:
        conn = ProviderConnection(user_id=user.id, provider="google")
    conn.Credentials = encrypt(refresh_token)
    conn.scopes = tokens.get("scope", "")
    if timezone:
        user.timezone = timezone
    session.add(conn)
    session.add(user)
    session.commit()
    return user


def user_scheduler(
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> Scheduler:
    conn = session.exec(
        select(ProviderConnection).where(
            ProviderConnection.user_id == user.id,
            ProviderConnection.provider == "google",
        )
    ).first()
    if conn is None or not conn.credentials:
        raise HTTPException(
            409, "No calendar connected — connect Google Calendar first."
        )
    return build_scheduler_for(user, conn)


app.post("/connect/google")


def connect_google(req: ConnectRequest, session: Session = Depends(get_session)):
    user = _connect_with_code(
        req.code, req.redirect_uri, session, req.timezone, req.code_verifier
    )
    return {"session_token": issue_session(str(user.id)), "timezone": user.timezone}


@app.get("/auth/google/start")
def auth_google_start(return_url: str):
    # return_url is the app's deep link (exp://… in Expo Go, ryaa://… in a real build)
    if not (return_url.startswith("exp://") or return_url.startswith("ryaa://")):
        raise HTTPException(400, "invalid return_url")
    params = {
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri": f"{PUBLIC_BASE_URL}/auth/google/callback",
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": return_url,  # round-tripped so the callback knows where to send the user back
    }
    return RedirectResponse(
        "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params)
    )


@app.get("/auth/google/callback")
def auth_google_callback(
    code: str, state: str, session: Session = Depends(get_session)
):
    user = _connect_with_code(code, f"{PUBLIC_BASE_URL}/auth/google/callback", session)
    token = issue_session(str(user.id))
    sep = "&" if "?" in state else "?"
    return RedirectResponse(
        f"{state}{sep}session_token={token}"
    )  # deep-link back to the app


@app.get("/debug/google-creds")
def debug_google_creds():
    # TEMPORARY diagnostic — probes THIS deployment's own Google creds. Remove after.
    cid = os.environ.get("GOOGLE_CLIENT_ID", "")
    csec = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    r = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": "dummy",
            "client_id": cid,
            "client_secret": csec,
            "redirect_uri": f"{PUBLIC_BASE_URL}/auth/google/callback",
            "grant_type": "authorization_code",
        },
    )
    return {
        "client_id_prefix": cid[:24],
        "client_id_len": len(cid),
        "secret_prefix": csec[:7],
        "secret_len": len(csec),
        "secret_has_quote": '"' in csec,
        "secret_has_stray_space": csec != csec.strip(),
        "public_base_url": PUBLIC_BASE_URL,
        # invalid_grant = creds VALID (dummy code rejected); invalid_client = creds BAD
        "google_verdict": r.json().get("error"),
    }


@app.post("/propose")
def propose(
    req: ProposeRequest, scheduler: Scheduler = Depends(user_scheduler)
) -> ProposeResult:
    history = [Message(role=m.role, content=m.content) for m in req.messages]
    return scheduler.chat(history)


@app.post("/confirm")
def confirm(
    req: ConfirmRequest, scheduler: Scheduler = Depends(user_scheduler)
) -> ScheduleResult:
    try:
        if req.action == "modify" and req.event_id:
            return scheduler.update(req.event_id, req.event)
        return scheduler.create(req.event)
    except RuntimeError as e:
        logger.warning("Confirm failed: %s", e)
        return ScheduleResult(status="failed", message=str(e))


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...)) -> TranscribeResult:
    data = file.file.read()
    if not data:
        return TranscribeResult(text="")
    text = voice_provider.transcribe(data, file.filename or "speech.wav")
    return TranscribeResult(text=text)


@app.post("/speak")
def speak(req: SpeakRequest):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(503, "ELEVENLABS_API_KEY not configured")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}/stream"
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    params = {"output_format": "mp3_44100_128"}
    payload = {
        "text": req.text,
        "model_id": "eleven_flash_v2_5",
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
            "speed": 1.0,
        },
    }

    # stream=True returns once headers arrive → surface a bad key/quota before streaming.
    r = requests.post(url, headers=headers, params=params, json=payload, stream=True)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return StreamingResponse(r.iter_content(chunk_size=4096), media_type="audio/mpeg")
