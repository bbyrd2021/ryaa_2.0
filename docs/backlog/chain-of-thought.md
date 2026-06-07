# Backlog: Thought / Chain-of-Thought (show RYAA thinking)

**Priority:** FRONT OF QUEUE (Brandon, 2026-06-06) — ahead of modify-events / Email roadmap.
**Status:** captured, not designed. (This is the promoted version of the spec's deferred
"stream the agent's intermediate steps to the UI" item.)

## Goal
Make RYAA's reasoning visible — surface its "thought" and the steps the agent loop takes
(which tools it called and why) instead of only the final reply. Directly serves Anthropic's
"prioritize transparency by explicitly showing the agent's planning steps."

## What "thought" maps to in our architecture
The agent loop already produces the raw material every iteration:
- the model's free-text before/around a tool call,
- each tool call (`list_events`, `propose_event`, `add_todo`) and its result.
Today `Agent.run` collects these in `messages` and throws them away, returning only the final
`AgentResult`. CoT = expose that trail.

## Open questions (decide at design time)
- **Surface what:** a true model CoT (reasoning tokens) vs. a friendly trace of tool steps
  ("checking your calendar…", "found a conflict…"). Lean toward the **step trace** first — honest,
  cheap, and it's what the loop already has.
- **Transport:** batch (return the steps with the response) vs. **stream** (SSE/websocket so the
  UI shows steps live as they happen). Streaming is the satisfying version but is a bigger lift —
  `act()`/`run()` would need to yield events.
- **UI:** a collapsible "thinking" disclosure under RYAA's bubble; reuse the working-indicator
  motion language. Design-taste pass applies.

## Notes
- Step-trace + batch is the small first slice; streaming is the follow-up.
- Couples with Voice (spoken "thinking" cues) and the design-taste frontend work.
