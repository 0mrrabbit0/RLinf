"""API router for task template discovery."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from models.template import TaskTemplate

router = APIRouter(prefix="/api/templates", tags=["templates"])

# The TemplateService instance is injected at startup (see main.py).
_service = None


def init(service: object) -> None:
    global _service
    _service = service


@router.get("", response_model=list[TaskTemplate])
async def list_templates() -> list[TaskTemplate]:
    return _service.list_templates()  # type: ignore[union-attr]


@router.get("/{template_id:path}", response_model=TaskTemplate)
async def get_template(template_id: str) -> TaskTemplate:
    """Fetch a single template by ID.

    Template IDs may contain slashes (e.g. ``embodiment/run_embodiment``),
    so the path parameter uses ``:path`` converter.
    """
    tpl = _service.get_template(template_id)  # type: ignore[union-attr]
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl
