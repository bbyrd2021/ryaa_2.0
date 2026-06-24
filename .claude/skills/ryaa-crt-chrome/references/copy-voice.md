# Reference — Copy voice (so content doesn't feel templated)

Copy can make a design feel as templated as the design itself. Write RYAA copy in this voice.

## What RYAA is

RYAA = **Real-Time Yielding Autonomous Agent**: a safe academic assistant for university students that does the work, then yields control at a confirm gate before anything irreversible (sending, scheduling, saving). The thesis is "autonomous BUT yielding — it asks before it acts."

## Capability truth (don't overstate)

- **Working now:** Calendar scheduling + Tasks, BOTH via Google Calendar.
- **"Soon":** Study Coach, Email, Morning Brief. Mark these clearly as not-yet-live.

## Two audiences, one section structure

Students don't care that it's pure Python; recruiters and eng leads do. Resolve this by REFRAMING, not cutting: lead each user-facing section with the BENEFIT, let the architecture sit underneath as proof.

- User-facing headline: the promise ("asks before it acts", "grounded in your real courses").
- Supporting evidence below: the receipts (pure-Python, model-agnostic `LLMProvider` protocol, parallel fail-closed guardrails, FastAPI backend). Students skim the promise; recruiters read the proof.

## Mechanics

- Avoid em-dashes in shipped copy (an AI-writing tell). Use periods or restructure.
- Lowercase `ryaa.` in running text and the on-screen wordmark; uppercase `RYAA` only on the chrome bezel badge.
- Keep it plain and confident. No vibe-code phrasing, no terminal cosplay in copy either.
