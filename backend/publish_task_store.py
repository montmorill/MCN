"""
Publish Task Store — JSON-file based, one file per task.
Mirrors task_store.py patterns but stores in runtime/publish-tasks/
to keep publish task data separate from collect task data.
"""

import json
import uuid
from typing import Any

from store_utils import (
    RUNTIME_DIR,
    now_iso,
    write_json_atomic as _write_json_atomic,
    normalize_progress as _normalize_progress,
)

TASK_STORE_DIR = RUNTIME_DIR / "publish-tasks"
TASK_STORE_DIR.mkdir(parents=True, exist_ok=True)

MAX_LOG_LINES = 500


def _task_path(task_id: str):
    return TASK_STORE_DIR / f"{str(task_id).strip()}.json"


def create_task_record(
    *,
    kind: str,
    task_type: str = "publish",
    publish_mode: str,
    title: str,
    description: str,
    payload: dict[str, Any],
    total_steps: int = 2,
) -> dict[str, Any]:
    task_id = uuid.uuid4().hex
    current_time = now_iso()
    record = {
        "id": task_id,
        "kind": kind,
        "task_type": task_type,
        "publish_mode": publish_mode,
        "collect_mode": "not-applicable",
        "title": title,
        "description": description,
        "status": "pending",
        "progress": _normalize_progress(0, total_steps),
        "created_at": current_time,
        "updated_at": current_time,
        "started_at": None,
        "ended_at": None,
        "payload": payload,
        "results": [],
        "result_summary": {
            "total_count": 0,
            "success_count": 0,
            "failure_count": 0,
            "tweet_id": None,
            "tweet_url": None,
        },
        "error": None,
        "logs": [],
    }
    _write_json_atomic(_task_path(task_id), record)
    return record


def read_task_record(task_id: str) -> dict[str, Any] | None:
    path = _task_path(task_id)
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
            if isinstance(payload, dict):
                return payload
    except Exception:
        return None
    return None


def update_task_record(task_id: str, **fields: Any) -> dict[str, Any] | None:
    current = read_task_record(task_id)
    if current is None:
        return None
    current.update(fields)
    current["updated_at"] = now_iso()
    _write_json_atomic(_task_path(task_id), current)
    return current


def append_task_log(task_id: str, message: str) -> dict[str, Any] | None:
    record = read_task_record(task_id)
    if record is None:
        return None
    logs = record.get("logs")
    if not isinstance(logs, list):
        logs = []
    timestamp = datetime.now().strftime("%H:%M:%S")
    logs.append(f"[{timestamp}] {message}")
    record["logs"] = logs[-MAX_LOG_LINES:]
    record["updated_at"] = now_iso()
    _write_json_atomic(_task_path(task_id), record)
    return record


def set_task_progress(task_id: str, current: int, total: int) -> dict[str, Any] | None:
    record = read_task_record(task_id)
    if record is None:
        return None
    record["progress"] = _normalize_progress(current, total)
    record["updated_at"] = now_iso()
    _write_json_atomic(_task_path(task_id), record)
    return record


def list_task_records(limit: int = 200) -> list[dict[str, Any]]:
    safe_limit = max(int(limit), 1)
    paths = sorted(
        TASK_STORE_DIR.glob("*.json"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    records: list[dict[str, Any]] = []
    for path in paths[:safe_limit]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                payload = json.load(f)
                if isinstance(payload, dict):
                    records.append(payload)
        except Exception:
            continue
    return records


def delete_task_record(task_id: str) -> bool:
    path = _task_path(task_id)
    if not path.exists():
        return False
    try:
        path.unlink()
        return True
    except Exception:
        return False
