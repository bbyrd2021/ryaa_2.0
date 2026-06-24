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

// One helper: POST JSON with the session token, throw on non-2xx.
async function post<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function propose(token: string, messages: Msg[]) {
  return post<ProposeResult>('/propose', token, { messages });
}

export function confirm(
  token: string,
  action: string,
  event: EventDetails,
  eventId: string | null,
) {
  return post<ScheduleResult>('/confirm', token, {
    action,
    event,
    event_id: eventId,
  });
}
