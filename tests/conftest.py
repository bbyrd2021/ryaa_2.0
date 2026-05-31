from __future__ import annotations

import pytest
from pydantic import BaseModel

from ryaa.providers.base import Message


class FakeProvider:
    def __init__(self, *, text: str = "", structured_return=None, raises=False):
        self.text = text
        self.structured_return = structured_return
        self.raises = raises

    def complete(self, messages: list[Message], *, model: str | None = None) -> str:
        if self.raises:
            raise RuntimeError("Test failure")
        return self.text

    def structured(
        self,
        messages: list[Message],
        schema: type[BaseModel],
        *,
        model: str | None = None,
    ) -> BaseModel:
        if self.raises:
            raise RuntimeError("Test failure")
        if isinstance(self.structured_return, dict):
            return self.structured_return[schema]
        return self.structured_return


class FakeConfirmer:
    def __init__(self, *, answer: bool):
        self.answer = answer
        self.calls: list[str] = []

    def confirm(self, summary: str) -> bool:
        self.calls.append(summary)
        return self.answer


class FakeCalendarBackend:
    def __init__(self):
        self.created: list = []

    def create_event(self, event):
        self.created.append(event)
        return "fake-event-id"


@pytest.fixture
def fake_provider() -> type[FakeProvider]:
    return FakeProvider


@pytest.fixture
def fake_confirmer() -> type[FakeConfirmer]:
    return FakeConfirmer


@pytest.fixture
def fake_calendar_backend() -> type[FakeCalendarBackend]:
    return FakeCalendarBackend
