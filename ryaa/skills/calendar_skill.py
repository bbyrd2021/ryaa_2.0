from __future__ import annotations

import json
from datetime import datetime

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.skills.base import AgentResult
from ryaa.tools.calendar_tool import CalendarBackend, EventDetails
from ryaa.tools.event_state import EventStore
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

class FindEventsArgs(BaseModel):
  query: str = Field(description="Text to match against event names, e.g. 'dentist'")
  start: datetime = Field(description="Search window start, ISO-8601")
  end: datetime = Field(description="Search window end, ISO-8601")

FIND_EVENTS = ToolSpec(
  name="find_events",
  description=(
    "Find existing events whose name matches a query within a time window. "
    "Use this to locate an event the user wants to change or ask about; "
    "if more than one matches, ask the user which one before acting."
  ),
  parameters=FindEventsArgs.model_json_schema(),
)

class ModifyEventArgs(EventDetails):
  event_id: str = Field(description="id of the existing event to modify (from find_events)")

PROPOSE_MODIFICATION = ToolSpec(
  name="propose_modification",
  description=(
    "Propose a change to an existing event for the user to confirm. Provide the event_id "
    "(from find_events) and the NEW name/start/duration/participants. Changes nothing until confirmed."
  ),
  parameters=ModifyEventArgs.model_json_schema(),
)

class CalendarSkill:
  """SKILL: how to schedule. Wraps the calendar TOOL (osascript backend)."""

  name = "calendar"
  description = "Create and check calendar events."

  def __init__(self, backend: CalendarBackend, store: EventStore | None = None):
    self.backend = backend
    self.store = store

  def instructions(self) -> str:
    return (
      "If a day, time, or duration is missing, ask ONE short question. "
      "Call list_events to check availability before proposing. "
      "When you know name + start + duration, call propose_event "
      "(the user confirms separately). Resolve relative dates against today. "
      "Listed events carry a state: 'created'/'modified' means you scheduled or changed it, "
      "'external' means it was already on the calendar — mention this when it helps. "
      "To change or ask about an existing event, call find_events first; "
      "if several match, ask which one. Once you know the event_id and the new "
      "details, call propose_modification (the user confirms separately)."
    )

  def tools(self) -> list[ToolSpec]:
    return [LIST_EVENTS, PROPOSE_EVENT, FIND_EVENTS, PROPOSE_MODIFICATION]

  def run_tool(self, call: ToolCall) -> AgentResult | str:
    if call.name == "propose_event":
      event = EventDetails(**call.arguments)
      return AgentResult(kind="proposal", event=event, summary=_summary(event))
    if call.name == "propose_modification":
      args = ModifyEventArgs(**call.arguments)
      event = EventDetails(
        name=args.name,
        start=args.start,
        duration_minutes=args.duration_minutes,
        participants=args.participants,
      )
      return AgentResult(
        kind="proposal",
        action="modify",
        event_id=args.event_id,
        event=event,
        summary=f"Change '{event.name}' to {event.start:%A %b %d %Y at %I:%M %p} for {event.duration_minutes} min?",
      )
    if call.name == "list_events":
      start = datetime.fromisoformat(call.arguments["start"])
      end = datetime.fromisoformat(call.arguments["end"])
      events = self.backend.list_events(start, end)
      return self._events_json(events, "No events in that window.")
    if call.name == "find_events":
      start = datetime.fromisoformat(call.arguments["start"])
      end = datetime.fromisoformat(call.arguments["end"])
      events = self.backend.find_events(call.arguments["query"], start, end)
      return self._events_json(events, "No matching events found.")
    return f"Unknown tool: {call.name}"

  def _events_json(self, events, empty_msg: str) -> str:
    if not events:
      return empty_msg
    for e in events:
      e.state = self.store.get(e.id) if self.store else None
    return json.dumps([
      {
        "id": e.id,
        "name": e.name,
        "start": e.start.isoformat(),
        "duration_minutes": e.duration_minutes,
        "state": e.state.status if e.state else "external",
      }
      for e in events
    ])

def _summary(event: EventDetails) -> str:
  participants = ", ".join(event.participants) or "no one else"
  return (
    f"Create event '{event.name}' on "
    f"{event.start:%A %b %d %Y at %I:%M %p} "
    f"for {event.duration_minutes} min with {participants}?"
  )

