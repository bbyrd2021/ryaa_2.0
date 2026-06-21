import os

from fastapi import Depends, Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlmodel import Session, select

from ryaa.db import get_session
from ryaa.db_models import User


def verify_google_id_token(token: str) -> dict:
    # check signature, expiry, AND audience (== our client ID); raise ValueError if bad
    client_id = os.environ["GOOGLE_CLIENT_ID"]
    return google_id_token.verify_oauth2_token(
        token, google_requests.Request(), client_id
    )


def current_user(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")
    try:
        claims = verify_google_id_token(authorization.removeprefix("Bearer ").strip())
    except ValueError:
        raise HTTPException(401, "Invalid or expired Google ID token")

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
    return user
