"""Service that auto-discovers task templates from the examples/ directory."""

from __future__ import annotations

import re
from pathlib import Path

from models.template import CATEGORY_LABELS, ConfigPreset, TaskCategory, TaskTemplate


_SCRIPT_CATEGORY_MAP: list[tuple[re.Pattern[str], TaskCategory]] = [
    (re.compile(r"^run_.*sft"), TaskCategory.SFT),
    (re.compile(r"^eval_"), TaskCategory.EVALUATION),
    (re.compile(r"^collect_"), TaskCategory.DATA_COLLECTION),
    (re.compile(r"^run_.*eval"), TaskCategory.EVALUATION),
    (re.compile(r"^run_.*infer"), TaskCategory.INFERENCE),
    (re.compile(r"^run_"), TaskCategory.TRAINING),
]

# Maps the top-level example directory to a human-readable domain prefix.
_DOMAIN_LABELS: dict[str, str] = {
    "embodiment": "具身智能",
    "reasoning": "推理",
    "agent": "智能体",
    "sft": "监督微调",
    "reward": "奖励模型",
    "recap": "数据回放",
}


def _classify_script(script_name: str) -> TaskCategory:
    stem = Path(script_name).stem
    for pattern, category in _SCRIPT_CATEGORY_MAP:
        if pattern.search(stem):
            return category
    return TaskCategory.OTHER


def _find_config_dir(script_path: Path) -> Path | None:
    """Look for a config/ directory next to or near the script."""
    candidate = script_path.parent / "config"
    if candidate.is_dir():
        return candidate
    return None


def _list_config_presets(config_dir: Path | None, repo_path: Path) -> list[ConfigPreset]:
    """Walk the config directory and return ConfigPreset objects."""
    if config_dir is None or not config_dir.exists():
        return []
    presets: list[ConfigPreset] = []
    for p in sorted(config_dir.iterdir()):
        if p.suffix in (".yaml", ".yml") and not p.name.startswith("_"):
            preset_id = p.stem
            presets.append(ConfigPreset(
                id=preset_id,
                name=preset_id,
                description=str(p.relative_to(repo_path)),
                config_path=str(p.relative_to(repo_path)),
            ))
        elif p.is_dir():
            for child in sorted(p.rglob("*.yaml")):
                if child.name.startswith("_"):
                    continue
                rel = child.relative_to(config_dir)
                preset_id = str(rel.with_suffix(""))
                presets.append(ConfigPreset(
                    id=preset_id,
                    name=preset_id,
                    description=str(child.relative_to(repo_path)),
                    config_path=str(child.relative_to(repo_path)),
                ))
    return presets


def _make_description(script_path: Path, category: TaskCategory, domain: str) -> str:
    """Generate a human-readable description for a template."""
    cat_label = CATEGORY_LABELS.get(category, "任务")
    domain_label = _DOMAIN_LABELS.get(domain, domain)
    return f"{domain_label} - {cat_label} ({script_path.name})"


class TemplateService:
    def __init__(self, repo_path: Path) -> None:
        self._repo_path = repo_path
        self._templates: dict[str, TaskTemplate] = {}
        self._scan()

    def _scan(self) -> None:
        examples_dir = self._repo_path / "examples"
        if not examples_dir.is_dir():
            return

        scripts = list(examples_dir.rglob("run_*.sh"))
        scripts += list(examples_dir.rglob("eval_*.sh"))
        scripts += list(examples_dir.rglob("collect_*.sh"))

        seen_paths: set[Path] = set()
        for script in sorted(scripts):
            if script in seen_paths:
                continue
            seen_paths.add(script)

            rel = script.relative_to(self._repo_path)
            # Build a readable id: e.g. "embodiment/run_embodiment"
            template_id = str(rel.with_suffix("")).replace("examples/", "")
            name = script.stem.replace("_", " ").title()
            category = _classify_script(script.name)
            config_dir = _find_config_dir(script)
            presets = _list_config_presets(config_dir, self._repo_path)

            # Derive domain from first path component after examples/
            domain_parts = rel.parts  # ('examples', 'embodiment', ...)
            domain = domain_parts[1] if len(domain_parts) > 2 else ""
            description = _make_description(script, category, domain)

            self._templates[template_id] = TaskTemplate(
                id=template_id,
                name=name,
                category=category,
                description=description,
                entry_script=str(rel),
                config_path=str(config_dir.relative_to(self._repo_path)) if config_dir else None,
                presets=presets,
            )

    def list_templates(self) -> list[TaskTemplate]:
        return list(self._templates.values())

    def get_template(self, template_id: str) -> TaskTemplate | None:
        return self._templates.get(template_id)
