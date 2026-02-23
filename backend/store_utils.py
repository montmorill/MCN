"""
Shared JSON store utilities.

Centralizes I/O helpers previously duplicated across account_store.py,
proxy_store.py, publish_store.py, task_store.py, publish_task_store.py
and monitoring_store.py.
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

try:
    import fcntl
except ModuleNotFoundError:
    fcntl = None

BASE_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = BASE_DIR / "runtime"
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    """ISO-8601 timestamp with second precision."""
    return datetime.now().isoformat(timespec="seconds")


def read_json_list(path: Path) -> list[dict[str, Any]]:
    """Read a JSON file expected to contain a list of dicts."""
    if not path.exists():
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
    except Exception:
        return []
    return []


def write_json_list_atomic(path: Path, payload: list[dict[str, Any]]) -> None:
    """Atomically write a list to a JSON file using a unique temp file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f".{uuid.uuid4().hex[:8]}.tmp")
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        temp_path.replace(path)
    except Exception:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    """Atomically write a single dict to a JSON file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(f".{uuid.uuid4().hex[:8]}.tmp")
    try:
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        temp_path.replace(path)
    except Exception:
        try:
            temp_path.unlink(missing_ok=True)
        except Exception:
            pass
        raise


def read_and_write_locked(path: Path, mutator: Any) -> Any:
    """Read-modify-write with file locking (fcntl on Unix, no-op on Windows).

    *mutator(records)* should return ``(new_records, return_value)`` or just
    ``return_value`` (in which case *records* is written back unchanged).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_path = path.with_suffix(path.suffix + ".lock")
    with open(lock_path, "w") as lock_file:
        if fcntl is not None:
            fcntl.flock(lock_file, fcntl.LOCK_EX)
        try:
            records = read_json_list(path)
            result = mutator(records)
            if isinstance(result, tuple) and len(result) == 2:
                new_records, return_value = result
            else:
                new_records = records
                return_value = result
            write_json_list_atomic(path, new_records)
            return return_value
        finally:
            if fcntl is not None:
                fcntl.flock(lock_file, fcntl.LOCK_UN)


def normalize_progress(current: int, total: int) -> dict[str, int]:
    """Clamp and calculate percentage for task progress."""
    safe_total = max(int(total), 1)
    safe_current = min(max(int(current), 0), safe_total)
    percent = int(round((safe_current / safe_total) * 100))
    return {
        "current": safe_current,
        "total": safe_total,
        "percent": min(max(percent, 0), 100),
    }


def mask_secret(value: str | None) -> str | None:
    """Mask a sensitive string, showing only the first and last characters."""
    normalized = str(value or "").strip()
    if not normalized:
        return None
    if len(normalized) <= 2:
        return "*" * len(normalized)
    return f"{normalized[0]}{'*' * (len(normalized) - 2)}{normalized[-1]}"
