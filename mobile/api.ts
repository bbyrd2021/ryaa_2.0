// All backend calls live here, so the screens don't deal with fetch/headers.
export const BACKEND = 'https://web-production-7f7d88.up.railway.app';

export type Msg = { role: 'user' | 'assistant'; content: string };

export type EventDetails = {
  name: string;
  start: string; // ISO datetime, as the backend serialized it
  duration_minutes: number;
  participants: string[];
};

export type ProposeResult = {
  status: 'proposed' | 'reply' | 'rejected' | 'not_calendar';
  summary: string | null;
  reasons: string[];
  event: EventDetails | null;
  action: 'create' | 'modify';
  event_id: string | null;
};

export type ScheduleResult = {
  status: string;
  message: string;
  event_id: string | null;
};

// One helper: POST JSON with the session token, throw on non-2xx. Pass a
// `signal` to make the request abortable (the composer's stop button).
async function post<T>(
  path: string,
  token: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function propose(token: string, messages: Msg[], signal?: AbortSignal) {
  return post<ProposeResult>('/propose', token, { messages }, signal);
}

export function confirm(
  token: string,
  action: string,
  event: EventDetails,
  eventId: string | null,
  signal?: AbortSignal,
) {
  return post<ScheduleResult>(
    '/confirm',
    token,
    { action, event, event_id: eventId },
    signal,
  );
}

export type ProposeStreamHandlers = {
  onDelta: (text: string) => void; // a new fragment of ryaa's reply
  onStatus?: (status: string) => void; // what ryaa is doing (e.g. "calendar")
  onResult: (result: ProposeResult) => void; // terminal proposal/reply
  onError: (message: string) => void;
};

// Stream /propose/stream via XMLHttpRequest — RN's fetch can't read a response
// body incrementally, but XHR exposes responseText as it grows. Parses SSE
// frames (`data: {...}\n\n`) and returns an abort fn for the stop button.
export function proposeStream(
  token: string,
  messages: Msg[],
  h: ProposeStreamHandlers,
): () => void {
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${BACKEND}/propose/stream`);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Authorization', `Bearer ${token}`);

  let seen = 0; // chars of responseText already consumed
  let buffer = '';
  let aborted = false;

  function pump() {
    const full = xhr.responseText;
    if (full.length <= seen) return;
    buffer += full.slice(seen);
    seen = full.length;
    let nl: number;
    while ((nl = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const payload = dataLine.slice(5).trim();
      if (!payload) continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === 'delta') h.onDelta(ev.text);
        else if (ev.type === 'status') h.onStatus?.(ev.status);
        else if (ev.type === 'result') h.onResult(ev.result as ProposeResult);
        else if (ev.type === 'error') h.onError(ev.message || 'stream error');
      } catch {
        // partial/invalid frame — skip
      }
    }
  }

  xhr.onreadystatechange = () => {
    if (aborted) return;
    if (xhr.readyState >= 3) pump();
    if (xhr.readyState === 4 && xhr.status >= 400) h.onError(`stream ${xhr.status}`);
  };
  xhr.onerror = () => {
    if (!aborted) h.onError('network error');
  };
  xhr.send(JSON.stringify({ messages }));

  return () => {
    aborted = true;
    xhr.abort();
  };
}
