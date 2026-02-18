"""
Twitter Account Status Verifier v2.0

Author: Manus AI
Date: 2026-02-15
Version: 2.0 (Major Update)

This script implements a highly efficient, pure-API method for verifying Twitter
account statuses using an `auth_token` cookie. It is significantly faster and
more reliable than browser-based automation.
"""

import httpx
import json
import time
from typing import List, Dict

# ====================================================================
# Core Verifier Class
# ====================================================================

class TwitterAccountVerifier:
    """
    A verifier that uses a valid auth_token session to check Twitter account statuses
    via internal GraphQL APIs, bypassing the need for browser automation.
    """
    BEARER_TOKEN = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
    USER_BY_SCREEN_NAME_URL = "https://x.com/i/api/graphql/AWbeRIdkLtqTRN7yL_H8yw/UserByScreenName"
    FEATURES = {
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
        "profile_label_improvements_pcf_label_in_post_enabled": True
    }

    def __init__(self, auth_token: str, ct0: str, proxy: str = None):
        """
        Initializes the verifier with a valid session.

        Args:
            auth_token: The auth_token cookie value.
            ct0: The ct0 (CSRF) token.
            proxy: Optional proxy string (e.g., "http://user:pass@host:port").
        """
        self.client = httpx.Client(
            headers={
                "authorization": f"Bearer {self.BEARER_TOKEN}",
                "x-csrf-token": ct0,
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
            cookies={
                "auth_token": auth_token,
                "ct0": ct0,
            },
            proxies={"all://": proxy} if proxy else None,
            timeout=10
        )

    def check_status(self, username: str) -> dict:
        """
        Checks the status of a single Twitter account.
        """
        params = {
            "variables": json.dumps({"screen_name": username, "withSafetyModeUserFields": True}),
            "features": json.dumps(self.FEATURES),
        }
        try:
            response = self.client.get(self.USER_BY_SCREEN_NAME_URL, params=params)
            
            if response.status_code == 200:
                data = response.json()
                result = data.get("data", {}).get("user", {}).get("result")
                
                if not result:
                    return {"username": username, "status": "not_found"}
                
                typename = result.get("__typename")
                if typename == "User":
                    legacy = result.get("legacy", {})
                    status = "protected" if legacy.get("protected") else "active"
                    return {
                        "username": username, 
                        "status": status,
                        "user_id": result.get("rest_id"),
                        "followers": legacy.get("followers_count"),
                        "following": legacy.get("friends_count"),
                        "tweets": legacy.get("statuses_count"),
                        "created_at": legacy.get("created_at"),
                    }
                elif typename == "UserUnavailable":
                    reason = result.get("reason", "").lower()
                    status = "suspended" if "suspended" in reason else f"unavailable_{reason}"
                    return {"username": username, "status": status}
            
            elif response.status_code == 401:
                return {"username": username, "status": "auth_token_expired"}
            elif response.status_code == 429:
                return {"username": username, "status": "rate_limited"}
            else:
                return {"username": username, "status": f"http_error_{response.status_code}"}
        
        except Exception as e:
            return {"username": username, "status": "exception", "message": str(e)}
        
        return {"username": username, "status": "unknown"}

# ====================================================================
# Helper Functions
# ====================================================================

def get_ct0(auth_token: str, proxy: str = None) -> str:
    """
    Automatically obtains the ct0 token from Twitter using a valid auth_token.
    """
    try:
        with httpx.Client(
            cookies={"auth_token": auth_token},
            proxies={"all://": proxy} if proxy else None,
            follow_redirects=True,
            timeout=15
        ) as client:
            response = client.get("https://x.com")
            response.raise_for_status()
            ct0 = response.cookies.get("ct0")
            if not ct0:
                raise ValueError("ct0 token not found in response cookies.")
            return ct0
    except (httpx.RequestError, ValueError) as e:
        print(f"Error getting ct0: {e}")
        return None

def batch_verify(usernames: List[str], auth_token_pool: List[str], proxy_pool: List[str] = None):
    """
    Performs large-scale batch verification using a pool of auth_tokens.
    """
    print(f"Verifying {len(usernames)} usernames with {len(auth_token_pool)} auth_tokens.")
    verifiers = []
    for i, token in enumerate(auth_token_pool):
        proxy = proxy_pool[i % len(proxy_pool)] if proxy_pool else None
        print(f"Initializing verifier for token {i+1}...", end=" ")
        ct0 = get_ct0(token, proxy)
        if ct0:
            verifiers.append(TwitterAccountVerifier(token, ct0, proxy))
            print(f"Success (ct0: {ct0[:10]}...)")
        else:
            print(f"Failed. Invalid auth_token or network issue.")

    if not verifiers:
        raise RuntimeError("No valid auth_tokens to perform verification.")

    all_results = {}
    for i, username in enumerate(usernames):
        # Round-robin through available verifiers
        verifier = verifiers[i % len(verifiers)]
        result = verifier.check_status(username)
        all_results[username] = result
        print(f"  [{i+1}/{len(usernames)}] @{username:<25} -> {result["status"]}")
        time.sleep(0.2) # Small delay to be polite
    
    return all_results

# ====================================================================
# Main Execution
# ====================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("Twitter Account Verifier v2.0")
    print("=" * 60)

    # --- CONFIGURATION ---
    # In a real application, these would come from a database or secure storage.
    # Your provided auth_token is used here.
    AUTH_TOKEN_POOL = [
        "f5ee5a62f08ddc1080c06198ce1b5bded1810a20",
        # Add more auth_tokens here to increase throughput
    ]

    # Optional: Use proxies for large-scale operations
    # PROXY_POOL = [
    #     "http://user1:pass1@proxy1:port",
    #     "http://user2:pass2@proxy2:port",
    # ]
    PROXY_POOL = None

    USERNAMES_TO_CHECK = [
        "elonmusk",
        "jack",
        "JessicaFer20452",
        "nonexistent_xyz_abc_123",
        "a",
        "github",
        "nasa",
        # A known suspended account for testing
        "maboroshi_cg", 
    ]

    # --- EXECUTION ---
    try:
        final_results = batch_verify(USERNAMES_TO_CHECK, AUTH_TOKEN_POOL, PROXY_POOL)

        print("\n" + "=" * 60)
        print("Verification Complete. Results:")
        print("=" * 60)
        print(json.dumps(final_results, indent=2))

        # Save results to a file
        with open("verification_results_v2.json", "w") as f:
            json.dump(final_results, f, indent=2)
        print("\nResults saved to verification_results_v2.json")

    except Exception as e:
        print(f"\nAn error occurred: {e}")
