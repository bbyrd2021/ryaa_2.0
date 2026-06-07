"""
Calendar CODE — the single home for everything the calendar *does*.

Per the tools-vs-skills split: this is the **tool** layer (it does work), so it owns:
  - the event data models (EventExtraction / EventDetails / EventConfirmation),
  - the LLM parser `CalendarParser` (extract -> gate -> parse -> confirm), and
  - the calendar backends (AppleCalendar via osascript, StubCalendar for tests).

Guidance on *how* the agent uses these lives in `ryaa/skills/` (the skill layer).
"""

from __future__ import annotations

import logging
import subprocess
from datetime import datetime, timedelta
from typing import Protocol

from pydantic import BaseModel, Field

from ryaa.providers.base import LLMProvider, Message
from ryaa.tools.event_state import EventState

logger = logging.getLogger(__name__)

# Confidence below this and we refuse to treat the input as a calendar event.
CONFIDENCE_THRESHOLD = 0.7


# --------------------------------------------------------------------------- #
# Data models — one per stage of the parser chain
# --------------------------------------------------------------------------- #


class EventExtraction(BaseModel):
    """Stage 1: is this even a calendar request, and how sure are we?"""

    description: str = Field(description="Raw description of the event")
    is_calendar_event: bool = Field(
        description="Whether this text describes a calendar event"
    )
    confidence_score: float = Field(description="Confidence between 0 and 1")


class EventDetails(BaseModel):
    """Stage 2: the structured event. Note `start` is a real datetime."""

    name: str = Field(description="Name of the event")
    start: datetime = Field(
        description="Start date and time in ISO 8601 (e.g. 2026-06-03T14:00:00)"
    )
    duration_minutes: int = Field(description="Expected duration in minutes")
    participants: list[str] = Field(description="List of participant names")


class EventConfirmation(BaseModel):
    """Stage 3: a friendly natural-language confirmation for the user."""

    confirmation_message: str = Field(
        description="Natural language confirmation message"
    )


class EventRef(EventDetails):
    """An existing event = EventDetails' content (inherited) + its id + optional RYAA state."""

    id: str
    state: EventState | None = None  # provenance from the store; None = pre-existing/external

# --------------------------------------------------------------------------- #
# The LLM parser (workflow-era brain; used by the CLI path)
# --------------------------------------------------------------------------- #


class CalendarParser:
    def __init__(self, provider: LLMProvider, model: str | None = None):
        # We depend on the CONTRACT (LLMProvider), not a concrete vendor class.
        # Whoever constructs CalendarParser decides which provider to inject.
        self.provider = provider
        self.model = model  # None => let the provider use its default

    def _date_context(self) -> str:
        """Give the model 'today' so it can resolve 'next Tuesday' correctly.

        This is the fix for the hallucinated-year problem: the model can't know
        the date unless we tell it.
        """
        today = datetime.now()
        return f"Today is {today.strftime('%A, %B %d, %Y')}."

    # ----- Stage 1: extract + gate ----------------------------------------- #

    def extract_event_info(self, user_input: str) -> EventExtraction:
        """First call: classify whether this is a calendar event."""
        logger.info("Extracting event info")
        result = self.provider.structured(
            messages=[
                Message(
                    role="system",
                    content=f"{self._date_context()} "
                    "Analyze whether the text describes a calendar event.",
                ),
                Message(role="user", content=user_input),
            ],
            schema=EventExtraction,
            model=self.model,
        )
        logger.info(
            "Extraction: is_event=%s confidence=%.2f",
            result.is_calendar_event,
            result.confidence_score,
        )
        return result

    # ----- Stage 2: parse details ------------------------------------------ #

    def parse_event_details(self, description: str) -> EventDetails:
        """Second call: pull out name/start/duration/participants."""
        logger.info("Parsing event details")
        result = self.provider.structured(
            messages=[
                Message(
                    role="system",
                    content=f"{self._date_context()} Extract detailed event information."
                    "When dates reference 'next Tuesday' or similar relative dates, use this current date as reference."
                    "Only include participants who are explicitly named. If no one else is mentioned, returnn empty list.",
                ),
                Message(
                    role="user",
                    content=description,
                ),
            ],
            schema=EventDetails,
            model=self.model,
        )
        logger.info(
            "Parsed event details - Name: %s, Start: %s",
            result.name,
            result.start,
        )
        return result

    # ----- Stage 3: confirmation ------------------------------------------- #

    def generate_confirmation(self, event: EventDetails) -> EventConfirmation:
        """Third call: write a friendly confirmation."""
        logger.info("Generating confirmation")
        result = self.provider.structured(
            messages=[
                Message(
                    role="system",
                    content="Generate a natural confirmation message for the event. Sign off as RYAA.",
                ),
                Message(
                    role="user",
                    content=f"{event.model_dump_json()}",
                ),
            ],
            schema=EventConfirmation,
            model=self.model,
        )
        logger.info("Confirmation generated successfully")
        return result

    # ----- The chain (note the GATE) --------------------------------------- #

    def prepare(self, user_input: str) -> EventDetails | None:
        """Extract -> gate -> parse. Returns the structured event, or None if the gate rejects."""
        extraction = self.extract_event_info(user_input)
        if (
            not extraction.is_calendar_event
            or extraction.confidence_score < CONFIDENCE_THRESHOLD
        ):
            logger.warning(
                "Gate failed: is_event=%s confidence=%.2f",
                extraction.is_calendar_event,
                extraction.confidence_score,
            )
            return None
        return self.parse_event_details(extraction.description)

    def process(self, user_input: str) -> EventConfirmation | None:
        """Full chain: (kept for the friendly-message path)."""
        details = self.prepare(user_input)
        if details is None:
            return None
        return self.generate_confirmation(details)


# --------------------------------------------------------------------------- #
# Backends — where events actually get created/read
# --------------------------------------------------------------------------- #


class CalendarBackend(Protocol):
    """Contract for 'somewhere events get created.' Stub now, Outlook later."""

    def create_event(self, event: EventDetails) -> str: ...  # returns the event ID
    def list_events(self, start: datetime, end: datetime) -> list[EventRef]: ...


class StubCalendar:
    """Fake Backend: pretends to create the event, but just logs it."""

    # Illustrative fixtures (next Tuesday relative to early June 2026).
    _FAKE_EVENTS = [
        EventRef(
            id="stub-standup",
            name="Team standup",
            start=datetime(2026, 6, 9, 9, 0),
            duration_minutes=30,
            participants=["Team"],
        ),
        EventRef(
            id="stub-dentist",
            name="Dentist",
            start=datetime(2026, 6, 9, 12, 0),
            duration_minutes=60,
            participants=[],
        ),
    ]

    def create_event(self, event: EventDetails) -> str:
        logger.info(
            "STUB created event: %s @ %s (%d min)",
            event.name,
            event.start,
            event.duration_minutes,
        )
        return "stub-event-id"

    def list_events(self, start: datetime, end: datetime) -> list[EventRef]:
        return [e for e in self._FAKE_EVENTS if start <= e.start <= end]


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

    def list_events(self, start: datetime, end: datetime) -> list[EventRef]:
        script = _build_list_script(self.calendar_name, start, end)
        result = subprocess.run(
            ["osascript", "-e", script], capture_output=True, text=True
        )
        if result.returncode != 0:
            raise RuntimeError(f"Calendar list failed: {result.stderr.strip()}")
        events: list[EventRef] = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) != 4:
                continue
            name, secs, dur, uid = parts
            events.append(
                EventRef(
                    id=uid,
                    name=name,
                    start=datetime(1970, 1, 1) + timedelta(seconds=float(secs)),
                    duration_minutes=int(float(dur)),
                    participants=[],
                )
            )
        return events


def _build_list_script(cal, start, end):
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
        set refDate to current date
        set day of refDate to 1
        set year of refDate to 1970
        set month of refDate to 1
        set day of refDate to 1
        set hours of refDate to 0
        set minutes of refDate to 0
        set seconds of refDate to 0
        set out to ""
        tell application "Calendar"
            tell calendar "{cal}"
                set theEvents to (every event whose start date is greater than or equal to startDate and start date is less than or equal to endDate)
                repeat with e in theEvents
                    set s to start date of e
                    set en to end date of e
                    set secs to (s - refDate)
                    set durMin to ((en - s) / 60) as integer
                    set out to out & (summary of e) & tab & secs & tab & durMin & tab & (uid of e) & linefeed
                end repeat
            end tell
        end tell
        return out
    """


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
