import json
import uuid
from typing import Any

from store_utils import (
    RUNTIME_DIR,
    now_iso as _now_iso,
    write_json_atomic,
)

MONITORING_STORE_PATH = RUNTIME_DIR / "monitoring.json"


def _empty_store() -> dict[str, Any]:
    return {
        "accounts": [],
        "snapshots": {},
        "tweet_metrics": {},
        "tweet_metrics_regular": {},
        "tweet_metrics_highlights": {},
    }


def _read_store() -> dict[str, Any]:
    if not MONITORING_STORE_PATH.exists():
        return _empty_store()
    try:
        with open(MONITORING_STORE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            if "monitored_accounts" in data and "accounts" not in data:
                data["accounts"] = []
                del data["monitored_accounts"]
            data.setdefault("accounts", [])
            data.setdefault("snapshots", {})
            data.setdefault("tweet_metrics", {})
            data.setdefault("tweet_metrics_regular", {})
            data.setdefault("tweet_metrics_highlights", {})
            return data
    except Exception:
        pass
    return _empty_store()


def _write_store(data: dict[str, Any]) -> None:
    write_json_atomic(MONITORING_STORE_PATH, data)


def list_monitored_accounts() -> list[dict[str, Any]]:
    return list(_read_store().get("accounts", []))


def get_monitored_account(account_id: str) -> dict[str, Any] | None:
    for acct in _read_store().get("accounts", []):
        if acct.get("id") == account_id:
            return acct
    return None


def get_monitored_account_by_username(username: str) -> dict[str, Any] | None:
    normalized = username.strip().lstrip("@").lower()
    for acct in _read_store().get("accounts", []):
        if acct.get("username", "").lower() == normalized:
            return acct
    return None


def add_monitored_account(
    username: str,
    note: str | None = None,
    refresh_interval_hours: int = 24,
    collect_scope: dict | None = None,
) -> dict[str, Any] | None:
    """Add a Twitter username to the monitoring list. Returns the record or None if duplicate."""
    normalized = username.strip().lstrip("@")
    if not normalized:
        return None

    store = _read_store()
    accounts = store.get("accounts", [])

    for acct in accounts:
        if acct.get("username", "").lower() == normalized.lower():
            return None  # duplicate

    record = {
        "id": uuid.uuid4().hex,
        "username": normalized,
        "note": note or None,
        "refresh_interval_hours": max(1, refresh_interval_hours),
        "collect_scope": collect_scope or {"mode": "recent_count", "count": 200},
        "added_at": _now_iso(),
        "last_scraped_at": None,
    }
    accounts.append(record)
    store["accounts"] = accounts
    _write_store(store)
    return record


def remove_monitored_account(account_id: str) -> bool:
    store = _read_store()
    accounts = store.get("accounts", [])
    filtered = [a for a in accounts if a.get("id") != account_id]
    if len(filtered) == len(accounts):
        return False
    store["accounts"] = filtered
    store.get("snapshots", {}).pop(account_id, None)
    store.get("tweet_metrics", {}).pop(account_id, None)
    store.get("tweet_metrics_regular", {}).pop(account_id, None)
    store.get("tweet_metrics_highlights", {}).pop(account_id, None)
    _write_store(store)
    return True


def update_monitored_account(account_id: str, **fields: Any) -> dict[str, Any] | None:
    store = _read_store()
    accounts = store.get("accounts", [])
    for i, acct in enumerate(accounts):
        if acct.get("id") == account_id:
            for k, v in fields.items():
                acct[k] = v
            accounts[i] = acct
            store["accounts"] = accounts
            _write_store(store)
            return acct
    return None


def save_account_snapshot(account_id: str, snapshot: dict[str, Any]) -> None:
    store = _read_store()
    snapshots = store.setdefault("snapshots", {})
    account_snaps = snapshots.setdefault(account_id, [])
    snapshot["captured_at"] = _now_iso()
    account_snaps.append(snapshot)
    if len(account_snaps) > 365:
        account_snaps[:] = account_snaps[-365:]
    _write_store(store)


def get_account_snapshots(account_id: str, limit: int = 90) -> list[dict[str, Any]]:
    store = _read_store()
    snaps = store.get("snapshots", {}).get(account_id, [])
    return snaps[-limit:]


def save_tweet_metrics(
    account_id: str,
    tweets: list[dict[str, Any]],
    source: str = "regular",
) -> None:
    """Save tweet metrics. *source* is ``"regular"`` or ``"highlights"``."""
    store = _read_store()
    key = f"tweet_metrics_{source}" if source in ("regular", "highlights") else "tweet_metrics"
    bucket = store.setdefault(key, {})
    bucket[account_id] = tweets[-500:]
    store.setdefault("tweet_metrics", {})[account_id] = (
        store.get("tweet_metrics_regular", {}).get(account_id, [])[:100]
    )
    _write_store(store)


def get_tweet_metrics(account_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Backward-compat: returns regular tweets by default."""
    return get_tweet_metrics_by_source(account_id, "regular", limit)


def get_tweet_metrics_by_source(
    account_id: str,
    source: str = "regular",
    limit: int = 50,
) -> list[dict[str, Any]]:
    store = _read_store()
    key = f"tweet_metrics_{source}" if source in ("regular", "highlights") else "tweet_metrics"
    tweets = store.get(key, {}).get(account_id, [])
    if not tweets and source == "regular":
        tweets = store.get("tweet_metrics", {}).get(account_id, [])
    return tweets[-limit:]


def get_latest_snapshot(account_id: str) -> dict[str, Any] | None:
    snaps = get_account_snapshots(account_id, limit=1)
    return snaps[-1] if snaps else None


# Legacy compat wrappers (used by old imports)
def list_monitored_account_ids() -> list[str]:
    return [a.get("id", "") for a in list_monitored_accounts()]
