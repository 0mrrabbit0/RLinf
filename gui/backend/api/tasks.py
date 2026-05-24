"""API router for task lifecycle management."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from models.task import TaskCreate, TaskStatus

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# The TaskService instance is injected at startup (see main.py).
_service = None


def init(service: object) -> None:
    global _service
    _service = service


@router.post("", response_model=TaskStatus, status_code=201)
async def create_task(req: TaskCreate) -> TaskStatus:
    try:
        return _service.create_task(req)  # type: ignore[union-attr]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=list[TaskStatus])
async def list_tasks() -> list[TaskStatus]:
    return _service.list_tasks()  # type: ignore[union-attr]


@router.get("/{task_id}", response_model=TaskStatus)
async def get_task(task_id: str) -> TaskStatus:
    status = _service.get_task(task_id)  # type: ignore[union-attr]
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.post("/{task_id}/stop", response_model=TaskStatus)
async def stop_task(task_id: str) -> TaskStatus:
    """Stop a running task (SIGTERM then SIGKILL)."""
    status = _service.stop_task(task_id)  # type: ignore[union-attr]
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.delete("/{task_id}", response_model=TaskStatus)
async def delete_task(task_id: str) -> TaskStatus:
    """Alias: DELETE also stops the task."""
    status = _service.stop_task(task_id)  # type: ignore[union-attr]
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return status
