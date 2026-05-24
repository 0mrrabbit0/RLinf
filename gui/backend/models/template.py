"""Pydantic models for task templates."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class TaskCategory(str, Enum):
    TRAINING = "training"
    EVALUATION = "evaluation"
    DATA_COLLECTION = "data_collection"
    SFT = "sft"
    INFERENCE = "inference"
    OTHER = "other"


# Human-readable labels for each category (Chinese).
CATEGORY_LABELS: dict[TaskCategory, str] = {
    TaskCategory.TRAINING: "训练",
    TaskCategory.EVALUATION: "评估",
    TaskCategory.DATA_COLLECTION: "数据采集",
    TaskCategory.SFT: "监督微调",
    TaskCategory.INFERENCE: "推理",
    TaskCategory.OTHER: "其他",
}


class ConfigPreset(BaseModel):
    """A named configuration preset shipped with a template."""

    id: str
    name: str
    description: str = ""
    config_path: str = ""


class TaskTemplate(BaseModel):
    id: str
    name: str
    category: TaskCategory
    description: str = ""
    entry_script: str
    config_path: str | None = None
    presets: list[ConfigPreset] = []
    env_vars: dict[str, str] = {}
