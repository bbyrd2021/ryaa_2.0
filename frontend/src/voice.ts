// Voice I/O for RYAA — the audio layer around the existing Python brain. Mic capture
// is hands-free: browser voice-activity detection (Silero VAD via @ricky0123/vad-web)
// segments each spoken turn, which we ship to /transcribe (Whisper). Replies come back
// from /speak (ElevenLabs) as streamed MP3 we play with MediaSource so audio starts
// before the whole clip lands. The /propose + /confirm brain is untouched — see
// useVoice.ts for the conversation state machine that drives these helpers.
//
// @ricky0123/vad-web pulls in onnxruntime-web (~450kB), so it's dynamically imported
// inside createVad() — the bundle only loads the first time you actually turn voice on.

// Keep in sync with App.tsx — where the FastAPI brain lives.
const API = "http://localhost:8000";

// vad-web fetches its AudioWorklet + Silero model from baseAssetPath (browser fetch /
// audioWorklet.addModule — fine as a root-relative path), and onnxruntime-web loads its
// wasm glue from onnxWASMBasePath via a dynamic import(). scripts/copy-vad-assets.mjs
// stages both under /vad/ (package.json postinstall).
const VAD_ASSET_PATH = "/vad/";
// ORT's .mjs glue is imported, not fetched, so it must be an ABSOLUTE (origin) URL —
// Vite passes full http(s) dynamic imports straight through to /public, whereas a
// root-relative "/vad/..." trips "this file is in /public and should not be imported
// from source code". Stays local (served by dev server / the deployed origin).
const ORT_WASM_PATH =
  typeof window !== "undefined" ? `${window.location.origin}/vad/` : VAD_ASSET_PATH;

// Whether the browser can run the voice loop at all: mic capture + streamed audio
// playback. Mirrors lens.ts's REFRACTS gate — checked before the mic button shows.
export const VOICE_SUPPORTED: boolean =
  typeof window !== "undefined" &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof MediaSource !== "undefined";

export type VadHandle = {
  start: () => void;
  pause: () => void;
  destroy: () => Promise<void>;
};

type VadCallbacks = {
  /** voice onset — drives the listening indicator and barge-in. */
  onSpeechStart: () => void;
  /** end of a turn — hands back the speech as a 16kHz mono WAV ready to POST. */
  onSpeechEnd: (wav: Blob) => void;
};

// Spin up continuous voice-activity detection. The first call triggers the mic
// permission prompt (so it must run from a user gesture). echoCancellation +
// noiseSuppression are on by default in vad-web's getStream, which keeps RYAA from
// transcribing its own spoken replies.
export async function createVad({
  onSpeechStart,
  onSpeechEnd,
}: VadCallbacks): Promise<VadHandle> {
  const { MicVAD, utils } = await import("@ricky0123/vad-web");
  const vad = await MicVAD.new({
    model: "v5",
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: ORT_WASM_PATH,
    startOnLoad: false,
    onSpeechStart,
    onSpeechEnd: (audio: Float32Array) => {
      // encodeWAV(samples, PCM=1, sampleRate, channels, bitDepth)
      const wav = utils.encodeWAV(audio, 1, 16000, 1, 16);
      onSpeechEnd(new Blob([wav], { type: "audio/wav" }));
    },
  });
  return {
    start: () => void vad.start(),
    pause: () => void vad.pause(),
    destroy: () => vad.destroy(),
  };
}

// Send a spoken turn to the brain's ears: POST the WAV to /transcribe (Whisper) and
// return the recognized text (trimmed; "" if empty). Throws on a failed request so
// the caller can fall back to listening.
export async function transcribe(wav: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", wav, "speech.wav");
  const res = await fetch(`${API}/transcribe`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`transcribe failed: ${res.status}`);
  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

export type Playback = {
  /** stop playback immediately (barge-in / voice off); resolves `done`. */
  stop: () => void;
  /** resolves when speech finishes naturally or is stopped. */
  done: Promise<void>;
};

// Speak a reply: stream MP3 from /speak and start playing before the full clip
// arrives (MediaSource Extensions) so it feels responsive. Falls back to buffering
// the whole clip if MSE can't stream mp3. Returns a handle to stop (barge-in) plus a
// `done` promise the state machine awaits before returning to listening.
export function speak(text: string): Playback {
  const audio = new Audio();
  let stopped = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((r) => (resolveDone = r));

  const finish = () => {
    if (stopped) return;
    stopped = true;
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
    resolveDone();
  };

  const run = async () => {
    try {
      const res = await fetch(`${API}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) throw new Error(`speak failed: ${res.status}`);

      const mime = "audio/mpeg";
      audio.addEventListener("ended", finish, { once: true });

      if ("MediaSource" in window && MediaSource.isTypeSupported(mime)) {
        const ms = new MediaSource();
        audio.src = URL.createObjectURL(ms);
        await new Promise<void>((r) =>
          ms.addEventListener("sourceopen", () => r(), { once: true }),
        );
        const sb = ms.addSourceBuffer(mime);
        const reader = res.body.getReader();
        void audio.play().catch(() => {
          /* autoplay may defer; ended/stop still resolve done */
        });
        // Pump chunks into the source buffer as they stream in.
        for (;;) {
          const { done: rdone, value } = await reader.read();
          if (stopped) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            return;
          }
          if (rdone) {
            if (ms.readyState === "open") ms.endOfStream();
            return;
          }
          if (value) await appendChunk(sb, value);
        }
      } else {
        // No streamed mp3 — buffer the whole clip, then play.
        const buf = await res.arrayBuffer();
        if (stopped) return;
        audio.src = URL.createObjectURL(new Blob([buf], { type: mime }));
        void audio.play().catch(() => {
          /* ignore */
        });
      }
    } catch (e) {
      console.error("[voice] speak failed (is /speak up on :8000?):", e);
      finish();
    }
  };
  void run();

  return { stop: finish, done };
}

// Append one chunk to a SourceBuffer, resolving when the append settles (appendBuffer
// is async — you must wait for `updateend` before the next append).
function appendChunk(sb: SourceBuffer, chunk: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      sb.removeEventListener("updateend", onUpdate);
      sb.removeEventListener("error", onError);
    };
    const onUpdate = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("appendBuffer error"));
    };
    sb.addEventListener("updateend", onUpdate, { once: true });
    sb.addEventListener("error", onError, { once: true });
    try {
      // cast: the stream yields Uint8Array<ArrayBufferLike>; appendBuffer wants a
      // BufferSource over a plain ArrayBuffer (never a SharedArrayBuffer here).
      sb.appendBuffer(chunk as BufferSource);
    } catch (e) {
      cleanup();
      reject(e as Error);
    }
  });
}
