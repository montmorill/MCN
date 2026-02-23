"""
Task worker launcher utilities.

Provides helpers for spawning background task_worker.py processes
and reading their log output.
"""

import os
import subprocess
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
TASK_WORKER_SCRIPT = BASE_DIR / "task_worker.py"
TASK_WORKER_LOG_DIR = BASE_DIR / "runtime" / "worker-logs"
TASK_WORKER_LOG_DIR.mkdir(parents=True, exist_ok=True)


def launch_task_worker(task_id: str) -> int:
    if not TASK_WORKER_SCRIPT.exists():
        raise RuntimeError(f"任务 worker 脚本不存在: {TASK_WORKER_SCRIPT}")

    stdout_path = TASK_WORKER_LOG_DIR / f"{task_id}.log"
    log_file = open(stdout_path, "a", encoding="utf-8")
    try:
        worker_env = dict(os.environ)
        worker_env["PYTHONUNBUFFERED"] = "1"
        worker_env["PYTHONUTF8"] = "1"
        process = subprocess.Popen(
            [sys.executable, "-u", str(TASK_WORKER_SCRIPT), task_id],
            cwd=str(BASE_DIR),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env=worker_env,
            start_new_session=True,
            close_fds=True,
        )
    finally:
        log_file.close()
    return int(process.pid)


def read_worker_log_lines(task_id: str) -> list[str]:
    log_path = TASK_WORKER_LOG_DIR / f"{task_id}.log"
    if not log_path.exists():
        return []
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            lines = [line.rstrip("\r\n") for line in f.readlines()]
            return [line for line in lines if line.strip()]
    except Exception:
        return []


def build_task_full_logs(task: dict[str, Any]) -> list[str]:
    task_id = str(task.get("id") or "").strip()
    task_logs = task.get("logs") if isinstance(task.get("logs"), list) else []
    normalized_task_logs = [str(item) for item in task_logs if str(item).strip()]
    worker_logs = read_worker_log_lines(task_id) if task_id else []
    return [*normalized_task_logs, *worker_logs]
