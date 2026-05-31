from __future__ import annotations

import logging
import subprocess
from datetime import timedelta
from typing import Protocol

from ryaa.skills.calendar import EventDetails

logger = logging.getLogger(__name__)


class AppleCalendar:
    def __init__(self, calendar_name: str = "Home"):
        self.calendar_name = calendar_name

    def create_event(self, event: EventDetails) -> str:
        end = event.start + timedelta(minutes=event.duration_minutes)
        summary = event.name.replace("\\", "\\\\").replace('"', '\\"')
        script = _build_script(self.calendar_name, summary, event.start, end)
        result = subprocess.run(
            ["osascript", "-e", script], capture_output=True, text=True
        )
        if result.returncode != 0:
            raise RuntimeError(f"Calendar create failed: {result.stderr.strip()}")
        return result.stdout.strip()


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


def _build_script(cal, summary, start, end):
    return f"""
        set startDate to current date
        set day of startDate to 1
        set year of startDate to {start.year}
        set month of startDate to {start.month}
        set day of startDate to {start.day}
        set hours of startDate to {start.hour}
        set minutes of startDate to {start.minute}
        set seconds of startDate to 0
        set endDate to current date
        set day of endDate to 1
        set year of endDate to {end.year}
        set month of endDate to {end.month}
        set day of endDate to {end.day}
        set hours of endDate to {end.hour}
        set minutes of endDate to {end.minute}
        set seconds of endDate to 0
        tell application "Calendar"
            tell calendar "{cal}"
                set newEvent to make new event with properties {{summary:"{summary}", start date:startDate, end date:endDate}}
                return uid of newEvent
            end tell
        end tell
    """
