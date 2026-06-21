# Spec — Mobile agent, multi-user + hosted (Expo client over a per-user, provider-agnostic Python brain)

> The pivot: RYAA stops being a single-user app on Brandon's Mac and becomes **a mobile agent his
> friends install on their iPhones**, each with **their own account**. The Python "brain" moves off
> the laptop, learns who's asking, and acts on each user's **real Google account** — calendar, tasks,
> and (incrementally) mail — instead of the local macOS Calendar. Voice is **deprioritized** and out
> of scope here; the MVP is a **text** agent.

## Context

Today (`ryaa/api.py` + `ryaa/factory.py`):
- One **global** `Scheduler`, built once at import: `scheduler = build_scheduler()`.
- Backend is `AppleCalendar()` — the **real macOS Calendar**, via the local machine (Mac-only).
- `InMemoryEventStore()` — one global dict of event provenance, no user concept.
- `TodoSkill` is a **no-op stub** (`StubTodos` only logs).
- Endpoints `/propose`, `/confirm` (+ voice `/transcribe`, `/speak`, both out of scope now).
- No identity, no persistence; CORS pinned to `:5173`; API base hardcoded to `localhost:8000`.

Three things make "friends use it on their iPhones" true:
1. **The brain must leave the laptop** — deploy FastAPI to Railway; phones can't reach `localhost`.
2. **The brain must know who's asking** — sign-in, verified server-side; every request scoped to a user.
3. **The data lives on the user's real provider, not our DB** — calendar/tasks/mail are read and
   written through Google's APIs. No mirroring.

## Architecture principles (the load-bearing decisions)

1. **Identity provider ≠ data provider — keep them independent.** *How you sign in* (Google, later
   Apple) is authentication; *whose calendar/tasks/mail RYAA acts on* is the connected provider
   account. They don't have to match. "Sign in" and "connect your account" are distinct (they can
   collapse into one consent for a Google user).
2. **One provider account powers calendar + tasks + mail — no mix-matching, by design.** A user
   connects *one* provider (Google for v1); that single `ProviderConnection` feeds all three
   capabilities. You don't pair Google Calendar with Outlook mail.
3. **Three agnostic seams, already-or-soon Protocols:** `CalendarBackend` (exists),
   `TasksBackend`, `MailBackend`. The agent/skills call the Protocols and never know it's Google
   behind them. `GoogleCalendarBackend` / `GoogleTasksBackend` / `GmailBackend` are just the first
   implementations. **Agnostic by interface, Google by implementation, for v1.**
4. **The user's real Google account is the source of truth — no mirroring.** We keep no synced copy of
   events, tasks, or emails. This is what keeps the DB to two tables and removes all sync/drift machinery.
5. **Provenance is a backend responsibility, not shared-code state.** "Is this RYAA's event / when did
   it touch it" is answered by each backend however its platform allows — so no Google-ism leaks into
   the brain. Google v1: native `created`/`updated` + a private `extendedProperties` tag `ryaa=1`.

**Non-goals (designed-for, not built here):** voice; Apple Sign-In; Outlook/iCloud backends; Android
polish; App Store submission.

---

## Part 1 — Identity (provider-agnostic sign-in, verified server-side)

**v1 uses Sign in with Google**, but the model is **provider-agnostic** from day one (Apple is
*required* on the App Store once you offer Google sign-in, so don't hardcode Google).

```python
# ryaa/auth.py — verify the identity token, yield the User. Stateless: the token IS the proof.
async def current_user(authorization: str = Header(...), session=Depends(get_session)) -> User:
    claims = verify_google_id_token(authorization.removeprefix("Bearer ").strip())  # 401 on failure
    return upsert_user(session, provider="google",
                       provider_subject=claims["sub"], email=claims.get("email"))
```
- Key a user on **(`auth_provider`, `provider_subject`)** — never email.
- First sign-in auto-provisions the `User`; no separate signup flow; **no session table** needed.
- Signing in ≠ data access. Calendar/tasks/mail authorization is a separate OAuth grant (Part 2).

---

## Part 2 — The provider connection + Google backends (the source of truth)

One `ProviderConnection` per user = one connected Google account, holding the creds + the set of
granted scopes, feeding all three backends.

**Scopes — granted incrementally, not all up front:**
- **At connect time:** `calendar.events` + `tasks` (both Google "sensitive," both core scheduling) —
  the "scheduling bundle."
- **On first email use:** Gmail scope (heavier — inbox read is Google's "restricted" tier; send-only
  is "sensitive"). Calendar/tasks-only users never face the Gmail consent.
- `access_type=offline` to get a **refresh token**; record granted scopes in the connection so the app
  can detect when it must prompt for an incremental grant.

**The three backends**, each implementing its Protocol, all constructed from a user's `ProviderConnection`:
- **`GoogleCalendarBackend`** (`CalendarBackend`) — events. **Owns provenance:** `create_event` stamps
  `extendedProperties.private = {"ryaa": "1"}`; `list_events`/`find_events` read it back (+ Google's
  native timestamps) to populate `EventRef.state` — so RYAA tells its own events from pre-existing
  ones **without a store**. *(This collapses the old `EventStore` seam into the backend; the
  `EventState` model survives as a return shape, `InMemoryEventStore`/`EventStore` Protocol /
  `SqlEventStore` proposed in an earlier draft are dropped.)*
- **`GoogleTasksBackend`** (`TasksBackend`) — todos, via the Google Tasks API. **Resolves the old
  "Todo table" question:** todos are source-of-truth on Google, **no DB table**. `TodoSkill` is rewired
  off `StubTodos` onto this backend.
- **`GmailBackend`** (`MailBackend`) — `search_messages`, `get_message`, `create_draft`/`send_message`.
  A `MailSkill` wraps it. **Sending is high-stakes and routes through the existing `propose → confirm`
  human-in-the-loop** (and `ryaa/safety/`) — RYAA drafts, the user confirms, never autonomous send.
  Gmail is the source of truth; no emails stored.

**Friends-and-family reality check:** calendar/tasks/mail are sensitive/restricted scopes, so until the
OAuth app is verified the consent screen warns "unverified app." In **testing mode you add friends as
test users (≤100)** and they click through. Verification (incl. a security assessment for restricted
Gmail read) is only needed to go public.

---

## Part 3 — Persistence (SQLModel: still just two tables)

**SQLModel**, SQLite for local dev → Postgres on Railway. The DB is tiny because the Google account
holds all the real data.

```python
class User(SQLModel, table=True):
    id: uuid                                  # surrogate PK
    auth_provider: str                        # "google" (later "apple")
    provider_subject: str                     # the sub from that provider
    email: str | None
    timezone: str | None                      # resolve "noon Tuesday"; cache from primary calendar
    created_at: datetime
    # unique(auth_provider, provider_subject)

class ProviderConnection(SQLModel, table=True):
    id: uuid
    user_id: uuid                             # FK -> User
    provider: str                             # "google" (later "microsoft"/"apple")
    credentials: str                          # refresh token / creds — ENCRYPTED AT REST
    scopes: str                               # what's granted so far (calendar+tasks now, mail later)
    created_at: datetime
```
- **Two tables, full stop.** No events, no tasks, no emails, no provenance table — all on Google.
- **`credentials` encrypted at rest** — the key to a friend's whole Google account.
- **`scopes`** drives incremental consent (know when to prompt for Gmail).
- **`timezone`** is load-bearing for a scheduling agent; cache it, don't refetch each request.
- **Not stored:** access tokens (ephemeral), display name/avatar (in the ID token), conversation
  history (client sends the full transcript per `/propose`), preferences/usage counters (later).
- **Migrations:** none yet — `SQLModel.metadata.create_all()` on startup (Alembic later).

---

## Part 4 — Per-user assembly (global Scheduler → one-per-user, per request)

`Scheduler` (and the skills) wrap per-user backends, so one global instance can't serve two users.
**Decision: build per-user, per-request** (rebuild cost is microseconds vs the LLM round-trip;
caching has a DB-session-lifetime gotcha — revisit only if profiling demands).

```python
def build_scheduler_for(user: User, conn: ProviderConnection) -> Scheduler:
    cal   = GoogleCalendarBackend.from_credentials(conn)   # AppleCalendar is GONE from the hosted path
    tasks = GoogleTasksBackend.from_credentials(conn)
    mail  = GmailBackend.from_credentials(conn)            # usable once the mail scope is granted
    agent = Agent(provider=SHARED_PROVIDER,
                  skills=[CalendarSkill(cal), TodoSkill(tasks), MailSkill(mail)])
    return Scheduler(guardrails=Guardrails(provider=SHARED_PROVIDER),
                     calendar=CalendarParser(provider=SHARED_PROVIDER), backend=cal, agent=agent)
```
- `OpenAIProvider` stays a **shared singleton** (your key, stateless per call).
- `AppleCalendar` removed from the hosted assembly (crashes on Linux/Railway; stays for local CLI only).
- Endpoints gain `Depends(current_user)` + the user's connection; request/response models
  (`ProposeResult`/`ScheduleResult`, the `messages` body) are **unchanged** — auth rides in the header.

---

## Part 5 — Deploy (Railway; the first unblocker — do it early, even single-user)

Deploys straight from `github.com/bbyrd2021/ryaa_2.0`, auto-redeploys on push, one-click Postgres.

1. **New project → Deploy from GitHub repo** → `ryaa_2.0`. Nixpacks builds from `requirements.txt`.
2. **Add deps:** `sqlmodel`, `psycopg[binary]`, `google-auth`, `google-auth-oauthlib`,
   `google-api-python-client`, `uvicorn[standard]`.
3. **Start command:** `web: uvicorn ryaa.api:app --host 0.0.0.0 --port $PORT` (bind `0.0.0.0`/`$PORT`).
4. **Add Postgres** add-on; set `DATABASE_URL` to `${{Postgres.DATABASE_URL}}`.
5. **Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `OPENAI_API_KEY`, `CREDENTIALS_ENC_KEY`
   (encrypts stored refresh tokens), + `ELEVENLABS_*` if keeping voice endpoints.
6. **Generate a public domain** — that URL is the API base for the Expo app.
7. **Pin Python 3.12** (`.python-version`/`runtime.txt`).

**Gotchas:** `AppleCalendar` crashes the boot on Railway — swap to `StubCalendar` for Phase 0. Railway's
`DATABASE_URL` is `postgresql://…` (works as-is). Run `create_all()` on startup. Native mobile requests
send no browser `Origin`, so CORS doesn't gate them — keep an explicit allowlist for web preview, drop
the `:5173` pin.

**Sanity milestone (Phase 0):** deploy the current single-user app with `StubCalendar`, hit the Railway
URL, confirm `/propose` serves.

---

## Part 6 — The Expo client (where the TypeScript reps happen)

A **fresh** Expo app — the existing `frontend/` (Vite/React) was the prototype; its HTML/CSS doesn't
port to React Native. The flow + API contract port; the UI is rebuilt.

- **Scaffold:** `npx create-expo-app` (TypeScript), Expo Router.
- **Sign-in:** `expo-auth-session` Google provider (works **inside Expo Go**; native
  `@react-native-google-signin` needs a custom dev build). Token in `expo-secure-store`.
- **Connect account:** the scheduling-bundle OAuth grant (`calendar.events` + `tasks`), same Google
  consent as sign-in; Gmail requested later on first email use.
- **API client:** `fetch` wrapper injecting `Authorization: Bearer <token>`, pointed at the Railway URL.
- **Screens (MVP):** (1) Sign-in / connect, (2) Chat — transcript POSTed to `/propose`; on `proposed`,
  a confirm card POSTs to `/confirm`. No voice.
- **Distribution:** **Expo Go + EAS Update** now (free, no Apple account). **EAS Build + TestFlight**
  later (Apple Developer Program, $99/yr).

---

## Build order (backend first)

- **Phase 0 — Deploy single-user.** ✅ DONE (2026-06-17). Swap `AppleCalendar`→`StubCalendar`
  (`RYAA_CALENDAR=stub` env toggle), deploy to Railway, hit the URL. Live at
  `https://web-production-7f7d88.up.railway.app`.
- **Phase 1 — DB foundation.** ✅ DONE (2026-06-20). SQLModel; `User` + `ProviderConnection`; SQLite
  local → Railway Postgres (`postgresql+psycopg://`); `init_db()` via `create_all()` in the FastAPI
  `lifespan`. Verified: tables created against Postgres in the cloud.
- **Phase 2 — Identity.** ⬅ NEXT. `current_user` (Google ID-token verify); first sign-in provisions a `User`.
- **Phase 3 — Connect + Calendar.** Scheduling-bundle OAuth → encrypted refresh token in
  `ProviderConnection`; `GoogleCalendarBackend` (incl. `extendedProperties` provenance); per-user
  `build_scheduler_for`; remove `AppleCalendar` from the hosted path; collapse the `EventStore` seam.
- **Phase 4 — Tasks.** `GoogleTasksBackend`; rewire `TodoSkill` off the stub. Small add on the same connection.
- **Phase 5 — Mail.** Incremental Gmail scope; `GmailBackend` + `MailSkill`; send routed through `confirm`.
- **Phase 6 — Expo client.** Sign-in + connect + text chat; ship via Expo Go.
- **Phase 7+ (later, not this spec):** Apple Sign-In; Outlook/iCloud backends; voice; TestFlight.

## Decisions locked (this session)

- Native **Expo/React Native** client; **voice deprioritized** (text MVP).
- **Multi-user**, each friend their own account; **Railway** host; **SQLModel** (SQLite→Postgres).
- **Per-request, per-user** Scheduler.
- **Identity ≠ data provider**; provider-agnostic identity.
- **One Google account powers calendar + tasks + mail — no mix-matching.** Three agnostic backends
  (`CalendarBackend`/`TasksBackend`/`MailBackend`); **Google-only implementations for v1**.
- **Google account = source of truth, no mirror.** Event provenance = `extendedProperties` on the
  event (backend-owned). **Todos = Google Tasks** (no DB table). **Emails not stored.**
- **Scopes incremental:** calendar + tasks at connect; **Gmail on first email use**. Mail **send routes
  through `propose → confirm`**.
- DB = **two tables**: `User` + `ProviderConnection` (encrypted creds); `timezone` stored.

## Open questions

None — design converged. **Phases 0–1 are done** (deployed to Railway + Postgres persistence live);
next concrete move is **Phase 2** (Google identity / `current_user` token-verify dependency).
