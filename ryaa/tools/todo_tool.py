from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

class StubTodos:
  """Fake todo store — logs instead of persisting. Real backend swaps in later."""

  def add(self, text: str) -> str:
    logger.info("STUB todo added: %s", text)
    return text