"""
The provider contract — RYAA's model-agnostic core.

WHY THIS FILE EXISTS
--------------------
Every model vendor (OpenAI, Anthropic, Google, local Ollama) has a different
SDK. OpenAI gives you `client.beta.chat.completions.parse(...)`; Anthropic gives
you `client.messages.create(...)` with a different shape; and so on.

If our skills (email, calendar, study-coach) called a vendor SDK directly, then
"switch models" would mean "rewrite every skill." That is the opposite of
model-agnostic.

So we invent OUR OWN tiny vocabulary here — two verbs:
    - complete():   messages in, plain text out
    - structured(): messages in, a validated Pydantic object out

Each concrete provider (see openai_provider.py) is responsible for translating
OUR vocabulary into ITS native SDK calls. The rest of RYAA only ever speaks this
vocabulary, never a vendor SDK. Swapping models = swapping which Provider object
we construct. Nothing else changes.

This is the "augmented LLM" building block from the patterns course, but wrapped
in an interface so the augmentation is portable.
"""

from __future__ import annotations

from typing import Literal, Protocol, TypeVar, runtime_checkable

from pydantic import BaseModel

# A TypeVar bound to BaseModel lets structured() be generic: if you pass in the
# class CalendarEvent, the type checker KNOWS you get a CalendarEvent back, not
# just "some BaseModel." This is what gives you autocomplete on the result.
T = TypeVar("T", bound=BaseModel)


class Message(BaseModel):
    """
    One turn in a conversation, in OUR neutral format.

    Note we do NOT use OpenAI's dict shape ({"role": ..., "content": ...}) as our
    canonical type. We define our own, and each provider converts to/from it.
    That keeps vendor details out of the rest of the app.

    role: one of "system" | "user" | "assistant" | "tool"
    """

    role: Literal["system", "user", "assistant", "tool"]
    content: str


@runtime_checkable
class LLMProvider(Protocol):
    """
    The contract every model provider must fulfill.

    We use a Protocol (structural typing / "duck typing with a type checker")
    rather than an abstract base class on purpose: a class is a valid
    LLMProvider simply by HAVING these two methods with these signatures. It does
    not need to inherit from anything. That keeps providers decoupled — an
    OpenAIProvider doesn't import this file at runtime to "count."

    @runtime_checkable lets us also do isinstance(x, LLMProvider) if we ever want
    a runtime sanity check.
    """

    def complete(
        self,
        messages: list[Message],
        *,
        model: str | None = None,
    ) -> str:
        """
        Plain-text completion. Returns the assistant's text response.

        `model` is keyword-only (the `*` forces that) and optional: each provider
        has a sensible default model, but a caller can override per-call.
        """
        ...

    def structured(
        self,
        messages: list[Message],
        schema: type[T],
        *,
        model: str | None = None,
    ) -> T:
        """
        Structured completion. Returns an INSTANCE of `schema` (a Pydantic model),
        already validated. This is the workhorse for RYAA: extracting a calendar
        event, parsing email fields, scoring a guardrail — all are "give me back
        this exact shape."

        The provider is responsible for whatever native mechanism achieves this
        (OpenAI's parse(), Anthropic's tool-forcing, etc.) and for raising if the
        model failed to produce a valid object.
        """
        ...
