import { useEffect, useRef, useState } from "react";
import type React from "react";
import { Glass } from "./Glass";
import { useVoice } from "./useVoice";
import "./App.css";

// Where the Python brain lives. The frontend (Vite, :5173) talks cross-port to
// the FastAPI server (:8000) — that's exactly what the CORS config allows.
const API = "http://localhost:8000";

// Just-for-fun status verbs shown while the provider is thinking. One is picked
// at random each time a request starts.
const WORKING_VERBS = [
  "thinking",
  "pondering",
  "scheming",
  "plotting",
  "conjuring",
  "noodling",
  "crunching",
  "divining",
  "mulling",
  "cooking",
  "wrangling",
  "finagling",
  "brewing",
  "calculating",
  "daydreaming",
  "manifesting",
  "summoning",
  "ruminating",
];

// When a proposal is on the table and you're talking (not typing), a spoken "yes" /
// "no" should drive the Confirm / Cancel buttons. This is a lightweight keyword
// classifier for v1 — anything it doesn't recognize falls through to the brain as a
// revision (e.g. "actually make it 1pm"). (Out of scope for now: an LLM intent check.)
const AFFIRM = /\b(yes|yeah|yep|yup|sure|confirm|confirmed|do it|go ahead|sounds good|please do|ok|okay|book it)\b/i;
const DENY = /\b(no|nope|nah|cancel|don'?t|do not|never mind|nevermind|forget it|stop)\b/i;

function classifyConfirm(text: string): "confirm" | "cancel" | "none" {
  const denied = DENY.test(text);
  const affirmed = AFFIRM.test(text);
  // If both/neither match, treat as ambiguous → let the brain handle it.
  if (affirmed && !denied) return "confirm";
  if (denied && !affirmed) return "cancel";
  return "none";
}

type Role = "user" | "assistant";
type ChatMessage = { role: Role; content: string };

// These mirror the Pydantic models on the backend. TypeScript can't see Python,
// so we re-declare the shapes by hand — they must stay in sync with ryaa/.
type EventDetails = {
  name: string;
  start: string; // ISO-8601 string (datetime serializes to this over JSON)
  duration_minutes: number;
  participants: string[];
};
type ProposeResult = {
  status: "proposed" | "reply" | "rejected" | "not_calendar";
  summary: string | null;
  reasons: string[];
  event: EventDetails | null;
  action: "create" | "modify";
  event_id: string | null;
};
type ScheduleResult = {
  status: "created" | "modified" | "rejected" | "not_calendar" | "cancelled" | "failed";
  message: string;
  event_id: string | null;
};
// What the browser holds between /propose and /confirm: the event + whether
// confirming will create or modify (and which event, for modify).
type Pending = {
  event: EventDetails;
  action: "create" | "modify";
  event_id: string | null;
};

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi, I'm RYAA. What can I schedule for you?",
    },
  ]);
  // The event RYAA has proposed and is waiting on you to confirm. null = nothing
  // pending. The browser holds this between /propose and /confirm (stateless API).
  const [pending, setPending] = useState<Pending | null>(null);
  // True while a request is in flight — used to disable inputs so you can't
  // double-send or confirm twice.
  const [busy, setBusy] = useState(false);
  // The playful status verb shown while busy (e.g. "RYAA is scheming…").
  const [verb, setVerb] = useState(WORKING_VERBS[0]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // The voice loop's callbacks are stable and fire on later ticks, so they read these
  // refs instead of the (possibly stale) `messages` / `pending` closures.
  const messagesRef = useRef(messages);
  const pendingRef = useRef(pending);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Append one message. Uses the functional updater (prev => ...) so rapid
  // back-to-back appends never read a stale `messages`.
  function addMessage(msg: ChatMessage) {
    setMessages((prev) => [...prev, msg]);
  }

  // Begin a request: pick a fresh random verb, then flip busy on. Picking the
  // verb here (not in render) means it stays put for the whole request instead
  // of re-rolling on every re-render.
  function startWorking() {
    setVerb(WORKING_VERBS[Math.floor(Math.random() * WORKING_VERBS.length)]);
    setBusy(true);
  }

  // The core send: append the user's turn, ask /propose, update the chat, and RETURN
  // the assistant's reply text so the voice loop can speak it. Used by both the typed
  // composer and spoken turns.
  async function sendText(text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return "";

    // Build the next transcript explicitly — setMessages is async, and a spoken turn
    // reads the live transcript from messagesRef (not the render closure).
    const userMsg: ChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...messagesRef.current, userMsg];
    setMessages(nextMessages);
    startWorking();

    let spoken: string;
    try {
      const res = await fetch(`${API}/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });
      const data: ProposeResult = await res.json();
      if (data.status === "proposed" && data.event) {
        spoken = data.summary ?? "Here's the plan:";
        addMessage({ role: "assistant", content: spoken });
        setPending({
          event: data.event,
          action: data.action,
          event_id: data.event_id,
        });
      } else if (data.status === "reply") {
        spoken = data.summary ?? "...";
        addMessage({ role: "assistant", content: spoken });
      } else if (data.status === "rejected") {
        spoken = data.reasons.join(" ") || "I can't schedule that one.";
        addMessage({ role: "assistant", content: spoken });
      } else {
        spoken = "That doesn't look like a calendar request.";
        addMessage({ role: "assistant", content: spoken });
      }
    } catch {
      spoken = "I couldn't reach the scheduler — is the API running on :8000?";
      addMessage({ role: "assistant", content: spoken });
    } finally {
      setBusy(false);
    }
    return spoken;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const reply = await sendText(text);
    await voice.speakReply(reply); // spoken aloud only when voice mode is on
  }

  // Step 2a: you said yes. Echo the proposed event back to /confirm, which actually
  // creates the macOS Calendar event. Returns the result text for the voice loop.
  async function confirmPending(): Promise<string> {
    const p = pendingRef.current;
    if (!p) return "";
    startWorking();
    let spoken: string;
    try {
      const res = await fetch(`${API}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      const data: ScheduleResult = await res.json();
      spoken = data.message;
      addMessage({ role: "assistant", content: spoken });
    } catch {
      spoken = "Something went wrong creating the event.";
      addMessage({ role: "assistant", content: spoken });
    } finally {
      setPending(null);
      setBusy(false);
    }
    return spoken;
  }

  // Step 2b: you said no. Drop the proposal client-side — no call, nothing created.
  function cancelPending(): string {
    setPending(null);
    const spoken = "Okay — cancelled. Nothing was created.";
    addMessage({ role: "assistant", content: spoken });
    return spoken;
  }

  async function handleConfirm() {
    if (!pending || busy) return;
    const reply = await confirmPending();
    await voice.speakReply(reply);
  }

  async function handleCancel() {
    const reply = cancelPending();
    await voice.speakReply(reply);
  }

  // A finished spoken turn. If a proposal is pending, "yes"/"no" drive Confirm/Cancel;
  // otherwise it's a normal request. Returns the reply text for useVoice to speak.
  async function handleVoiceTranscript(text: string): Promise<string> {
    if (pendingRef.current) {
      const intent = classifyConfirm(text);
      if (intent === "confirm") return confirmPending();
      if (intent === "cancel") return cancelPending();
      // ambiguous → fall through; the brain treats it as a revision
    }
    return sendText(text);
  }

  const voice = useVoice({ onTranscript: handleVoiceTranscript });

  const locked = busy || pending !== null;

  return (
    <div className="app">
      {/* Glass refraction lives in <Glass> (Glass.tsx + lens.ts): the Aave
          "Building glass for the web" technique — a per-element feDisplacementMap
          lens generated from a rounded-rect height field, so the backdrop curves
          through it. Chromium-only; Safari/Firefox keep the CSS frosted fallback.
          A web approximation of Apple's Liquid Glass, not an official technique. */}
      <div className="orbs" aria-hidden="true">
        <span className="orb orb--1" />
        <span className="orb orb--2" />
        <span className="orb orb--3" />
        <span className="orb orb--4" />
        <span className="orb orb--5" />
      </div>

      <Glass as="header" className="app__header" radius={18} frost={5}>
        <div className="brand">
          <span className="brand__dot" />
          <h1 className="brand__name">RYAA</h1>
        </div>
        <p className="brand__tag">Real-time Yielding Autonomous Agent</p>
      </Glass>

      <main className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg--${m.role}`}>
            <Glass className="bubble" radius={16}>
              <span className="bubble__who">
                {m.role === "user" ? "You" : "RYAA"}
              </span>
              {m.content}
            </Glass>
          </div>
        ))}

        {pending && !busy && (
          <div className="proposal">
            <button
              className="proposal__btn proposal__btn--confirm"
              onClick={handleConfirm}
            >
              Confirm
            </button>
            <button
              className="proposal__btn proposal__btn--cancel"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        )}

        {busy && (
          <div className="working" aria-live="polite">
            <span className="working__bead" aria-hidden="true" />
            <span className="working__text">RYAA is {verb}</span>
            <span className="working__dots" aria-hidden="true" />
          </div>
        )}

        {/* Voice status — only while in voice mode and the brain isn't already
            showing the "thinking" indicator above. */}
        {voice.voiceOn && !busy && voice.state !== "off" && (
          <div className={`working working--voice working--${voice.state}`} aria-live="polite">
            <span className="working__bead" aria-hidden="true" />
            <span className="working__text">
              {voice.state === "speaking"
                ? "RYAA is speaking"
                : voice.state === "transcribing"
                  ? "Got that…"
                  : "Listening"}
            </span>
            <span className="working__dots" aria-hidden="true" />
          </div>
        )}

        <div ref={bottomRef} />
      </main>

      <Glass as="footer" className="composer" radius={18} frost={5}>
        <Glass
          as="input"
          className="composer__input"
          radius={14}
          frost={5}
          value={input}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setInput(e.target.value)
          }
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={
            pending ? "Confirm or cancel above first…" : "Message RYAA…"
          }
          disabled={locked}
        />
        {voice.supported && (
          <button
            className={`composer__mic${voice.voiceOn ? " is-on" : ""}${
              voice.state === "listening" ? " is-listening" : ""
            }`}
            onClick={voice.toggle}
            aria-pressed={voice.voiceOn}
            aria-label={voice.voiceOn ? "Turn off voice" : "Talk to RYAA"}
            title={voice.voiceOn ? "Voice on — tap to stop" : "Talk to RYAA"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"
                fill="currentColor"
              />
              <path
                d="M5 11a7 7 0 0 0 14 0M12 18v3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <button
          className="composer__send"
          onClick={handleSend}
          disabled={locked}
          aria-label="Send"
        >
          ➤
        </button>
      </Glass>
    </div>
  );
}

export default App;
