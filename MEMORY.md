# RYAA — Project Memory

> Living memory for the RYAA project. Read this first at the start of any session.
> Update the **Status** and **Decision log** sections whenever they change.
> Full product + architecture design: [`DESIGN.md`](./DESIGN.md). Per-session detail: `docs/session-notes/`.

---

## Product

**RYAA** = **Real-time Yielding Autonomous Agent** — a safe, automated academic assistant for university students.
Goal: *actually useful, not a party trick.* The name encodes the philosophy: *autonomous* (it acts) but *yielding* (it hands control back at a confirm gate before anything irreversible — sending email, creating an event).

**Headline capabilities** (full detail in `DESIGN.md`)

*Core skills:*
1. **Email drafting** — drafts emails to professors/TAs/advisors that the user reviews & edits; nothing sends without explicit approval.
2. **Study suggestions** — coaching grounded in the user's real courses/deadlines/syllabi (retrieval), not generic advice.
3. **Calendar scheduling** — creates events in **Outlook** (Microsoft Graph API), because that's what schools use.
4. **Todos** 🟡 — task list (capture, due dates, course tags, priority). First feature needing **durable storage** (new persistence layer, behind a repository Protocol).

*Intelligence layer (composes the skills):* 🟡
5. **Morning Brief** — daily synthesis (events + due todos + deadlines + needs-reply). Orchestrator-workers pattern.
6. **Dream Mode** — overnight read-only aggregation: proposes todos, pre-computes suggestions, **stages** tomorrow's brief, commits nothing. The purest expression of "Yielding": maximally autonomous, yields every action for morning approval.

**Roadmap shape:** CLI tool first → later a minimal Siri-style popup UI, "Frutiger Aero / Windows Vista glass, modernized" aesthetic. UI is deferred — do not build it yet.

---

## How we work together (IMPORTANT — read every session)

- **Brandon writes the code. Claude is the product manager + guide + unblocker.**
- Brandon wants to **understand every little aspect** so he can run/fix it in production solo.
- **Teaching rhythm:** Claude writes the *contracts* (interfaces/architecture — the hard decisions, heavily commented). Brandon writes the *implementations* against them. Claude reviews.
- When Brandon gets stuck, his words: "your job is to guide me out of it." Unblocking is the priority. Have him paste errors.
- Don't dump large finished code on him unless asked — explain, scaffold, hand off the implementation.

---

## Tech stack & conventions

- **Language:** Python (pure-Python philosophy — no heavy agent frameworks; patterns over libraries).
- **Models:** OpenAI SDK to start, but **model-platform agnostic** via a hand-rolled provider layer (no LiteLLM — chosen for understanding).
- **Structured output / validation:** Pydantic.
- **Env:** conda env named **`ryaa`** (`/opt/anaconda3/envs/ryaa`). Secrets in `.env` (currently `OPENAI_API_KEY`).
- **Type checking:** mypy (`mypy.ini`, ignore_missing_imports).
- **Lint + format:** **Ruff** (one tool for both; config in `pyproject.toml`, `line-length = 88`). Replaced flake8+Black to kill the lint/format disagreement. Installed in the env; VSCode uses the `charliermarsh.ruff` extension with format-on-save. Dev tools pinned in `requirements-dev.txt` (separate from runtime `requirements.txt`).
- **Foundation:** Brandon completed the Dave Ebbelaar / Anthropic "Building Effective Agents" curriculum in `patterns/` — augmented LLM, structured output, tools, retrieval, prompt chaining, routing, parallelization, orchestrator. Each RYAA feature maps onto one of these patterns.

---

## Architecture (target)

```
CLI  (later: Frutiger-Aero popup UI)              ← interface
Orchestrator / Router                             ← which skill handles this?
  Email | Calendar | Study Coach                  ← skills (the 3 features)
Safety layer: parallel guardrails + confirm gate  ← the "safe" in safe & automated
Provider abstraction (model-agnostic)             ← swap OpenAI/Anthropic/local
Tool layer (Graph API, local KB, calendar)        ← real-world reach
```

**Package layout** (`ryaa/`): `providers/`, `skills/`, `safety/`, `tools/`.

**"Safe & automated" = which patterns:**
- Parallel guardrails (calendar-validity check ∥ prompt-injection check) → *parallelization pattern*.
- Confirmation gate before any outside-world action (send email / create event) → *chaining gate-check pattern*. Automated **up to** the action; human approves the action.
- Grounding for study suggestions → *retrieval pattern*.

---

## Quality gate (run before considering any change "done")

```bash
ruff check ryaa/     # lint   (add --fix to auto-fix)
ruff format ryaa/    # format
mypy ryaa/           # types  (run with the env python: /opt/anaconda3/envs/ryaa/bin/python -m mypy ryaa/)
pytest               # unit tests (fast, mocked, offline). Real-API: pytest -m integration
```
All clean = change is done. Editor runs ruff format-on-save automatically.

**Testing approach:** unit tests mock the LLM via a `FakeProvider` (satisfies `LLMProvider`) — never hit the real API. Tests live in `tests/` mirroring `ryaa/`. Real-API smoke tests are marked `@pytest.mark.integration` and excluded from the default run (config in `pyproject.toml`).

---

## Decision log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-29 | First vertical slice = **Calendar scheduling** | Direct extension of the chaining calendar example; forces solving OAuth/Graph early (riskiest unknown). |
| 2026-05-29 | Model-agnostic via **hand-rolled provider layer** (not LiteLLM) | Maximize Brandon's understanding; no black box in production. |
| 2026-05-29 | **Stub-first** integration | Build the full scheduling brain against a fake calendar; swap in real Graph `create_event` last. Isolate the risky external dependency behind an interface. |
| 2026-05-29 | Outlook = **Microsoft Graph API + OAuth 2.0 (MSAL)** | Real Outlook drafts/events, not terminal toys. |
| 2026-05-29 | **Ruff** for lint+format (dropped flake8+Black) | One tool, one config (`line-length=88`) → lint/format can't disagree; faster; reproducible (pinned in env, not editor extension). |
| 2026-05-29 | **Sync + threads**, NOT async everywhere | Async is contagious (colors whole codebase) and only helps concurrent waits. Only the parallel guardrails need concurrency → use `ThreadPoolExecutor` there; keep all else sync. `base.py` unchanged. Revisit (add async provider methods) only if a web/UI server arrives. |

---

## Status (update this!)

**As of 2026-05-29:**
- ✅ `ryaa/` package skeleton created (`providers/ skills/ safety/ tools/`).
- ✅ `ryaa/providers/base.py` — model-agnostic contract. `Message.role` tightened to a `Literal`. `LLMProvider` Protocol with `complete()` + `structured()`.
- ✅ **`ryaa/providers/openai_provider.py` DONE & verified** — Brandon implemented all 3 methods. Both methods fail-fast on `None`. `_to_openai` returns `cast(list[ChatCompletionMessageParam], ...)`. mypy clean (7 files), smoke test passed (real `complete()` text + parsed `Event`). **The model-agnostic provider layer is real.**
- Concepts Brandon learned this session: pure components vs app-owns-config, fail-fast on None, check-the-value-you-return, `cast` vs `# type: ignore`, `Literal` for closed sets.
- ⏳ **Track A (Brandon, async):** verify Azure app registration is allowed on his school 365 tenant (status: *unknown / unsure*). If clear, report Application(client) ID + Directory(tenant) ID. If locked → pivot to personal MS account for dev.

- ✅ **`ryaa/skills/calendar.py` DONE & verified** — `CalendarSkill` takes an injected `LLMProvider` (dependency injection, never imports OpenAI). 3-stage chain (extract → GATE → parse details → confirmation), all via `provider.structured()`. Schemas: `EventExtraction`/`EventDetails`/`EventConfirmation`. `EventDetails.start` is a real `datetime`; `_date_context()` grounds relative dates (fixed the hallucinated-year bug — verified "next Tuesday" → correct 2026 date). Gate at `CONFIDENCE_THRESHOLD = 0.7`. Verified: valid event parses, non-calendar input → `None`. mypy + ruff clean.
- 📝 Note for Outlook: model returned a tz-aware UTC datetime; **Graph requires a timezone** — make tz handling deliberate when wiring real `create_event`, don't rely on the model.

- ✅ **`ryaa/safety/guardrails.py` DONE & green** (2026-05-30) — `Guardrails(provider, confidence_threshold=0.7)`; `_check_calendar`/`_check_security` via `provider.structured()`; `validate()` runs both in parallel (`ThreadPoolExecutor`, submit-both-before-read), **fail-closed** (`try/except` denies on any error), returns `GuardrailResult(is_valid, reasons: list[str])`. Reasons kept as `list[str]` for now (upgrade to structured `Reason` objects only when a UI/override needs to branch on reason type — YAGNI).
- ✅ **Test harness up** (2026-05-30) — pytest configured (`pythonpath=["."]`, integration marker excluded by default). `tests/conftest.py` has `FakeProvider` + `fake_provider` fixture (returns the class). First test green: `test_gate_rejects_low_confidence`. Unit tests mock the LLM — zero API calls.

- ✅ **CALENDAR VERTICAL SLICE COMPLETE END-TO-END** (2026-05-30) — confirm gate (`ryaa/safety/confirm.py`: `Confirm` Protocol + `CLIConfirm`), calendar tool seam (`ryaa/tools/calendar_tool.py`: `CalendarBackend` Protocol + `StubCalendar`), orchestrator (`ryaa/orchestrator.py`: `Scheduler` = guardrails → prepare → YIELD/confirm → create, returns `ScheduleResult`), and CLI composition root (`ryaa/cli.py`, run `python -m ryaa.cli`). **6 tests pass** incl. `test_declined_does_not_create` (proves nothing is created without a yes). **Ran live against GPT** — natural-language scheduling, confirm gate, decline path all verified.

**Next up:** (1) **real calendar backend, NO Azure needed** — `AppleCalendar` (osascript) or `ICSFile` satisfying `CalendarBackend`, swap one line in `cli.py` (decision D5 in DESIGN); (2) regression test for the orchestrator "created" message (the f-string bug); then persistence+Todos → Email → Study Coach → Morning Brief → Dream Mode. Outlook/Azure now optional, not blocking. Detail: `docs/session-notes/2026-05-30.md`.

---

## Open questions / risks

- ⚠️ **School tenant may block app registration** (the #1 project risk). Mitigated by stub-first plan + parallel investigation.
- UI aesthetic (Frutiger Aero popup) — deferred, revisit after CLI MVP.
