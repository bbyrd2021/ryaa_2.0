from __future__ import annotations

from pydantic import BaseModel, Field

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.skills.base import AgentResult
from ryaa.tools.todo_tool import StubTodos

class AddTodoArgs(BaseModel):
  text: str = Field(description="The to-do text")

ADD_TODO = ToolSpec(
  name="add_todo",
  description="Add a simple to-do item the user wants to remember.",
  parameters=AddTodoArgs.model_json_schema(),
)

class TodoSkill:
  "SKILL: how to track to-dos. Wraps the Todo TOOL."

  name = "todos"
  description = "Track simple to-do items."

  def __init__(self, store: StubTodos | None = None):
    self.store = store or StubTodos()

  def instructions(self) -> str:
    return "When the user wants to remember or track a task, call add_todo. (Stub: not persisted yet.)"

  def tools(self) -> list[ToolSpec]:
    return [ADD_TODO]

  def run_tool(self, call: ToolCall) -> AgentResult | str:
    if call.name == "add_todo":
      args = AddTodoArgs.model_validate(call.arguments)
      saved = self.store.add(args.text)
      return f"Added to-do: {saved!r} (stub — not saved)."
    return f"Unknown tool: {call.name}"