from __future__ import annotations

import json

from pydantic import BaseModel, Field

from ryaa.providers.base import ToolCall, ToolSpec
from ryaa.tools.todo_tool import StubTasks, TasksBackend


class AddTodoArgs(BaseModel):
    text: str = Field(description="The to-do text")


ADD_TODO = ToolSpec(
    name="add_todo",
    description="Add a to-do item to the user's Google Tasks.",
    parameters=AddTodoArgs.model_json_schema(),
)

LIST_TODOS = ToolSpec(
    name="list_todos",
    description="List the user's current (incomplete) to-dos.",
    parameters={"type": "object", "properties": {}},  # no args
)


class TodoSkill:
    "SKILL: track to-dos in the user's Google Tasks."

    name = "todos"
    description = "Track to-do items."

    def __init__(self, backend: TasksBackend | None = None):
        self.backend = backend or StubTasks()

    def instructions(self) -> str:
        return (
            "When the user wants to remember or track a task, call add_todo. "
            "When they ask what's on their list / what they need to do, call list_todos."
        )

    def tools(self) -> list[ToolSpec]:
        return [ADD_TODO, LIST_TODOS]

    def run_tool(self, call: ToolCall) -> str:
        if call.name == "add_todo":
            args = AddTodoArgs.model_validate(call.arguments)
            self.backend.add_task(args.text)
            return f"Added to-do: {args.text!r}."
        if call.name == "list_todos":
            items = self.backend.list_tasks()
            if not items:
                return "No to-dos on the list."
            return json.dumps(
                [{"title": t.title, "completed": t.completed} for t in items]
            )
        return f"Unknown tool: {call.name}"
