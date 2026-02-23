"""
Shared Twitter/X constants and helpers.

Centralizes values previously duplicated across twitter_publisher.py,
twitter_monitor_scraper.py, twitter_account_verifier.py and binding_verifier.py.
"""

from typing import Any
from urllib.parse import quote

TWITTER_BEARER_TOKEN = (
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D"
    "1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
)

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

DOMAIN = "x.com"

USER_BY_SCREEN_NAME_QUERY_IDS = ["AWbeRIdkLtqTRN7yL_H8yw"]
USER_BY_SCREEN_NAME_SUFFIX = "UserByScreenName"


def build_proxy_url(proxy: dict[str, Any]) -> str:
    """Build proxy URL from a proxy record dict, URL-encoding credentials."""
    protocol = proxy.get("protocol", "http")
    host = proxy.get("ip", "")
    port = proxy.get("port", "")
    username = str(proxy.get("username") or "").strip()
    password = str(proxy.get("password") or "").strip()
    if username and password:
        auth = f"{quote(username, safe='')}:{quote(password, safe='')}@"
    else:
        auth = ""
    return f"{protocol}://{auth}{host}:{port}"


def build_api_headers(ct0: str) -> dict[str, str]:
    """Base headers for Twitter API calls (without transaction ID)."""
    return {
        "authorization": f"Bearer {TWITTER_BEARER_TOKEN}",
        "x-csrf-token": ct0,
        "x-twitter-active-user": "yes",
        "x-twitter-client-language": "en",
    }


def build_api_cookies(auth_token: str, ct0: str) -> dict[str, str]:
    """Base cookies for Twitter API calls."""
    return {"auth_token": auth_token, "ct0": ct0}
