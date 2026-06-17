# Spec — Modify events + event state (agent era)

> Supersedes the pre-agent design in `docs/backlog/modify-events.md` (Router/Selector). In the
> agent world, routing is the model picking a tool and "which one?" is a clarifying question —
> so this is built as new **CalendarSkill tools** + a small **state store**, not a Selector seam.

## Context
Two asks, one feature:
1. **Modify/reschedule** existing events ("move my brunch to 11", "make the study session 90 min").
2. **Event state** — RYAA should be able to tell *when it created and/or modified* an event, and
   distinguish its own events from pre-existing ones (the "Dentist at noon" was a `StubCalendar`
   fixture, not RYAA's).

Both need a thing the code lacks: **events must carry an id** (you can't modify or track what you
can't reference). `list_events` currently returns `EventDetails` with no id — that's the first fix.

Decisions: **state lives in a local store keyed by event id** (in-memory now, persisted later behind
the same Protocol); **modify is built as agent tools** with conversational disambiguation.

## Shape of the solution (layers)
- **tools (code):** `EventRef` (an existing event = fields **+ id**), `EventStore` (state by id),
  and `CalendarBackend` grows `find_events` + `update_event`; `list_events` now returns `EventRef`.
- **skills (guidance):** `CalendarSkill` gains `find_events` + `propose_modification` tools, and
  annotates listed events with their state so the agent can *tell*.
- **yield/confirm generalized:** a proposal now carries an **action** (`create` | `modify`) and an
  `event_id`, so `/confirm` routes to create vs update.

---

## New / changed models

**`ryaa/tools/calendar_tool.py`** — add `EventRef` as a **subclass** of `EventDetails` (inherits the
content fields; no re-declaration). It only adds identity + state:
```python
# Phase A: just id.   Phase B: add the `state` field + `from ryaa.tools.event_state import EventState`.
class EventRef(EventDetails):
    """An existing event = EventDetails' content + its id (+ optional RYAA state)."""

    id: str
    state: "EventState | None" = None   # Phase B; filled by the skill from the store; None = pre-existing
```
**Why subclass, not merge:** `propose_event`'s tool schema is generated from `EventDetails`, and it
must stay `{name, start, duration_minutes, participants}` — the model shouldn't be handed an `id`
(it'd hallucinate one) or `state` (server-assigned). So `EventDetails` = create-args; `EventRef` =
an existing event. Subclassing gives DRY without leaking identity into the create path.

**`ryaa/tools/event_state.py`** (new) — the state store (code → tools/):
```python
from __future__ import annotations

from datetime import datetime
from typing import Literal, Protocol

from pydantic import BaseModel


class EventState(BaseModel):
    status: Literal["created", "modified"]
    created_at: datetime
    modified_at: datetime | None = None


class EventStore(Protocol):
    def mark_created(self, event_id: str) -> None: ...
    def mark_modified(self, event_id: str) -> None: ...
    def get(self, event_id: str) -> EventState | None: ...


class InMemoryEventStore:
    """Stub-first: a dict. Swap for a JSON/SQLite store behind this same interface later."""

    def __init__(self) -> None:
        self._states: dict[str, EventState] = {}

    def mark_created(self, event_id: str) -> None:
        self._states[event_id] = EventState(status="created", created_at=datetime.now())

    def mark_modified(self, event_id: str) -> None:
        existing = self._states.get(event_id)
        now = datetime.now()
        if existing is None:
            self._states[event_id] = EventState(status="modified", created_at=now, modified_at=now)
        else:
            existing.status = "modified"
            existing.modified_at = now

    def get(self, event_id: str) -> EventState | None:
        return self._states.get(event_id)
```

---

## Build phases (stub-first — each green before the next, one review gate each)

### Phase A — events carry ids (`EventRef`)
- Add `EventRef` (above). Give `StubCalendar._FAKE_EVENTS` ids (e.g. `"stub-standup"`, `"stub-dentist"`)
  by making them `EventRef`s.
- Change `CalendarBackend.list_events` and `StubCalendar.list_events` to return `list[EventRef]`.
- `AppleCalendar.list_events`: include the event **uid** (the osascript already returns uids on
  create; the list script must emit `uid of e` too). Real-device — verify later.
- Update `CalendarSkill.run_tool`'s `list_events` serialization to include `id`.
- Existing tests stay green (list_events shape changes are internal to the calendar path).

### Phase B — state store + "created" provenance + RYAA can *tell*
- Add `ryaa/tools/event_state.py` (above).
- `factory.py`: build one `store = InMemoryEventStore()`; inject the **same instance** into both the
  `Scheduler` and the `CalendarSkill` (like the shared `backend`).
- `Scheduler.create()` → after `backend.create_event` returns the id, call `self.store.mark_created(id)`.
- `CalendarSkill` annotates each listed `EventRef` with `state = self.store.get(ref.id)` before
  serializing, and includes it in the tool result (e.g. `"state": "created" | "modified" | "external"`,
  where `None` → `"external"`). Now the agent can say "that's a pre-existing event" vs "I scheduled that."
- Test (fake store): create → store has a `created` record; list → RYAA's event shows `created`,
  the Dentist fixture shows `external`.

### Phase C — find the event (read tool + conversational pick)
- `CalendarBackend.find_events(query: str, start: datetime, end: datetime) -> list[EventRef]`;
  `StubCalendar`: case-insensitive name-contains within the window. `AppleCalendar`: osascript search (later).
- `CalendarSkill` gains a `find_events` tool (args: `query`, `start`, `end`) → returns matching
  `EventRef`s (with id + state). Guidance: "to change/cancel an existing event, find it first;
  if more than one matches, ask the user which one."
- No new yield yet — this just lets the agent locate candidates and ask. Test: a `find_events` call
  returns the right fixtures; ambiguous query → agent replies asking which (kind="reply").

### Phase D — the modify yield + generalized confirm
- `CalendarBackend.update_event(event_id: str, event: EventDetails) -> str` (returns the id);
  `StubCalendar`: replace the matching fixture's fields, return id.
- **Generalize the proposal** in `skills/base.py`:
  ```python
  class AgentResult(BaseModel):
      kind: Literal["proposal", "reply"]
      summary: str | None = None
      event: EventDetails | None = None
      action: Literal["create", "modify"] = "create"   # NEW
      event_id: str | None = None                        # NEW (set on modify)
  ```
- `CalendarSkill` gains `propose_modification` (args: `event_id` + the new `name/start/duration_minutes/
  participants`). Its `run_tool` returns `AgentResult(kind="proposal", action="modify",
  event_id=..., event=EventDetails(...), summary="Change 'X' to ...?")`. `propose_event` stays
  `action="create"` (the default).
- **`ProposeResult`** (orchestrator) carries `action` + `event_id`; `chat()` passes them through.
- **`Scheduler.update(event_id, event)`** → `backend.update_event` + `store.mark_modified(id)` →
  `ScheduleResult(status="modified", ...)`. Add `"modified"` to `ScheduleResult.status`.
- **`/confirm`** takes a richer body and routes:
  ```python
  class ConfirmRequest(BaseModel):
      action: Literal["create", "modify"] = "create"
      event: EventDetails
      event_id: str | None = None

  @app.post("/confirm")
  def confirm(req: ConfirmRequest) -> ScheduleResult:
      try:
          if req.action == "modify" and req.event_id:
              return scheduler.update(req.event_id, req.event)
          return scheduler.create(req.event)
      except RuntimeError as e:
          logger.warning("Confirm failed: %s", e)
          return ScheduleResult(status="failed", message=str(e))
  ```
- **Frontend (`App.tsx`)**: `pending` becomes `{ event, action, event_id }` (read `action`/`event_id`
  from the `proposed` response); `handleConfirm` POSTs the `ConfirmRequest`. The Confirm/Cancel UI is
  unchanged; the success bubble shows the `created` *or* `modified` message.
- Test the full modify flow with fakes: "move the dentist to 1pm" → find → propose_modification →
  confirm → `update_event` called + store shows `modified`.

### Phase E — real device (mostly DONE)
- `uid` in `AppleCalendar.list_events` — ✅ done (Phase A).
- `AppleCalendar.update_event` osascript — ✅ done + **verified live** (Phase D nudge-and-restore).
- `find_events` reuses `list_events` + a Python name filter on both backends — correct and verified.
  A *native* osascript search (`whose summary contains …`) is the only optional remainder, and it's
  marginal at personal-calendar scale (a near-duplicate of the list script). Left optional.

**modify-events A–D are complete and on the real calendar.**

---

## Verification
- `mypy ryaa/` clean; `pytest` green (existing 6 + new phase tests).
- `scratch_agent.py`-style isolation: "what's on Tuesday?" → Dentist shows `external`; schedule
  something → it shows `created`; "move it to 1pm" → proposal `action=modify`, confirm → `modified`.
- End-to-end: vague modify → RYAA asks which event → you answer → proposal → Confirm → "Updated 'X'."

## Out of scope (still later)
- Persisting the store (swap `InMemoryEventStore` → JSON/SQLite behind `EventStore`).
- Delete/cancel events (same pattern: a `cancel_event` tool + `action="cancel"`).
- A non-calendar skill yielding (Email draft) — the `action` field now makes that easier.
