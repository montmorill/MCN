import asyncio
import json
import os
import time
import uuid
from typing import Any
from urllib.parse import quote

import aiohttp

WS_URL = "wss://ws.checkerproxy.net/connection/websocket"
CHECK_API_URL_TEMPLATE = "https://api.checkerproxy.net/v1/landing/check/{task_id}"
DEFAULT_USER_ID = "9f798c7806ee1ae795a70451352e5d1c"
DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/144.0.0.0 Safari/537.36"
)
DEFAULT_SERVICES = ("google", "facebook", "tiktok", "twitter")
DEFAULT_CHECK_TYPE = "soft"


def _clip_text(value: str | None, limit: int = 360) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...(+{len(text) - limit} chars)"


def _to_float(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < 0:
        return None
    return parsed


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize_services(services: list[str] | None) -> list[str]:
    if not services:
        return list(DEFAULT_SERVICES)
    normalized: list[str] = []
    for item in services:
        value = str(item or "").strip().lower()
        if not value:
            continue
        if value not in normalized:
            normalized.append(value)
    return normalized or list(DEFAULT_SERVICES)


def build_proxy_dsn(record: dict[str, Any]) -> str:
    protocol = str(record.get("protocol") or "http").strip().lower()
    host = str(record.get("ip") or "").strip()
    port = _to_int(record.get("port"))
    username = str(record.get("username") or "").strip()
    password = str(record.get("password") or "").strip()

    if not host or not port or port <= 0:
        raise ValueError("代理配置不完整: 缺少 ip 或 port")

    if protocol == "socks5":
        scheme = "socks5h"
    elif protocol == "https":
        scheme = "https"
    else:
        scheme = "http"

    auth = ""
    if username:
        auth = f"{quote(username, safe='')}:{quote(password, safe='')}@"
    return f"{scheme}://{auth}{host}:{port}"


def _extract_items_from_ws_message(message_text: str) -> list[dict[str, Any]]:
    if not message_text:
        return []
    try:
        data = json.loads(message_text)
    except json.JSONDecodeError:
        return []

    push = data.get("push")
    if not isinstance(push, dict):
        return []
    pub = push.get("pub")
    if not isinstance(pub, dict):
        return []

    payload = pub.get("data")
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        return [payload]
    return []


def _normalize_dsn_endpoint(dsn: str) -> str:
    value = str(dsn or "").strip().lower()
    if not value:
        return ""
    if "://" in value:
        value = value.split("://", 1)[1]
    if "@" in value:
        value = value.split("@", 1)[1]
    return value


def _parse_checker_item(item: dict[str, Any], target_dsn: str) -> dict[str, Any] | None:
    dsn = str(item.get("dsn") or "").strip()
    if not dsn:
        return None
    if target_dsn:
        target_endpoint = _normalize_dsn_endpoint(target_dsn)
        current_endpoint = _normalize_dsn_endpoint(dsn)
        if target_endpoint and current_endpoint and target_endpoint != current_endpoint:
            return None

    protocol_layer = "http" if isinstance(item.get("http"), dict) else "socks"
    protocol_data = item.get("http") or item.get("socks") or {}
    if not isinstance(protocol_data, dict):
        return None
    if not protocol_data:
        return None

    details = protocol_data.get("d") if isinstance(protocol_data.get("d"), dict) else {}
    services_wrapper = item.get("s")
    services_raw = (
        services_wrapper.get("l")
        if isinstance(services_wrapper, dict) and isinstance(services_wrapper.get("l"), list)
        else []
    )

    parsed_services: list[dict[str, Any]] = []
    for service in services_raw:
        if not isinstance(service, dict):
            continue
        parsed_services.append(
            {
                "name": str(service.get("c") or "unknown"),
                "ok": bool(service.get("s")),
                "latency_seconds": _to_float(service.get("t")),
            }
        )

    latency_seconds = _to_float(protocol_data.get("t"))
    latency_ms = None if latency_seconds is None else int(round(latency_seconds * 1000))

    score = item.get("sc")
    if score is None and isinstance(services_wrapper, dict):
        score = services_wrapper.get("sc")
    score_value = _to_float(score)
    score_output: int | float | None
    if score_value is None:
        score_output = None
    elif abs(score_value - round(score_value)) < 1e-9:
        score_output = int(round(score_value))
    else:
        score_output = round(score_value, 2)

    return {
        "dsn": dsn,
        "protocol_layer": protocol_layer,
        "real_ip": str(protocol_data.get("ip") or "").strip() or None,
        "latency_seconds": latency_seconds,
        "latency_ms": latency_ms,
        "score": score_output,
        "proxy_type": str(details.get("t") or "").strip() or None,
        "country": str(details.get("c") or "").strip() or None,
        "region": str(details.get("r") or "").strip() or None,
        "city": str(details.get("ct") or "").strip() or None,
        "services": parsed_services,
    }


def _merge_result(current: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    merged = dict(current)
    for key in (
        "dsn",
        "protocol_layer",
        "real_ip",
        "latency_seconds",
        "latency_ms",
        "score",
        "proxy_type",
        "country",
        "region",
        "city",
    ):
        value = incoming.get(key)
        if value is not None:
            merged[key] = value
    incoming_services = incoming.get("services")
    if isinstance(incoming_services, list) and incoming_services:
        merged["services"] = incoming_services
    elif "services" not in merged:
        merged["services"] = []
    return merged


def _determine_status(merged: dict[str, Any]) -> str:
    if not merged.get("real_ip"):
        return "dead"
    latency_ms = _to_int(merged.get("latency_ms"))
    if latency_ms is not None and latency_ms >= 3500:
        return "slow"
    score = _to_float(merged.get("score"))
    if score is not None and score < 40:
        return "slow"
    return "active"


async def _submit_check_task(
    session: aiohttp.ClientSession,
    *,
    task_id: str,
    user_id: str,
    dsn: str,
    services: list[str],
    timeout_seconds: int,
    check_type: str,
    submit_delay_seconds: float = 2.0,
) -> tuple[int, str]:
    if submit_delay_seconds > 0:
        await asyncio.sleep(submit_delay_seconds)
    url = CHECK_API_URL_TEMPLATE.format(task_id=task_id)
    payload = {
        "archiveEnabled": True,
        "checkType": check_type,
        "dsnList": [dsn],
        "services": services,
        "timeout": timeout_seconds,
    }
    headers = {
        "User-Id": user_id,
        "Content-Type": "application/json",
        "Origin": "https://checkerproxy.net",
        "Referer": "https://checkerproxy.net/",
        "User-Agent": DEFAULT_USER_AGENT,
    }
    async with session.post(
        url,
        json=payload,
        headers=headers,
        timeout=aiohttp.ClientTimeout(total=25),
    ) as response:
        body = await response.text()
        return response.status, _clip_text(body)


async def _run_checkerproxy_health_check(
    *,
    user_id: str,
    dsn: str,
    services: list[str],
    timeout_seconds: int,
    check_type: str,
) -> dict[str, Any]:
    task_id = str(uuid.uuid4())
    channel = f"checker_results:{task_id}"
    ws_headers = {
        "Origin": "https://checkerproxy.net",
        "User-Agent": DEFAULT_USER_AGENT,
        "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
        "Cache-Control": "no-cache",
    }
    deadline = time.monotonic() + timeout_seconds + 20

    merged: dict[str, Any] = {}
    first_result_at: float | None = None
    submit_http_status: int | None = None
    submit_body_preview = ""

    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        async with session.ws_connect(WS_URL, headers=ws_headers) as ws:
            await ws.send_json({"connect": {"name": "js"}, "id": 1})
            await ws.send_json(
                {
                    "subscribe": {
                        "channel": channel,
                        "recoverable": True,
                    },
                    "id": 2,
                }
            )

            submit_task = asyncio.create_task(
                _submit_check_task(
                    session,
                    task_id=task_id,
                    user_id=user_id,
                    dsn=dsn,
                    services=services,
                    timeout_seconds=timeout_seconds,
                    check_type=check_type,
                    submit_delay_seconds=2.0,
                )
            )

            while time.monotonic() < deadline:
                if submit_task.done() and submit_http_status is None:
                    submit_http_status, submit_body_preview = await submit_task
                    if submit_http_status >= 400:
                        return {
                            "success": False,
                            "status": "dead",
                            "message": (
                                f"checkerproxy 任务提交失败 (HTTP {submit_http_status})"
                            ),
                            "task_id": task_id,
                            "submit_http_status": submit_http_status,
                            "submit_response_preview": submit_body_preview,
                            "services": [],
                        }

                receive_timeout = min(2.5, max(0.5, deadline - time.monotonic()))
                try:
                    msg = await ws.receive(timeout=receive_timeout)
                except asyncio.TimeoutError:
                    if first_result_at is not None and time.monotonic() - first_result_at >= 12:
                        break
                    continue

                if msg.type == aiohttp.WSMsgType.TEXT:
                    message_text = str(msg.data or "")
                    if message_text.strip() == "{}":
                        await ws.send_json({})
                        continue

                    items = _extract_items_from_ws_message(message_text)
                    for item in items:
                        parsed = _parse_checker_item(item, dsn)
                        if not parsed:
                            continue
                        merged = _merge_result(merged, parsed)
                        if first_result_at is None:
                            first_result_at = time.monotonic()

                    if first_result_at is not None:
                        has_services = bool(merged.get("services"))
                        elapsed = time.monotonic() - first_result_at
                        if has_services and elapsed >= 2:
                            break
                        if elapsed >= 12:
                            break
                elif msg.type in (
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSED,
                    aiohttp.WSMsgType.ERROR,
                ):
                    break

            if submit_http_status is None:
                try:
                    submit_http_status, submit_body_preview = await asyncio.wait_for(
                        submit_task, timeout=8
                    )
                except asyncio.TimeoutError:
                    submit_task.cancel()
                except Exception as error:
                    return {
                        "success": False,
                        "status": "dead",
                        "message": f"checkerproxy 任务提交异常: {error}",
                        "task_id": task_id,
                        "services": [],
                    }

    if submit_http_status is not None and submit_http_status >= 400:
        return {
            "success": False,
            "status": "dead",
            "message": f"checkerproxy 任务提交失败 (HTTP {submit_http_status})",
            "task_id": task_id,
            "submit_http_status": submit_http_status,
            "submit_response_preview": submit_body_preview,
            "services": [],
        }

    if not merged:
        return {
            "success": False,
            "status": "dead",
            "message": "在 checkerproxy 超时时间内未收到检测结果",
            "task_id": task_id,
            "submit_http_status": submit_http_status,
            "submit_response_preview": submit_body_preview,
            "services": [],
        }

    status = _determine_status(merged)
    services_result = merged.get("services") or []
    services_ok_count = sum(1 for item in services_result if bool(item.get("ok")))
    services_total_count = len(services_result)
    score_display = merged.get("score")
    latency_ms = merged.get("latency_ms")

    message = (
        "代理深度检测完成"
        f" (评分={score_display if score_display is not None else '-'}"
        f", 解锁={services_ok_count}/{services_total_count}"
        f", 延迟={latency_ms if latency_ms is not None else '-'}ms)"
    )

    return {
        "success": status in {"active", "slow"},
        "status": status,
        "message": message,
        "task_id": task_id,
        "submit_http_status": submit_http_status,
        "submit_response_preview": submit_body_preview,
        "dsn": merged.get("dsn"),
        "protocol_layer": merged.get("protocol_layer"),
        "real_ip": merged.get("real_ip"),
        "latency_seconds": merged.get("latency_seconds"),
        "latency_ms": merged.get("latency_ms"),
        "score": merged.get("score"),
        "proxy_type": merged.get("proxy_type"),
        "country": merged.get("country"),
        "region": merged.get("region"),
        "city": merged.get("city"),
        "services": services_result,
    }


def run_checkerproxy_health_check(
    *,
    proxy_record: dict[str, Any],
    timeout_seconds: int = 15,
    services: list[str] | None = None,
    check_type: str = DEFAULT_CHECK_TYPE,
    user_id: str | None = None,
) -> dict[str, Any]:
    resolved_user_id = (
        str(user_id or "").strip()
        or str(os.getenv("CHECKERPROXY_USER_ID") or "").strip()
        or DEFAULT_USER_ID
    )
    if not resolved_user_id:
        raise ValueError("未配置 checkerproxy User-Id")

    dsn = build_proxy_dsn(proxy_record)
    normalized_timeout = max(5, min(int(timeout_seconds or 15), 60))
    normalized_services = _normalize_services(services)
    normalized_check_type = str(check_type or DEFAULT_CHECK_TYPE).strip() or DEFAULT_CHECK_TYPE

    def _runner() -> Any:
        return _run_checkerproxy_health_check(
            user_id=resolved_user_id,
            dsn=dsn,
            services=normalized_services,
            timeout_seconds=normalized_timeout,
            check_type=normalized_check_type,
        )

    try:
        return asyncio.run(_runner())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(_runner())
        finally:
            loop.close()
