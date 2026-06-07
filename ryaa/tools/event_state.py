"""
Event state store — RYAA's record of which events it created/modified, and when.

Lives in tools/ (it's *code* that does work). Keyed by the calendar event id, so it
distinguishes RYAA's own events from pre-existing ones. In-memory for now; swap for a
JSON/SQLite implementation later behind the `EventStore` Protocol — nothing else changes.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol

from pydantic import BaseModel


class EventState(BaseModel):
    status: Literal["created", "modified"]
    created_at: datetime
    modified_at: datetime | None = None


class EventStore(Protocol):
    def mark_created(self, event_id: str) -> None: ...
    def mark_modified(self, event_id: str) -> None: ...
    def get(self, event_id: str) -> EventState | None: ...


class InMemoryEventStore:
    """Stub-first: a dict. Swap for a JSON/SQLite store behind this same interface later."""

    def __init__(self) -> None:
        self._states: dict[str, EventState] = {}

    def mark_created(self, event_id: str) -> None:
        self._states[event_id] = EventState(status="created", created_at=datetime.now())

    def mark_modified(self, event_id: str) -> None:
        existing = self._states.get(event_id)
        now = datetime.now()
        if existing is None:
            self._states[event_id] = EventState(
                status="modified", created_at=now, modified_at=now
            )
        else:
            existing.status = "modified"
            existing.modified_at = now

    def get(self, event_id: str) -> EventState | None:
        return self._states.get(event_id)
