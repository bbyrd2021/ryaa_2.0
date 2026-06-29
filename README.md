# ryaa

**A personal AI assistant that asks before it acts.**

RYAA (*Real-time Yielding Autonomous Agent*) is autonomous enough to do real
work on your behalf — read your calendar, draft a change, line up an event — but
**yields control back to you before anything irreversible happens**. Nothing is
written to your calendar, nothing is sent, until you confirm. That tension —
autonomous *and* yielding — is the name and the core safety promise.

> "Asks before it acts."

---

## What it does today

- **Conversational agent** — chat naturally; RYAA uses tools only when they help.
- **Calendar** — read your Google Calendar, propose new events and edits to
  existing ones. It **proposes**, you **confirm**; only then does it write.
- **Todos** — backed by Google Tasks.
- **Streaming replies** — responses stream in token-by-token (SSE).
- **Voice (web client)** — browser VAD + Whisper speech-to-text in, ElevenLabs
  text-to-speech out, for hands-free use.

The fuller product vision and decision log live in [`DESIGN.md`](./DESIGN.md)
and [`MEMORY.md`](./MEMORY.md).

---

## Architecture

A single hosted **Python brain** (FastAPI) that every client talks to over HTTP.

```
                 ┌──────────────────────────────────────────┐
  mobile/  ──┐   │  ryaa/  — FastAPI backend (the "brain")   │
  frontend/ ─┼──▶│  agent loop · skills · model-agnostic LLM │──▶ OpenAI
  (clients)  │   │  provider · Google Calendar/Tasks · auth  │──▶ Google APIs
             │   └──────────────────────────────────────────┘──▶ ElevenLabs
  landing/ ──┘            (hosted on Railway)
```

**Design tenets**
- **Yield before acting.** Automated up to the action; the human approves the action (`propose` → `confirm`).
- **Model-agnostic.** Feature code speaks one neutral vocabulary (`LLMProvider`); swap vendors without touching skills.
- **Understandable.** Pure-Python, pattern-based, no black-box agent framework — every line is runnable and fixable.

### How a turn works

1. A client POSTs the transcript to `/propose` (or `/propose/stream` for SSE).
2. `Agent.run` loops: ask the model → if it calls a tool, route it to the owning
   **skill** → feed the result back → repeat until the model just replies.
3. A skill can **yield** a *proposal* (e.g. a calendar event) instead of acting.
4. The client shows a confirm card; on **Yes**, it POSTs `/confirm`, and only
   then does the event get written.

Key files: `ryaa/agent.py` (loop), `ryaa/orchestrator.py` (Scheduler),
`ryaa/skills/` (calendar, todo), `ryaa/providers/base.py` (the model-agnostic
contract), `ryaa/api.py` (HTTP surface).

---

## Repo layout

| Path | What it is |
|---|---|
| `ryaa/` | FastAPI backend — the brain. Agent, skills, tools, providers, auth. |
| `mobile/` | **Expo / React Native (TypeScript)** native client — the current app. iOS Liquid Glass + the CRT/chrome identity, glowing-markdown streaming chat. |
| `frontend/` | Vite + React web client (voice VAD). |
| `landing/` | Static marketing page (`index.html`), CRT/chrome identity. |
| `tests/` | Backend pytest suite. |
| `docs/` | Session notes & design references. |
| `DESIGN.md` · `MEMORY.md` | Product/architecture design and decision log. |

---

## Backend — run it

Requires **Python 3.12**.

```bash
pip install -r requirements.txt        # add requirements-dev.txt for tooling
cp .env.example .env                    # then fill in the values below
uvicorn ryaa.api:app --reload          # http://localhost:8000
```

Tests & lint:

```bash
pytest                 # tests live in tests/
ruff check . && ruff format .          # one tool, lint + format (pyproject.toml)
```

### Environment variables

| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` | LLM provider (default model `gpt-4o`). |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth — sign-in + Calendar/Tasks access. |
| `SESSION_SECRET` | Signs issued session tokens. |
| `CREDENTIALS_ENC_KEY` | Encrypts stored user refresh tokens at rest. |
| `DATABASE_URL` | DB connection (defaults to local `ryaa.db` SQLite). |
| `PUBLIC_BASE_URL` | Backend's public URL, for OAuth redirects. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` | Text-to-speech (voice out). |
| `RYAA_CALENDAR` | CLI-only calendar backend: `stub` for tests, else local Apple Calendar. (The hosted API uses per-user Google Calendar.) |

Deploy: `Procfile` runs `uvicorn ryaa.api:app` — hosted on **Railway**.

---

## Mobile — run it

Expo SDK 54 (TypeScript). On a physical iPhone via Expo Go for dev:

```bash
cd mobile
npm install
npm run go        # forces the Mac's LAN host + clears the Metro cache
# then scan the QR in Expo Go (phone + Mac on the same Wi-Fi)
# npm run tunnel  # fallback if Wi-Fi isolation blocks the bundle
```

The app points at the hosted Railway backend (`mobile/api.ts`).

Ship to TestFlight with EAS (`mobile/eas.json` has the profiles):

```bash
eas login && eas init
eas build --platform ios --profile production
eas submit --platform ios --latest
```

The RYAA visual identity (warm-paper minimalism + one retro CRT moment + flat
brushed chrome) is codified in `.claude/skills/ryaa-crt-chrome/`.

---

## Web frontend & landing

```bash
cd frontend && npm install && npm run dev    # Vite dev server (voice client)
```

The landing page is a single static `landing/index.html` — deploy to any static
host (e.g. Vercel, root directory `landing`).

---

## Tech stack

**Backend:** Python 3.12 · FastAPI · OpenAI · Google Calendar/Tasks · SQLModel ·
Pydantic · Ruff · pytest · Railway.
**Mobile:** Expo / React Native · TypeScript · expo-glass-effect (iOS 26 Liquid
Glass) · react-native-markdown-display.
**Web:** Vite · React · `@ricky0123/vad-web`.
