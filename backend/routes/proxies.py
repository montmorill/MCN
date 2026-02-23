"""
Proxy management routes.
"""

from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from checkerproxy_health import run_checkerproxy_health_check
from store_utils import mask_secret
from proxy_store import (
    create_proxy_record,
    delete_proxy_record,
    get_proxy_record,
    list_proxy_records,
    parse_proxy_input,
    update_proxy_record,
)

router = APIRouter(tags=["proxies"])


# ---------- Pydantic models ----------


class ProxyCreateRequest(BaseModel):
    ip: str | None = None
    port: int | None = None
    username: str | None = None
    password: str | None = None
    protocol: str = "http"  # http | https | socks5
    region: str | None = None
    type: str = "publish"  # publish | monitor
    raw: str | None = None


class ProxyBatchCreateRequest(BaseModel):
    items: list[str] = Field(..., min_length=1)
    protocol: str = "http"  # http | https | socks5
    region: str | None = None
    type: str = "publish"  # publish | monitor


class ProxyTestRequest(BaseModel):
    timeout: int = 15
    check_type: str = "soft"
    services: list[str] | None = None


# ---------- Helpers ----------


def serialize_proxy_record(record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": record.get("id"),
        "ip": record.get("ip"),
        "port": record.get("port"),
        "protocol": record.get("protocol"),
        "username": record.get("username"),
        "password_masked": mask_secret(record.get("password")),
        "region": record.get("region"),
        "type": record.get("type"),
        "status": record.get("status"),
        "last_checked_at": record.get("last_checked_at"),
        "last_latency_ms": record.get("last_latency_ms"),
        "last_error": record.get("last_error"),
        "last_check_result": record.get("last_check_result"),
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


# ---------- Routes ----------


@router.get("/api/proxies")
def get_proxies(type: str | None = None, status: str | None = None) -> dict[str, Any]:
    try:
        records = list_proxy_records(proxy_type=type, status=status)
    except ValueError as e:
        return {"success": False, "message": str(e), "proxies": [], "count": 0}

    serialized = [serialize_proxy_record(item) for item in reversed(records)]
    return {"success": True, "proxies": serialized, "count": len(serialized)}


@router.post("/api/proxies")
def create_proxy(payload: ProxyCreateRequest) -> dict[str, Any]:
    try:
        if payload.raw and payload.raw.strip():
            parsed = parse_proxy_input(payload.raw.strip())
            record = create_proxy_record(
                ip=str(parsed.get("ip") or ""),
                port=int(parsed.get("port") or 0),
                protocol=(payload.protocol or parsed.get("protocol") or "http"),
                username=payload.username if payload.username is not None else parsed.get("username"),
                password=payload.password if payload.password is not None else parsed.get("password"),
                region=payload.region,
                proxy_type=payload.type,
            )
        else:
            if payload.ip is None or payload.port is None:
                return {"success": False, "message": "ip 和 port 不能为空"}
            record = create_proxy_record(
                ip=payload.ip,
                port=payload.port,
                protocol=payload.protocol,
                username=payload.username,
                password=payload.password,
                region=payload.region,
                proxy_type=payload.type,
            )
    except ValueError as e:
        return {"success": False, "message": str(e)}
    except Exception as e:
        return {"success": False, "message": f"创建代理失败: {e}"}

    return {
        "success": True,
        "message": "代理已添加",
        "proxy": serialize_proxy_record(record),
    }


@router.post("/api/proxies/batch")
def create_proxy_batch(payload: ProxyBatchCreateRequest) -> dict[str, Any]:
    normalized_items = [str(item).strip() for item in payload.items if str(item).strip()]
    if not normalized_items:
        return {
            "success": False,
            "message": "未提供有效代理输入",
            "success_count": 0,
            "failure_count": 0,
            "proxies": [],
            "failures": [],
        }

    created: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for raw in normalized_items:
        try:
            parsed = parse_proxy_input(raw)
            record = create_proxy_record(
                ip=str(parsed.get("ip") or ""),
                port=int(parsed.get("port") or 0),
                protocol=payload.protocol or str(parsed.get("protocol") or "http"),
                username=parsed.get("username"),
                password=parsed.get("password"),
                region=payload.region,
                proxy_type=payload.type,
            )
            created.append(record)
        except Exception as e:
            failures.append({"raw": raw, "reason": str(e)})

    success_count = len(created)
    failure_count = len(failures)
    message = "批量添加完成"
    if success_count == 0:
        message = "批量添加失败"
    elif failure_count > 0:
        message = "批量添加完成（部分失败）"

    return {
        "success": success_count > 0,
        "partial_success": success_count > 0 and failure_count > 0,
        "message": message,
        "success_count": success_count,
        "failure_count": failure_count,
        "proxies": [serialize_proxy_record(item) for item in created],
        "failures": failures,
    }


@router.delete("/api/proxies/{proxy_id}")
def delete_proxy(proxy_id: str) -> dict[str, Any]:
    deleted = delete_proxy_record(proxy_id)
    if not deleted:
        return {"success": False, "message": "代理不存在或删除失败"}
    return {"success": True, "message": "代理已删除"}


@router.post("/api/proxies/{proxy_id}/test")
def test_proxy(proxy_id: str, payload: ProxyTestRequest) -> dict[str, Any]:
    record = get_proxy_record(proxy_id)
    if record is None:
        return {"success": False, "message": "代理不存在"}

    timeout_seconds = max(5, min(int(payload.timeout or 15), 60))
    check_type = str(payload.check_type or "soft").strip() or "soft"
    services = payload.services

    try:
        checker_result = run_checkerproxy_health_check(
            proxy_record=record,
            timeout_seconds=timeout_seconds,
            services=services,
            check_type=check_type,
        )
        status = str(checker_result.get("status") or "dead").strip().lower()
        if status not in {"active", "slow", "dead"}:
            status = "dead"
        latency_ms = checker_result.get("latency_ms")
        message = str(checker_result.get("message") or "代理检测失败")
        success = bool(checker_result.get("success")) and status in {"active", "slow"}

        updated = update_proxy_record(
            proxy_id,
            status=status,
            last_checked_at=datetime.now().isoformat(timespec="seconds"),
            last_latency_ms=latency_ms,
            last_error=None if success else message,
            last_check_result=checker_result,
        )
        return {
            "success": success,
            "message": message,
            "proxy": serialize_proxy_record(updated or record),
            "result": checker_result,
        }
    except Exception as e:
        updated = update_proxy_record(
            proxy_id,
            status="dead",
            last_checked_at=datetime.now().isoformat(timespec="seconds"),
            last_latency_ms=None,
            last_error=str(e),
            last_check_result={
                "success": False,
                "status": "dead",
                "message": str(e),
            },
        )
        return {
            "success": False,
            "message": f"代理健康检测异常: {e}",
            "proxy": serialize_proxy_record(updated or record),
            "result": {
                "success": False,
                "status": "dead",
                "message": str(e),
            },
        }
