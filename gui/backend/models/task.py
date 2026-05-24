"""Pydantic models for task execution."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class TaskStatusEnum(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    STOPPED = "stopped"


class TaskCreate(BaseModel):
    """Payload from the frontend task creation wizard."""

    name: str = ""
    description: str = ""
    tags: list[str] = []
    template_id: str | None = None
    config_preset: str | None = None
    config_overrides: dict[str, str] = {}
    env_vars: dict[str, str] = {}


class TaskStatus(BaseModel):
    id: str
    name: str = ""
    status: TaskStatusEnum
    template_id: str | None = None
    pid: int | None = None
    command: str = ""
    started_at: datetime = Field(default_factory=datetime.utcnow)
    finished_at: datetime | None = None
    log_path: str | None = None
    exit_code: int | None = None
