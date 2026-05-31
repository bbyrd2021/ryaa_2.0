from __future__ import annotations

import logging

from dotenv import load_dotenv

from ryaa.orchestrator import Scheduler
from ryaa.providers.openai_provider import OpenAIProvider
from ryaa.safety.confirm import CLIConfirm
from ryaa.safety.guardrails import Guardrails
from ryaa.skills.calendar import CalendarSkill
from ryaa.tools.calendar_tool import StubCalendar


def main() -> None:
    load_dotenv()  # entrypoint loads config - components just read env
    logging.basicConfig(
        level=logging.WARNING
    )  # WARNING = quiet; flip to INFO to watch internals
    # --- composition root: pick the concrete implementations ---
    provider = OpenAIProvider()
    scheduler = Scheduler(
        guardrails=Guardrails(provider=provider),
        calendar=CalendarSkill(provider=provider),
        confirmer=CLIConfirm(),  # real terminal y/N prompt
        backend=StubCalendar(),  # swap for AppleCalendar / GraphCalendar later
    )

    print("RYAA - your scheduling assistant. Type a request, or 'quit' to exit.")
    while True:
        user_input = input("\nRYAA> ").strip()
        if user_input.lower() in {"quit", "exit", "q"}:
            break
        if not user_input:
            continue
        result = scheduler.schedule(user_input)

        print(f"[{result.status}] {result.message}")
        if result.event_id:
            print(f" event id: {result.event_id}")


if __name__ == "__main__":
    main()
