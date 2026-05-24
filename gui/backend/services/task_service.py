"""Service that manages task subprocess lifecycle."""

from __future__ import annotations

import os
import signal
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

from config import settings
from models.task import TaskCreate, TaskStatus, TaskStatusEnum
from services.template_service import TemplateService


class TaskService:
    def __init__(self, template_service: TemplateService) -> None:
        self._template_service = template_service
        self._tasks: dict[str, _RunningTask] = {}

    def create_task(self, req: TaskCreate) -> TaskStatus:
        """Launch a task as a subprocess and return its initial status."""
        template = None
        if req.template_id:
            template = self._template_service.get_template(req.template_id)
            if template is None:
                raise ValueError(f"Unknown template: {req.template_id}")

        task_id = uuid.uuid4().hex[:12]
        log_dir = settings.db_path.parent / "logs" / task_id
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / "output.log"

        # Build command (list form — no shell=True, prevents injection)
        if template is not None:
            script_path = settings.rlinf_repo_path / template.entry_script
            cmd_list = ["bash", str(script_path)]
            if req.config_preset:
                cmd_list.append(req.config_preset)
            cmd_display = " ".join(cmd_list)
        else:
            raise ValueError("template_id is required to create a task")

        # Build environment
        env = os.environ.copy()
        env["REPO_PATH"] = str(settings.rlinf_repo_path)
        if template is not None:
            env.update(template.env_vars)
        env.update(req.env_vars)
        for key, value in req.config_overrides.items():
            # Pass Hydra-style overrides via an env var the scripts can consume.
            env.setdefault("RLINF_OVERRIDES", "")
            env["RLINF_OVERRIDES"] += f" {key}={value}"

        log_file = open(log_path, "w")  # noqa: SIM115
        proc = subprocess.Popen(
            cmd_list,
            shell=False,
            cwd=str(settings.rlinf_repo_path),
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid,
        )

        now = datetime.now(timezone.utc)
        running = _RunningTask(
            id=task_id,
            name=req.name or (template.name if template else ""),
            template_id=req.template_id,
            process=proc,
            log_file=log_file,
            command=cmd_display,
            started_at=now,
            log_path=str(log_path),
        )
        self._tasks[task_id] = running
        return running.to_status()

    def list_tasks(self) -> list[TaskStatus]:
        return [t.to_status() for t in self._tasks.values()]

    def get_task(self, task_id: str) -> TaskStatus | None:
        task = self._tasks.get(task_id)
        if task is None:
            return None
        return task.to_status()

    def stop_task(self, task_id: str) -> TaskStatus | None:
        """Send SIGTERM, then SIGKILL if the process is still alive."""
        task = self._tasks.get(task_id)
        if task is None:
            return None

        proc = task.process
        if proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, OSError):
                pass
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except (ProcessLookupError, OSError):
                    pass
                proc.wait(timeout=3)

        task.log_file.close()
        return task.to_status()

    async def shutdown(self) -> None:
        """Stop all running tasks. Called on app shutdown."""
        for task_id in list(self._tasks):
            task = self._tasks[task_id]
            if task.process.poll() is None:
                self.stop_task(task_id)


class _RunningTask:
    __slots__ = (
        "id", "name", "template_id", "process", "log_file",
        "command", "started_at", "log_path",
    )

    def __init__(
        self,
        id: str,
        name: str,
        template_id: str | None,
        process: subprocess.Popen[bytes],
        log_file: object,
        command: str,
        started_at: datetime,
        log_path: str,
    ) -> None:
        self.id = id
        self.name = name
        self.template_id = template_id
        self.process = process
        self.log_file = log_file
        self.command = command
        self.started_at = started_at
        self.log_path = log_path

    def to_status(self) -> TaskStatus:
        rc = self.process.poll()
        if rc is None:
            status = TaskStatusEnum.RUNNING
            exit_code = None
        else:
            if not self.log_file.closed:
                self.log_file.close()
            if rc == 0:
                status = TaskStatusEnum.COMPLETED
            elif rc < 0:
                status = TaskStatusEnum.STOPPED
            else:
                status = TaskStatusEnum.FAILED
            exit_code = rc

        return TaskStatus(
            id=self.id,
            name=self.name,
            status=status,
            template_id=self.template_id,
            pid=self.process.pid,
            command=self.command,
            started_at=self.started_at,
            log_path=self.log_path,
            exit_code=exit_code,
        )
