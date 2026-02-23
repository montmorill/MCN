"""
Publish Scheduler — background coroutine that processes the publish queue.

Launched via FastAPI startup event:
    asyncio.create_task(publish_scheduler.run_scheduler_loop())
"""

import asyncio
import logging
import random
from datetime import datetime, timedelta

from publish_store import (
    count_today_success,
    create_history_record,
    get_last_publish_time,
    list_queue_items,
    update_queue_item,
)
from twitter_publisher import cleanup_expired_sessions, publish_single_tweet

logger = logging.getLogger("publish_scheduler")

SCAN_INTERVAL = 30  # seconds between queue scans
BACKOFF_BASE = 30   # seconds — retry delays: 30, 120, 480

_scheduler_running = False
_force_trigger = asyncio.Event()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_scheduler_status() -> dict:
    return {"running": _scheduler_running, "scan_interval": SCAN_INTERVAL}


def trigger_immediate_scan() -> None:
    _force_trigger.set()


# ---------------------------------------------------------------------------
# Core loop
# ---------------------------------------------------------------------------

async def run_scheduler_loop() -> None:
    global _scheduler_running
    _scheduler_running = True
    logger.info("Publish scheduler started (interval=%ds)", SCAN_INTERVAL)

    while True:
        try:
            await _process_pending_queue()
            await cleanup_expired_sessions()
        except Exception:
            logger.exception("Scheduler cycle error")

        # Wait for interval or forced trigger
        try:
            await asyncio.wait_for(_force_trigger.wait(), timeout=SCAN_INTERVAL)
            _force_trigger.clear()
        except asyncio.TimeoutError:
            pass


# ---------------------------------------------------------------------------
# Queue processing
# ---------------------------------------------------------------------------

async def _process_pending_queue() -> None:
    now = datetime.now()

    # Process items ready for execution
    ready_items = _collect_ready_items(now)
    for item in ready_items:
        await _execute_queue_item(item)


def _collect_ready_items(now: datetime) -> list[dict]:
    ready = []

    # 1) Immediate items (pending)
    for item in list_queue_items(status="pending"):
        strategy = item.get("strategy") or {}
        if strategy.get("type") == "immediate":
            ready.append(item)

    # 2) Scheduled items whose time has arrived
    for item in list_queue_items(status="scheduled"):
        strategy = item.get("strategy") or {}
        scheduled_time_str = strategy.get("scheduled_time")
        if not scheduled_time_str:
            ready.append(item)
            continue
        try:
            scheduled_time = datetime.fromisoformat(scheduled_time_str)
        except (ValueError, TypeError):
            ready.append(item)
            continue

        offset = strategy.get("randomize_offset_minutes", 0)
        if offset > 0:
            scheduled_time += timedelta(minutes=random.uniform(0, offset))

        if now >= scheduled_time:
            if _passes_strategy_checks(item, strategy, now):
                ready.append(item)

    return ready


def _passes_strategy_checks(item: dict, strategy: dict, now: datetime) -> bool:
    account_id = item.get("account_id", "")

    # Volumetric limit: daily_limit
    daily_limit = strategy.get("daily_limit")
    if daily_limit and daily_limit > 0:
        today_count = count_today_success(account_id)
        if today_count >= daily_limit:
            return False

    # Interval limit: interval_minutes
    interval = strategy.get("interval_minutes")
    if interval and interval > 0:
        last_time_str = get_last_publish_time(account_id)
        if last_time_str:
            try:
                last_time = datetime.fromisoformat(last_time_str)
                if now - last_time < timedelta(minutes=interval):
                    return False
            except (ValueError, TypeError):
                pass

    return True


async def _execute_queue_item(item: dict) -> None:
    item_id = item["id"]
    account_id = item["account_id"]
    content = item.get("content") or {}

    update_queue_item(item_id, status="publishing")

    result = await publish_single_tweet(account_id, content)

    if result.get("success"):
        update_queue_item(
            item_id,
            status="success",
            result={
                "tweet_id": result.get("tweet_id"),
                "tweet_url": result.get("tweet_url"),
                "error": None,
                "published_at": datetime.now().isoformat(timespec="seconds"),
            },
        )
        create_history_record(
            account_id=account_id,
            tweet_type=item.get("tweet_type", "text"),
            content=content,
            status="success",
            tweet_id=result.get("tweet_id"),
            tweet_url=result.get("tweet_url"),
            queue_item_id=item_id,
        )
        logger.info("Queue item %s published OK (%s)", item_id, result.get("tweet_url"))

    else:
        retry_count = item.get("retry_count", 0) + 1
        max_retries = item.get("max_retries", 3)
        error_code = result.get("code", "unknown")
        error_msg = result.get("message", "未知错误")
        retryable = result.get("retryable", False)

        if retryable and retry_count < max_retries:
            # Schedule retry with exponential backoff
            delay = BACKOFF_BASE * (4 ** (retry_count - 1))
            # For rate limits, use the reset timestamp if available
            if error_code == "rate_limited" and result.get("rate_limit_reset"):
                try:
                    import time
                    wait = max(int(result["rate_limit_reset"]) - int(time.time()), delay)
                    delay = wait
                except (ValueError, TypeError):
                    pass

            retry_time = (datetime.now() + timedelta(seconds=delay)).isoformat(timespec="seconds")
            strategy = dict(item.get("strategy") or {})
            strategy["type"] = "scheduled"
            strategy["scheduled_time"] = retry_time

            update_queue_item(
                item_id,
                status="scheduled",
                retry_count=retry_count,
                strategy=strategy,
                result={
                    "tweet_id": None,
                    "tweet_url": None,
                    "error": f"[retry {retry_count}/{max_retries}] {error_msg}",
                    "published_at": None,
                },
            )
            logger.warning("Queue item %s failed (%s), retry %d/%d in %ds",
                           item_id, error_code, retry_count, max_retries, delay)
        else:
            update_queue_item(
                item_id,
                status="failed",
                retry_count=retry_count,
                result={
                    "tweet_id": None,
                    "tweet_url": None,
                    "error": error_msg,
                    "published_at": None,
                },
            )
            create_history_record(
                account_id=account_id,
                tweet_type=item.get("tweet_type", "text"),
                content=content,
                status="failed",
                error_message=error_msg,
                queue_item_id=item_id,
            )
            logger.error("Queue item %s failed permanently: %s", item_id, error_msg)
