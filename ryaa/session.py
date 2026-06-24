import os
import time

import jwt

_ALG = "HS256"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


def issue_session(user_id: str) -> str:
    now = int(time.time())
    payload = {"sub": user_id, "iat": now, "exp": now + SESSION_TTL_SECONDS}
    return jwt.encode(payload, os.environ["SESSION_SECRET"], algorithm=_ALG)


def verify_session(token: str) -> str:
    payload = jwt.decode(token, os.environ["SESSION_SECRET"], algorithms=[_ALG])
    return payload["sub"]
