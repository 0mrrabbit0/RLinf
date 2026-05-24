"""Application settings for the RLinf GUI backend."""

from __future__ import annotations

import sys
from pathlib import Path

from pydantic_settings import BaseSettings


def _detect_repo_path() -> Path:
    """Walk up from this file to find the repository root (contains .git/)."""
    current = Path(__file__).resolve().parent
    for ancestor in (current, *current.parents):
        if (ancestor / ".git").exists():
            return ancestor
    # Fallback: assume gui/backend/ is two levels below repo root.
    return current.parent.parent


class Settings(BaseSettings):
    rlinf_repo_path: Path = _detect_repo_path()
    python_interpreter: str = sys.executable
    db_path: Path = Path.home() / ".rlinf-gui" / "rlinf.db"
    host: str = "127.0.0.1"
    port: int = 18721

    model_config = {"env_prefix": "RLINF_GUI_"}


settings = Settings()
