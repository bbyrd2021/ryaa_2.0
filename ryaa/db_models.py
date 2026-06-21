import uuid
from datetime import datetime, timezone

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("auth_provider", "provider_subject"),)
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    auth_provider: str = Field(index=True)  # "google"
    provider_subject: str = Field(index=True)
    email: str | None = None
    timezone: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)


class ProviderConnection(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    provider: str
    credentials: str | None = None  # encrypted refresh token — filled in Phase 3
    scopes: str = ""
    created_at: datetime = Field(default_factory=_utcnow)
