"""FastAPI application entry point for the RLinf GUI backend sidecar."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import configs, nodes, tasks, templates
from config import settings
from services.task_service import TaskService
from services.template_service import TemplateService

# --- Service singletons (initialised during lifespan) ---

_task_service: TaskService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _task_service

    # Startup
    template_service = TemplateService(repo_path=settings.rlinf_repo_path)
    _task_service = TaskService(template_service=template_service)

    # Wire services into routers
    templates.init(template_service)
    tasks.init(_task_service)

    settings.db_path.parent.mkdir(parents=True, exist_ok=True)

    yield

    # Shutdown
    if _task_service is not None:
        await _task_service.shutdown()


app = FastAPI(
    title="RLinf Studio Backend",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS for Tauri webview (localhost dev and production origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "https://tauri.localhost",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(configs.router)
app.include_router(templates.router)
app.include_router(tasks.router)
app.include_router(nodes.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )
