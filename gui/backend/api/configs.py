"""API router for browsing and validating YAML config files."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from config import settings

router = APIRouter(prefix="/api/configs", tags=["configs"])


def _build_tree(root: Path, base: Path) -> list[dict[str, Any]]:
    """Recursively build a JSON-serialisable directory tree.

    Empty directories (those containing no YAML files in any descendant) are
    pruned from the result so the UI tree stays clean.
    """
    nodes: list[dict[str, Any]] = []
    if not root.is_dir():
        return nodes
    for child in sorted(root.iterdir()):
        if child.name.startswith("."):
            continue
        rel = str(child.relative_to(base))
        if child.is_dir():
            children = _build_tree(child, base)
            # Only include directories that contain at least one YAML file.
            if children:
                nodes.append(
                    {"name": child.name, "path": rel, "type": "directory", "children": children}
                )
        elif child.suffix in (".yaml", ".yml"):
            nodes.append({"name": child.name, "path": rel, "type": "file"})
    return nodes


@router.get("/tree")
def config_tree() -> list[dict[str, Any]]:
    """Scan examples/*/config/ directories and return a merged tree."""
    examples_dir = settings.rlinf_repo_path / "examples"
    return _build_tree(examples_dir, settings.rlinf_repo_path)


@router.get("/file")
async def read_config_file(path: str = Query(..., description="Relative path inside the repo")) -> dict[str, str]:
    """Read a YAML config file and return its raw content."""
    resolved = (settings.rlinf_repo_path / path).resolve()
    # Safety: ensure the resolved path is inside the repo.
    if not str(resolved).startswith(str(settings.rlinf_repo_path.resolve())):
        raise HTTPException(status_code=403, detail="Path escapes the repository root")
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return {"path": path, "content": resolved.read_text(encoding="utf-8")}


class ValidateRequest(BaseModel):
    path: str
    content: str


class ValidateResponse(BaseModel):
    valid: bool
    errors: list[str] = []


@router.post("/validate", response_model=ValidateResponse)
async def validate_config(req: ValidateRequest) -> ValidateResponse:
    """Write content to a temp file, try OmegaConf.load(), and report errors."""
    tmp_path = None
    try:
        from omegaconf import OmegaConf

        with tempfile.NamedTemporaryFile(suffix=".yaml", mode="w", delete=False) as tmp:
            tmp_path = tmp.name
            tmp.write(req.content)
            tmp.flush()
            OmegaConf.load(tmp.name)
        return ValidateResponse(valid=True)
    except Exception as exc:
        return ValidateResponse(valid=False, errors=[str(exc)])
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
