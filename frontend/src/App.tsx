import { useEffect, useRef, useState } from "react";
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
};
type ScheduleResult = {
  status: "created" | "rejected" | "not_calendar" | "cancelled" | "failed";
  message: string;
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
  const [pending, setPending] = useState<EventDetails | null>(null);
  // True while a request is in flight — used to disable inputs so you can't
  // double-send or confirm twice.
  const [busy, setBusy] = useState(false);
  // The playful status verb shown while busy (e.g. "RYAA is scheming…").
  const [verb, setVerb] = useState(WORKING_VERBS[0]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  async function handleSend() {
    const text = input.trim();

    // Build the next transcript explicitly — setMessages is async, so we can't
    // rely on `messages` already containing this turn when we fetch.
    const userMsg: ChatMessage = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    startWorking();

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
        addMessage({
          role: "assistant",
          content: data.summary ?? "Here's the plan:",
        });
        setPending(data.event);
      } else if (data.status === "reply") {
        addMessage({ role: "assistant", content: data.summary ?? "..." });
      } else if (data.status === "rejected") {
        addMessage({
          role: "assistant",
          content: data.reasons.join(" ") || "I can't schedule that one.",
        });
      } else {
        addMessage({
          role: "assistant",
          content: "That doesn't look like a calendar request.",
        });
      }
    } catch {
      addMessage({
        role: "assistant",
        content:
          "I couldn't reach the scheduler — is the API running on :8000?",
      });
    } finally {
      setBusy(false);
    }
  }

  // Step 2a: you said yes. Echo the proposed event back to /confirm, which
  // actually creates the macOS Calendar event.
  async function handleConfirm() {
    if (!pending || busy) return;
    startWorking();
    try {
      const res = await fetch(`${API}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending),
      });
      const data: ScheduleResult = await res.json();
      addMessage({ role: "assistant", content: data.message });
    } catch {
      addMessage({
        role: "assistant",
        content: "Something went wrong creating the event.",
      });
    } finally {
      setPending(null);
      setBusy(false);
    }
  }

  // Step 2b: you said no. Drop the proposal client-side — no call, nothing created.
  function handleCancel() {
    setPending(null);
    addMessage({
      role: "assistant",
      content: "Okay — cancelled. Nothing was created.",
    });
  }

  const locked = busy || pending !== null;

  return (
    <div className="app">
      <div className="orbs" aria-hidden="true">
        <span className="orb orb--1" />
        <span className="orb orb--2" />
        <span className="orb orb--3" />
        <span className="orb orb--4" />
        <span className="orb orb--5" />
      </div>

      <header className="app__header">
        <div className="brand">
          <span className="brand__dot" />
          <h1 className="brand__name">RYAA</h1>
        </div>
        <p className="brand__tag">Real-time Yielding Autonomous Agent</p>
      </header>

      <main className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg--${m.role}`}>
            <div className="bubble">
              <span className="bubble__who">
                {m.role === "user" ? "You" : "RYAA"}
              </span>
              {m.content}
            </div>
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

        <div ref={bottomRef} />
      </main>

      <footer className="composer">
        <input
          className="composer__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={
            pending ? "Confirm or cancel above first…" : "Message RYAA…"
          }
          disabled={locked}
        />
        <button
          className="composer__send"
          onClick={handleSend}
          disabled={locked}
          aria-label="Send"
        >
          ➤
        </button>
      </footer>
    </div>
  );
}

export default App;
