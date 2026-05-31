"""Throwaway smoke test for the provider layer. Delete once the real CLI exists."""

from dotenv import load_dotenv

load_dotenv()  # the app entrypoint's job — load config here, not in the provider

from pydantic import BaseModel

from ryaa.providers.base import Message
from ryaa.providers.openai_provider import OpenAIProvider


class Event(BaseModel):
    name: str
    date: str


def main() -> None:
    provider = OpenAIProvider()

    print("== complete() ==")
    print(
        provider.complete([Message(role="user", content="say hi in exactly 3 words")])
    )

    print("\n== structured() ==")
    event = provider.structured(
        [Message(role="user", content="Final exam for CS101 is on Dec 12")],
        Event,
    )
    print(repr(event))


if __name__ == "__main__":
    main()
