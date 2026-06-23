from __future__ import annotations

import logging
from typing import Protocol

from pydantic import BaseModel

logger = logging.getLogger(__name__)

# class StubTodos:
#   """Fake todo store — logs instead of persisting. Real backend swaps in later."""

#   def add(self, text: str) -> str:
#     logger.info("STUB todo added: %s", text)
#     return text


class TaskItem(BaseModel):
    id: str
    title: str
    completed: bool = False


class TasksBackend(Protocol):
    def add_task(self, title: str) -> TaskItem: ...
    def list_tasks(self, include_completed: bool = False) -> list[TaskItem]: ...


class StubTasks:
    """In-memory tasks backend for the CLI and tests."""

    def __init__(self) -> None:
        self._tasks: list[TaskItem] = []

    def add_task(self, title: str) -> str:
        tid = f"stub-task-{len(self._tasks) + 1}"
        self._tasks.append(TaskItem(id=tid, title=title))
        return tid

    def list_tasks(self, include_completed: bool = False) -> list[TaskItem]:
        return [t for t in self._tasks if include_completed or not t.completed]
