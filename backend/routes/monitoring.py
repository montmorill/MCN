"""
Monitoring routes -- data monitoring API endpoints.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from monitoring_store import (
    add_monitored_account,
    get_account_snapshots,
    get_latest_snapshot,
    get_monitored_account,
    get_tweet_metrics,
    get_tweet_metrics_by_source,
    list_monitored_accounts,
    remove_monitored_account,
    save_account_snapshot,
    save_tweet_metrics,
    update_monitored_account,
)

router = APIRouter(tags=["monitoring"])


# ---------- Pydantic models ----------


class MonitorAddRequest(BaseModel):
    username: str
    note: str | None = None
    refresh_interval_hours: int = 24
    collect_scope: dict | None = None


class MonitorBatchAccountItem(BaseModel):
    username: str
    collect_scope: dict | None = None


class MonitorBatchAddRequest(BaseModel):
    accounts: list[MonitorBatchAccountItem] = []
    usernames: list[str] = []  # legacy compat
    refresh_interval_hours: int = 24
    collect_scope: dict | None = None  # legacy default


class MonitorUpdateRequest(BaseModel):
    collect_scope: dict | None = None
    refresh_interval_hours: int | None = None


class MonitorBatchRemoveRequest(BaseModel):
    account_ids: list[str]


class MonitorScrapeRequest(BaseModel):
    account_ids: list[str]


# ---------- Routes ----------


@router.get("/api/monitoring/accounts")
def get_monitoring_accounts():
    accounts = list_monitored_accounts()
    items = []
    for acct in accounts:
        acct_id = acct.get("id", "")
        latest = get_latest_snapshot(acct_id)
        items.append({
            **acct,
            "latest_snapshot": latest,
        })
    return {"success": True, "accounts": items, "count": len(items)}


@router.post("/api/monitoring/accounts")
def add_monitoring_account(req: MonitorAddRequest):
    username = req.username.strip().lstrip("@")
    if not username:
        return {"success": False, "message": "用户名不能为空"}
    record = add_monitored_account(
        username,
        note=req.note,
        refresh_interval_hours=req.refresh_interval_hours,
        collect_scope=req.collect_scope,
    )
    if record is None:
        return {"success": False, "message": f"@{username} 已在监控列表中"}
    return {"success": True, "account": record, "message": f"已添加 @{username} 到监控列表"}


@router.post("/api/monitoring/accounts/batch")
def batch_add_monitoring_accounts(req: MonitorBatchAddRequest):
    added = 0
    skipped = 0
    # new format: per-account items
    if req.accounts:
        for item in req.accounts:
            username = item.username.strip().lstrip("@")
            if not username:
                continue
            record = add_monitored_account(
                username,
                refresh_interval_hours=req.refresh_interval_hours,
                collect_scope=item.collect_scope or req.collect_scope,
            )
            if record:
                added += 1
            else:
                skipped += 1
    else:
        # legacy format: flat username list
        for raw in req.usernames:
            username = raw.strip().lstrip("@")
            if not username:
                continue
            record = add_monitored_account(
                username,
                refresh_interval_hours=req.refresh_interval_hours,
                collect_scope=req.collect_scope,
            )
            if record:
                added += 1
            else:
                skipped += 1
    return {
        "success": True,
        "added": added,
        "skipped": skipped,
        "message": f"已添加 {added} 个账号" + (f"，{skipped} 个重复已跳过" if skipped else ""),
    }


@router.delete("/api/monitoring/accounts/{account_id}")
def delete_monitoring_account(account_id: str):
    removed = remove_monitored_account(account_id)
    if not removed:
        return {"success": False, "message": "账号不在监控列表中"}
    return {"success": True, "message": "已从监控列表移除"}


@router.patch("/api/monitoring/accounts/{account_id}")
def update_monitoring_account_settings(account_id: str, req: MonitorUpdateRequest):
    acct = get_monitored_account(account_id)
    if not acct:
        return {"success": False, "message": "账号不在监控列表中"}
    fields: dict = {}
    if req.collect_scope is not None:
        fields["collect_scope"] = req.collect_scope
    if req.refresh_interval_hours is not None:
        fields["refresh_interval_hours"] = max(1, req.refresh_interval_hours)
    if not fields:
        return {"success": True, "message": "无变更"}
    update_monitored_account(account_id, **fields)
    return {"success": True, "message": "设置已更新"}


@router.post("/api/monitoring/accounts/batch-remove")
def batch_remove_monitoring_accounts(req: MonitorBatchRemoveRequest):
    removed = 0
    for aid in req.account_ids:
        if remove_monitored_account(aid):
            removed += 1
    return {"success": True, "removed": removed, "message": f"已移除 {removed} 个账号"}


@router.get("/api/monitoring/accounts/{account_id}/dashboard")
def get_monitoring_dashboard(account_id: str, source: str = "regular"):
    acct = get_monitored_account(account_id)
    if not acct:
        return {"success": False, "message": "账号不在监控列表中"}

    snapshots = get_account_snapshots(account_id, limit=90)
    if source in ("regular", "highlights"):
        tweets = get_tweet_metrics_by_source(account_id, source, limit=50)
    else:
        tweets = get_tweet_metrics(account_id, limit=50)
    latest = snapshots[-1] if snapshots else None

    followers_history = [
        {"date": s.get("captured_at", ""), "followers": s.get("followers_count", 0)}
        for s in snapshots
    ]

    return {
        "success": True,
        "account": {
            "id": acct.get("id"),
            "username": acct.get("username"),
        },
        "overview": latest or {},
        "followers_history": followers_history,
        "tweets": tweets,
        "source": source,
    }


# ── Scrape endpoints ──


@router.post("/api/monitoring/accounts/{account_id}/scrape")
def scrape_single_monitoring_account(account_id: str):
    from twitter_monitor_scraper import scrape_account as _scrape

    acct = get_monitored_account(account_id)
    if not acct:
        return {"success": False, "message": "账号不在监控列表中"}

    result = _scrape(acct)

    if result.get("success") and result.get("profile"):
        save_account_snapshot(account_id, result["profile"])
        if result.get("regular_tweets"):
            save_tweet_metrics(account_id, result["regular_tweets"], source="regular")
        if result.get("highlight_tweets"):
            save_tweet_metrics(account_id, result["highlight_tweets"], source="highlights")
        update_monitored_account(
            account_id,
            last_scraped_at=datetime.now().isoformat(timespec="seconds"),
        )

    return {
        "success": result.get("success", False),
        "error": result.get("error"),
        "stats": result.get("stats", {}),
    }


@router.post("/api/monitoring/scrape-batch")
def scrape_batch_monitoring_accounts(req: MonitorScrapeRequest):
    from twitter_monitor_scraper import scrape_account as _scrape

    results = []
    for aid in req.account_ids:
        acct = get_monitored_account(aid)
        if not acct:
            results.append({"account_id": aid, "success": False, "error": "not_found"})
            continue

        result = _scrape(acct)
        if result.get("success") and result.get("profile"):
            save_account_snapshot(aid, result["profile"])
            if result.get("regular_tweets"):
                save_tweet_metrics(aid, result["regular_tweets"], source="regular")
            if result.get("highlight_tweets"):
                save_tweet_metrics(aid, result["highlight_tweets"], source="highlights")
            update_monitored_account(
                aid,
                last_scraped_at=datetime.now().isoformat(timespec="seconds"),
            )

        results.append({
            "account_id": aid,
            "username": acct.get("username", ""),
            "success": result.get("success", False),
            "error": result.get("error"),
            "stats": result.get("stats", {}),
        })

    succeeded = sum(1 for r in results if r["success"])
    return {
        "success": True,
        "results": results,
        "summary": f"成功 {succeeded}/{len(req.account_ids)}",
    }
