# Backlog: Modify / reschedule existing calendar events

**Status:** SUPERSEDED (2026-06-06) by `docs/specs/modify-events.md` (agent-era design).
The Router/Selector approach below predates the agent loop; the build now uses agent tools
(`find_events` + `propose_modification`) with conversational disambiguation, plus a local
event-state store. Kept for history.

## Goal
Let RYAA change existing events ("move my brunch to 11", "make the study session 90 min"), not just create new ones. This is the README's routing example (new vs modify) applied for real.

## Key decisions
- **Intra-skill routing:** reuse the existing `Router` class (registry-driven) with `{create, modify}` to classify intent inside the calendar flow. (Routing at two levels: top-level skill selection + intra-calendar intent.)
- **Target identification = "list matches, you pick"** (Brandon's choice). RYAA finds candidate events and presents a numbered list; user selects which to modify. More precise for duplicates; more interaction/UI than best-match-confirm.

## New pieces required
- **`Selector` seam** — parallels `Confirmer`, but for choosing from a list: `select(options) -> chosen`. Implementations: `CLISelector` (numbered prompt + read int), web selector (clickable list, later), `FakeSelector` (canned index for tests). Same DI pattern as everything else.
- **`CalendarBackend` grows:** add `find_events(query/window) -> list[EventRef]` and `update_event(event_id, changes) -> str`. Stub in `StubCalendar`; real osascript in `AppleCalendar` last.
- **`EventRef` model** — id, title, start (what `find_events` returns, what the Selector lists).
- **`ModifyRequest` schema** — target description + the changes (new_start?, new_duration_minutes?, etc.).

## Build phases (stub-first, each green before next)
- **A.** `CalendarSkill.classify_intent(text) -> "create"|"modify"|"unknown"` (reuse `Router`) + a test. *(This was the only piece partially specced; not yet built.)*
- **B.** Grow `CalendarBackend` (`find_events`, `update_event`); stub in `StubCalendar`; add `EventRef`.
- **C.** Modify flow: `ModifyRequest` → `find_events` → `Selector.select` (pick) → confirm → `update_event`. Add `Selector` Protocol + `CLISelector` + `FakeSelector`.
- **D.** Tests for the modify flow with fakes (incl. fail-closed / wrong-pick paths).
- **E.** Real osascript `find`/`update` in `AppleCalendar`.

## Flow sketch
```
"move brunch to 11"
  → router intent = modify
  → parse ModifyRequest (target="brunch", change: start->11am)
  → find_events("brunch", upcoming) -> [candidates]
  → Selector.select(candidates) -> chosen event   (the "you pick" step)
  → confirm the change (reuse confirm gate)
  → backend.update_event(chosen.id, changes)
```

## Notes
- Reuses existing seams (Router, Confirmer) — the new abstraction is `Selector`.
- Don't fully design the universal Skill interface here either — extract from 2+ skills.
