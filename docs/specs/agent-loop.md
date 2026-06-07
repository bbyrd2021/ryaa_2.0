# Spec — Agent Loop, EXACT build (run RYAA from the frontend)

> Rewrite of the earlier spec. This one is **complete code, no `...` stubs**. Follow it
> top to bottom and the browser will drive a real agent loop: vague request → RYAA asks a
> clarifying question → you answer → it checks the calendar → it proposes → you Confirm →
> event is created. Copy each block exactly; the pieces are designed to fit together.

## The design in one paragraph
RYAA is **not** a scheduling assistant — scheduling is one **skill**. Three clean layers,
following Anthropic's tools-vs-skills split:
- **Tools = the fat code** that does work — `tools/calendar_tool.py` (osascript). The ACI.
- **Skills = guidance** on *how/when* to use a set of tools (Anthropic's "Agent Skills": context
  that turns a general agent into a specialist). A `Skill` bundles a description, instructions, its
  tool specs, and a `run_tool` that dispatches to the tool code.
- **Agent = a generic conversational loop.** It holds a *list* of skills, exposes all their tools,
  and dispatches each tool call to the **owning** skill. **Routing is implicit** — the model
  picking a tool *is* the routing; the agent hands it to the right skill. If the model calls no
  tool, it just **converses**.

Two skills ship now so routing is real: **Calendar** (list/propose) and a **stub Todo** skill.
The **yield** generalizes: a skill's `run_tool` returns a plain string (feed back, keep looping) or
an `AgentResult` proposal (terminal — hand to the human). The agent is **additive**: the CLI and
the 6 tests keep the old workflow (`schedule`/`propose`/`create`) **untouched, no test edits**; the
frontend uses the new `Scheduler.chat(history)` → agent loop. `create()` / `/confirm` unchanged.

## Files (in build order)
1. `ryaa/providers/base.py` — add tool types, extend `Message`, add `act()` to the Protocol
2. `ryaa/providers/openai_provider.py` — implement `act()` + teach `_to_openai` about tools
3. `ryaa/tools/calendar_tool.py` — add `list_events`; **absorb the deleted `skills/calendar.py`** (event models + `CalendarParser`)
4. The **skill layer** (new): `skills/base.py` (Skill Protocol + AgentResult), `agent.py` (generic
   loop), `skills/calendar_skill.py`, `tools/todo_tool.py`, `skills/todo_skill.py`
5. `ryaa/orchestrator.py` — add `"reply"` status, an `agent` field, and `chat()`
6. `ryaa/factory.py` — build the skills + the `Agent`, share the backend
7. `ryaa/api.py` — `/propose` takes the transcript, calls `chat()`
8. `frontend/src/App.tsx` — send the transcript, handle `"reply"`

Environment: conda env `ryaa`, Python 3.12 (so `datetime.fromisoformat` accepts a trailing `Z`).
`factory.py` stays on `StubCalendar` for the whole demo.

> **Layer rule of thumb:** if it *does* something (osascript, an API call, DB write) it's a **tool**
> in `tools/`. If it *guides* the model on when/how to use tools (instructions + tool specs +
> dispatch) it's a **skill** in `skills/`. The **agent** never imports a specific tool or skill.

---

## 1. `ryaa/providers/base.py`

**1a. Add these three classes ABOVE `class Message`** (so `ToolCall` exists before `Message`
references it):
```python
class ToolCall(BaseModel):
    """A request BY the model to run one tool. `arguments` is already json.loads()'d."""

    id: str
    name: str
    arguments: dict


class ToolSpec(BaseModel):
    """A tool we OFFER the model. `parameters` is a JSON Schema describing the args."""

    name: str
    description: str
    parameters: dict


class ModelTurn(BaseModel):
    """One step the model takes: some text, and/or some tool calls it wants run."""

    text: str = ""
    tool_calls: list[ToolCall] = []
```

**1b. Replace the body of `class Message`** (keep its docstring) so it can carry tool calls and
tool results:
```python
class Message(BaseModel):
    # ... keep the existing docstring ...
    role: Literal["system", "user", "assistant", "tool"]
    content: str = ""
    tool_calls: list[ToolCall] = []   # set on assistant turns that call tools
    tool_call_id: str | None = None   # set on tool-result turns (role == "tool")
```

**1c. Add the third verb to the `LLMProvider` Protocol** (after `structured`):
```python
    def act(
        self,
        messages: list[Message],
        tools: list[ToolSpec],
        *,
        model: str | None = None,
    ) -> ModelTurn:
        """One agent step: given the conversation and the tools on offer, return what
        the model wants to do next — free text and/or tool calls."""
        ...
```

---

## 2. `ryaa/providers/openai_provider.py`

**2a. Imports** — replace the two relevant import lines:
```python
import json
import os
from typing import cast

from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam, ChatCompletionToolParam

from .base import Message, ModelTurn, T, ToolCall, ToolSpec
```

**2b. Replace `_to_openai`** so it handles assistant-tool-call turns and tool-result turns
(OpenAI needs the `tool_call_id` linkage):
```python
    def _to_openai(self, messages: list[Message]) -> list[ChatCompletionMessageParam]:
        out: list[dict] = []
        for m in messages:
            if m.role == "assistant" and m.tool_calls:
                out.append(
                    {
                        "role": "assistant",
                        "content": m.content or None,
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": json.dumps(tc.arguments),
                                },
                            }
                            for tc in m.tool_calls
                        ],
                    }
                )
            elif m.role == "tool":
                out.append(
                    {"role": "tool", "tool_call_id": m.tool_call_id, "content": m.content}
                )
            else:
                out.append({"role": m.role, "content": m.content})
        return cast(list[ChatCompletionMessageParam], out)
```

**2c. Add `act()`** at the end of the class:
```python
    def act(
        self,
        messages: list[Message],
        tools: list[ToolSpec],
        *,
        model: str | None = None,
    ) -> ModelTurn:
        model = model or self.default_model
        openai_tools = cast(
            list[ChatCompletionToolParam],
            [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in tools
            ],
        )
        completion = self.client.chat.completions.create(
            model=model,
            messages=self._to_openai(messages),
            tools=openai_tools,
        )
        msg = completion.choices[0].message
        # Newer OpenAI SDKs type `tool_calls` as a union (function | custom); only the
        # function variant has `.function`, so guard on `.type` (also narrows for mypy).
        calls = [
            ToolCall(
                id=tc.id,
                name=tc.function.name,
                arguments=json.loads(tc.function.arguments or "{}"),
            )
            for tc in (msg.tool_calls or [])
            if tc.type == "function"
        ]
        return ModelTurn(text=msg.content or "", tool_calls=calls)
```

---

## 3. `ryaa/tools/calendar_tool.py`

> **Refactor (do this first):** `ryaa/skills/calendar.py` is **deleted** — "code" doesn't belong
> in `skills/`. Move its three event models (`EventExtraction`, `EventDetails`,
> `EventConfirmation`) **and** its LLM parser (the old `CalendarSkill`, **renamed
> `CalendarParser`**) into this file, verbatim — only the class name changes. So
> `calendar_tool.py` becomes the single home for all calendar *code*: models + parser + osascript
> backend. For the moved code add `from ryaa.providers.base import LLMProvider, Message` and
> `from pydantic import BaseModel, Field`, and **delete** this file's old top-of-file import of
> `EventDetails` from `skills.calendar` (it defines `EventDetails` itself now). Everything else
> imports `EventDetails` / `CalendarParser` from here — no aliases.

**3a. Import** — add `datetime`:
```python
from datetime import datetime, timedelta
```

**3b. Add `list_events` to the `CalendarBackend` Protocol** (next to `create_event`):
```python
    def list_events(self, start: datetime, end: datetime) -> list[EventDetails]: ...
```

**3c. Add `list_events` to `StubCalendar`** — this is the path the demo actually runs (factory
uses StubCalendar). The fake events let the agent show real calendar-awareness:
```python
class StubCalendar:
    """Fake Backend: pretends to create, and serves a few canned events for reads."""

    # Illustrative fixtures (next Tuesday relative to early June 2026).
    _FAKE_EVENTS = [
        EventDetails(
            name="Team standup",
            start=datetime(2026, 6, 9, 9, 0),
            duration_minutes=30,
            participants=["Team"],
        ),
        EventDetails(
            name="Dentist",
            start=datetime(2026, 6, 9, 12, 0),
            duration_minutes=60,
            participants=[],
        ),
    ]

    def create_event(self, event: EventDetails) -> str:
        logger.info(
            "STUB created event: %s @ %s (%d min)",
            event.name,
            event.start,
            event.duration_minutes,
        )
        return "stub-event-id"

    def list_events(self, start: datetime, end: datetime) -> list[EventDetails]:
        return [e for e in self._FAKE_EVENTS if start <= e.start <= end]
```

**3d. Add `list_events` to `AppleCalendar`** + the `_build_list_script` helper. ⚠️ This talks to
the real Calendar app — **the StubCalendar demo never calls it**, so verify it on your machine
separately (osascript date handling is fiddly). The trick: AppleScript date subtraction yields
seconds; we reconstruct a tz-free naive datetime in Python so there's no timezone math.
```python
    def list_events(self, start: datetime, end: datetime) -> list[EventDetails]:
        script = _build_list_script(self.calendar_name, start, end)
        result = subprocess.run(
            ["osascript", "-e", script], capture_output=True, text=True
        )
        if result.returncode != 0:
            raise RuntimeError(f"Calendar list failed: {result.stderr.strip()}")
        events: list[EventDetails] = []
        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split("\t")
            if len(parts) != 3:
                continue
            name, secs, dur = parts
            events.append(
                EventDetails(
                    name=name,
                    start=datetime(1970, 1, 1) + timedelta(seconds=float(secs)),
                    duration_minutes=int(float(dur)),
                    participants=[],
                )
            )
        return events
```
Add at the bottom of the file (note: AppleScript `tab`/`linefeed` constants, not `\t`/`\n`):
```python
def _build_list_script(cal, start, end):
    return f"""
        set startDate to current date
        set day of startDate to 1
        set year of startDate to {start.year}
        set month of startDate to {start.month}
        set day of startDate to {start.day}
        set hours of startDate to {start.hour}
        set minutes of startDate to {start.minute}
        set seconds of startDate to 0
        set endDate to current date
        set day of endDate to 1
        set year of endDate to {end.year}
        set month of endDate to {end.month}
        set day of endDate to {end.day}
        set hours of endDate to {end.hour}
        set minutes of endDate to {end.minute}
        set seconds of endDate to 0
        set refDate to current date
        set day of refDate to 1
        set year of refDate to 1970
        set month of refDate to 1
        set day of refDate to 1
        set hours of refDate to 0
        set minutes of refDate to 0
        set seconds of refDate to 0
        set out to ""
        tell application "Calendar"
            tell calendar "{cal}"
                set theEvents to (every event whose start date is greater than or equal to startDate and start date is less than or equal to endDate)
                repeat with e in theEvents
                    set s to start date of e
                    set en to end date of e
                    set secs to (s - refDate)
                    set durMin to ((en - s) / 60) as integer
                    set out to out & (summary of e) & tab & secs & tab & durMin & linefeed
                end repeat
            end tell
        end tell
        return out
    """
```

---

## 4. The skill layer (generic agent + skills)

> The agent imports **no** specific skill or tool. Skills wrap tool code and add guidance.

**4a. `ryaa/skills/base.py`** (new) — the `Skill` contract + the loop's result type:
```python
from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.tools.calendar_tool import EventDetails


class AgentResult(BaseModel):
    kind: Literal["proposal", "reply"]
    summary: str | None = None          # the proposal summary OR the reply text
    event: EventDetails | None = None   # carried on a calendar proposal (generalize at skill #3)


class Skill(Protocol):
    """Guidance for a family of tools: WHAT it does, HOW to use it, and the tools themselves."""

    name: str
    description: str

    def instructions(self) -> str: ...           # context injected into the system prompt
    def tools(self) -> list[ToolSpec]: ...        # the model-facing tool specs
    def run_tool(self, call: ToolCall) -> "AgentResult | str": ...  # str = continue, AgentResult = yield
```

**4b. `ryaa/agent.py`** (new) — the generic loop. No calendar, no todo imports:
```python
from __future__ import annotations

from datetime import datetime

from ryaa.providers.base import LLMProvider, Message
from ryaa.skills.base import AgentResult, Skill

MAX_ITERS = 6

BASE_PROMPT = (
    "You are RYAA, a helpful personal assistant. Converse naturally. "
    "Use a tool only when it helps act on the user's request; otherwise just reply. "
    "Ask a short clarifying question if you are missing something you need."
)


class Agent:
    """The middleman: a conversational loop over a set of skills' tools."""

    def __init__(self, provider: LLMProvider, skills: list[Skill], model: str | None = None):
        self.provider = provider
        self.skills = skills
        self.model = model
        # tool name -> the skill that owns it. This dict IS the router.
        self._owner = {spec.name: s for s in skills for spec in s.tools()}

    def _system_prompt(self) -> str:
        today = datetime.now().strftime("%A, %B %d, %Y")
        parts = [BASE_PROMPT, f"Today is {today}."]
        for s in self.skills:
            parts.append(f"[{s.name}] {s.instructions()}")   # each skill's guidance
        return "\n".join(parts)

    def _all_tools(self):
        return [spec for s in self.skills for spec in s.tools()]

    def run(self, history: list[Message]) -> AgentResult:
        messages = [Message(role="system", content=self._system_prompt()), *history]
        tools = self._all_tools()

        for _ in range(MAX_ITERS):
            turn = self.provider.act(messages, tools, model=self.model)

            # No tool call -> the model is just talking to the user. End the turn.
            if not turn.tool_calls:
                return AgentResult(kind="reply", summary=turn.text or "...")

            messages.append(
                Message(role="assistant", content=turn.text, tool_calls=turn.tool_calls)
            )

            for call in turn.tool_calls:
                skill = self._owner.get(call.name)          # ROUTE: which skill owns this tool?
                if skill is None:
                    messages.append(
                        Message(role="tool", content=f"Unknown tool: {call.name}", tool_call_id=call.id)
                    )
                    continue
                outcome = skill.run_tool(call)              # dispatch to the owning skill
                if isinstance(outcome, AgentResult):        # terminal (e.g. a proposal) -> YIELD
                    return outcome
                # plain string -> ground truth, feed back and keep looping
                messages.append(Message(role="tool", content=outcome, tool_call_id=call.id))

        return AgentResult(kind="reply", summary="I'm having trouble with that one — can you rephrase?")
```

**4c. `ryaa/skills/calendar_skill.py`** (new) — guidance + wiring to the calendar **tool**.
Each tool's args are a **Pydantic model** ("strict data model" per Anthropic): the schema we send
the model is *generated* from it (`.model_json_schema()`), and incoming args are *validated*
through it (`.model_validate(...)`, which also coerces ISO strings → `datetime`):
```python
from __future__ import annotations

import json
from datetime import datetime

from pydantic import BaseModel, Field

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.skills.base import AgentResult
from ryaa.tools.calendar_tool import EventDetails
from ryaa.tools.calendar_tool import CalendarBackend


# --- tool-argument models: ONE source of truth for both the schema and validation ---
class ListEventsArgs(BaseModel):
    start: datetime = Field(description="Window start, ISO-8601 e.g. 2026-06-09T00:00:00")
    end: datetime = Field(description="Window end, ISO-8601 e.g. 2026-06-09T23:59:59")

# propose_event's args ARE EventDetails' fields, so we reuse EventDetails directly.


LIST_EVENTS = ToolSpec(
    name="list_events",
    description=(
        "List existing calendar events between two datetimes. "
        "Use this to check availability or detect conflicts before proposing."
    ),
    parameters=ListEventsArgs.model_json_schema(),   # generated, not hand-written
)

PROPOSE_EVENT = ToolSpec(
    name="propose_event",
    description=(
        "Propose a calendar event for the user to confirm. Call ONLY once you know "
        "the name, start time, and duration. Does NOT create anything."
    ),
    parameters=EventDetails.model_json_schema(),
)


class CalendarSkill:
    """SKILL: how to schedule. Wraps the calendar TOOL (osascript backend)."""

    name = "calendar"
    description = "Create and check calendar events."

    def __init__(self, backend: CalendarBackend):
        self.backend = backend   # the TOOL (fat code)

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
            event = EventDetails.model_validate(call.arguments)   # validate + coerce; THE YIELD
            return AgentResult(kind="proposal", event=event, summary=_summary(event))
        if call.name == "list_events":
            args = ListEventsArgs.model_validate(call.arguments)  # ISO strings -> datetime
            events = self.backend.list_events(args.start, args.end)
            if not events:
                return "No events in that window."
            return json.dumps(
                [
                    {"name": e.name, "start": e.start.isoformat(), "duration_minutes": e.duration_minutes}
                    for e in events
                ]
            )
        return f"Unknown tool: {call.name}"


def _summary(event: EventDetails) -> str:
    participants = ", ".join(event.participants) or "no one else"
    return (
        f"Create event '{event.name}' on "
        f"{event.start:%A %b %d %Y at %I:%M %p} "
        f"for {event.duration_minutes} min with {participants}?"
    )
```

**4d. `ryaa/tools/todo_tool.py`** (new) — the Todo **tool** (stub code; the layer that would persist):
```python
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


class StubTodos:
    """Fake todo store — logs instead of persisting. Real backend swaps in later."""

    def add(self, text: str) -> str:
        logger.info("STUB todo added: %s", text)
        return text
```

**4e. `ryaa/skills/todo_skill.py`** (new) — guidance + wiring to the Todo tool. Proves routing
without a confirm flow (todos are low-stakes, so `add_todo` returns a string, not a proposal):
```python
from __future__ import annotations

from pydantic import BaseModel, Field

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.skills.base import AgentResult
from ryaa.tools.todo_tool import StubTodos


class AddTodoArgs(BaseModel):
    text: str = Field(description="The to-do text")


ADD_TODO = ToolSpec(
    name="add_todo",
    description="Add a simple to-do item the user wants to remember.",
    parameters=AddTodoArgs.model_json_schema(),
)


class TodoSkill:
    """SKILL: how to track to-dos. Wraps the Todo TOOL."""

    name = "todos"
    description = "Track simple to-do items."

    def __init__(self, store: StubTodos | None = None):
        self.store = store or StubTodos()

    def instructions(self) -> str:
        return "When the user wants to remember or track a task, call add_todo. (Stub: not persisted yet.)"

    def tools(self) -> list[ToolSpec]:
        return [ADD_TODO]

    def run_tool(self, call: ToolCall) -> AgentResult | str:
        if call.name == "add_todo":
            args = AddTodoArgs.model_validate(call.arguments)
            saved = self.store.add(args.text)
            return f"Added to-do: {saved!r} (stub — not saved)."
        return f"Unknown tool: {call.name}"
```

---

## 5. `ryaa/orchestrator.py` (additive — workflow path untouched)

**5a.** Add `"reply"` to `ProposeResult.status`:
```python
class ProposeResult(BaseModel):
    status: Literal["proposed", "reply", "rejected", "not_calendar"]
    summary: str | None = None
    reasons: list[str] = []
    event: EventDetails | None = None
```

**5b.** Add an optional `agent` to `Scheduler.__init__` (keep everything else; default `None`
so the tests, which build `Scheduler` without an agent, stay green):
```python
    def __init__(self, guardrails, calendar, backend, confirmer=None, agent=None):
        self.guardrails = guardrails
        self.calendar = calendar
        self.backend = backend
        self.confirmer = confirmer
        self.agent = agent
```

**5c.** Add the `chat()` method (the frontend path). Leave `propose`, `create`, `schedule`,
`_summary` exactly as they are:
```python
    def chat(self, history: list[Message]) -> ProposeResult:
        # NOTE: the old calendar guardrail gate is intentionally dropped here.
        # RYAA is a general assistant now, so "not a calendar request" is no longer
        # a rejection (it might be a todo, or just chat). A general security-only
        # guardrail is a later refinement.
        if self.agent is None:
            return ProposeResult(status="rejected", reasons=["No agent configured."])

        result = self.agent.run(history)
        if result.kind == "proposal":
            return ProposeResult(
                status="proposed", summary=result.summary, event=result.event
            )
        return ProposeResult(status="reply", summary=result.summary)
```
Add the import at the top of the file:
```python
from ryaa.providers.base import Message
```

---

## 6. `ryaa/factory.py` (full file)

> Naming: `CalendarParser` (the workflow LLM parser) now lives in `tools/calendar_tool.py`, and
> the agent `CalendarSkill` in `skills/calendar_skill.py`. Different names, different files — no
> alias needed.
```python
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
        skills=[CalendarSkill(backend), TodoSkill()],  # ← register skills here as RYAA grows
    )
    return Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarParser(provider=provider),  # still used by the CLI workflow path
        backend=backend,                             # SAME instance the CalendarSkill reads
        confirmer=confirmer,
        agent=agent,
    )
```

---

## 7. `ryaa/api.py` (full file)
```python
from __future__ import annotations

import logging
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ryaa.factory import build_scheduler
from ryaa.orchestrator import ProposeResult, ScheduleResult
from ryaa.providers.base import Message
from ryaa.tools.calendar_tool import EventDetails

logger = logging.getLogger(__name__)

load_dotenv()
scheduler = build_scheduler()

app = FastAPI(title="RYAA API", description="API for the RYAA scheduling assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["POST"],
    allow_headers=["*"],
)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ProposeRequest(BaseModel):
    messages: list[ChatTurn]  # the whole transcript the browser holds


@app.post("/propose")
def propose(req: ProposeRequest) -> ProposeResult:
    history = [Message(role=m.role, content=m.content) for m in req.messages]
    return scheduler.chat(history)


@app.post("/confirm")
def confirm(event: EventDetails) -> ScheduleResult:
    try:
        return scheduler.create(event)
    except RuntimeError as e:
        logger.warning("Create failed: %s", e)
        return ScheduleResult(status="failed", message=str(e))
```

---

## 8. `frontend/src/App.tsx`

**8a.** Add `"reply"` to the `ProposeResult` TS type:
```ts
type ProposeResult = {
  status: "proposed" | "reply" | "rejected" | "not_calendar";
  summary: string | null;
  reasons: string[];
  event: EventDetails | null;
};
```

**8b.** Replace `handleSend` so it sends the **whole transcript** and handles `"reply"`:
```ts
  async function handleSend() {
    const text = input.trim();
    if (!text || busy || pending) return;

    // Build the next transcript explicitly — setMessages is async, so we can't
    // rely on `messages` already containing this turn when we fetch.
    const userMsg: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    startWorking();

    try {
      const res = await fetch(`${API}/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data: ProposeResult = await res.json();

      if (data.status === "proposed" && data.event) {
        addMessage({ role: "assistant", content: data.summary ?? "Here's the plan:" });
        setPending(data.event);
      } else if (data.status === "reply") {
        addMessage({ role: "assistant", content: data.summary ?? "..." });
      } else if (data.status === "rejected") {
        addMessage({
          role: "assistant",
          content: data.reasons.join(" ") || "I can't schedule that one.",
        });
      } else {
        addMessage({
          role: "assistant",
          content: "That doesn't look like a calendar request.",
        });
      }
    } catch {
      addMessage({
        role: "assistant",
        content: "I couldn't reach the scheduler — is the API running on :8000?",
      });
    } finally {
      setBusy(false);
    }
  }
```
`handleConfirm` / `handleCancel` are unchanged.

---

## Verification (do these in order)

**A. Tests — update imports for the refactor, then green:**
In `tests/test_orchestrator.py` and `tests/skills/test_calendar.py`: change
`from ryaa.skills.calendar import CalendarSkill, ...` → `from ryaa.tools.calendar_tool import
CalendarParser, ...`, and rename `CalendarSkill(provider=...)` → `CalendarParser(provider=...)`.
```
python -m pytest -q          # 6 passed
```

**B. Agent in isolation (no server, no frontend) — fastest feedback loop:**
```python
# scratch_agent.py  (run: python scratch_agent.py)
from dotenv import load_dotenv; load_dotenv()
from ryaa.providers.openai_provider import OpenAIProvider
from ryaa.providers.base import Message
from ryaa.tools.calendar_tool import StubCalendar
from ryaa.skills.calendar_skill import CalendarSkill
from ryaa.skills.todo_skill import TodoSkill
from ryaa.agent import Agent

agent = Agent(OpenAIProvider(), skills=[CalendarSkill(StubCalendar()), TodoSkill()])

# vague calendar -> reply (clarifying question)
print(agent.run([Message(role="user", content="schedule lunch with Sam")]))
# complete calendar -> proposal
print(agent.run([Message(role="user", content="lunch with Sam next Tuesday at noon for 45 min")]))
# availability -> calls list_events (Dentist at noon Jun 9) and warns, not a proposal
print(agent.run([Message(role="user", content="am I free next Tuesday at noon?")]))
# todo -> ROUTES to the todo skill (proves routing across skills)
print(agent.run([Message(role="user", content="remind me to buy milk")]))
# chit-chat -> reply, no tool called
print(agent.run([Message(role="user", content="hey, what can you do?")]))
```

**C. End-to-end from the browser:**
```
uvicorn ryaa.api:app --reload --port 8000      # terminal 1
cd frontend && npm run dev                      # terminal 2
```
- Type **"schedule lunch with Sam"** → RYAA replies with a question, **no Confirm/Cancel**.
- Answer **"next Tuesday at noon for 45 min"** → RYAA proposes, **Confirm/Cancel appear**.
- **Confirm** → `created` message (StubCalendar logs it; nothing hits the real calendar).

## Notes / out of scope
- **Routing is implicit** (the `_owner` dict + the model's tool choice). `router.py`'s LLM
  classifier stays parked — revisit it only when many skills make a single combined tool list
  noisy (then classify first to load one skill's tools).
- **Layering:** `skills/calendar.py` is deleted — all calendar *code* (event models + the
  `CalendarParser` LLM parser + the osascript backend) lives in `tools/calendar_tool.py`;
  `skills/` holds only guidance (`base.py`, `calendar_skill.py`, `todo_skill.py`). No aliases.
  Eventually the agent replaces the CLI workflow and `CalendarParser` retires.
- **Guardrails:** the calendar gate is dropped from `chat()` (RYAA is general now). Add a
  general security-only guardrail (prompt-injection) as a later refinement.
- **Generalize the yield later:** `AgentResult.event` is still calendar-typed, and `/confirm`
  takes an `EventDetails`. When a non-calendar skill needs to yield (e.g. Email → a draft), make
  the proposal payload generic and route `/confirm` by type. Fine to defer — Todo doesn't yield.
- `AppleCalendar.list_events` is **unverified on a real device** — the demo runs on `StubCalendar`.
  Test it separately before flipping `factory.py` to `AppleCalendar()`.
- The browser sends the full transcript every turn, including old completed schedules. Good enough
  for v1; a "new conversation" reset is a later nicety.
```
