"""
Calendar skill — the "scheduling brain."

This is your 1-prompt-chaining.py calendar assistant, rebuilt three ways for
production:

1. MODEL-AGNOSTIC: it never imports OpenAI. It is *handed* an LLMProvider and
   only calls provider.structured(...). Swap the provider -> the skill moves to
   a new model with zero changes here. (This is dependency injection.)

2. REAL DATES: the tutorial stored `date: str` (which gave us the hallucinated
   "December 12, 2023"). We use a real `datetime`, so Pydantic validates it and
   downstream code — including the eventual Outlook/Graph call — gets a true
   timestamp, not prose.

3. STUB-FIRST: this file produces a validated event + confirmation. It does NOT
   talk to Outlook yet. The real create_event tool gets swapped in later, behind
   an interface, so none of this logic has to change.

The chain (unchanged from what you learned):
    extract -> GATE CHECK -> parse details -> generate confirmation
"""

from __future__ import annotations

import logging
from datetime import datetime

from pydantic import BaseModel, Field

from ryaa.providers.base import LLMProvider, Message

logger = logging.getLogger(__name__)

# Confidence below this and we refuse to treat the input as a calendar event.
# Named constant, not a magic number buried in an if-statement.
CONFIDENCE_THRESHOLD = 0.7


# --------------------------------------------------------------------------- #
# Schemas — one per stage of the chain (the "structured output" building block)
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


# --------------------------------------------------------------------------- #
# The skill
# --------------------------------------------------------------------------- #


class CalendarSkill:
    def __init__(self, provider: LLMProvider, model: str | None = None):
        # We depend on the CONTRACT (LLMProvider), not a concrete vendor class.
        # Whoever constructs CalendarSkill decides which provider to inject.
        self.provider = provider
        self.model = model  # None => let the provider use its default

    def _date_context(self) -> str:
        """Give the model 'today' so it can resolve 'next Tuesday' correctly.

        This is the fix for the hallucinated-year problem: the model can't know
        the date unless we tell it.
        """
        today = datetime.now()
        return f"Today is {today.strftime('%A, %B %d, %Y')}."

    # ----- Stage 1: extract + gate (FULLY WORKED — your template) ----------- #

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

    # ----- Stage 2: parse details (YOUR TURN) ------------------------------- #

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

    # ----- Stage 3: confirmation (YOUR TURN) -------------------------------- #

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

    # ----- The chain (FULLY WORKED — note the GATE) ------------------------- #

    def prepare(self, user_input: str) -> EventDetails | None:
        """Extract -> gate -> parse. Returns the structured event, or None of the gate rejects."""
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
