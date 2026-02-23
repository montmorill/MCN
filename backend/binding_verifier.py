"""
绑定验证模块 (binding_verifier.py)

端到端验证：直接通过代理调用 Twitter GraphQL API。
能调通 = 绑定有效，调不通 = 绑定无效。

不依赖本机网络环境（不对比本机 IP），适用于任何用户的电脑。
"""

import json
import time
import traceback
from typing import Any

import requests

from twitter_account_verifier import (
    USER_BY_SCREEN_NAME_ENDPOINT_SUFFIX,
    USER_BY_SCREEN_NAME_FEATURES,
    normalize_screen_name,
)
from twitter_common import (
    DEFAULT_USER_AGENT,
    TWITTER_BEARER_TOKEN,
    USER_BY_SCREEN_NAME_QUERY_IDS,
    build_proxy_url,
)

LOG_PREFIX = "[binding_verifier]"
DEFAULT_TIMEOUT = 20

# 用于获取代理出口 IP 的服务（仅作辅助信息展示，不参与判定）
# 必须用 HTTP，HTTP 代理转发 HTTP 请求不需要 CONNECT 隧道
IP_CHECK_SERVICES = [
    "http://api.ipify.org?format=json",
    "http://httpbin.org/ip",
    "http://ifconfig.me/ip",
]


# ================================================================
#  工具函数
# ================================================================

def _log(msg: str) -> None:
    print(f"{LOG_PREFIX} {msg}", flush=True)


def _build_requests_proxies(proxy_url: str) -> dict[str, str]:
    return {"http": proxy_url, "https": proxy_url}


# ================================================================
#  辅助：获取代理出口 IP（仅展示用，不参与通过/失败判定）
# ================================================================

def _get_exit_ip_via_proxy(proxy_url: str) -> dict[str, Any]:
    """通过代理访问 HTTP IP 查询服务，获取出口 IP。仅作为辅助信息。"""
    _log(f"获取代理出口IP（辅助信息）...")
    proxies = _build_requests_proxies(proxy_url)

    for i, service_url in enumerate(IP_CHECK_SERVICES):
        _log(f"  尝试 [{i+1}/{len(IP_CHECK_SERVICES)}] {service_url}")
        start = time.time()
        try:
            resp = requests.get(
                service_url,
                proxies=proxies,
                timeout=DEFAULT_TIMEOUT,
                headers={"User-Agent": "Mozilla/5.0"},
            )
            latency_ms = int((time.time() - start) * 1000)
            if resp.status_code == 602:
                _log(f"  代理返回 602: 当前网络IP属于中国，需通过海外节点连接 ({latency_ms}ms)")
                return {"exit_ip": None, "latency_ms": latency_ms}
            if resp.status_code != 200:
                _log(f"  跳过: status={resp.status_code}")
                continue

            text = resp.text.strip()
            if "origin" in text:
                exit_ip = json.loads(text).get("origin", "").split(",")[0].strip()
            elif text.startswith("{") and "ip" in text:
                exit_ip = json.loads(text).get("ip", "").strip()
            else:
                exit_ip = text.split("\n")[0].strip()

            if exit_ip:
                _log(f"  出口IP: {exit_ip} ({latency_ms}ms)")
                return {"exit_ip": exit_ip, "latency_ms": latency_ms}
        except Exception as e:
            elapsed = int((time.time() - start) * 1000)
            _log(f"  异常: {type(e).__name__}: {e} ({elapsed}ms)")
            continue

    _log("  无法获取出口IP（不影响验证结果）")
    return {"exit_ip": None, "latency_ms": None}


# ================================================================
#  核心：通过代理调用 Twitter GraphQL API（用 requests）
# ================================================================

def _twitter_api_via_requests(
    auth_token: str,
    screen_name: str,
    proxy_url: str,
) -> dict[str, Any]:
    """
    端到端验证核心：用 requests + 代理 调用 Twitter GraphQL API。
    
    流程：
      1. 通过代理访问 https://x.com 获取 ct0 (CSRF token)
      2. 通过代理调用 UserByScreenName GraphQL API
      3. 解析返回结果，判断账号状态
    
    能走通 = 代理绑定有效（请求确实通过了代理到达了 Twitter）
    """
    proxies = _build_requests_proxies(proxy_url)
    session = requests.Session()
    session.proxies.update(proxies)
    session.headers.update({"User-Agent": DEFAULT_USER_AGENT})

    # ---------- 步骤 1: 获取 ct0 ----------
    _log("步骤1: 通过代理访问 x.com 获取 ct0...")
    start = time.time()
    try:
        resp_home = session.get(
            "https://x.com",
            cookies={"auth_token": auth_token},
            timeout=DEFAULT_TIMEOUT,
            allow_redirects=True,
        )
        latency_ct0 = int((time.time() - start) * 1000)
        _log(f"  x.com 响应: status={resp_home.status_code} ({latency_ct0}ms)")
    except Exception as e:
        latency_ct0 = int((time.time() - start) * 1000)
        error_str = str(e)
        _log(f"  x.com 请求失败: {type(e).__name__}: {e} ({latency_ct0}ms)")

        # 识别鲁米代理的地区限制错误
        if "602" in error_str and ("Authentication" in error_str or "China" in error_str):
            return {
                "success": False,
                "status": "proxy_region_blocked",
                "message": "代理拒绝连接: 当前网络IP属于中国，鲁米代理要求通过海外节点连接。请开启 VPN 或在海外服务器上运行。",
                "latency_ms": latency_ct0,
            }

        return {
            "success": False,
            "status": "proxy_error",
            "message": f"通过代理访问 x.com 失败: {type(e).__name__}: {e}",
            "latency_ms": latency_ct0,
        }

    if resp_home.status_code != 200:
        return {
            "success": False,
            "status": f"http_error_{resp_home.status_code}",
            "message": f"x.com 返回 HTTP {resp_home.status_code}",
            "latency_ms": latency_ct0,
        }

    # 从 cookies 中提取 ct0
    ct0 = resp_home.cookies.get("ct0") or session.cookies.get("ct0")
    if not ct0:
        _log("  未获取到 ct0，auth_token 可能已失效")
        return {
            "success": False,
            "status": "auth_token_expired",
            "message": "无法获取 ct0，auth_token 可能已失效",
            "latency_ms": latency_ct0,
        }
    _log(f"  ct0 获取成功: {ct0[:16]}...")

    # ---------- 步骤 2: 调用 GraphQL API ----------
    _log(f"步骤2: 通过代理调用 Twitter GraphQL API 查询 @{screen_name}...")
    features = dict(USER_BY_SCREEN_NAME_FEATURES)
    params = {
        "variables": json.dumps(
            {"screen_name": screen_name, "withSafetyModeUserFields": True},
            separators=(",", ":"),
        ),
        "features": json.dumps(features, separators=(",", ":")),
    }
    headers = {
        "authorization": f"Bearer {TWITTER_BEARER_TOKEN}",
        "x-csrf-token": ct0,
        "x-twitter-active-user": "yes",
        "x-twitter-client-language": "en",
    }
    cookies = {"auth_token": auth_token, "ct0": ct0}

    last_status = None
    last_body = None
    for query_id in USER_BY_SCREEN_NAME_QUERY_IDS:
        url = f"https://x.com/i/api/graphql/{query_id}/{USER_BY_SCREEN_NAME_ENDPOINT_SUFFIX}"
        start_api = time.time()
        try:
            resp_api = session.get(
                url,
                params=params,
                headers=headers,
                cookies=cookies,
                timeout=DEFAULT_TIMEOUT,
            )
            latency_api = int((time.time() - start_api) * 1000)
            last_status = resp_api.status_code
            last_body = resp_api.text
            _log(f"  GraphQL 响应: status={resp_api.status_code} ({latency_api}ms)")
            _log(f"  响应预览: {resp_api.text[:300]}")

            if resp_api.status_code != 404:
                break
        except Exception as e:
            latency_api = int((time.time() - start_api) * 1000)
            _log(f"  GraphQL 请求失败: {type(e).__name__}: {e} ({latency_api}ms)")
            return {
                "success": False,
                "status": "proxy_error",
                "message": f"通过代理调用 Twitter API 失败: {type(e).__name__}: {e}",
                "latency_ms": latency_ct0 + latency_api,
            }

    total_latency = int((time.time() - start) * 1000)

    # ---------- 步骤 3: 解析结果 ----------
    _log("步骤3: 解析 Twitter API 返回结果...")

    if last_status == 401:
        return {
            "success": False,
            "status": "auth_token_expired",
            "message": "认证失败，auth_token 已失效",
            "latency_ms": total_latency,
        }
    if last_status == 429:
        return {
            "success": False,
            "status": "rate_limited",
            "message": "触发 Twitter 速率限制，请稍后再试",
            "latency_ms": total_latency,
        }
    if last_status != 200:
        return {
            "success": False,
            "status": f"http_error_{last_status}",
            "message": f"Twitter API 返回 HTTP {last_status}",
            "latency_ms": total_latency,
        }

    try:
        payload = json.loads(last_body)
    except Exception:
        return {
            "success": False,
            "status": "parse_error",
            "message": "Twitter API 响应 JSON 解析失败",
            "latency_ms": total_latency,
        }

    result = payload.get("data", {}).get("user", {}).get("result")
    if not result:
        return {
            "success": True,  # API 调通了，只是账号不存在
            "status": "not_found",
            "message": "账号不存在或不可见",
            "latency_ms": total_latency,
        }

    typename = str(result.get("__typename") or "").strip()

    if typename == "User":
        legacy = result.get("legacy", {}) or {}
        status = "protected" if legacy.get("protected") else "active"
        _log(f"  账号状态: {status}")
        return {
            "success": True,
            "status": status,
            "message": "账号可用",
            "latency_ms": total_latency,
            "user_id": result.get("rest_id"),
            "followers": legacy.get("followers_count"),
        }

    if typename == "UserUnavailable":
        reason = str(result.get("reason") or "").strip().lower()
        if "suspended" in reason:
            status = "suspended"
        elif "locked" in reason:
            status = "locked"
        else:
            status = f"unavailable_{reason or 'unknown'}"
        _log(f"  账号状态: {status}")
        return {
            "success": True,  # API 调通了，账号有问题但代理绑定是有效的
            "status": status,
            "message": result.get("reason") or "账号不可用",
            "latency_ms": total_latency,
        }

    return {
        "success": True,
        "status": f"unknown_{typename.lower() or 'unknown'}",
        "message": "返回结构不在预期范围",
        "latency_ms": total_latency,
    }


# ================================================================
#  对外接口：verify_binding
# ================================================================

def verify_binding(
    account: dict[str, Any],
    proxy: dict[str, Any],
) -> dict[str, Any]:
    """
    端到端绑定验证：通过代理调用 Twitter API。
    
    能调通 Twitter API = 绑定有效（请求确实走了代理到达了 Twitter）
    调不通 = 绑定无效，返回具体错误原因
    """
    account_name = account.get("account", "unknown")
    screen_name = normalize_screen_name(account_name)
    proxy_label = f"{proxy.get('protocol')}://{proxy.get('ip')}:{proxy.get('port')}"

    _log("")
    _log("=" * 60)
    _log(f"开始绑定验证: 账号=@{screen_name}, 代理={proxy_label}")
    _log("=" * 60)

    # --- 检查 auth_token ---
    auth_token = account.get("token")
    if not auth_token:
        _log("验证失败: 账号缺少 auth_token")
        return {
            "success": False,
            "account": account_name,
            "proxy": proxy_label,
            "exit_ip": None,
            "twitter": None,
            "summary": "账号缺少 auth_token，无法验证",
        }

    # --- 构建代理 URL ---
    proxy_url = build_proxy_url(proxy)

    # --- 辅助：获取代理出口 IP（仅展示，不影响判定）---
    ip_info = _get_exit_ip_via_proxy(proxy_url)
    exit_ip = ip_info.get("exit_ip")

    # --- 核心：通过代理调用 Twitter API ---
    _log("=" * 40)
    _log("核心验证: 通过代理调用 Twitter GraphQL API")
    _log("=" * 40)

    try:
        twitter_result = _twitter_api_via_requests(
            auth_token=auth_token,
            screen_name=screen_name,
            proxy_url=proxy_url,
        )
    except Exception as e:
        _log(f"验证异常: {type(e).__name__}: {e}")
        _log(traceback.format_exc())
        return {
            "success": False,
            "account": account_name,
            "proxy": proxy_label,
            "exit_ip": exit_ip,
            "twitter": {"status": "error", "message": str(e)},
            "summary": f"验证异常: {type(e).__name__}: {e}",
        }

    # --- 组装结果 ---
    api_success = twitter_result.get("success", False)
    status = twitter_result.get("status", "unknown")
    message = twitter_result.get("message", "")
    latency = twitter_result.get("latency_ms")

    if api_success:
        if status in ("active", "protected"):
            summary = (
                f"绑定验证通过 | 出口IP: {exit_ip or '未知'} | "
                f"Twitter: @{screen_name} 状态={status} | 延迟: {latency}ms"
            )
        elif status in ("suspended", "locked"):
            summary = (
                f"代理绑定有效（API 调通） | 出口IP: {exit_ip or '未知'} | "
                f"但账号 @{screen_name} 状态={status}"
            )
        else:
            summary = (
                f"代理绑定有效（API 调通） | 出口IP: {exit_ip or '未知'} | "
                f"@{screen_name}: {status} - {message}"
            )
    else:
        summary = f"绑定验证失败 | {status}: {message}"

    _log(f"验证结束: success={api_success} | {summary}")

    return {
        "success": api_success,
        "account": account_name,
        "proxy": proxy_label,
        "exit_ip": exit_ip,
        "twitter": twitter_result,
        "summary": summary,
    }
