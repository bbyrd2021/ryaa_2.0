"""
OpenAI implementation of the LLMProvider contract.

YOUR TASK: fill in the two TODOs. Everything you need you've already written in
1-basic.py (complete) and 2-structured_output.py (structured). The only new bit
is translating our neutral Message objects into the dict shape OpenAI wants.

When done, this class will satisfy LLMProvider structurally — no inheritance
needed — because it has complete() and structured() with matching signatures.
"""

from __future__ import annotations

import json
import os
from typing import cast

from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam, ChatCompletionToolParam

from .base import Message, ModelTurn, T, ToolCall, ToolSpec

# Why a module-level default instead of hardcoding "gpt-4o" in each method:
# one place to change the model, and it documents the provider's default.
DEFAULT_MODEL = "gpt-4o"


class OpenAIProvider:
    """
    OpenAI provider implementation.
    """

    def __init__(self, api_key: str | None = None, default_model: str = DEFAULT_MODEL):
        # If no key is passed, fall back to the environment (load_dotenv runs in
        # your entrypoint). Storing the client once and reusing it is cheaper than
        # constructing one per call.

        self.client = OpenAI(api_key=api_key or os.getenv("OPENAI_API_KEY"))
        self.default_model = default_model

    def _to_openai(self, messages: list[Message]) -> list[ChatCompletionMessageParam]:
        """
        Translate OUR Message objects -> OpenAI's [{"role":..,"content":..}] dicts.
        This is the one place vendor formatting lives. (Helper, not part of the
        contract.)
        """
        out: list[dict] = []
        for m in messages:
            if m.role == "assistant" and m.tool_calls:
                out.append(
                    {
                        "role": "assistant",
                        "content": m.content or None,
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": json.dumps(tc.arguments),
                                },
                            }
                            for tc in m.tool_calls
                        ],
                    }
                )
            elif m.role == "tool":
                out.append(
                    {
                        "role": "tool",
                        "tool_call_id": m.tool_call_id,
                        "content": m.content,
                    }
                )
            else:
                out.append(
                    {
                        "role": m.role,
                        "content": m.content,
                    }
                )
        return cast(list[ChatCompletionMessageParam], out)

    def complete(self, messages: list[Message], *, model: str | None = None) -> str:
        """
        Plain-text completion. Returns the assistant's text response.
        """
        model = model or self.default_model
        completion = self.client.chat.completions.create(
            model=model,
            messages=self._to_openai(messages),
        )
        result = completion.choices[0].message.content
        if result is None:
            raise ValueError("Failed to parse text response")
        return result

    def structured(
        self, messages: list[Message], schema: type[T], *, model: str | None = None
    ) -> T:
        """
        Structured completion. Returns an INSTANCE of `schema` (a Pydantic model),
        already validated.
        """
        model = model or self.default_model
        completion = self.client.beta.chat.completions.parse(
            model=model,
            messages=self._to_openai(messages),
            response_format=schema,
        )
        result = completion.choices[0].message.parsed
        if result is None:
            raise ValueError("Failed to parse structured response")
        return result

    def act(
        self,
        messages: list[Message],
        tools: list[ToolSpec],
        *,
        model: str | None = None,
    ) -> ModelTurn:
        model = model or self.default_model
        openai_tools = cast(
            list[ChatCompletionToolParam],
            [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.parameters,
                    },
                }
                for t in tools
            ],
        )
        completion = self.client.chat.completions.create(
            model=model,
            messages=self._to_openai(messages),
            tools=openai_tools,
        )
        msg = completion.choices[0].message
        calls = [
            ToolCall(
                id=tc.id,
                name=tc.function.name,
                arguments=json.loads(tc.function.arguments or "{}"),
            )
            for tc in (msg.tool_calls or [])
            if tc.type == "function"
        ]
        return ModelTurn(text=msg.content or "", tool_calls=calls)
