import os
from urllib.parse import quote, urlparse

import requests

# 你拿到的原始格式（支持两种）：
# 1) host:port:user:pass
# 2) http://user:pass@host:port
PROXY_RAW = os.getenv(
    "PROXY_RAW",
    "asdata.lumidaili.com:10000:userID-xxxx-orderid-xxxx-region-any:proxyPass",
)


def build_proxy_url(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        raise ValueError("代理字符串为空")

    # 直接是标准 URL
    if "://" in value:
        parsed = urlparse(value)
        if not parsed.hostname or not parsed.port or parsed.username is None or parsed.password is None:
            raise ValueError("标准 URL 代理格式不完整，应为 http://user:pass@host:port")
        return value

    # host:port:user:pass
    parts = value.split(":")
    if len(parts) != 4:
        raise ValueError("非 URL 代理格式必须为 host:port:user:pass")

    host, port, user, password = parts
    if not host or not port or not user or not password:
        raise ValueError("代理字段不能为空")

    safe_user = quote(user, safe="")
    safe_password = quote(password, safe="")
    return f"http://{safe_user}:{safe_password}@{host}:{port}"


def mask_proxy_url(proxy_url: str) -> str:
    parsed = urlparse(proxy_url)
    username = parsed.username or ""
    hostname = parsed.hostname or ""
    port = parsed.port or ""
    return f"{parsed.scheme}://{username}:******@{hostname}:{port}"


def test_endpoint(name: str, url: str, proxies: dict[str, str] | None, timeout: int = 20) -> None:
    try:
        response = requests.get(url=url, proxies=proxies, timeout=timeout)
        print(f"[{name}] status={response.status_code}")
        text_preview = response.text[:200].replace("\n", " ")
        print(f"[{name}] body_preview={text_preview}")
        response.raise_for_status()
    except requests.exceptions.ProxyError as e:
        print(f"[{name}] proxy_error={e}")
    except requests.exceptions.ConnectTimeout as e:
        print(f"[{name}] connect_timeout={e}")
    except requests.exceptions.ReadTimeout as e:
        print(f"[{name}] read_timeout={e}")
    except requests.exceptions.HTTPError as e:
        print(f"[{name}] http_error={e}")
    except Exception as e:
        print(f"[{name}] error={e}")


def main() -> None:
    proxy_url = build_proxy_url(PROXY_RAW)
    proxies = {
        "http": proxy_url,
        "https": proxy_url,
    }

    print("=" * 60)
    print("Proxy raw:", PROXY_RAW)
    print("Proxy URL:", mask_proxy_url(proxy_url))
    print("=" * 60)

    print("\n[1] direct -> ipinfo")
    test_endpoint("direct-ipinfo", "https://ipinfo.io/", proxies=None, timeout=12)

    print("\n[2] proxy -> ipinfo (和你朋友脚本一致)")
    test_endpoint("proxy-ipinfo", "https://ipinfo.io/", proxies=proxies, timeout=20)

    print("\n[3] proxy -> ipify (辅助验证)")
    test_endpoint("proxy-ipify", "https://api.ipify.org?format=json", proxies=proxies, timeout=20)


if __name__ == "__main__":
    main()
