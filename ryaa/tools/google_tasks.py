import os

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from ryaa.tools.todo_tool import TaskItem

_TOKEN_URI = "https://oauth2.googleapis.com/token"


class GoogleTasksBackend:
    """TasksBackend backed by the user's real Google Tasks (refresh-token creds)."""

    def __init__(self, refresh_token: str):
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri=_TOKEN_URI,
            client_id=os.environ["GOOGLE_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        )
        self._svc = build("tasks", "v1", credentials=creds, cache_discovery=False)
        self._list = "@default"  # the user's default task list

    def add_task(self, title: str) -> str:
        created = (
            self._svc.tasks()
            .insert(tasklist=self._list, body={"title": title})
            .execute()
        )
        return created["id"]

    def list_tasks(self, include_completed: bool = False) -> list[TaskItem]:
        resp = (
            self._svc.tasks()
            .list(
                tasklist=self._list,
                showCompleted=include_completed,
                showHidden=include_completed,
            )
            .execute()
        )
        return [
            TaskItem(
                id=t["id"],
                title=t.get("title", ""),
                completed=t.get("status") == "completed",
            )
            for t in resp.get("items", [])
        ]
