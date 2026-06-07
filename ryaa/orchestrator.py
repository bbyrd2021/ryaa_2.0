from typing import Literal

from pydantic import BaseModel

from ryaa.providers.base import Message
from ryaa.tools.calendar_tool import EventDetails


class ScheduleResult(BaseModel):
    status: Literal["created", "rejected", "not_calendar", "cancelled", "failed"]
    message: str
    event_id: str | None = None


class ProposeResult(BaseModel):
    status: Literal["proposed", "reply", "rejected", "not_calendar"]
    summary: str | None = None
    reasons: list[str] = []
    event: EventDetails | None = None


class Scheduler:
    def __init__(self, guardrails, calendar, backend, confirmer=None, agent=None):
        self.guardrails = guardrails
        self.calendar = calendar
        self.backend = backend
        self.confirmer = confirmer
        self.agent = agent

    def chat(self, history: list[Message]) -> ProposeResult:
        # NOTE: the old calendar guardrail gate is intentionally dropped here. 
        # RYAA is a general assistant now, so "not a calendar request" is no longer
        # a rejection (it might todo, or just chat). A general security-only 
        # guardrail is a later refinement.

        if self.agent is None:
            return ProposeResult(status="rejected", reasons=["no agent configured."])

        result = self.agent.run(history)
        if result.kind == "proposal":
            return ProposeResult(status="proposed", summary=result.summary, event=result.event)
        return ProposeResult(status="reply", summary=result.summary)

    def propose(self, user_input: str) -> ProposeResult:
        verdict = self.guardrails.validate(user_input)
        if not verdict.is_valid:
            return ProposeResult(status="rejected", reasons=verdict.reasons)
        details = self.calendar.prepare(user_input)
        if details is None:
            return ProposeResult(status="not_calendar")
        return ProposeResult(
            status="proposed", summary=self._summary(details), event=details
        )

    def create(self, event: EventDetails) -> ScheduleResult:
        event_id = self.backend.create_event(event)
        return ScheduleResult(
            status="created", message=f"Created '{event.name}'.", event_id=event_id
        )

    def schedule(self, user_input) -> ScheduleResult:
        # CLI path - composes propose + confirmer + create
        proposal = self.propose(user_input)
        if proposal.status == "rejected":
            return ScheduleResult(
                status="rejected", message="; ".join(proposal.reasons)
            )
        if proposal.status == "not_calendar":
            return ScheduleResult(
                status="not_calendar",
                message="That doesn't look like a calendar request.",
            )
        if not self.confirmer.confirm(proposal.summary):
            return ScheduleResult(
                status="cancelled", message="Cancelled - nothing was created"
            )
        assert proposal.event is not None
        return self.create(proposal.event)

    def _summary(self, details) -> str:
        # human readable  description for the confirm prompt -- format the fields, no LLM needed
        return (
            f"Create event '{details.name}' on "
            f"{details.start:%A %b %d %Y at %I:%M %p} "
            f"for {details.duration_minutes} min "
            f"with {', '.join(details.participants) or 'no one else'}?"
        )
