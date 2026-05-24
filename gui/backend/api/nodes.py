"""API router for cluster node management (Phase 1 stubs)."""

from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


class NodeInfo(BaseModel):
    id: str
    address: str
    status: str = "unknown"


class NodeRegister(BaseModel):
    address: str
    label: str = ""


@router.get("", response_model=list[NodeInfo])
async def list_nodes() -> list[NodeInfo]:
    return []


@router.post("", response_model=NodeInfo, status_code=201)
async def register_node(req: NodeRegister) -> NodeInfo:
    # Stub: echo back as a registered node.
    return NodeInfo(id="stub-0", address=req.address, status="registered")
