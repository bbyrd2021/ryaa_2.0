from __future__ import annotations

import os

from ryaa.agent import Agent
from ryaa.crypto import decrypt
from ryaa.db_models import ProviderConnection, User
from ryaa.orchestrator import Scheduler
from ryaa.providers.openai_provider import OpenAIProvider
from ryaa.safety.guardrails import Guardrails
from ryaa.skills.calendar_skill import CalendarSkill  # agent skill (guidance)
from ryaa.skills.todo_skill import TodoSkill
from ryaa.tools.calendar_tool import (  # noqa: F401
    AppleCalendar,
    CalendarParser,
    StubCalendar,
)
from ryaa.tools.event_state import InMemoryEventStore
from ryaa.tools.google_calendar import GoogleCalendarBackend


def build_scheduler(confirmer=None) -> Scheduler:
    """Assemble a Scheduler. CLI passes a CLIConfirm; the API passes nothing
    (the browser is the confirmer)."""
    provider = OpenAIProvider()
    backend = (
        StubCalendar() if os.getenv("RYAA_CALENDAR") == "stub" else AppleCalendar()
    )  # real macOS Calendar
    store = InMemoryEventStore()  # event provenance/state, keyed by event id
    agent = Agent(
        provider=provider,
        skills=[
            CalendarSkill(backend, store),
            TodoSkill(),
        ],  # register skills here as RYAA grows
    )
    return Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarParser(
            provider=provider
        ),  # still used by the CLI workflow path
        backend=backend,  # same instance the CalendarSkill reads
        confirmer=confirmer,
        agent=agent,
        store=store,  # same instance create() + list annotate
    )


def build_scheduler_for(user: User, conn: ProviderConnection) -> Scheduler:
    """Per-user Scheduler backed by the user's real Google Calendar."""
    provider = OpenAIProvider()
    backend = GoogleCalendarBackend(
        refresh_token=decrypt(conn.credentials),
        timezone=user.timezone or "America/Chicago",
    )
    agent = Agent(provider=provider, skills=[CalendarSkill(backend), TodoSkill()])
    return Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarParser(provider=provider),
        backend=backend,
        agent=agent,
        # no store — provenance lives on the Google event (extendedProperties)
    )
