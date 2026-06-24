import os
import uuid

from fastapi import Depends, Header, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlmodel import Session

from ryaa.db import get_session
from ryaa.db_models import User
from ryaa.session import verify_session


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
        user_id = verify_session(authorization.removeprefix("Bearer ").strip())
    except Exception:
        raise HTTPException(401, "Invalid or expired session")

    user = session.get(User, uuid.UUID(user_id))
    if user is None:
        raise HTTPException(401, "User not found")
    return user
