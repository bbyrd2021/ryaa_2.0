from __future__ import annotations

from ryaa.agent import Agent
from ryaa.orchestrator import Scheduler
from ryaa.providers.openai_provider import OpenAIProvider
from ryaa.safety.guardrails import Guardrails
from ryaa.skills.calendar_skill import CalendarSkill  # agent skill (guidance)
from ryaa.skills.todo_skill import TodoSkill
from ryaa.tools.calendar_tool import AppleCalendar, CalendarParser, StubCalendar  # noqa: F401


def build_scheduler(confirmer=None) -> Scheduler:
    """Assemble a Scheduler. CLI passes a CLIConfirm; the API passes nothing
    (the browser is the confirmer)."""
    provider = OpenAIProvider()
    backend = StubCalendar()  # TODO: swap to AppleCalendar() for real events
    agent = Agent(
        provider=provider,
        skills=[CalendarSkill(backend), TodoSkill()],  # register skills here as RYAA grows
    )
    return Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarParser(provider=provider),  # still used by the CLI workflow path
        backend=backend,                             # same instance the CalendarSkill reads
        confirmer=confirmer,
        agent=agent,
    )
