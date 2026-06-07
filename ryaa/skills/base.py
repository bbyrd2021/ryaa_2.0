from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, Field

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.tools.calendar_tool import EventDetails

class AgentResult(BaseModel):
  kind: Literal["proposal", "reply"]
  summary: str | None = None          # the proposal summary OR the reply text
  event: EventDetails | None = None   # carried on a calendar proposal (generalize at skill #3)

class Skill(Protocol):
  """Guidance for a family of tools: WHAT it does, HOW to use it, and the tools themselves."""

  name: str
  description: str

  def instructions(self) -> str: ...           # context injected into the system prompt
  def tools(self) -> list[ToolSpec]: ...        # the model-facing tool specs
  def run_tool(self, call: ToolCall) -> "AgentResult | str": ...  # str = continue, AgentResult = yield

