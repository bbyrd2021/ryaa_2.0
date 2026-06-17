# Voice — design & implementation

**Status (2026-06-07):** frontend implemented (typecheck/lint/build green); backend
endpoints pending (Brandon writes the Python — reference below).
Supersedes the design questions in [`backlog/voice.md`](backlog/voice.md).

## Goal
Talk to RYAA and have it talk back — **hands-free, conversational, like Siri** (not
push-to-talk). Hands-free scheduling: "lunch with Sam Tuesday at noon" → it proposes →
"yes" → it books.

## Decisions
- **Voice is an I/O layer around the existing brain.** The `/propose` + `/confirm` agent
  loop and the Confirm/Cancel proposal UX are unchanged. Voice only adds ears and a mouth.
- **Hands-free via browser VAD, not OpenAI Realtime.** Voice-activity detection runs in
  the browser (Silero VAD) and auto-segments each spoken turn — so it feels continuous
  with no buttons, but without WebRTC / ephemeral tokens / streaming-STT plumbing.
- **STT = Whisper** (`gpt-4o-transcribe`), **TTS = ElevenLabs** (`eleven_flash_v2_5`).
- **Accepted tradeoff:** a turn isn't transcribed until you stop speaking + one Whisper
  round-trip (~0.5–1s), vs live captions. Fine for v1; the "thinking" indicator covers it.

## The loop
```
listen (VAD) → speech-end → WAV clip → POST /transcribe (Whisper) → text
   → existing /propose brain → reply text → POST /speak (ElevenLabs) → stream-play
   → back to listening
```
Barge-in: VAD speech-start while RYAA is talking stops playback so you can interrupt.
Confirm/Cancel by voice: while a proposal is pending, a spoken "yes"/"no" drives the
buttons (keyword heuristic); anything ambiguous falls through to the brain as a revision.

---

## Frontend (implemented)

| File | Role |
|---|---|
| `frontend/src/voice.ts` | Audio layer: VAD wrapper (`createVad`), `transcribe(wav)` → `/transcribe`, `speak(text)` streaming MP3 playback via MediaSource with a `.stop()` handle, `VOICE_SUPPORTED` gate. |
| `frontend/src/useVoice.ts` | State machine `off → listening → transcribing → thinking → speaking`; barge-in; delegates turn meaning to App via `onTranscript`; exposes `{ voiceOn, state, toggle, speakReply, supported }`. |
| `frontend/src/App.tsx` | `handleSend` refactored into `sendText(text)` (returns reply to speak); `confirm/cancelPending()` likewise; `handleVoiceTranscript` routes yes/no vs revision; mic toggle + listening/speaking indicators. Text composer unchanged. |
| `frontend/src/App.css` | Mic button (matches `.composer__send`), pulsing listening ring (respects the global reduced-motion rule). |
| `frontend/scripts/copy-vad-assets.mjs` | `postinstall` step — stages the VAD worklet/model + onnxruntime-web wasm into `public/vad/` (gitignored). |

Notes:
- `@ricky0123/vad-web` (+ `onnxruntime-web`) is **dynamically imported** inside
  `createVad`, so the ~420kB ONNX runtime only loads the first time voice is turned on.
- `VOICE_SUPPORTED` (getUserMedia + MediaSource) gates the mic button, mirroring
  `lens.ts`'s `REFRACTS`. Voice-off behaves identically to before.
- Mic permission is requested on the first toggle (inside the click gesture).

---

## Backend (to write — reference)

Two sync `def` endpoints in `ryaa/api.py` (matches `/propose`/`/confirm` style; FastAPI
runs sync defs in a threadpool) + one env var. `requests` is already a dependency, so the
TTS proxy uses it — no new packages.

### `ryaa/providers/openai_provider.py` — add `transcribe`
```python
def transcribe(self, data: bytes, filename: str = "speech.wav") -> str:
    """Whisper-family STT. `data` is raw WAV bytes from the browser's VAD clip."""
    resp = self.client.audio.transcriptions.create(
        model="gpt-4o-transcribe",            # better on names/times than whisper-1
        file=(filename, data, "audio/wav"),
    )
    return resp.text
```

### `ryaa/api.py` — endpoints
```python
import os
import requests
from fastapi import File, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ryaa.providers.openai_provider import OpenAIProvider

voice_provider = OpenAIProvider()  # or share the factory's instance

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")  # "George"


class TranscribeResult(BaseModel):
    text: str


class SpeakRequest(BaseModel):
    text: str


@app.post("/transcribe")
def transcribe(file: UploadFile = File(...)) -> TranscribeResult:
    data = file.file.read()
    if not data:
        return TranscribeResult(text="")
    text = voice_provider.transcribe(data, file.filename or "speech.wav")
    return TranscribeResult(text=text)


@app.post("/speak")
def speak(req: SpeakRequest):
    if not ELEVENLABS_API_KEY:
        raise HTTPException(503, "ELEVENLABS_API_KEY not configured")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}/stream"
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    params = {"output_format": "mp3_44100_128"}
    payload = {
        "text": req.text,
        "model_id": "eleven_flash_v2_5",
        "voice_settings": {
            "stability": 0.45, "similarity_boost": 0.75,
            "style": 0.0, "use_speaker_boost": True, "speed": 1.0,
        },
    }

    # stream=True returns once headers arrive → surface a bad key/quota before streaming.
    r = requests.post(url, headers=headers, params=params, json=payload, stream=True)
    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)
    return StreamingResponse(r.iter_content(chunk_size=4096), media_type="audio/mpeg")
```

### `.env.example`
```
ELEVENLABS_API_KEY=your-key-here
# optional — defaults to the "George" demo voice
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
```

Gotchas: CORS already allows `POST` from `:5173` (covers both routes). `/transcribe` is
`multipart/form-data`, field name **`file`** — keep the signature `file: UploadFile`.
Async alternative is `httpx.AsyncClient.stream(...)`, but that adds an `httpx` dependency;
`requests` is simpler for a local single-user app.

---

## Verification
1. Backend: `uvicorn ryaa.api:app --reload --port 8000` with `OPENAI_API_KEY` +
   `ELEVENLABS_API_KEY` in `.env`. Smoke-test:
   - `curl -F file=@sample.wav localhost:8000/transcribe` → `{"text": ...}`
   - `curl -s -X POST localhost:8000/speak -H 'content-type: application/json' -d '{"text":"hi"}' --output out.mp3` → playable
2. Frontend: `cd frontend && npm run dev` (Chromium). Toggle voice, say "lunch with Sam
   Tuesday at noon" → transcribes, RYAA proposes + speaks; say "yes" → confirms by voice.
3. Barge-in: talk over RYAA mid-reply → playback stops, your turn is captured.
4. `cd frontend && npx tsc -b` clean; voice-off == today's behavior.

## Out of scope / follow-ups
- True streaming STT / live captions (OpenAI Realtime + WebRTC) — revisit if turn latency annoys.
- Wake word ("hey RYAA") — the toggle is the wake for v1.
- LLM-based confirm/cancel intent (v1 uses a keyword heuristic in `App.tsx`).
- Streaming the brain's reply into ElevenLabs' WebSocket — not worth it while `/propose`
  is a single blocking turn.
- Sidebar (separate task).

## Risks / to tune
- **Echo / self-transcription:** relies on `echoCancellation` + barge-in; may need a brief
  post-playback mic gate if RYAA hears itself.
- **VAD asset loading under Vite** (resolved): ORT loads its `.mjs` glue via dynamic
  `import()`, and Vite refuses to serve a `/public` file through the module pipeline
  ("…should not be imported from source code"). Fix in `voice.ts`: `onnxWASMBasePath` is
  an **absolute origin URL** (`${location.origin}/vad/`) so Vite passes it through to
  static `/public`. The worklet + `.onnx` stay on the root-relative `/vad/` (loaded via
  browser APIs, not imports). CDN fallback if needed:
  `https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/`.
- **Whisper turn latency** (~0.5–1s after you stop) — acceptable; covered by the indicator.
