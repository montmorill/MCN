"""
Publishing routes -- Twitter publish, queue, history, scheduler, publish tasks.
"""

import asyncio as _asyncio
import json
import logging
import time as _time
import traceback as _tb
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from account_store import get_account_record
import publish_scheduler
import publish_store
import publish_task_store
from twitter_publisher import publish_single_tweet

router = APIRouter(tags=["publishing"])

BASE_DIR = Path(__file__).resolve().parent.parent
MEDIA_UPLOAD_DIR = BASE_DIR / "runtime" / "media-uploads"
MEDIA_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ---------- Pydantic models ----------


class TweetPublishRequest(BaseModel):
    account_id: str = Field(..., min_length=1)
    text: str = ""
    media_paths: list[str] | None = None
    is_sensitive: bool = False


class QueueAddRequest(BaseModel):
    account_id: str = Field(..., min_length=1)
    tweet_type: str = "text"
    content: dict
    strategy: dict | None = None
    priority: int = 0


class QueueReorderRequest(BaseModel):
    item_id: str = Field(..., min_length=1)
    new_priority: int


class PublishTweetTaskRequest(BaseModel):
    account_id: str = Field(..., min_length=1)
    publish_mode: str = "single-tweet"
    text: str = ""
    media_paths: list[str] | None = None
    is_sensitive: bool = False
    strategy_type: str = "immediate"
    scheduled_time: str | None = None
    title: str | None = None
    description: str | None = None


# ---- Immediate publish ----------------------------------------------------


@router.post("/api/publish/tweet")
async def publish_tweet_now(req: TweetPublishRequest):
    content = {
        "text": req.text,
        "media_paths": req.media_paths,
        "is_sensitive": req.is_sensitive,
    }
    result = await publish_single_tweet(req.account_id, content)

    tweet_type = "text"
    if req.media_paths:
        first = (req.media_paths[0] or "").lower()
        if first.endswith((".mp4", ".mov", ".avi", ".webm")):
            tweet_type = "video"
        elif first.endswith(".gif"):
            tweet_type = "gif"
        else:
            tweet_type = "image"

    publish_store.create_history_record(
        account_id=req.account_id,
        tweet_type=tweet_type,
        content=content,
        status="success" if result.get("success") else "failed",
        tweet_id=result.get("tweet_id"),
        tweet_url=result.get("tweet_url"),
        error_message=result.get("message") if not result.get("success") else None,
    )

    return result


# ---- Media upload ---------------------------------------------------------


@router.post("/api/publish/upload-media")
async def publish_upload_media(
    account_id: str = Form(...),
    file: UploadFile = File(...),
):
    import uuid as _uuid
    safe_name = f"{_uuid.uuid4().hex}_{file.filename or 'upload'}"
    file_path = MEDIA_UPLOAD_DIR / safe_name
    data = await file.read()
    with open(file_path, "wb") as f:
        f.write(data)

    try:
        from twitter_publisher import get_or_create_session
        session = await get_or_create_session(account_id)
        media_id = await session.upload_media_file(str(file_path))
        return {
            "success": True,
            "media_id": media_id,
            "local_path": str(file_path),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/api/media/upload")
async def upload_media_temp(file: UploadFile = File(...)):
    """Save uploaded media file locally and return the path (no Twitter upload)."""
    import uuid as _uuid
    safe_name = f"{_uuid.uuid4().hex}_{file.filename or 'upload'}"
    file_path = MEDIA_UPLOAD_DIR / safe_name
    data = await file.read()
    with open(file_path, "wb") as f:
        f.write(data)
    return {"success": True, "local_path": str(file_path), "filename": file.filename}


# ---- Queue management -----------------------------------------------------


@router.get("/api/publish/queue")
async def list_publish_queue(
    account_id: str | None = None,
    status: str | None = None,
):
    items = publish_store.list_queue_items(account_id=account_id, status=status)
    return {"success": True, "items": items, "total": len(items)}


@router.post("/api/publish/queue")
async def add_to_publish_queue(req: QueueAddRequest):
    item = publish_store.create_queue_item(
        account_id=req.account_id,
        tweet_type=req.tweet_type,
        content=req.content,
        strategy=req.strategy,
        priority=req.priority,
    )
    return {"success": True, "item": item}


@router.put("/api/publish/queue/{item_id}")
async def update_publish_queue_item(item_id: str, body: dict):
    allowed = {"content", "strategy", "priority", "status", "tweet_type"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if not updates:
        return {"success": False, "error": "无有效更新字段"}
    result = publish_store.update_queue_item(item_id, **updates)
    if result is None:
        return {"success": False, "error": "队列项不存在"}
    return {"success": True, "item": result}


@router.delete("/api/publish/queue/{item_id}")
async def delete_publish_queue_item(item_id: str):
    ok = publish_store.delete_queue_item(item_id)
    return {"success": ok}


@router.post("/api/publish/queue/reorder")
async def reorder_publish_queue(req: QueueReorderRequest):
    result = publish_store.reorder_queue_item(req.item_id, req.new_priority)
    if result is None:
        return {"success": False, "error": "队列项不存在"}
    return {"success": True, "item": result}


@router.post("/api/publish/queue/pause/{account_id}")
async def pause_publish_queue(account_id: str):
    count = publish_store.pause_account_queue(account_id)
    return {"success": True, "paused_count": count}


@router.post("/api/publish/queue/resume/{account_id}")
async def resume_publish_queue(account_id: str):
    count = publish_store.resume_account_queue(account_id)
    return {"success": True, "resumed_count": count}


# ---- History ---------------------------------------------------------------


@router.get("/api/publish/history")
async def list_publish_history(
    account_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
):
    items = publish_store.list_history(account_id=account_id, status=status, limit=limit)
    return {"success": True, "items": items, "total": len(items)}


# ---- Scheduler control -----------------------------------------------------


@router.get("/api/publish/scheduler/status")
async def get_publish_scheduler_status():
    return publish_scheduler.get_scheduler_status()


@router.post("/api/publish/scheduler/trigger")
async def trigger_publish_scheduler():
    publish_scheduler.trigger_immediate_scan()
    return {"success": True, "message": "已触发立即扫描"}


# ==========================================================================
# Publish Tasks (task-based, stored in runtime/publish-tasks/)
# ==========================================================================


async def _execute_publish_task(task_id: str) -> None:
    """Background coroutine that executes a single publish task."""
    logger = logging.getLogger("publish_task_executor")
    logger.setLevel(logging.DEBUG)

    logger.info("=" * 60)
    logger.info("[task:%s] ====== 开始执行发布任务 ======", task_id[:8])

    task = publish_task_store.read_task_record(task_id)
    if task is None:
        logger.error("[task:%s] 任务记录不存在!", task_id[:8])
        return

    logger.debug("[task:%s] 任务记录: kind=%s, publish_mode=%s, status=%s",
                 task_id[:8], task.get("kind"), task.get("publish_mode"), task.get("status"))

    publish_task_store.update_task_record(
        task_id,
        status="running",
        started_at=publish_task_store.now_iso(),
    )
    publish_task_store.set_task_progress(task_id, 1, 2)
    logger.debug("[task:%s] 状态已更新为 running", task_id[:8])

    payload = task.get("payload") or {}
    account_id = payload.get("account_id", "")
    content = payload.get("content") or {}

    logger.debug("[task:%s] payload.account_id=%s", task_id[:8], account_id)
    logger.debug("[task:%s] payload.content keys=%s", task_id[:8], list(content.keys()))

    account = get_account_record(account_id)
    if not account:
        err_msg = f"账号不存在: {account_id}"
        logger.error("[task:%s] %s", task_id[:8], err_msg)
        publish_task_store.append_task_log(task_id, f"错误: {err_msg}")
        publish_task_store.update_task_record(
            task_id, status="failed", error=err_msg,
            ended_at=publish_task_store.now_iso(),
        )
        publish_task_store.set_task_progress(task_id, 2, 2)
        return

    account_label = account.get("account") or account_id
    logger.info("[task:%s] 账号: @%s (id=%s, status=%s, platform=%s)",
                task_id[:8], account_label, account_id,
                account.get("status"), account.get("platform"))

    publish_task_store.append_task_log(task_id, f"开始发布推文 → 账号: @{account_label}")

    text_preview = (content.get("text") or "")[:60]
    if text_preview:
        publish_task_store.append_task_log(task_id, f"推文内容: {text_preview}...")
    media_paths = content.get("media_paths") or []
    if media_paths:
        publish_task_store.append_task_log(task_id, f"附带媒体文件: {len(media_paths)} 个")
        for i, mp in enumerate(media_paths):
            logger.debug("[task:%s] 媒体[%d]: %s", task_id[:8], i, mp)
            publish_task_store.append_task_log(task_id, f"  媒体[{i}]: {mp}")

    publish_task_store.append_task_log(task_id, "正在初始化发布会话 (获取ct0, 验证auth_token)...")
    t0 = _time.time()

    try:
        result = await publish_single_tweet(account_id, content)
    except Exception as exc:
        elapsed = _time.time() - t0
        tb_text = _tb.format_exc()
        logger.error("[task:%s] publish_single_tweet 抛出异常 (耗时=%.1fs): %s\n%s",
                     task_id[:8], elapsed, exc, tb_text)
        publish_task_store.append_task_log(task_id, f"发布异常 ({type(exc).__name__}): {exc}")
        publish_task_store.append_task_log(task_id, f"耗时: {elapsed:.1f}s")
        publish_task_store.update_task_record(
            task_id,
            status="failed",
            error=str(exc),
            ended_at=publish_task_store.now_iso(),
        )
        publish_task_store.set_task_progress(task_id, 2, 2)
        return

    elapsed = _time.time() - t0
    logger.info("[task:%s] publish_single_tweet 返回 (耗时=%.1fs): success=%s",
                task_id[:8], elapsed, result.get("success"))

    if result.get("success"):
        tweet_url = result.get("tweet_url", "")
        tweet_id = result.get("tweet_id", "")
        publish_task_store.append_task_log(task_id, f"发布成功! 耗时: {elapsed:.1f}s")
        publish_task_store.append_task_log(task_id, f"推文链接: {tweet_url}")
        publish_task_store.append_task_log(task_id, f"推文ID: {tweet_id}")
        logger.info("[task:%s] 发布成功: tweet_id=%s, url=%s",
                    task_id[:8], tweet_id, tweet_url)
        publish_task_store.update_task_record(
            task_id,
            status="completed",
            ended_at=publish_task_store.now_iso(),
            result_summary={
                "total_count": 1,
                "success_count": 1,
                "failure_count": 0,
                "tweet_id": tweet_id,
                "tweet_url": tweet_url,
            },
        )
        publish_store.create_history_record(
            account_id=account_id,
            tweet_type=task.get("publish_mode", "text"),
            content=content,
            status="success",
            tweet_id=tweet_id,
            tweet_url=tweet_url,
        )
    else:
        error_code = result.get("code", "unknown")
        error_msg = result.get("message", "发布失败")
        retryable = result.get("retryable", False)
        raw_error = result.get("raw_error", "")
        publish_task_store.append_task_log(
            task_id,
            f"发布失败 (耗时: {elapsed:.1f}s, 错误码: {error_code}, 可重试: {retryable})"
        )
        publish_task_store.append_task_log(task_id, f"错误详情: {error_msg}")
        if raw_error and raw_error != error_msg:
            publish_task_store.append_task_log(task_id, f"原始错误: {raw_error[:2000]}")
        tb_text = result.get("traceback", "")
        if tb_text:
            publish_task_store.append_task_log(task_id, f"堆栈: {tb_text[:2000]}")
        logger.warning("[task:%s] 发布失败完整结果: %s",
                       task_id[:8], json.dumps(result, ensure_ascii=False, default=str)[:3000])
        publish_task_store.update_task_record(
            task_id,
            status="failed",
            error=error_msg,
            ended_at=publish_task_store.now_iso(),
            result_summary={
                "total_count": 1,
                "success_count": 0,
                "failure_count": 1,
                "tweet_id": None,
                "tweet_url": None,
            },
        )
        publish_store.create_history_record(
            account_id=account_id,
            tweet_type=task.get("publish_mode", "text"),
            content=content,
            status="failed",
            error_message=error_msg,
        )

    logger.info("[task:%s] ====== 发布任务执行完毕 ======", task_id[:8])

    publish_task_store.set_task_progress(task_id, 2, 2)
    logger.info("Publish task %s finished", task_id)


@router.post("/api/publish-tasks")
async def create_publish_task(req: PublishTweetTaskRequest):
    tweet_type = "text"
    if req.media_paths:
        first = (req.media_paths[0] or "").lower()
        if first.endswith((".mp4", ".mov", ".avi", ".webm")):
            tweet_type = "video"
        elif first.endswith(".gif"):
            tweet_type = "gif"
        else:
            tweet_type = "image"

    title = (req.title or "").strip() or f"发布推文 — {tweet_type}"
    description = (req.description or "").strip() or "执行 Twitter 推文发布。"

    task = publish_task_store.create_task_record(
        kind=f"publish-{tweet_type}",
        publish_mode="single-tweet",
        title=title,
        description=description,
        payload={
            "account_id": req.account_id,
            "content": {
                "text": req.text,
                "media_paths": req.media_paths,
                "is_sensitive": req.is_sensitive,
            },
            "strategy": {
                "type": req.strategy_type,
                "scheduled_time": req.scheduled_time,
            },
        },
    )

    publish_task_store.append_task_log(task["id"], "任务已创建")

    if req.strategy_type == "immediate":
        _asyncio.create_task(_execute_publish_task(task["id"]))
        publish_task_store.append_task_log(task["id"], "已提交立即执行")
    else:
        publish_task_store.update_task_record(task["id"], status="scheduled")
        publish_task_store.append_task_log(
            task["id"],
            f"已设为定时发布: {req.scheduled_time or '未指定时间'}",
        )

    return {"success": True, "task_id": task["id"], "task": task}


@router.get("/api/publish-tasks")
def list_publish_tasks(limit: int = 200):
    safe_limit = max(min(int(limit), 1000), 1)
    tasks = publish_task_store.list_task_records(limit=safe_limit)
    return {"success": True, "tasks": tasks, "count": len(tasks)}


@router.get("/api/publish-tasks/{task_id}")
def get_publish_task_detail(task_id: str):
    task = publish_task_store.read_task_record(task_id)
    if task is None:
        return {"success": False, "message": "任务不存在", "task": None}
    return {"success": True, "task": task}


@router.delete("/api/publish-tasks/{task_id}")
def delete_publish_task(task_id: str):
    deleted = publish_task_store.delete_task_record(task_id)
    if not deleted:
        return {"success": False, "message": "任务不存在或删除失败"}
    return {"success": True, "message": "任务已删除"}
