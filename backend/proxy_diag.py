"""
快速诊断代理连通性 — 测试不同方式访问
运行: cd backend && python proxy_diag.py
"""
import requests
import time

# 从 proxy_ips.json 中取一个代理
PROXY_URL = "http://userID-2608-orderid-18098-region-us:330d976b7d0c23e4@usdata.lumidaili.com:10000"

# 测试目标
TARGETS = [
    # HTTP 目标（不走 CONNECT 隧道）
    ("http://httpbin.org/ip", "HTTP httpbin"),
    ("http://api.ipify.org?format=json", "HTTP ipify"),
    ("http://ifconfig.me/ip", "HTTP ifconfig"),
    # HTTPS 目标（走 CONNECT 隧道）
    ("https://httpbin.org/ip", "HTTPS httpbin"),
    ("https://api.ipify.org?format=json", "HTTPS ipify"),
]

proxies = {"http": PROXY_URL, "https": PROXY_URL}

print("=" * 60)
print(f"代理: {PROXY_URL.split('@')[1] if '@' in PROXY_URL else PROXY_URL}")
print("=" * 60)

for url, label in TARGETS:
    start = time.time()
    try:
        resp = requests.get(
            url,
            proxies=proxies,
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
        )
        elapsed = int((time.time() - start) * 1000)
        print(f"✅ [{label}] status={resp.status_code} body={resp.text.strip()[:100]} ({elapsed}ms)")
    except Exception as e:
        elapsed = int((time.time() - start) * 1000)
        print(f"❌ [{label}] {type(e).__name__}: {e} ({elapsed}ms)")

print()
print("如果 HTTP 目标成功但 HTTPS 目标失败，说明代理不支持 CONNECT 隧道，需要用 HTTP 目标来验证。")
