from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from typing import Literal

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ryaa.db import init_db
from ryaa.factory import build_scheduler
from ryaa.orchestrator import ProposeResult, ScheduleResult
from ryaa.providers.base import Message
from ryaa.providers.openai_provider import OpenAIProvider
from ryaa.tools.calendar_tool import EventDetails

logger = logging.getLogger(__name__)

load_dotenv()
scheduler = build_scheduler()


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


@app.post("/propose")
def propose(req: ProposeRequest) -> ProposeResult:
    history = [Message(role=m.role, content=m.content) for m in req.messages]
    return scheduler.chat(history)


@app.post("/confirm")
def confirm(req: ConfirmRequest) -> ScheduleResult:
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
