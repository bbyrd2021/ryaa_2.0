# Backlog: Voice (speech in + spoken replies)

**Priority:** FRONT OF QUEUE (Brandon, 2026-06-06) — ahead of modify-events / Email roadmap.
**Status:** designed & frontend built → see [`../specs/voice.md`](../specs/voice.md). Backend endpoints pending.

## Goal
Talk to RYAA and have it talk back — speech-to-text for input, text-to-speech for replies.
Hands-free scheduling ("hey RYAA, lunch with Sam Tuesday at noon").

## Open questions (decide at design time)
- **STT:** browser Web Speech API (free, no backend, Chrome-centric) vs. a service (Whisper/
  Deepgram — better accuracy, needs an endpoint). Lean Web Speech for v1 (Python-light, fast).
- **TTS:** browser SpeechSynthesis (free, robotic) vs. a service (ElevenLabs/OpenAI — natural,
  costs + latency). Web Speech for v1.
- **Backend impact:** likely none for v1 — STT/TTS live in the browser; the API still speaks text.
  Revisit if we want streaming.
- **UI:** mic button in the composer, a listening state (reuse the "working" indicator vocabulary),
  a speaker toggle for replies. Ties into the design-taste pass.

## Notes
- Mostly a frontend + browser-API feature; keeps the Python brain unchanged for v1.
