"""
Task management routes (collect tasks).
"""

import os
import signal
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from longmao_parser import normalize_platform_type
from task_launcher import (
    TASK_WORKER_LOG_DIR,
    build_task_full_logs,
    launch_task_worker,
)
from task_store import (
    append_task_log,
    create_task_record,
    delete_task_record,
    list_task_records,
    read_task_record,
    update_task_record,
)

router = APIRouter(tags=["tasks"])


# ---------- Pydantic models ----------


class SingleWorkCollectRequest(BaseModel):
    links: list[str] = Field(..., min_length=1)
    title: str | None = None
    description: str | None = None


class AuthorCollectRequest(BaseModel):
    platform: str = "bilibili"
    collect_action: str = "data-only"  # data-only | collect-download
    uids: list[str] = Field(..., min_length=1)
    title: str | None = None
    description: str | None = None


class AuthorSelectiveDownloadRequest(BaseModel):
    platform: str = "bilibili"
    author_uid: str
    selected_video_folders: list[str] = Field(..., min_length=1)


# ---------- Helper: ensure_material_tree (imported lazily) ----------

def _ensure_material_tree() -> None:
    """Delegate to app-level ensure_material_tree (imported here to avoid circular deps)."""
    from routes.materials import ensure_material_tree
    ensure_material_tree()


# ---------- Routes ----------


@router.post("/api/tasks/collect/single-work")
def create_single_work_collect_task(payload: SingleWorkCollectRequest) -> dict[str, Any]:
    _ensure_material_tree()
    normalized_links = [link.strip() for link in payload.links if link.strip()]
    if not normalized_links:
        return {
            "success": False,
            "message": "至少提供一个有效作品链接",
            "results": [],
            "success_count": 0,
            "failure_count": 0,
        }

    task_title = (payload.title or "").strip() or "指定作品采集任务"
    task_description = (payload.description or "").strip() or "按作品链接执行批量采集。"
    task_record = create_task_record(
        kind="collect-single-work",
        task_type="collect",
        collect_mode="single-work",
        title=task_title,
        description=task_description,
        payload={
            "links": normalized_links,
            "title": task_title,
            "description": task_description,
        },
        total_steps=max(len(normalized_links) * 2, 1),
    )

    try:
        worker_pid = launch_task_worker(task_record["id"])
        task_record = update_task_record(task_record["id"], worker_pid=worker_pid) or task_record
        append_task_log(
            task_record["id"],
            f"任务已加入后台队列，待处理链接数: {len(normalized_links)}",
        )
    except Exception as e:
        task_record = (
            update_task_record(
                task_record["id"],
                status="failed",
                error=f"后台任务启动失败: {e}",
                ended_at=datetime.now().isoformat(timespec="seconds"),
            )
            or task_record
        )
        return {
            "success": False,
            "queued": False,
            "message": f"后台任务启动失败: {e}",
            "task_id": task_record["id"],
            "task": task_record,
        }

    return {
        "success": True,
        "queued": True,
        "message": "采集任务已创建，正在后台执行",
        "task_id": task_record["id"],
        "task": task_record,
    }


@router.post("/api/tasks/collect/author")
def create_author_collect_task(payload: AuthorCollectRequest) -> dict[str, Any]:
    _ensure_material_tree()

    platform = normalize_platform_type(payload.platform)
    if platform != "bilibili":
        return {
            "success": False,
            "message": "当前仅支持 B站 指定作者采集",
            "results": [],
            "success_count": 0,
            "failure_count": 0,
        }

    collect_action = payload.collect_action.strip().lower()
    if collect_action not in {"data-only", "collect-download"}:
        return {
            "success": False,
            "message": "collect_action 仅支持 data-only 或 collect-download",
            "results": [],
            "success_count": 0,
            "failure_count": 0,
        }

    normalized_uids = [uid.strip() for uid in payload.uids if uid.strip()]
    if not normalized_uids:
        return {
            "success": False,
            "message": "至少提供一个有效作者 UID",
            "results": [],
            "success_count": 0,
            "failure_count": 0,
        }

    task_title = (payload.title or "").strip() or "指定作者采集任务"
    task_description = (payload.description or "").strip() or "按作者 UID 执行采集流程。"
    task_record = create_task_record(
        kind="collect-author",
        task_type="collect",
        collect_mode="author",
        title=task_title,
        description=task_description,
        payload={
            "platform": platform,
            "collect_action": collect_action,
            "uids": normalized_uids,
            "title": task_title,
            "description": task_description,
        },
        total_steps=max(len(normalized_uids) * 2, 1),
    )

    try:
        worker_pid = launch_task_worker(task_record["id"])
        task_record = update_task_record(task_record["id"], worker_pid=worker_pid) or task_record
        append_task_log(
            task_record["id"],
            f"任务已加入后台队列，待处理 UID 数: {len(normalized_uids)}",
        )
    except Exception as e:
        task_record = (
            update_task_record(
                task_record["id"],
                status="failed",
                error=f"后台任务启动失败: {e}",
                ended_at=datetime.now().isoformat(timespec="seconds"),
            )
            or task_record
        )
        return {
            "success": False,
            "queued": False,
            "message": f"后台任务启动失败: {e}",
            "task_id": task_record["id"],
            "task": task_record,
        }

    return {
        "success": True,
        "queued": True,
        "message": "指定作者采集任务已创建，正在后台执行",
        "task_id": task_record["id"],
        "task": task_record,
    }


@router.post("/api/tasks/collect/author/selective-download")
def selective_download_author_videos(payload: AuthorSelectiveDownloadRequest) -> dict[str, Any]:
    _ensure_material_tree()

    platform = normalize_platform_type(payload.platform)
    if platform != "bilibili":
        return {
            "success": False,
            "message": "当前仅支持 B站 选择性下载",
            "results": [],
            "success_count": 0,
            "failure_count": 0,
        }

    author_uid = payload.author_uid.strip()
    selected_video_folders = [
        folder.strip() for folder in payload.selected_video_folders if folder.strip()
    ]
    if not author_uid or not selected_video_folders:
        return {
            "success": False,
            "message": "author_uid 和 selected_video_folders 均不能为空",
            "results": [],
            "success_count": 0,
            "failure_count": 0,
        }

    task_record = create_task_record(
        kind="collect-author-selective-download",
        task_type="collect",
        collect_mode="author",
        title=f"{author_uid} 选择性下载",
        description=f"按勾选清单下载作者 {author_uid} 的视频源文件。",
        payload={
            "platform": platform,
            "author_uid": author_uid,
            "selected_video_folders": selected_video_folders,
        },
        total_steps=max(len(selected_video_folders) * 2, 1),
    )

    try:
        worker_pid = launch_task_worker(task_record["id"])
        task_record = update_task_record(task_record["id"], worker_pid=worker_pid) or task_record
        append_task_log(
            task_record["id"],
            f"任务已加入后台队列，待下载作品数: {len(selected_video_folders)}",
        )
    except Exception as e:
        task_record = (
            update_task_record(
                task_record["id"],
                status="failed",
                error=f"后台任务启动失败: {e}",
                ended_at=datetime.now().isoformat(timespec="seconds"),
            )
            or task_record
        )
        return {
            "success": False,
            "queued": False,
            "message": f"后台任务启动失败: {e}",
            "task_id": task_record["id"],
            "task": task_record,
        }

    return {
        "success": True,
        "queued": True,
        "message": "选择性下载任务已创建，正在后台执行",
        "task_id": task_record["id"],
        "task": task_record,
    }


@router.get("/api/tasks")
def get_tasks(limit: int = 200) -> dict[str, Any]:
    safe_limit = max(min(int(limit), 1000), 1)
    tasks = list_task_records(limit=safe_limit)
    return {
        "success": True,
        "tasks": tasks,
        "count": len(tasks),
    }


@router.get("/api/tasks/{task_id}")
def get_task_detail(task_id: str) -> dict[str, Any]:
    task = read_task_record(task_id)
    if task is None:
        return {
            "success": False,
            "message": "任务不存在",
            "task": None,
        }
    enriched_task = dict(task)
    enriched_task["logs"] = build_task_full_logs(task)
    return {
        "success": True,
        "task": enriched_task,
    }


@router.delete("/api/tasks/{task_id}")
def delete_task(task_id: str) -> dict[str, Any]:
    task = read_task_record(task_id)
    if task is None:
        return {
            "success": False,
            "message": "任务不存在",
        }

    worker_pid = task.get("worker_pid")
    status = str(task.get("status") or "")
    terminated_worker = False

    if status in {"pending", "running"} and worker_pid is not None:
        try:
            os.kill(int(worker_pid), signal.SIGTERM)
            terminated_worker = True
        except ProcessLookupError:
            terminated_worker = False
        except Exception:
            terminated_worker = False

    deleted = delete_task_record(task_id)
    if not deleted:
        return {
            "success": False,
            "message": "任务删除失败",
        }

    log_path = TASK_WORKER_LOG_DIR / f"{task_id}.log"
    if log_path.exists():
        try:
            log_path.unlink()
        except Exception:
            pass

    return {
        "success": True,
        "message": "任务已删除",
        "terminated_worker": terminated_worker,
    }
