from __future__ import annotations

import logging

from dotenv import load_dotenv

from ryaa.factory import build_scheduler
from ryaa.safety.confirm import CLIConfirm


def main() -> None:
    load_dotenv()  # entrypoint loads config - components just read env
    logging.basicConfig(
        level=logging.WARNING
    )  # WARNING = quiet; flip to INFO to watch internals
    # --- composition root: pick the concrete implementations ---
    scheduler = build_scheduler(confirmer=CLIConfirm())

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
