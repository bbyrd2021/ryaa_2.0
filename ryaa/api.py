from __future__ import annotations

import logging
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ryaa.factory import build_scheduler
from ryaa.orchestrator import ProposeResult, ScheduleResult
from ryaa.providers.base import Message
from ryaa.tools.calendar_tool import EventDetails

logger = logging.getLogger(__name__)

load_dotenv()
scheduler = build_scheduler()

app = FastAPI(title="RYAA API", description="API for the RYAA scheduling assistant")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str

class ProposeRequest(BaseModel):
    messages: list[ChatTurn] = Field(description="The whole transcript the browser holds")


class ConfirmRequest(BaseModel):
    action: Literal["create", "modify"] = "create"
    event: EventDetails
    event_id: str | None = None  # the event to change (when action == "modify")


@app.post("/propose")
def propose(req: ProposeRequest) -> ProposeResult:
    history = [Message(role=m.role, content=m.content) for m in req.messages]
    return scheduler.chat(history)


@app.post("/confirm")
def confirm(req: ConfirmRequest) -> ScheduleResult:
    try:
        if req.action == "modify" and req.event_id:
            return scheduler.update(req.event_id, req.event)
        return scheduler.create(req.event)
    except RuntimeError as e:
        logger.warning("Confirm failed: %s", e)
        return ScheduleResult(status="failed", message=str(e))
