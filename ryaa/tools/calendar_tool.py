from __future__ import annotations

import logging
from typing import Protocol

from ryaa.skills.calendar import EventDetails

logger = logging.getLogger(__name__)


class CalendarBackend(Protocol):
    """Contract for 'somewhere events get created.' Stub now, Outlook later."""

    def create_event(self, event: EventDetails) -> str: ...  # returns the event ID


class StubCalendar:
    """Fake Backend: pretends to create the event, but just logs it."""

    def create_event(self, event: EventDetails) -> str:
        logger.info(
            "STUB created event: %s @ %s (%d min)",
            event.name,
            event.start,
            event.duration_minutes,
        )
        return "stub-event-id"
