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
from ryaa.tools.google_tasks import GoogleTasksBackend


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
    provider = OpenAIProvider()
    refresh = decrypt(conn.credentials)
    cal = GoogleCalendarBackend(
        refresh_token=refresh, timezone=user.timezone or "America/New_York"
    )
    tasks = GoogleTasksBackend(refresh_token=refresh)
    agent = Agent(provider=provider, skills=[CalendarSkill(cal), TodoSkill(tasks)])
    return Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarParser(provider=provider),
        backend=cal,
        agent=agent,
    )
