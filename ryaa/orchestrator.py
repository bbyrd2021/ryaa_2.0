from typing import Literal

from pydantic import BaseModel


class ScheduleResult(BaseModel):
    status: Literal["created", "rejected", "not_calendar", "cancelled"]
    message: str
    event_id: str | None = None


class Scheduler:
    def __init__(self, guardrails, calendar, confirmer, backend):
        self.guardrails = guardrails
        self.calendar = calendar
        self.confirmer = confirmer
        self.backend = backend

    def schedule(self, user_input: str) -> ScheduleResult:
        # 1. GUARDRAILS -- validate the request
        verdict = self.guardrails.validate(user_input)
        if not verdict.is_valid:
            return ScheduleResult(status="rejected", message="; ".join(verdict.reasons))

        # 2. PARSE -- extract the structured event (None = gate said not-a-calendar)
        details = self.calendar.prepare(user_input)
        if details is None:
            return ScheduleResult(
                status="not_calendar",
                message="That doesn't look like a calendar request.",
            )

        # 3. CONFIRM -- THE YIELD. show the human, wait for the explicit yes.
        if not self.confirmer.confirm(self._summary(details)):
            return ScheduleResult(
                status="cancelled", message="Cancelled - nothing was created"
            )

        # 4. ACT - only now do we touch the (stub) calendar
        event_id = self.backend.create_event(details)
        return ScheduleResult(
            status="created", message=f"Created '{details.name}'.", event_id=event_id
        )

    def _summary(self, details) -> str:
        # human readable  description for the confirm prompt -- format the fields, no LLM needed
        return (
            f"Create event '{details.name}' on "
            f"{details.start:%A %b %d %Y at %I:%M %p} "
            f"for {details.duration_minutes} min "
            f"with {', '.join(details.participants) or 'no one else'}?"
        )
