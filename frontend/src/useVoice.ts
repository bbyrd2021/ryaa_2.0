// The conversation state machine for hands-free voice. Owns the VAD lifecycle and the
// listen → transcribe → think → speak loop, but delegates "what does this turn mean?"
// to the App via onTranscript (so Confirm/Cancel-by-voice and the /propose flow stay
// in App). Speaking is also exposed (speakReply) so typed replies get voiced too.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createVad,
  speak,
  transcribe,
  VOICE_SUPPORTED,
  type Playback,
  type VadHandle,
} from "./voice";

export type VoiceState =
  | "off"
  | "listening" // mic open, waiting for speech
  | "transcribing" // got a turn, asking Whisper
  | "thinking" // brain is running (/propose or /confirm)
  | "speaking"; // RYAA is talking back

type UseVoiceArgs = {
  // Hand a finished transcript to the App. It runs the same path as typing (or
  // confirm/cancel when a proposal is pending) and returns the reply text to speak
  // ("" to stay silent).
  onTranscript: (text: string) => Promise<string>;
};

export function useVoice({ onTranscript }: UseVoiceArgs) {
  const [voiceOn, setVoiceOn] = useState(false);
  const [state, setState] = useState<VoiceState>("off");

  const vadRef = useRef<VadHandle | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  const stateRef = useRef<VoiceState>("off");
  const voiceOnRef = useRef(false);
  const busyRef = useRef(false); // a turn is mid-flight (transcribe→think→speak)

  // onTranscript closes over App state (messages, pending). Keep the latest copy in a
  // ref so the stable VAD callbacks never call a stale version.
  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  const setBoth = useCallback((s: VoiceState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const stopPlayback = useCallback(() => {
    playbackRef.current?.stop();
    playbackRef.current = null;
  }, []);

  // Stream a reply out loud. Used by both spoken and typed turns, so barge-in and the
  // "speaking" indicator work either way. No-op when voice is off.
  const speakReply = useCallback(
    async (text: string) => {
      if (!voiceOnRef.current || !text) return;
      setBoth("speaking");
      const pb = speak(text);
      playbackRef.current = pb;
      await pb.done;
      playbackRef.current = null;
      if (voiceOnRef.current && stateRef.current === "speaking") setBoth("listening");
    },
    [setBoth],
  );

  // Barge-in: if the user starts talking while RYAA is speaking, cut playback so they
  // can interrupt.
  const handleSpeechStart = useCallback(() => {
    console.debug("[voice] speech start");
    if (stateRef.current === "speaking") {
      stopPlayback();
      setBoth("listening");
    }
  }, [setBoth, stopPlayback]);

  const handleSpeechEnd = useCallback(
    async (wav: Blob) => {
      console.debug(`[voice] speech end → turn captured (${wav.size} bytes)`);
      if (!voiceOnRef.current) return;
      // Drop a turn that lands while we're still handling the previous one.
      if (busyRef.current) {
        console.debug("[voice] dropped overlapping turn (still processing previous)");
        return;
      }
      busyRef.current = true;
      try {
        setBoth("transcribing");
        let text = "";
        try {
          text = await transcribe(wav);
          console.debug("[voice] transcript:", JSON.stringify(text));
        } catch (e) {
          console.error("[voice] transcribe failed (is /transcribe up on :8000?):", e);
          text = "";
        }
        if (!voiceOnRef.current) return;
        if (!text) {
          setBoth("listening");
          return;
        }

        setBoth("thinking");
        let reply = "";
        try {
          reply = await onTranscriptRef.current(text);
        } catch (e) {
          console.error("[voice] brain/onTranscript failed:", e);
          reply = "";
        }
        if (!voiceOnRef.current) return;

        await speakReply(reply);
        if (voiceOnRef.current && stateRef.current !== "speaking") setBoth("listening");
      } finally {
        busyRef.current = false;
      }
    },
    [setBoth, speakReply],
  );

  const toggle = useCallback(async () => {
    if (voiceOnRef.current) {
      // Turn off: stop talking, release the mic, go idle.
      voiceOnRef.current = false;
      setVoiceOn(false);
      stopPlayback();
      vadRef.current?.pause();
      setBoth("off");
      return;
    }
    if (!VOICE_SUPPORTED) {
      console.warn("[voice] not supported: needs getUserMedia + MediaSource (Chromium, secure context)");
      return;
    }
    voiceOnRef.current = true;
    setVoiceOn(true);
    setBoth("listening");
    try {
      if (!vadRef.current) {
        // First toggle: loads the VAD chunk + prompts for mic permission (we're inside
        // a click gesture).
        console.debug("[voice] starting VAD…");
        vadRef.current = await createVad({
          onSpeechStart: handleSpeechStart,
          onSpeechEnd: handleSpeechEnd,
        });
      }
      vadRef.current.start();
      console.debug("[voice] listening");
    } catch (e) {
      console.error("[voice] failed to start VAD:", e);
      voiceOnRef.current = false;
      setVoiceOn(false);
      setBoth("off");
    }
  }, [handleSpeechEnd, handleSpeechStart, setBoth, stopPlayback]);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      playbackRef.current?.stop();
      void vadRef.current?.destroy();
    };
  }, []);

  return { voiceOn, state, toggle, speakReply, supported: VOICE_SUPPORTED };
}
