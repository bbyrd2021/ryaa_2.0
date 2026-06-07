from __future__ import annotations

import json
from datetime import datetime

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.skills.base import AgentResult
from ryaa.tools.calendar_tool import CalendarBackend, EventDetails
from pydantic import BaseModel, Field

class ListEventsArgs(BaseModel):
  start: datetime = Field(description="Window start, ISO-8601 e.g. 2026-06-09T00:00:00")
  end: datetime = Field(description="Window end, ISO-8601 e.g. 2026-06-09T23:59:59")

LIST_EVENTS = ToolSpec(
  name="list_events",
  description=(
    "List existing calendar events between two ISO-8601 datetimes."
    "Use this to check availability or detect conflicts before proposing."
  ),
  parameters=ListEventsArgs.model_json_schema(),   # generated, not hand-written
)

PROPOSE_EVENT = ToolSpec(
  name="propose_event",
  description=(
    "Propose a calendar event for the user to confirm. Call ONLY once you know "
    "the name, the start time, and the duration. Does NOT create anything."
  ),
  parameters=EventDetails.model_json_schema(),
)

class CalendarSkill:
  """SKILL: how to schedule. Wraps the calendar TOOL (osascript backend)."""

  name = "calendar"
  description = "Create and check calendar events."

  def __init__(self, backend: CalendarBackend):
    self.backend = backend

  def instructions(self) -> str:
    return (
      "If a day, time, or duration is missing, ask ONE short question. "
      "Call list_events to check availability before proposing. "
      "When you know name + start + duration, call propose_event "
      "(the user confirms separately). Resolve relative dates against today."
    )

  def tools(self) -> list[ToolSpec]:
    return [LIST_EVENTS, PROPOSE_EVENT]

  def run_tool(self, call: ToolCall) -> AgentResult | str:
    if call.name == "propose_event":
      event = EventDetails(**call.arguments)
      return AgentResult(kind="proposal", event=event, summary=_summary(event))
    if call.name == "list_events":
      start = datetime.fromisoformat(call.arguments["start"])
      end = datetime.fromisoformat(call.arguments["end"])
      events = self.backend.list_events(start, end)
      if not events:
        return "No events in that window."
      return json.dumps([{"name": e.name, "start": e.start.isoformat(), "duration_minutes": e.duration_minutes} for e in events])
    return f"Unknown tool: {call.name}"

def _summary(event: EventDetails) -> str:
  participants = ", ".join(event.participants) or "no one else"
  return (
    f"Create event '{event.name}' on "
    f"{event.start:%A %b %d %Y at %I:%M %p} "
    f"for {event.duration_minutes} min with {participants}?"
  )

