from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime

from ryaa.providers.base import LLMProvider, Message
from ryaa.skills.base import AgentEvent, AgentResult, Skill

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
            #No tools call -> the modelis just talking to the user. End the turn 
            if not turn.tool_calls:
                return AgentResult(kind="reply", summary=turn.text or "...")

            messages.append(Message(role="assistant", content=turn.text, tool_calls=turn.tool_calls))

            for call in turn.tool_calls:
                skill = self._owner.get(call.name)          # ROUTE: which skill owns this tool?
                if skill is None:
                    messages.append(Message(role="tool", content=f"Unknown tool: {call.name}", tool_call_id=call.id))
                    continue
                outcome = skill.run_tool(call)              # dispatch to the owning skill
                if isinstance(outcome, AgentResult):        # terminal (e.g. a proposal) -> YIELD
                    return outcome
                # plain string -> ground truth, feed back and keep looping
                messages.append(Message(role="tool", content=outcome, tool_call_id=call.id))

        return AgentResult(kind="reply", summary="I'm having trouble with that one — can you rephrase?")

    def run_stream(self, history: list[Message]) -> Iterator[AgentEvent]:
        """
        Streaming twin of run(): same tool-calling loop, but yields the reply text
        as "delta" events as it's produced, "status" events when it runs a tool,
        and a final "result" event (the proposal or reply). The caller only sees
        AgentEvents — no provider details leak out.
        """
        messages = [Message(role="system", content=self._system_prompt()), *history]
        tools = self._all_tools()

        for _ in range(MAX_ITERS):
            turn = None
            for chunk in self.provider.act_stream(messages, tools, model=self.model):
                if chunk.type == "delta":
                    # Stream live. On a tool-calling turn this is usually empty; if
                    # not, it's preamble that the final "result" summary supersedes.
                    yield AgentEvent(type="delta", text=chunk.text)
                else:
                    turn = chunk.turn
            assert turn is not None, "provider.act_stream must end with a 'done' chunk"

            if not turn.tool_calls:
                yield AgentEvent(type="result", result=AgentResult(kind="reply", summary=turn.text or "..."))
                return

            messages.append(Message(role="assistant", content=turn.text, tool_calls=turn.tool_calls))

            for call in turn.tool_calls:
                skill = self._owner.get(call.name)
                if skill is None:
                    messages.append(Message(role="tool", content=f"Unknown tool: {call.name}", tool_call_id=call.id))
                    continue
                yield AgentEvent(type="status", status=skill.name)   # e.g. "calendar"
                outcome = skill.run_tool(call)
                if isinstance(outcome, AgentResult):
                    yield AgentEvent(type="result", result=outcome)
                    return
                messages.append(Message(role="tool", content=outcome, tool_call_id=call.id))

        yield AgentEvent(
            type="result",
            result=AgentResult(kind="reply", summary="I'm having trouble with that one — can you rephrase?"),
        )
