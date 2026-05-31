from datetime import datetime

from ryaa.orchestrator import Scheduler
from ryaa.safety.guardrails import CalendarValidation, Guardrails, SecurityCheck
from ryaa.skills.calendar import CalendarSkill, EventDetails, EventExtraction


def _provider(fake_provider):
    return fake_provider(
        structured_return={
            CalendarValidation: CalendarValidation(
                is_calendar_request=True, confidence_score=0.9
            ),
            SecurityCheck: SecurityCheck(is_safe=True, risk_flags=[]),
            EventExtraction: EventExtraction(
                description="study group", is_calendar_event=True, confidence_score=0.9
            ),
            EventDetails: EventDetails(
                name="Study Group",
                start=datetime(2026, 6, 2, 14, 0),
                duration_minutes=60,
                participants=["Alice"],
            ),
        }
    )


def test_confirmed_creates_event(fake_provider, fake_confirmer, fake_calendar_backend):
    provider = _provider(fake_provider)
    backend = fake_calendar_backend()
    scheduler = Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarSkill(provider=provider),
        confirmer=fake_confirmer(answer=True),
        backend=backend,
    )
    result = scheduler.schedule("schedule study group tuesday 2pm with Alice")
    assert result.status == "created"
    assert result.event_id == "fake-event-id"
    assert len(backend.created) == 1


def test_declined_does_not_create(fake_provider, fake_confirmer, fake_calendar_backend):
    provider = _provider(fake_provider)
    backend = fake_calendar_backend()
    scheduler = Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarSkill(provider=provider),
        confirmer=fake_confirmer(answer=False),  # user says no
        backend=backend,
    )
    result = scheduler.schedule("schedule study group tuesday 2pm with Alice")
    assert result.status == "cancelled"
    assert backend.created == []  # nothing reached the calendar
