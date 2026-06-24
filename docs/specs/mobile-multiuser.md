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
  - **Participants stay names, not emails** (that's how the agent extracts them from NL, e.g.
    "lunch with Sam"). Google `attendees` need real emails, so participant names round-trip via
    `extendedProperties.ryaa_participants` instead — they label the event, they don't invite anyone.
  - *Future enhancement (backlog, not v1):* **real calendar invites.** When RYAA actually needs to
    invite someone, it just **asks the user for the email conversationally** (same clarification flow
    it uses for a missing time) — no Contacts/People API needed. Evolve `participants` toward emails
    then.
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
- **Phase 2 — Identity.** ✅ DONE (2026-06-20). `current_user` (Google ID-token verify); first sign-in
  provisions a `User`. Verified local + cloud (Railway). `GOOGLE_CLIENT_ID` read lazily (import-order).
- **Phase 3 — Connect + Calendar.** ⬅ NEXT. Scheduling-bundle OAuth → encrypted refresh token in
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

None — design converged. **Phases 0–2 are done** (deployed to Railway, Postgres persistence, Google
identity — all live); next concrete move is **Phase 3** (connect calendar OAuth + `GoogleCalendarBackend`
+ per-user `build_scheduler_for`).

---

## Phase 3 — reference implementation (3b + 3c, type these in verbatim)

Complete code for the encryption helper and the Google Calendar backend. Type into the named files.

### Deps + env (do first)
- `requirements.txt`: add `cryptography` and `google-api-python-client` (`google-auth` already present),
  then `pip install` them in the `ryaa` env.
- Generate the Fernet key:
  ```
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```
  Add to `.env` (and Railway later): `CREDENTIALS_ENC_KEY=<that key>`. (`GOOGLE_CLIENT_SECRET` is
  already in `.env`.)

### 3b — `ryaa/crypto.py` (new file)
```python
import os

from cryptography.fernet import Fernet


def _fernet() -> Fernet:
    # read the key lazily (not at import) so load_dotenv() has already run
    return Fernet(os.environ["CREDENTIALS_ENC_KEY"])


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()
```

### 3c — `ryaa/tools/google_calendar.py` (new file)
```python
import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from ryaa.tools.calendar_tool import EventDetails, EventRef
from ryaa.tools.event_state import EventState

_TOKEN_URI = "https://oauth2.googleapis.com/token"


def _parse_when(when: dict) -> datetime:
    # timed events have {"dateTime": ...}; all-day events have {"date": ...}
    raw = when.get("dateTime") or when["date"]
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


class GoogleCalendarBackend:
    """CalendarBackend backed by a user's real Google Calendar (refresh-token creds)."""

    def __init__(self, refresh_token: str, timezone: str = "America/New_York"):
        self._creds = Credentials(
            token=None,  # no access token yet — refreshed automatically on first call
            refresh_token=refresh_token,
            token_uri=_TOKEN_URI,
            client_id=os.environ["GOOGLE_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        )
        self._svc = build(
            "calendar", "v3", credentials=self._creds, cache_discovery=False
        )
        self._tz = timezone
        self._zone = ZoneInfo(timezone)
        self._cal = "primary"

    def create_event(self, event: EventDetails) -> str:
        body = self._body(event, status="created")
        created = self._svc.events().insert(calendarId=self._cal, body=body).execute()
        return created["id"]

    def update_event(self, event_id: str, event: EventDetails) -> str:
        body = self._body(event, status="modified")
        updated = (
            self._svc.events()
            .patch(calendarId=self._cal, eventId=event_id, body=body)
            .execute()
        )
        return updated["id"]

    def list_events(self, start: datetime, end: datetime) -> list[EventRef]:
        return self._query(start, end, query=None)

    def find_events(self, query: str, start: datetime, end: datetime) -> list[EventRef]:
        return self._query(start, end, query=query)

    # ---- helpers ----

    def _body(self, event: EventDetails, status: str) -> dict:
        end = event.start + timedelta(minutes=event.duration_minutes)
        return {
            "summary": event.name,
            "start": {"dateTime": event.start.isoformat(), "timeZone": self._tz},
            "end": {"dateTime": end.isoformat(), "timeZone": self._tz},
            "extendedProperties": {
                "private": {
                    "ryaa": "1",
                    "ryaa_status": status,
                    "ryaa_participants": json.dumps(event.participants),
                }
            },
        }

    def _query(
        self, start: datetime, end: datetime, query: str | None
    ) -> list[EventRef]:
        params = {
            "calendarId": self._cal,
            "timeMin": self._rfc3339(start),
            "timeMax": self._rfc3339(end),
            "singleEvents": True,
            "orderBy": "startTime",
        }
        if query:
            params["q"] = query
        resp = self._svc.events().list(**params).execute()
        return [self._to_ref(e) for e in resp.get("items", [])]

    def _rfc3339(self, dt: datetime) -> str:
        # Google rejects naive datetimes for timeMin/timeMax — attach the backend's zone
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=self._zone)
        return dt.isoformat()

    def _to_ref(self, e: dict) -> EventRef:
        start = _parse_when(e["start"])
        end = _parse_when(e["end"])
        priv = e.get("extendedProperties", {}).get("private", {})
        state = None
        if priv.get("ryaa") == "1":  # our event → populate provenance; else external → None
            state = EventState(
                status=priv.get("ryaa_status", "created"),
                created_at=datetime.fromisoformat(e["created"].replace("Z", "+00:00")),
                modified_at=datetime.fromisoformat(e["updated"].replace("Z", "+00:00")),
            )
        return EventRef(
            id=e["id"],
            name=e.get("summary", ""),
            start=start,
            duration_minutes=int((end - start).total_seconds() // 60),
            participants=json.loads(priv.get("ryaa_participants", "[]")),
            state=state,
        )
```

**Before you run it:** change the `timezone` default to *your* IANA zone (e.g. `America/Chicago`) — in
3e it gets fed from `User.timezone`, but for testing it's the constructor default. Note this hits your
**real** calendar.

### 3e — per-user assembly + endpoint cutover (type these in)

Three edits. The endpoints stop using the global single-user scheduler and build a per-user one from
the caller's `ProviderConnection`. Provenance now lives on the Google event, so the per-user path uses
**no store** (the CLI keeps its store; this is backward compatible).

**1. `ryaa/skills/calendar_skill.py`** — in `_events_json`, don't overwrite the backend's state when
there's no store. Replace the loop:
```python
        # OLD:
        # for e in events:
        #     e.state = self.store.get(e.id) if self.store else None
        # NEW:
        for e in events:
            if self.store is not None:      # CLI store path: annotate from the store
                e.state = self.store.get(e.id)
            # no store (Google path): keep the state the backend already set
```

**2. `ryaa/factory.py`** — add these imports near the top and the new function at the bottom:
```python
from ryaa.crypto import decrypt
from ryaa.db_models import ProviderConnection, User
from ryaa.tools.google_calendar import GoogleCalendarBackend


def build_scheduler_for(user: User, conn: ProviderConnection) -> Scheduler:
    """Per-user Scheduler backed by the user's real Google Calendar."""
    provider = OpenAIProvider()
    backend = GoogleCalendarBackend(
        refresh_token=decrypt(conn.credentials),
        timezone=user.timezone or "America/New_York",
    )
    agent = Agent(provider=provider, skills=[CalendarSkill(backend), TodoSkill()])
    return Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarParser(provider=provider),
        backend=backend,
        agent=agent,
        # no store — provenance lives on the Google event (extendedProperties)
    )
```

**3. `ryaa/api.py`** — cut the endpoints over to a per-user scheduler.

Imports — adjust these lines:
```python
from sqlmodel import Session, select                                   # NEW
from ryaa.db import get_session, init_db                               # add get_session
from ryaa.db_models import ProviderConnection, User                    # add ProviderConnection
from ryaa.factory import build_scheduler_for                           # replaces build_scheduler
from ryaa.orchestrator import ProposeResult, Scheduler, ScheduleResult # add Scheduler
```

Delete the module-level line `scheduler = build_scheduler()` (no longer used — the global single-user
scheduler is gone; each request builds its own).

Add the dependency and update both endpoints (note: `user` is now consumed inside `user_scheduler`,
so it drops off the endpoint signatures — auth is still enforced via the dependency chain):
```python
def user_scheduler(
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
) -> Scheduler:
    conn = session.exec(
        select(ProviderConnection).where(
            ProviderConnection.user_id == user.id,
            ProviderConnection.provider == "google",
        )
    ).first()
    if conn is None or not conn.credentials:
        raise HTTPException(409, "No calendar connected — connect Google Calendar first.")
    return build_scheduler_for(user, conn)


@app.post("/propose")
def propose(
    req: ProposeRequest, scheduler: Scheduler = Depends(user_scheduler)
) -> ProposeResult:
    history = [Message(role=m.role, content=m.content) for m in req.messages]
    return scheduler.chat(history)


@app.post("/confirm")
def confirm(
    req: ConfirmRequest, scheduler: Scheduler = Depends(user_scheduler)
) -> ScheduleResult:
    try:
        if req.action == "modify" and req.event_id:
            return scheduler.update(req.event_id, req.event)
        return scheduler.create(req.event)
    except RuntimeError as e:
        logger.warning("Confirm failed: %s", e)
        return ScheduleResult(status="failed", message=str(e))
```

After typing these in, I'll run a **seed script** (encrypts your `.env` refresh token into a
`ProviderConnection` for your user) and a **direct test** that calls `build_scheduler_for(...)` →
`scheduler.chat(...)` / `scheduler.create(...)` against your real calendar — no fresh `id_token`
needed (that path is already proven in Phase 2). `AppleCalendar` stays in `build_scheduler()` for the
CLI but is no longer in the hosted path.

### 3d — `POST /connect/google` onboarding endpoint (type these in)

Turns an OAuth **authorization code** (from the client) into a stored, encrypted `ProviderConnection`,
and captures the user's real calendar timezone into `User.timezone`. The Expo app drives this in
Phase 6; for now it's testable with a one-time code.

**`ryaa/api.py`** — add import:
```python
from ryaa.crypto import encrypt   # NEW
# (requests, os, select, Session, get_session, current_user, User, ProviderConnection,
#  HTTPException already imported from earlier phases)
```
> Note: `calendar.events` can NOT read calendar metadata (`calendars().get` → 403), so we do **not**
> fetch the calendar timezone server-side. The **client sends its device timezone** in the request.

Add the request model + endpoint:
```python
class ConnectRequest(BaseModel):
    code: str
    redirect_uri: str
    code_verifier: str | None = None   # PKCE (Expo app sends this); optional for manual testing
    timezone: str | None = None        # client's IANA tz (calendar.events can't read calendar metadata)


@app.post("/connect/google")
def connect_google(
    req: ConnectRequest,
    user: User = Depends(current_user),
    session: Session = Depends(get_session),
):
    # 1. exchange the one-time auth code for tokens
    data = {
        "code": req.code,
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": req.redirect_uri,
        "grant_type": "authorization_code",
    }
    if req.code_verifier:
        data["code_verifier"] = req.code_verifier
    resp = requests.post("https://oauth2.googleapis.com/token", data=data)
    if resp.status_code != 200:
        raise HTTPException(400, f"Token exchange failed: {resp.text}")
    tokens = resp.json()

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        # Google only returns this on first consent — client must use access_type=offline + prompt=consent
        raise HTTPException(400, "No refresh token returned; re-consent with offline access + prompt=consent.")

    # 2. upsert the connection (encrypted) + set the user's timezone (client-supplied)
    conn = session.exec(
        select(ProviderConnection).where(
            ProviderConnection.user_id == user.id,
            ProviderConnection.provider == "google",
        )
    ).first()
    if conn is None:
        conn = ProviderConnection(user_id=user.id, provider="google")
    conn.credentials = encrypt(refresh_token)
    conn.scopes = tokens.get("scope", "")
    if req.timezone:
        user.timezone = req.timezone
    session.add(conn)
    session.add(user)
    session.commit()

    return {"connected": True, "timezone": user.timezone, "scopes": conn.scopes}
```

**Testing it** needs a fresh one-time auth code. The code→refresh-token exchange is the same mechanism
the Playground already proved; the new parts are the **timezone capture** and the **DB upsert**. Two
options: (a) smoke-test the error path (bogus code → `400`) right after you type it in, or (b) a full
real test where you mint a one-time code and we watch a real `ProviderConnection` + `User.timezone`
get written. The full happy path also gets exercised naturally when the Expo app lands (Phase 6).

---

## Phase 4 — reference implementation (Google Tasks, type these in)

Todos move off the `StubTodos` stub onto the user's real Google Tasks — same refresh-token /
`Credentials` pattern as the calendar backend, on the **same `ProviderConnection`** (the `tasks` scope
is already granted). No DB table. Four edits.

### 1. `ryaa/tools/todo_tool.py` (rewrite the whole file)
```python
from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel


class TaskItem(BaseModel):
    id: str
    title: str
    completed: bool = False


class TasksBackend(Protocol):
    def add_task(self, title: str) -> str: ...  # returns the task id
    def list_tasks(self, include_completed: bool = False) -> list[TaskItem]: ...


class StubTasks:
    """In-memory tasks backend for the CLI and tests."""

    def __init__(self) -> None:
        self._tasks: list[TaskItem] = []

    def add_task(self, title: str) -> str:
        tid = f"stub-task-{len(self._tasks) + 1}"
        self._tasks.append(TaskItem(id=tid, title=title))
        return tid

    def list_tasks(self, include_completed: bool = False) -> list[TaskItem]:
        return [t for t in self._tasks if include_completed or not t.completed]
```

### 2. `ryaa/tools/google_tasks.py` (new file)
```python
import os

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from ryaa.tools.todo_tool import TaskItem

_TOKEN_URI = "https://oauth2.googleapis.com/token"


class GoogleTasksBackend:
    """TasksBackend backed by the user's real Google Tasks (refresh-token creds)."""

    def __init__(self, refresh_token: str):
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri=_TOKEN_URI,
            client_id=os.environ["GOOGLE_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        )
        self._svc = build("tasks", "v1", credentials=creds, cache_discovery=False)
        self._list = "@default"  # the user's default task list

    def add_task(self, title: str) -> str:
        created = (
            self._svc.tasks().insert(tasklist=self._list, body={"title": title}).execute()
        )
        return created["id"]

    def list_tasks(self, include_completed: bool = False) -> list[TaskItem]:
        resp = (
            self._svc.tasks()
            .list(tasklist=self._list, showCompleted=include_completed, showHidden=include_completed)
            .execute()
        )
        return [
            TaskItem(
                id=t["id"],
                title=t.get("title", ""),
                completed=t.get("status") == "completed",
            )
            for t in resp.get("items", [])
        ]
```

### 3. `ryaa/skills/todo_skill.py` (rewrite the whole file)
```python
from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.tools.todo_tool import StubTasks, TasksBackend


class AddTodoArgs(BaseModel):
    text: str = Field(description="The to-do text")


ADD_TODO = ToolSpec(
    name="add_todo",
    description="Add a to-do item to the user's Google Tasks.",
    parameters=AddTodoArgs.model_json_schema(),
)

LIST_TODOS = ToolSpec(
    name="list_todos",
    description="List the user's current (incomplete) to-dos.",
    parameters={"type": "object", "properties": {}},  # no args
)


class TodoSkill:
    "SKILL: track to-dos in the user's Google Tasks."

    name = "todos"
    description = "Track to-do items."

    def __init__(self, backend: TasksBackend | None = None):
        self.backend = backend or StubTasks()

    def instructions(self) -> str:
        return (
            "When the user wants to remember or track a task, call add_todo. "
            "When they ask what's on their list / what they need to do, call list_todos."
        )

    def tools(self) -> list[ToolSpec]:
        return [ADD_TODO, LIST_TODOS]

    def run_tool(self, call: ToolCall) -> str:
        if call.name == "add_todo":
            args = AddTodoArgs.model_validate(call.arguments)
            self.backend.add_task(args.text)
            return f"Added to-do: {args.text!r}."
        if call.name == "list_todos":
            items = self.backend.list_tasks()
            if not items:
                return "No to-dos on the list."
            return json.dumps([{"title": t.title, "completed": t.completed} for t in items])
        return f"Unknown tool: {call.name}"
```

### 4. `ryaa/factory.py` — wire Google Tasks into the per-user assembly
Add the import and update `build_scheduler_for` (decrypt once, build both backends):
```python
from ryaa.tools.google_tasks import GoogleTasksBackend   # NEW


def build_scheduler_for(user: User, conn: ProviderConnection) -> Scheduler:
    provider = OpenAIProvider()
    refresh = decrypt(conn.credentials)
    cal = GoogleCalendarBackend(refresh_token=refresh, timezone=user.timezone or "America/New_York")
    tasks = GoogleTasksBackend(refresh_token=refresh)
    agent = Agent(provider=provider, skills=[CalendarSkill(cal), TodoSkill(tasks)])
    return Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarParser(provider=provider),
        backend=cal,
        agent=agent,
    )
```
(`build_scheduler()` for the CLI keeps `TodoSkill()` — now defaulting to `StubTasks`.)

After typing these in, I'll run a direct test (add → list → cleanup on your real Google Tasks) plus an
agent chat ("add X to my to-dos" / "what's on my list?") to confirm the skill wiring.

---

## Phase 6b-1 — backend session tokens (rework auth, type these in)

The app does ONE Google OAuth → gets a code → `/connect/google` exchanges it for identity + calendar
access AND returns a backend-signed **session token** the app uses for everything after. `current_user`
now verifies *our* session token, not a Google id_token. Four edits.

### Deps + env (do first)
- `requirements.txt`: add `PyJWT`, then `pip install PyJWT`.
- Generate a signing secret and add to `.env` (and Railway): `SESSION_SECRET`:
  ```
  python -c "import secrets; print(secrets.token_urlsafe(32))"
  ```
  (Railway also still needs `GOOGLE_CLIENT_SECRET` for the code exchange.)

### 1. `ryaa/session.py` (new file)
```python
import os
import time

import jwt

_ALG = "HS256"
SESSION_TTL_SECONDS = 60 * 60 * 24 * 30  # 30 days


def issue_session(user_id: str) -> str:
    now = int(time.time())
    payload = {"sub": user_id, "iat": now, "exp": now + SESSION_TTL_SECONDS}
    return jwt.encode(payload, os.environ["SESSION_SECRET"], algorithm=_ALG)


def verify_session(token: str) -> str:
    """Return the user_id from a valid session token; raises on invalid/expired."""
    payload = jwt.decode(token, os.environ["SESSION_SECRET"], algorithms=[_ALG])
    return payload["sub"]
```

### 2. `ryaa/auth.py` — `current_user` now verifies the session token
Change the import line `from sqlmodel import Session, select` → `from sqlmodel import Session` (select is
no longer used here), add `import uuid` and `from ryaa.session import verify_session`, and **keep**
`verify_google_id_token` (connect still uses it). Replace `current_user` with:
```python
def current_user(
    authorization: str | None = Header(default=None),
    session: Session = Depends(get_session),
) -> User:
    if not authorization:
        raise HTTPException(401, "Missing Authorization header")
    try:
        user_id = verify_session(authorization.removeprefix("Bearer ").strip())
    except Exception:
        raise HTTPException(401, "Invalid or expired session")
    user = session.get(User, uuid.UUID(user_id))
    if user is None:
        raise HTTPException(401, "User not found")
    return user
```

### 3. `ryaa/api.py` — imports
```python
from ryaa.auth import current_user, verify_google_id_token   # add verify_google_id_token
from ryaa.session import issue_session                        # NEW
```

### 4. `ryaa/api.py` — rework `/connect/google` (no `current_user`; code is the proof; returns a session)
Replace the whole `connect_google` function with:
```python
@app.post("/connect/google")
def connect_google(req: ConnectRequest, session: Session = Depends(get_session)):
    # No current_user — the one-time auth code itself proves identity.
    data = {
        "code": req.code,
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": req.redirect_uri,
        "grant_type": "authorization_code",
    }
    if req.code_verifier:
        data["code_verifier"] = req.code_verifier
    resp = requests.post("https://oauth2.googleapis.com/token", data=data)
    if resp.status_code != 200:
        raise HTTPException(400, f"Token exchange failed: {resp.text}")
    tokens = resp.json()

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise HTTPException(400, "No refresh token; re-consent with offline access + prompt=consent.")
    id_token = tokens.get("id_token")
    if not id_token:
        raise HTTPException(400, "No id_token returned from Google.")

    # identify the user from the verified id_token
    claims = verify_google_id_token(id_token)
    sub = claims["sub"]
    user = session.exec(
        select(User).where(User.auth_provider == "google", User.provider_subject == sub)
    ).first()
    if user is None:
        user = User(auth_provider="google", provider_subject=sub, email=claims.get("email"))
        session.add(user)
        session.commit()
        session.refresh(user)

    # store the encrypted refresh token + timezone
    conn = session.exec(
        select(ProviderConnection).where(
            ProviderConnection.user_id == user.id,
            ProviderConnection.provider == "google",
        )
    ).first()
    if conn is None:
        conn = ProviderConnection(user_id=user.id, provider="google")
    conn.credentials = encrypt(refresh_token)
    conn.scopes = tokens.get("scope", "")
    if req.timezone:
        user.timezone = req.timezone
    session.add(conn)
    session.add(user)
    session.commit()

    # mint a backend session token the app uses for all future requests
    return {"session_token": issue_session(str(user.id)), "timezone": user.timezone}
```

After typing these in, I'll test backend-side with a fresh one-time code: `POST /connect/google` (code
only, no header) → returns a `session_token` → then `POST /propose` with that token as the bearer →
hits your real calendar. That proves the whole new auth path before we build the app side (6b-2).

---

## Phase 6b-2a — backend OAuth web flow (type these in)

The app opens a browser to the backend, which owns the whole Google OAuth dance and redirects back to
the app (via a deep link) carrying a session token. This sidesteps Expo-Go's Google-OAuth redirect
hell. Refactors the `/connect/google` exchange into a shared helper, adds two GET endpoints.

### Google Cloud Console (your hands — do first)
Add these to your OAuth client's **Authorized redirect URIs** (APIs & Services → Credentials → the
`569874455572-…` client):
- `http://localhost:8000/auth/google/callback`  (local testing)
- `https://web-production-7f7d88.up.railway.app/auth/google/callback`  (cloud)

### env
- `.env`: `PUBLIC_BASE_URL=http://localhost:8000`
- Railway: `PUBLIC_BASE_URL=https://web-production-7f7d88.up.railway.app`

### `ryaa/api.py` — imports + config
```python
from fastapi.responses import RedirectResponse, StreamingResponse   # add RedirectResponse
from urllib.parse import urlencode                                   # NEW
```
Near the other module-level config (after `load_dotenv()`):
```python
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000")
GOOGLE_SCOPES = (
    "openid email profile "
    "https://www.googleapis.com/auth/calendar.events "
    "https://www.googleapis.com/auth/tasks"
)
```

### `ryaa/api.py` — extract the exchange into a helper, and slim `connect_google`
Replace the whole `connect_google` function with this helper + thin endpoint:
```python
def _connect_with_code(
    code: str,
    redirect_uri: str,
    session: Session,
    timezone: str | None = None,
    code_verifier: str | None = None,
) -> User:
    """Exchange an auth code, upsert the user + encrypted refresh token, return the User."""
    data = {
        "code": code,
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    if code_verifier:
        data["code_verifier"] = code_verifier
    resp = requests.post("https://oauth2.googleapis.com/token", data=data)
    if resp.status_code != 200:
        raise HTTPException(400, f"Token exchange failed: {resp.text}")
    tokens = resp.json()

    refresh_token = tokens.get("refresh_token")
    if not refresh_token:
        raise HTTPException(400, "No refresh token; re-consent with offline access + prompt=consent.")
    id_token = tokens.get("id_token")
    if not id_token:
        raise HTTPException(400, "No id_token returned from Google.")

    claims = verify_google_id_token(id_token)
    sub = claims["sub"]
    user = session.exec(
        select(User).where(User.auth_provider == "google", User.provider_subject == sub)
    ).first()
    if user is None:
        user = User(auth_provider="google", provider_subject=sub, email=claims.get("email"))
        session.add(user)
        session.commit()
        session.refresh(user)

    conn = session.exec(
        select(ProviderConnection).where(
            ProviderConnection.user_id == user.id,
            ProviderConnection.provider == "google",
        )
    ).first()
    if conn is None:
        conn = ProviderConnection(user_id=user.id, provider="google")
    conn.credentials = encrypt(refresh_token)
    conn.scopes = tokens.get("scope", "")
    if timezone:
        user.timezone = timezone
    session.add(conn)
    session.add(user)
    session.commit()
    return user


@app.post("/connect/google")
def connect_google(req: ConnectRequest, session: Session = Depends(get_session)):
    user = _connect_with_code(req.code, req.redirect_uri, session, req.timezone, req.code_verifier)
    return {"session_token": issue_session(str(user.id)), "timezone": user.timezone}
```

### `ryaa/api.py` — the two browser-OAuth endpoints
```python
@app.get("/auth/google/start")
def auth_google_start(return_url: str):
    # return_url is the app's deep link (exp://… in Expo Go, ryaa://… in a real build)
    if not (return_url.startswith("exp://") or return_url.startswith("ryaa://")):
        raise HTTPException(400, "invalid return_url")
    params = {
        "client_id": os.environ["GOOGLE_CLIENT_ID"],
        "redirect_uri": f"{PUBLIC_BASE_URL}/auth/google/callback",
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": return_url,  # round-tripped so the callback knows where to send the user back
    }
    return RedirectResponse("https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(params))


@app.get("/auth/google/callback")
def auth_google_callback(code: str, state: str, session: Session = Depends(get_session)):
    user = _connect_with_code(code, f"{PUBLIC_BASE_URL}/auth/google/callback", session)
    token = issue_session(str(user.id))
    sep = "&" if "?" in state else "?"
    return RedirectResponse(f"{state}{sep}session_token={token}")  # deep-link back to the app
```

Notes: GET endpoints + redirects aren't CORS-gated (CORS only affects JS fetch, not browser
navigation), so no CORS change. `state` validation is a basic open-redirect guard (only `exp://`/
`ryaa://`) — fine for MVP; sign/validate it later. Timezone isn't captured in the web flow (the app
can set it on first `/propose`-ish call later); not blocking.

After you've added the redirect URIs + `PUBLIC_BASE_URL` and typed these in, I'll test: start the local
server, confirm `/auth/google/start` 307-redirects to Google with the right params, then you open it in
a browser, consent, and we watch it land on `exp://test?session_token=…` — proving the full web flow.






