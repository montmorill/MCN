import json
import re
import time
from typing import Any

import httpx

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

TWITTER_BEARER_TOKEN = (
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D"
    "1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
)
USER_BY_SCREEN_NAME_QUERY_IDS = [
    "AWbeRIdkLtqTRN7yL_H8yw",
]
USER_BY_SCREEN_NAME_ENDPOINT_SUFFIX = "UserByScreenName"

USER_BY_SCREEN_NAME_FEATURES = {
    "hidden_profile_subscriptions_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "subscriptions_verification_info_is_identity_verified_enabled": True,
    "subscriptions_verification_info_verified_since_enabled": True,
    "highlights_tweets_tab_ui_enabled": True,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_profile_redirect_enabled": True,
    "profile_label_improvements_pcf_label_in_post_enabled": True,
    # 2026-02 Twitter occasionally requires these flags to be explicitly non-null.
    "rweb_tipjar_consumption_enabled": True,
    "subscriptions_feature_can_gift_premium": False,
    "responsive_web_twitter_article_notes_tab_enabled": True,
}


def _clip_text(value: str, limit: int = 320) -> str:
    text = str(value or "")
    if len(text) <= limit:
        return text
    return f"{text[:limit]}...(truncated)"


def _extract_response_debug(response: httpx.Response) -> dict[str, Any]:
    wanted_headers = [
        "x-rate-limit-limit",
        "x-rate-limit-remaining",
        "x-rate-limit-reset",
        "x-transaction-id",
        "x-response-time",
    ]
    headers: dict[str, str] = {}
    for key in wanted_headers:
        value = response.headers.get(key)
        if value is not None:
            headers[key] = value

    return {
        "request_url": str(response.request.url),
        "request_method": response.request.method,
        "status_code": response.status_code,
        "headers": headers,
        "response_preview": _clip_text(response.text),
    }


def _extract_error_messages(payload: dict[str, Any]) -> list[str]:
    errors = payload.get("errors")
    if not isinstance(errors, list):
        return []
    messages: list[str] = []
    for item in errors:
        if isinstance(item, dict):
            message = str(item.get("message") or "").strip()
            if message:
                messages.append(message)
    return messages


def _extract_missing_feature_flags(payload: dict[str, Any]) -> list[str]:
    messages = _extract_error_messages(payload)
    missing: list[str] = []
    for message in messages:
        match = re.search(
            r"The following features cannot be null:\s*(.+)$",
            message,
            flags=re.I,
        )
        if not match:
            continue
        for raw_name in match.group(1).split(","):
            feature_name = raw_name.strip()
            if feature_name:
                missing.append(feature_name)
    return list(dict.fromkeys(missing))


def _build_http_error_message(response: httpx.Response) -> str:
    base = f"HTTP {response.status_code}"
    try:
        payload = response.json()
        if not isinstance(payload, dict):
            return base
        messages = _extract_error_messages(payload)
        if not messages:
            return base
        return f"{base}: {' | '.join(messages[:2])}"
    except Exception:
        return base


def parse_auth_token(raw_value: str | None) -> str | None:
    normalized = str(raw_value or "").strip()
    if not normalized:
        return None

    cookie_match = re.search(r"(?:^|;\s*)auth_token=([^;]+)", normalized, flags=re.I)
    if cookie_match:
        candidate = cookie_match.group(1).strip().strip('"').strip("'")
        return candidate or None

    if normalized.lower().startswith("auth_token:"):
        candidate = normalized.split(":", 1)[1].strip()
        return candidate or None

    return normalized


def normalize_screen_name(raw_value: str | None) -> str:
    screen_name = str(raw_value or "").strip()
    if not screen_name:
        return ""

    url_match = re.search(
        r"(?:https?://)?(?:www\.)?(?:x|twitter)\.com/([A-Za-z0-9_]{1,30})",
        screen_name,
        flags=re.I,
    )
    if url_match:
        return url_match.group(1)

    if screen_name.startswith("@"):
        screen_name = screen_name[1:]

    screen_name = screen_name.split("?", 1)[0].split("/", 1)[0].strip()
    return screen_name


def map_verification_to_account_status(verify_status: str, current_status: str) -> str:
    normalized = str(verify_status or "").strip().lower()
    original = str(current_status or "active").strip().lower() or "active"

    if normalized in {"active", "protected"}:
        return "active"
    if normalized in {"suspended", "locked"} or normalized.startswith("unavailable_"):
        return "suspended"
    if normalized == "not_found":
        return "disabled"

    # For transient errors (rate limit/network/auth failures), keep previous status.
    return original


class TwitterAccountVerifierSession:
    def __init__(
        self,
        *,
        auth_token: str,
        proxy_url: str | None = None,
        timeout_seconds: float = 15.0,
    ) -> None:
        self.auth_token = auth_token
        self.proxy_url = proxy_url
        self.ct0: str | None = None
        self.features: dict[str, Any] = dict(USER_BY_SCREEN_NAME_FEATURES)
        self._client = httpx.Client(
            follow_redirects=True,
            timeout=timeout_seconds,
            proxy=proxy_url if proxy_url else None,
        )

    def close(self) -> None:
        self._client.close()

    def _bootstrap_ct0(self) -> str:
        if self.ct0:
            return self.ct0

        response = self._client.get(
            "https://x.com",
            headers={"user-agent": DEFAULT_USER_AGENT},
            cookies={"auth_token": self.auth_token},
        )
        response.raise_for_status()
        ct0 = response.cookies.get("ct0") or self._client.cookies.get("ct0")
        if not ct0:
            raise RuntimeError("无法从响应中获取 ct0")
        self.ct0 = ct0
        return self.ct0

    def _build_headers(self, ct0: str) -> dict[str, str]:
        return {
            "authorization": f"Bearer {TWITTER_BEARER_TOKEN}",
            "x-csrf-token": ct0,
            "user-agent": DEFAULT_USER_AGENT,
            "x-twitter-active-user": "yes",
            "x-twitter-client-language": "en",
        }

    def _request_user_lookup(
        self,
        screen_name: str,
        ct0: str,
        *,
        features: dict[str, Any] | None = None,
    ) -> tuple[httpx.Response, str]:
        effective_features = features if features is not None else self.features
        params = {
            "variables": json.dumps(
                {"screen_name": screen_name, "withSafetyModeUserFields": True},
                separators=(",", ":"),
            ),
            "features": json.dumps(effective_features, separators=(",", ":")),
        }
        headers = self._build_headers(ct0)

        last_response: httpx.Response | None = None
        last_query_id = ""
        for query_id in USER_BY_SCREEN_NAME_QUERY_IDS:
            url = f"https://x.com/i/api/graphql/{query_id}/{USER_BY_SCREEN_NAME_ENDPOINT_SUFFIX}"
            response = self._client.get(
                url,
                params=params,
                headers=headers,
                cookies={"auth_token": self.auth_token, "ct0": ct0},
            )
            last_response = response
            last_query_id = query_id
            if response.status_code != 404:
                return response, query_id

        if last_response is None:
            raise RuntimeError("请求未发出")
        return last_response, last_query_id

    def verify_screen_name(self, raw_screen_name: str) -> dict[str, Any]:
        screen_name = normalize_screen_name(raw_screen_name)
        if not screen_name:
            return {
                "status": "invalid_username",
                "message": "账号名为空或格式无效",
                "http_status": None,
                "latency_ms": 0,
                "debug": {"raw_screen_name": raw_screen_name},
            }

        start = time.perf_counter()
        try:
            ct0 = self._bootstrap_ct0()
        except Exception as exc:
            return {
                "status": "auth_token_expired",
                "message": f"ct0 初始化失败: {exc}",
                "http_status": None,
                "latency_ms": int((time.perf_counter() - start) * 1000),
                "debug": {
                    "screen_name": screen_name,
                    "phase": "bootstrap_ct0",
                    "exception": repr(exc),
                },
            }

        features_for_request = dict(self.features)
        auto_added_features: list[str] = []
        request_attempts: list[dict[str, Any]] = []

        try:
            response: httpx.Response | None = None
            query_id = ""
            for attempt_index in range(3):
                response, query_id = self._request_user_lookup(
                    screen_name,
                    ct0,
                    features=features_for_request,
                )
                attempt_debug = _extract_response_debug(response)
                attempt_debug["attempt_index"] = attempt_index
                attempt_debug["query_id"] = query_id
                request_attempts.append(attempt_debug)

                # 如果不是 400，直接结束；401/429/200 都在后续统一处理。
                if response.status_code != 400:
                    break

                try:
                    payload_400 = response.json()
                except Exception:
                    break
                if not isinstance(payload_400, dict):
                    break

                missing_features = _extract_missing_feature_flags(payload_400)
                if not missing_features:
                    break

                appended = False
                for feature_name in missing_features:
                    if feature_name not in features_for_request:
                        features_for_request[feature_name] = False
                        auto_added_features.append(feature_name)
                        appended = True
                if not appended:
                    break

            if response is None:
                raise RuntimeError("请求未发出")
            self.features = features_for_request
            latency_ms = int((time.perf_counter() - start) * 1000)
        except Exception as exc:
            return {
                "status": "exception",
                "message": f"请求异常: {exc}",
                "http_status": None,
                "latency_ms": int((time.perf_counter() - start) * 1000),
                "debug": {
                    "screen_name": screen_name,
                    "phase": "request_user_lookup",
                    "exception": repr(exc),
                    "request_attempts": request_attempts,
                    "auto_added_features": auto_added_features,
                },
            }

        response_debug = _extract_response_debug(response)
        response_debug["screen_name"] = screen_name
        response_debug["query_id"] = query_id
        response_debug["request_attempts"] = request_attempts
        response_debug["auto_added_features"] = auto_added_features

        if response.status_code == 401:
            return {
                "status": "auth_token_expired",
                "message": "认证失败或 token 失效",
                "http_status": 401,
                "latency_ms": latency_ms,
                "debug": response_debug,
            }
        if response.status_code == 429:
            return {
                "status": "rate_limited",
                "message": "请求触发速率限制",
                "http_status": 429,
                "latency_ms": latency_ms,
                "debug": response_debug,
            }
        if response.status_code != 200:
            return {
                "status": f"http_error_{response.status_code}",
                "message": _build_http_error_message(response),
                "http_status": response.status_code,
                "latency_ms": latency_ms,
                "debug": response_debug,
            }

        try:
            payload = response.json()
        except Exception as exc:
            return {
                "status": "exception",
                "message": f"响应 JSON 解析失败: {exc}",
                "http_status": 200,
                "latency_ms": latency_ms,
                "debug": response_debug,
            }

        result = (
            payload.get("data", {})
            .get("user", {})
            .get("result")
        )
        if not result:
            return {
                "status": "not_found",
                "message": "账号不存在或不可见",
                "http_status": 200,
                "latency_ms": latency_ms,
                "debug": response_debug,
            }

        typename = str(result.get("__typename") or "").strip()
        if typename == "User":
            legacy = result.get("legacy", {}) or {}
            return {
                "status": "protected" if legacy.get("protected") else "active",
                "message": "账号可用",
                "http_status": 200,
                "latency_ms": latency_ms,
                "user_id": result.get("rest_id"),
                "followers": legacy.get("followers_count"),
                "following": legacy.get("friends_count"),
                "tweets": legacy.get("statuses_count"),
                "created_at": legacy.get("created_at"),
                "debug": response_debug,
            }

        if typename == "UserUnavailable":
            reason = str(result.get("reason") or "").strip()
            reason_lower = reason.lower()
            if "suspended" in reason_lower:
                normalized_status = "suspended"
            elif "locked" in reason_lower:
                normalized_status = "locked"
            else:
                normalized_status = f"unavailable_{reason_lower or 'unknown'}"
            return {
                "status": normalized_status,
                "message": reason or "账号不可用",
                "http_status": 200,
                "latency_ms": latency_ms,
                "debug": response_debug,
            }

        return {
            "status": f"unknown_type_{typename.lower() or 'unknown'}",
            "message": "返回结构不在预期范围",
            "http_status": 200,
            "latency_ms": latency_ms,
            "debug": response_debug,
        }
