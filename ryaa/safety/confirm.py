from typing import Protocol


class Confirm(Protocol):
    def confirm(self, summary: str) -> bool: ...


class CLIConfirm:
    def confirm(self, summary: str) -> bool:
        print(summary)
        answer = input("Proceed? [y/N] ").strip().lower()
        return answer in ["y", "yes"]
