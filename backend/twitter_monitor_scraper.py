"""
Twitter monitoring scraper — fetches profile snapshots and tweet metrics
for monitored accounts using requests.Session + proxy.

Uses a "worker" account (one of our own accounts with auth_token + proxy
binding) to authenticate GraphQL requests, but fetches data about the
*target* public username.
"""

import json
import logging
import time
import traceback
from datetime import datetime, timedelta, timezone
from typing import Any

import requests

from account_store import list_account_records
from proxy_store import get_proxy_record, list_account_bindings
from twitter_common import (
    DEFAULT_USER_AGENT,
    TWITTER_BEARER_TOKEN,
    USER_BY_SCREEN_NAME_QUERY_IDS,
    USER_BY_SCREEN_NAME_SUFFIX,
    build_api_cookies,
    build_api_headers,
    build_proxy_url,
)

logger = logging.getLogger("monitor_scraper")
logger.setLevel(logging.DEBUG)

DEFAULT_TIMEOUT = 25
PAGE_DELAY = 1.5
USER_TWEETS_QUERY_ID = "QWF3SzpHmykQHsQMixG0cg"
USER_HIGHLIGHTS_QUERY_ID = "tHFm_XZc_NNi-CfUThwbNw"

USER_FEATURES = {
    "hidden_profile_likes_enabled": True,
    "hidden_profile_subscriptions_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "subscriptions_verification_info_is_identity_verified_enabled": True,
    "subscriptions_verification_info_verified_since_enabled": True,
    "highlights_tweets_tab_ui_enabled": True,
    "responsive_web_twitter_article_notes_tab_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
}

TWEETS_FEATURES = {
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "tweetypie_unmention_optimization_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "tweet_awards_web_tipping_enabled": False,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": True,
    "rweb_video_timestamps_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "responsive_web_media_download_video_enabled": False,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_enhance_cards_enabled": False,
}

HIGHLIGHTS_FEATURES = {
    "rweb_tipjar_consumption_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "communities_web_enable_tweet_community_results_fetch": True,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "articles_preview_enabled": True,
    "tweetypie_unmention_optimization_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "tweet_awards_web_tipping_enabled": False,
    "creator_subscriptions_quote_tweet_preview_enabled": False,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": True,
    "rweb_video_timestamps_enabled": True,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": True,
    "responsive_web_enhance_cards_enabled": False,
}


# ── Helpers ──────────────────────────────────────────────────────

def _pick_worker() -> dict[str, Any] | None:
    """Find an active monitor-pool account with a valid proxy binding to use as worker."""
    accounts = list_account_records(platform="twitter", pool="monitor")
    bindings = list_account_bindings()
    binding_map = {
        b.get("account_uid"): b for b in bindings
        if b.get("platform", "").lower() == "twitter"
    }

    for acct in accounts:
        if acct.get("status") != "active":
            continue
        if not acct.get("token"):
            continue
        binding = binding_map.get(acct.get("id"))
        if not binding:
            continue
        proxy = get_proxy_record(binding["proxy_id"])
        if not proxy or proxy.get("status") not in ("active", "slow"):
            continue
        return {
            "auth_token": acct["token"],
            "proxy_url": build_proxy_url(proxy),
            "account_name": acct.get("account", "unknown"),
        }
    return None


def _create_session(worker: dict[str, Any]) -> tuple[requests.Session, str]:
    """Create requests session with proxy, fetch ct0 from x.com."""
    session = requests.Session()
    session.proxies.update({"http": worker["proxy_url"], "https": worker["proxy_url"]})
    session.headers.update({"User-Agent": DEFAULT_USER_AGENT})

    logger.debug("Creating session via proxy for worker @%s", worker["account_name"])
    resp = session.get(
        "https://x.com",
        cookies={"auth_token": worker["auth_token"]},
        timeout=DEFAULT_TIMEOUT,
        allow_redirects=True,
    )
    logger.debug("x.com response: status=%d, cookies=%s", resp.status_code, list(resp.cookies.keys()))

    if resp.status_code != 200:
        raise RuntimeError(f"x.com returned HTTP {resp.status_code}")

    ct0 = resp.cookies.get("ct0") or session.cookies.get("ct0")
    if not ct0:
        raise RuntimeError("Failed to obtain ct0 — auth_token may be expired")

    logger.debug("Session created, ct0 obtained (length=%d)", len(ct0))
    return session, ct0


TWITTER_DATE_FMT = "%a %b %d %H:%M:%S %z %Y"


def _parse_twitter_date(s: str) -> datetime | None:
    try:
        return datetime.strptime(s, TWITTER_DATE_FMT)
    except Exception:
        return None


def _extract_tweet_metric(entry: dict, source: str) -> dict[str, Any] | None:
    """Extract a TweetMetric dict from a timeline entry."""
    eid = entry.get("entryId", "?")
    try:
        content = entry.get("content", {})
        entry_type = content.get("entryType", "")
        item_content = content.get("itemContent", {})

        if not item_content:
            logger.debug("[extract] %s: no itemContent, content keys=%s", eid, list(content.keys()))
            return None

        tweet_results = item_content.get("tweet_results", {})
        if not tweet_results:
            logger.debug("[extract] %s: no tweet_results in itemContent, keys=%s", eid, list(item_content.keys()))
            return None

        result = tweet_results.get("result", {})
        typename = result.get("__typename", "")

        if typename == "TweetWithVisibilityResults":
            result = result.get("tweet", result)
            typename = result.get("__typename", "")

        if typename == "TweetTombstone":
            logger.debug("[extract] %s: tombstone tweet (deleted/restricted)", eid)
            return None

        legacy = result.get("legacy", {})
        if not legacy or not legacy.get("id_str"):
            logger.debug(
                "[extract] %s: no legacy.id_str, typename=%s, result keys=%s",
                eid, typename, list(result.keys()),
            )
            return None

        views_raw = result.get("views", {})
        views = int(views_raw.get("count", 0)) if views_raw.get("count") else 0

        media_urls: list[str] = []
        extended_entities = legacy.get("extended_entities", {})
        for m in extended_entities.get("media", []):
            url = m.get("media_url_https") or m.get("media_url")
            if url:
                media_urls.append(url)

        core = result.get("core", {})
        user_legacy = core.get("user_results", {}).get("result", {}).get("legacy", {})
        author_name = user_legacy.get("name", "")
        author_handle = user_legacy.get("screen_name", "")

        metric = {
            "tweet_id": legacy["id_str"],
            "text": legacy.get("full_text", ""),
            "created_at": legacy.get("created_at", ""),
            "views": views,
            "likes": legacy.get("favorite_count", 0),
            "retweets": legacy.get("retweet_count", 0),
            "replies": legacy.get("reply_count", 0),
            "quotes": legacy.get("quote_count", 0),
            "bookmarks": legacy.get("bookmark_count", 0),
            "media_urls": media_urls,
            "author_name": author_name,
            "author_handle": author_handle,
            "source": source,
        }
        logger.debug(
            "[extract] %s: OK id=%s likes=%d rt=%d views=%d text=%.60s",
            eid, metric["tweet_id"], metric["likes"], metric["retweets"],
            metric["views"], metric["text"].replace("\n", " "),
        )
        return metric
    except Exception as e:
        logger.warning("[extract] %s: exception %s: %s", eid, type(e).__name__, e)
        return None


# ── Profile fetch ────────────────────────────────────────────────

def _fetch_profile(
    session: requests.Session,
    ct0: str,
    auth_token: str,
    screen_name: str,
) -> dict[str, Any]:
    """Fetch user profile via UserByScreenName. Returns parsed profile dict."""
    params = {
        "variables": json.dumps(
            {"screen_name": screen_name, "withSafetyModeUserFields": True},
            separators=(",", ":"),
        ),
        "features": json.dumps(USER_FEATURES, separators=(",", ":")),
    }

    for qid in USER_BY_SCREEN_NAME_QUERY_IDS:
        url = f"https://x.com/i/api/graphql/{qid}/{USER_BY_SCREEN_NAME_SUFFIX}"
        resp = session.get(
            url,
            params=params,
            headers=build_api_headers(ct0),
            cookies=build_api_cookies(auth_token, ct0),
            timeout=DEFAULT_TIMEOUT,
        )
        if resp.status_code == 429:
            raise RuntimeError("rate_limited")
        if resp.status_code == 401:
            raise RuntimeError("auth_expired")
        if resp.status_code != 404:
            break

    if resp.status_code != 200:
        raise RuntimeError(f"UserByScreenName HTTP {resp.status_code}")

    data = resp.json()
    user_result = data.get("data", {}).get("user", {}).get("result", {})
    if not user_result or user_result.get("__typename") != "User":
        typename = user_result.get("__typename", "missing")
        raise RuntimeError(f"User not found or unavailable ({typename})")

    legacy = user_result.get("legacy", {})
    return {
        "rest_id": user_result.get("rest_id"),
        "snapshot": {
            "followers_count": legacy.get("followers_count"),
            "following_count": legacy.get("friends_count"),
            "tweet_count": legacy.get("statuses_count"),
            "listed_count": legacy.get("listed_count"),
            "profile_name": legacy.get("name"),
            "profile_image_url": legacy.get("profile_image_url_https"),
            "bio": legacy.get("description"),
            "created_at": legacy.get("created_at"),
        },
    }


# ── Tweet pagination ─────────────────────────────────────────────

def _fetch_tweets_paginated(
    session: requests.Session,
    ct0: str,
    auth_token: str,
    user_id: str,
    endpoint: str,
    query_id: str,
    features: dict,
    *,
    max_count: int | None = None,
    max_days: int | None = None,
    source: str = "regular",
) -> list[dict[str, Any]]:
    """Paginate through a tweet timeline endpoint. Respects count/days limits."""
    collected: list[dict[str, Any]] = []
    cursor: str | None = None
    cutoff_dt = (datetime.now(timezone.utc) - timedelta(days=max_days)) if max_days else None
    page = 0

    while True:
        variables: dict[str, Any] = {
            "userId": user_id,
            "count": 40,
            "includePromotedContent": True,
            "withVoice": True,
        }
        if endpoint == "UserTweets":
            variables["withQuickPromoteEligibilityTweetFields"] = True
            variables["withV2Timeline"] = True
        if cursor:
            variables["cursor"] = cursor

        params = {
            "variables": json.dumps(variables, separators=(",", ":")),
            "features": json.dumps(features, separators=(",", ":")),
        }

        url = f"https://x.com/i/api/graphql/{query_id}/{endpoint}"
        try:
            resp = session.get(
                url,
                params=params,
                headers=build_api_headers(ct0),
                cookies=build_api_cookies(auth_token, ct0),
                timeout=DEFAULT_TIMEOUT,
            )
        except Exception as e:
            logger.warning("Request failed on page %d: %s", page, e)
            break

        if resp.status_code == 429:
            logger.warning("Rate limited on page %d, stopping pagination", page)
            break
        if resp.status_code != 200:
            logger.warning("%s returned HTTP %d on page %d", endpoint, resp.status_code, page)
            break

        try:
            data = resp.json()
        except Exception:
            logger.warning("JSON parse error on page %d", page)
            break

        logger.debug(
            "[%s] page %d raw response keys: %s (size=%d bytes)",
            endpoint, page, list(data.keys()), len(resp.content),
        )

        user_result = data.get("data", {}).get("user", {}).get("result", {})
        timeline_obj = (
            user_result.get("timeline_v2")
            or user_result.get("timeline")
            or {}
        )
        inner = timeline_obj.get("timeline", timeline_obj)
        instructions = inner.get("instructions", [])

        logger.debug(
            "[%s] page %d: user_result keys=%s, timeline key=%s, instructions count=%d",
            endpoint, page,
            list(user_result.keys()) if user_result else "EMPTY",
            "timeline_v2" if user_result.get("timeline_v2") else (
                "timeline" if user_result.get("timeline") else "NONE"
            ),
            len(instructions),
        )

        entries = []
        for instr in instructions:
            itype = instr.get("type", "")
            logger.debug("[%s] page %d instruction type=%s", endpoint, page, itype)
            if itype == "TimelineAddEntries":
                entries = instr.get("entries", [])
                break
            if itype == "TimelinePinEntry":
                continue

        if not entries:
            logger.warning(
                "[%s] page %d: no entries found. instruction types: %s",
                endpoint, page,
                [i.get("type") for i in instructions],
            )
            if instructions:
                first_instr = instructions[0]
                logger.debug(
                    "[%s] page %d: first instruction keys=%s, preview=%s",
                    endpoint, page,
                    list(first_instr.keys()),
                    json.dumps(first_instr, ensure_ascii=False)[:500],
                )
            break

        next_cursor = None
        hit_cutoff = False

        entry_ids_sample = [e.get("entryId", "?") for e in entries[:8]]
        logger.debug(
            "[%s] page %d: %d entries, first IDs: %s",
            endpoint, page, len(entries), entry_ids_sample,
        )

        parsed_count = 0
        skipped_count = 0

        for entry in entries:
            eid = entry.get("entryId", "")
            if eid.startswith("cursor-bottom"):
                next_cursor = entry.get("content", {}).get("value")
                continue
            if not eid.startswith("tweet"):
                continue

            metric = _extract_tweet_metric(entry, source)
            if not metric:
                skipped_count += 1
                logger.debug("[%s] could not extract metric from entry %s", endpoint, eid)
                continue
            parsed_count += 1

            if cutoff_dt and metric["created_at"]:
                tweet_dt = _parse_twitter_date(metric["created_at"])
                if tweet_dt and tweet_dt < cutoff_dt:
                    hit_cutoff = True
                    break

            collected.append(metric)

            if max_count and len(collected) >= max_count:
                hit_cutoff = True
                break

        page += 1
        logger.info(
            "[%s] page %d: entries=%d, parsed=%d, skipped=%d, total_collected=%d, cursor=%s",
            endpoint, page, len(entries), parsed_count, skipped_count,
            len(collected), "yes" if next_cursor else "no",
        )

        if hit_cutoff or not next_cursor:
            break
        if max_count and len(collected) >= max_count:
            break

        cursor = next_cursor
        time.sleep(PAGE_DELAY)

    return collected


# ── Main entry point ─────────────────────────────────────────────

def scrape_account(monitored_account: dict[str, Any]) -> dict[str, Any]:
    """
    Scrape a monitored account's profile + tweets.

    Returns:
        {
            "success": bool,
            "profile": SnapshotData | None,
            "regular_tweets": list[TweetMetric],
            "highlight_tweets": list[TweetMetric],
            "error": str | None,
            "stats": { "regular_count": int, "highlight_count": int, "elapsed_ms": int },
        }
    """
    username = monitored_account.get("username", "")
    scope = monitored_account.get("collect_scope") or {"mode": "custom", "regular": {"type": "count", "count": 200}}
    start = time.time()

    logger.info("Starting scrape for @%s (scope=%s)", username, json.dumps(scope, ensure_ascii=False))

    worker = _pick_worker()
    if not worker:
        return {
            "success": False,
            "profile": None,
            "regular_tweets": [],
            "highlight_tweets": [],
            "error": "没有可用的工作账号（需要至少一个已绑定代理的活跃账号）",
            "stats": {"regular_count": 0, "highlight_count": 0, "elapsed_ms": 0},
        }

    logger.info("Using worker @%s", worker["account_name"])

    try:
        session, ct0 = _create_session(worker)
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        logger.error("Session creation failed: %s", e)
        return {
            "success": False,
            "profile": None,
            "regular_tweets": [],
            "highlight_tweets": [],
            "error": f"工作账号会话创建失败: {e}",
            "stats": {"regular_count": 0, "highlight_count": 0, "elapsed_ms": elapsed},
        }

    auth_token = worker["auth_token"]

    # 1. Fetch profile
    try:
        profile_data = _fetch_profile(session, ct0, auth_token, username)
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        logger.error("Profile fetch failed for @%s: %s\n%s", username, e, traceback.format_exc())
        return {
            "success": False,
            "profile": None,
            "regular_tweets": [],
            "highlight_tweets": [],
            "error": f"获取用户资料失败: {e}",
            "stats": {"regular_count": 0, "highlight_count": 0, "elapsed_ms": elapsed},
        }

    rest_id = profile_data["rest_id"]
    snapshot = profile_data["snapshot"]
    logger.info("Profile fetched: @%s (id=%s, followers=%s)", username, rest_id, snapshot.get("followers_count"))

    # 2. Determine scope parameters
    is_full = scope.get("mode") == "full"

    if is_full:
        regular_max_count = None
        regular_max_days = None
        do_highlights = True
        hl_max_count = None
        hl_max_days = None
    else:
        regular_cfg = scope.get("regular", {"type": "count", "count": 200})
        if regular_cfg.get("type") == "count":
            regular_max_count = regular_cfg.get("count", 200)
            regular_max_days = None
        else:
            regular_max_count = None
            regular_max_days = regular_cfg.get("days", 30)

        hl_cfg = scope.get("highlights")
        do_highlights = hl_cfg is not None
        if do_highlights:
            if hl_cfg.get("type") == "count":
                hl_max_count = hl_cfg.get("count", 100)
                hl_max_days = None
            else:
                hl_max_count = None
                hl_max_days = hl_cfg.get("days", 30)
        else:
            hl_max_count = None
            hl_max_days = None

    # 3. Fetch regular tweets
    regular_tweets: list[dict] = []
    try:
        regular_tweets = _fetch_tweets_paginated(
            session, ct0, auth_token, rest_id,
            endpoint="UserTweets",
            query_id=USER_TWEETS_QUERY_ID,
            features=TWEETS_FEATURES,
            max_count=regular_max_count,
            max_days=regular_max_days,
            source="regular",
        )
    except Exception as e:
        logger.error("Regular tweet fetch failed: %s\n%s", e, traceback.format_exc())

    # 4. Fetch highlights (if configured)
    highlight_tweets: list[dict] = []
    if do_highlights:
        try:
            highlight_tweets = _fetch_tweets_paginated(
                session, ct0, auth_token, rest_id,
                endpoint="UserHighlightsTweets",
                query_id=USER_HIGHLIGHTS_QUERY_ID,
                features=HIGHLIGHTS_FEATURES,
                max_count=hl_max_count,
                max_days=hl_max_days,
                source="highlights",
            )
        except Exception as e:
            logger.error("Highlights fetch failed: %s\n%s", e, traceback.format_exc())

    elapsed = int((time.time() - start) * 1000)
    logger.info(
        "Scrape complete for @%s: %d regular, %d highlights (%dms)",
        username, len(regular_tweets), len(highlight_tweets), elapsed,
    )

    return {
        "success": True,
        "profile": snapshot,
        "regular_tweets": regular_tweets,
        "highlight_tweets": highlight_tweets,
        "error": None,
        "stats": {
            "regular_count": len(regular_tweets),
            "highlight_count": len(highlight_tweets),
            "elapsed_ms": elapsed,
        },
    }
