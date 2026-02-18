import asyncio
import aiohttp
import json
import uuid
import requests
import time
import ssl
import threading

# ================= 配置区 =================
USER_ID = "9f798c7806ee1ae795a70451352e5d1c"
WS_URL = "wss://ws.checkerproxy.net/connection/websocket"

MY_PROXIES = [
    "http://userID-2608-orderid-201875-region-us:59751a2451fa4c0a@usdata.lumidaili.com:10000",
    "http://userID-2608-orderid-18098-region-us:330d976b7d0c23e4@asdata.lumidaili.com:10000"
]

TASK_UUID = str(uuid.uuid4())
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"

# ================= 核心解析逻辑 (关键修改) =================

async def process_message(ws, message_text):
    if not message_text: return
    try:
        data = json.loads(message_text)
    except:
        return

    # 心跳回复
    if data == {}:
        await ws.send_json({})
        return

    # 解析推送结果
    if "push" in data and "pub" in data["push"]:
        payload = data["push"]["pub"]["data"]
        items = payload if isinstance(payload, list) else [payload]
        
        for item in items:
            if "dsn" not in item: continue
            
            # --- 1. 拆解协议层 (http 或 socks) ---
            # 关键修复：IP 和位置信息藏在 'http' 或 'socks' 字段里
            protocol_data = item.get("http") or item.get("socks") or {}
            
            # 如果协议层还没数据，说明还没测完基础连接，跳过
            if not protocol_data:
                continue

            # --- 2. 提取基础信息 ---
            proxy_dsn = item.get("dsn")
            
            # 从协议层(http/socks)里拿 IP 和 延迟
            real_ip = protocol_data.get("ip", "N/A") 
            latency = protocol_data.get("t", 0)
            
            # 综合评分通常在最外层 'sc'，或者 's' 里的 'sc'
            score = item.get("sc") or item.get("s", {}).get("sc", "N/A")

            # --- 3. 提取详细归属地 (在协议层的 'd' 里) ---
            details = protocol_data.get("d", {})
            proxy_type = details.get("t", "Unknown") 
            country = details.get("c", "Unknown")   
            region = details.get("r", "")           
            city = details.get("ct", "")            
            
            # --- 4. 提取服务解锁状态 ---
            services_wrapper = item.get("s", {})
            # 兼容处理：有时候 s 是 bool，有时候是 dict
            services = services_wrapper.get("l", []) if isinstance(services_wrapper, dict) else []

            # --- 5. 打印报告 ---
            # 只有当拿到了真实IP，才认为是有效报告
            if real_ip != "N/A":
                print("\n" + "🟢"*15 + " 深度检测报告 " + "🟢"*15)
                print(f"🔗 代理: {proxy_dsn.split('@')[-1]}")
                print(f"🌐 落地IP: {real_ip}")
                print(f"🏠 类型: {proxy_type}")
                print(f"📍 位置: {country} - {region} - {city}")
                print(f"🛡️ 评分: {score}  |  ⚡ 延迟: {latency}s")
                print("-" * 50)
                
                if services:
                    print("🔓 平台解锁:")
                    for svc in services:
                        status = "✅" if svc.get("s") else "❌"
                        name = svc.get("c", "未知")
                        s_lat = svc.get("t", 0)
                        print(f"   {status} {name:<10} (延迟: {s_lat}s)")
                else:
                    print("⏳ 平台检测中...")
                print("="*50 + "\n")

# ================= 主逻辑 (保持不变) =================

async def start_websocket():
    headers = {
        "Origin": "https://checkerproxy.net",
        "User-Agent": USER_AGENT,
        "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
        "Cache-Control": "no-cache"
    }

    print(f"⏳ [WS] 连接: {WS_URL}")
    connector = aiohttp.TCPConnector(ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        try:
            async with session.ws_connect(WS_URL, headers=headers) as ws:
                print("📞 [WS] 连接成功")
                asyncio.create_task(trigger_http_check_async())
                
                await ws.send_json({"connect": {"name": "js"}, "id": 1})
                await ws.send_json({
                    "subscribe": {
                        "channel": f"checker_results:{TASK_UUID}",
                        "recoverable": True
                    },
                    "id": 2
                })
                print(f"📡 [WS] 已订阅: {TASK_UUID}")

                async for msg in ws:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        await process_message(ws, msg.data)
                    elif msg.type == aiohttp.WSMsgType.ERROR:
                        print('❌ [WS] 错误:', ws.exception())
                        break
        except Exception as e:
            print(f"💥 [WS] 异常: {e}")

async def trigger_http_check_async():
    await asyncio.sleep(2)
    print(f"🚀 [HTTP] 提交任务...")
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, run_requests_post)

def run_requests_post():
    url = f"https://api.checkerproxy.net/v1/landing/check/{TASK_UUID}"
    payload = {
        "archiveEnabled": True, "checkType": "soft",
        "dsnList": MY_PROXIES,
        "services": ["google", "facebook", "tiktok", "twitter"],
        "timeout": 15
    }
    headers = {
        "User-Id": USER_ID, "Content-Type": "application/json",
        "Origin": "https://checkerproxy.net", "Referer": "https://checkerproxy.net/",
        "User-Agent": USER_AGENT
    }
    try:
        requests.post(url, json=payload, headers=headers)
        print("✅ [HTTP] 提交成功")
    except Exception as e:
        print(f"💥 [HTTP] 错误: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(start_websocket())
    except KeyboardInterrupt:
        print("\n👋 停止")

