import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from ryaa.tools.calendar_tool import EventDetails, EventRef
from ryaa.tools.event_state import EventState

TOKEN_URI = "https://oauth2.googleapis.com/token"


def _parse_when(when: dict) -> datetime:
    # timed event have {"dateTime": ...}; all-day events have {"date": ...}
    raw = when.get("dateTime") or when["date"]
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


class GoogleCalendarBackend:
    """
    CalendarBackend backed by a user's real Google Calendar (refresh-token creds).
    """

    def __init__(self, refresh_token: str, timezone: str = "America/Chicago"):
        self._creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri=TOKEN_URI,
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
        try:
            updated = (
                self._svc.events()
                .patch(calendarId=self._cal, eventId=event_id, body=body)
                .execute()
            )
        except HttpError as e:
            # Google-managed events (auto-added from email) reject patches with 400/403.
            if e.resp.status in (400, 403):
                raise RuntimeError(
                    "That event was auto-added by Google (e.g. from an email), "
                    "so it can't be edited here."
                ) from e
            raise
        return updated["id"]

    def list_events(self, start: datetime, end: datetime) -> list[EventRef]:
        return self._query(start, end, query=None)

    def find_events(self, query: str, start: datetime, end: datetime) -> list[EventRef]:
        return self._query(start, end, query=query)

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
        # Google rejects naive datetimes for timeMin/timeMax - attach the backend's zone
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=self._zone)
        return dt.isoformat()

    def _to_ref(self, e: dict) -> EventRef:
        start = _parse_when(e["start"])
        end = _parse_when(e["end"])
        priv = e.get("extendedProperties", {}).get("private", {})
        state = None
        if (
            priv.get("ryaa") == "1"
        ):  # our event → populate provenance; else external → None
            state = EventState(
                status=priv.get("ryaa_status", "created"),
                created_at=datetime.fromisoformat(e["created"].replace("Z", "+00:00")),
                modified_at=datetime.fromisoformat(e["updated"].replace("Z", "+00:00")),
            )
        # Google-managed events (eventType != "default", e.g. "fromGmail" flight/
        # hotel auto-adds) can't be patched via the API — flag so ryaa won't try.
        editable = e.get("eventType", "default") == "default"
        return EventRef(
            id=e["id"],
            name=e.get("summary", ""),
            start=start,
            duration_minutes=int((end - start).total_seconds() // 60),
            participants=json.loads(priv.get("ryaa_participants", "[]")),
            state=state,
            editable=editable,
        )
