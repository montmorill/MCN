import csv
import json
import logging
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("uvicorn.access").setLevel(logging.INFO)

import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from bilibili_crawler import BilibiliCrawler
from longmao_parser import normalize_platform_type, parse_content_data

import asyncio as _asyncio

import publish_scheduler

# Route modules
from routes.proxies import router as proxies_router
from routes.accounts import router as accounts_router
from routes.bindings import router as bindings_router
from routes.tasks import router as tasks_router
from routes.materials import router as materials_router
from routes.publishing import router as publishing_router
from routes.monitoring import router as monitoring_router

# Re-export constants and helpers used by task_worker.py
from routes.materials import (
    BASE_DIR,
    MATERIALS_ROOT,
    PLATFORM_DIRS,
    BILIBILI_UNDOWNLOADED_AUTHOR_DIR,
    ensure_material_tree,
    sanitize_folder_name,
    to_base_relative_path,
    make_unique_file_path,
)

_BILIBILI_CRAWLER: BilibiliCrawler | None = None
DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

# ── FastAPI application ──

app = FastAPI(title="MCN Backend API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _startup_publish_scheduler():
    _asyncio.create_task(publish_scheduler.run_scheduler_loop())


# ── Include routers ──

app.include_router(proxies_router)
app.include_router(accounts_router)
app.include_router(bindings_router)
app.include_router(tasks_router)
app.include_router(materials_router)
app.include_router(publishing_router)
app.include_router(monitoring_router)


# ── Health check ──

@app.get("/api/health")
def health_check() -> dict[str, str]:
    ensure_material_tree()
    return {"status": "ok"}


# ==========================================================================
# Content collection functions (kept here for task_worker.py compatibility)
# ==========================================================================


def detect_platform(url: str) -> str:
    normalized = url.lower()
    if "bilibili.com" in normalized or "b23.tv" in normalized:
        return "bilibili"
    if "douyin.com" in normalized or "iesdouyin.com" in normalized:
        return "douyin"
    if (
        "xiaohongshu.com" in normalized
        or "xhslink.com" in normalized
        or "xiao-hong-shu.com" in normalized
    ):
        return "xiaohongshu"
    return "bilibili"


def make_unique_dir(base_dir: Path, folder_name: str) -> Path:
    candidate = base_dir / folder_name
    if not candidate.exists():
        return candidate
    index = 2
    while True:
        next_candidate = base_dir / f"{folder_name}_{index}"
        if not next_candidate.exists():
            return next_candidate
        index += 1


def guess_extension(url: str, fallback: str) -> str:
    try:
        path = urlparse(url).path
        suffix = Path(path).suffix.lower()
        if suffix and len(suffix) <= 8:
            return suffix
    except Exception:
        pass
    return fallback


def build_download_headers(url: str) -> dict[str, str]:
    headers: dict[str, str] = {"User-Agent": DEFAULT_UA}
    lower = url.lower()
    if "bilivideo.com" in lower or "bilibili.com" in lower:
        headers["Referer"] = "https://www.bilibili.com/"
    elif "douyin" in lower:
        headers["Referer"] = "https://www.douyin.com/"
    elif "xiaohongshu" in lower or "xhscdn.com" in lower:
        headers["Referer"] = "https://www.xiaohongshu.com/"
    return headers


def download_to_file(url: str, output_path: Path, purpose: str = "unknown") -> dict[str, Any]:
    headers = build_download_headers(url)
    print(f"   下载[{purpose}] -> {output_path.name}")
    try:
        with requests.get(url, timeout=45, stream=True, headers=headers) as response:
            status_code = response.status_code
            response.raise_for_status()
            bytes_written = 0
            with open(output_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        bytes_written += len(chunk)
        print(
            f"   下载成功[{purpose}] status={status_code} bytes={bytes_written} file={output_path.name}"
        )
        return {
            "ok": True,
            "path": str(output_path),
            "status_code": status_code,
            "bytes_written": bytes_written,
        }
    except Exception as e:
        status_code = None
        response_text_preview = None
        if isinstance(e, requests.HTTPError) and e.response is not None:
            status_code = e.response.status_code
            try:
                response_text_preview = e.response.text[:300]
            except Exception:
                response_text_preview = None
        print(
            f"   下载失败[{purpose}] status={status_code} file={output_path.name} error={e}"
        )
        if response_text_preview:
            print(f"      - response_preview: {response_text_preview}")
        return {
            "ok": False,
            "error": str(e),
            "status_code": status_code,
            "response_preview": response_text_preview,
            "path": str(output_path),
        }


def merge_dash_streams_to_mp4(
    video_path: Path, audio_path: Path, output_path: Path
) -> dict[str, Any]:
    ffmpeg_path = shutil.which("ffmpeg")
    if not ffmpeg_path:
        return {"ok": False, "error": "未检测到 ffmpeg，无法合并 m4s 为 mp4"}

    command = [
        ffmpeg_path,
        "-y",
        "-i",
        str(video_path),
        "-i",
        str(audio_path),
        "-c:v",
        "copy",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    print(
        f"   合并 DASH 流: video={video_path.name} + audio={audio_path.name} -> {output_path.name}"
    )
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=600,
            check=False,
        )
    except Exception as e:
        return {"ok": False, "error": f"ffmpeg 执行异常: {e}"}

    if result.returncode != 0:
        stderr_preview = (result.stderr or "")[-800:]
        return {
            "ok": False,
            "error": "ffmpeg 合并失败",
            "returncode": result.returncode,
            "stderr_preview": stderr_preview,
        }

    if not output_path.exists():
        return {"ok": False, "error": "ffmpeg 返回成功但未生成 mp4 文件"}

    print(f"   合并成功: {output_path.name}")
    return {
        "ok": True,
        "path": str(output_path),
        "size_bytes": output_path.stat().st_size,
    }


def get_bilibili_crawler() -> BilibiliCrawler:
    global _BILIBILI_CRAWLER
    if _BILIBILI_CRAWLER is None:
        _BILIBILI_CRAWLER = BilibiliCrawler()
    return _BILIBILI_CRAWLER


def save_single_row_csv(row: dict[str, Any], output_path: Path) -> None:
    headers = list(row.keys())
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        writer.writerow(row)


def collect_bilibili_detail_csv(source_url: str, output_dir: Path) -> dict[str, Any]:
    try:
        crawler = get_bilibili_crawler()
        detail = crawler.get_single_video_detail_by_url(source_url)
        if not detail:
            return {"ok": False, "error": "B站视频详细数据获取失败"}

        csv_name = "bilibili_video_detail.csv"
        save_single_row_csv(detail, output_dir / csv_name)
        return {"ok": True, "csv_file": csv_name}
    except Exception as e:
        return {"ok": False, "error": f"B站详情CSV生成异常: {e}"}


def collect_single_work(url: str, task_title: str | None, task_desc: str | None) -> dict[str, Any]:
    parsed = parse_content_data(url)
    if not parsed.get("ok"):
        return {
            "url": url,
            "success": False,
            "error": parsed.get("error", "解析失败"),
        }

    extracted = parsed["extracted"]
    parsed_platform_type = normalize_platform_type(parsed.get("platform_type"))
    platform_key = parsed_platform_type if parsed_platform_type in PLATFORM_DIRS else detect_platform(url)
    platform_dir_name = PLATFORM_DIRS.get(platform_key, "哔哩哔哩")
    single_work_dir = MATERIALS_ROOT / platform_dir_name / "单个作品"

    title = sanitize_folder_name(extracted.get("title") or "未命名作品")
    work_dir = make_unique_dir(single_work_dir, title)
    work_dir.mkdir(parents=True, exist_ok=True)

    downloaded_files: dict[str, Any] = {
        "cover": None,
        "videos": [],
        "images": [],
        "audio": None,
    }
    downloaded_video_paths: list[Path] = []
    downloaded_audio_path: Path | None = None
    bilibili_media_plan: dict[str, Any] | None = None
    bilibili_detail_csv: str | None = None
    bilibili_detail_warning: str | None = None

    if platform_key == "bilibili":
        crawler = get_bilibili_crawler()
        best_media = crawler.get_best_media_urls_by_url(url)
        if best_media.get("ok") and best_media.get("video_url"):
            best_video_url = str(best_media.get("video_url"))
            best_audio_url = best_media.get("audio_url")
            extracted["videos"] = [best_video_url]
            if isinstance(best_audio_url, str) and best_audio_url.strip():
                extracted["audio"] = best_audio_url.strip()

            bilibili_media_plan = {
                "strategy": "highest-quality",
                "source": best_media.get("source"),
                "quality_id": best_media.get("quality_id"),
                "quality_label": best_media.get("quality_label"),
                "width": best_media.get("width"),
                "height": best_media.get("height"),
                "accept_quality": best_media.get("accept_quality"),
                "accept_description": best_media.get("accept_description"),
                "quality_warning": best_media.get("quality_warning"),
                "is_logged_in": best_media.get("is_logged_in"),
                "login_user": best_media.get("login_user"),
            }
            print(
                "[B站单作品] 使用最高画质下载:"
                f" qn={best_media.get('quality_id')}"
                f" label={best_media.get('quality_label') or '-'}"
                f" resolution={best_media.get('width')}x{best_media.get('height')}"
                f" source={best_media.get('source')}"
            )
            if best_media.get("quality_warning"):
                print(f"[B站单作品] 清晰度提示: {best_media.get('quality_warning')}")
        else:
            print("[B站单作品] 最高画质解析失败，回退到解析器直链")
            if isinstance(getattr(crawler, "last_error", None), dict):
                print(f"   - crawler_error: {crawler.last_error}")

    cover_url = extracted.get("cover")
    if cover_url:
        cover_ext = guess_extension(cover_url, ".jpg")
        cover_result = download_to_file(
            cover_url, work_dir / f"cover{cover_ext}", purpose="cover"
        )
        if cover_result["ok"]:
            downloaded_files["cover"] = Path(cover_result["path"]).name

    for index, video_url in enumerate(extracted.get("videos", []), start=1):
        video_ext = guess_extension(video_url, ".mp4")
        video_result = download_to_file(
            video_url, work_dir / f"video_{index}{video_ext}", purpose=f"video_{index}"
        )
        if video_result["ok"]:
            video_path = Path(video_result["path"])
            downloaded_video_paths.append(video_path)
            downloaded_files["videos"].append(video_path.name)

    for index, image_url in enumerate(extracted.get("images", []), start=1):
        image_ext = guess_extension(image_url, ".jpg")
        image_result = download_to_file(
            image_url, work_dir / f"image_{index}{image_ext}", purpose=f"image_{index}"
        )
        if image_result["ok"]:
            downloaded_files["images"].append(Path(image_result["path"]).name)

    audio_url = extracted.get("audio")
    if audio_url:
        audio_ext = guess_extension(audio_url, ".mp3")
        audio_result = download_to_file(
            audio_url, work_dir / f"audio{audio_ext}", purpose="audio"
        )
        if audio_result["ok"]:
            downloaded_audio_path = Path(audio_result["path"])
            downloaded_files["audio"] = downloaded_audio_path.name

    if (
        platform_key == "bilibili"
        and downloaded_video_paths
        and downloaded_audio_path is not None
    ):
        first_video_path = downloaded_video_paths[0]
        if (
            first_video_path.suffix.lower() == ".m4s"
            and downloaded_audio_path.suffix.lower() == ".m4s"
        ):
            merged_path = work_dir / "video_1.mp4"
            merge_result = merge_dash_streams_to_mp4(
                first_video_path, downloaded_audio_path, merged_path
            )
            if merge_result.get("ok"):
                downloaded_files["videos"][0] = merged_path.name
                downloaded_files["merged_video"] = merged_path.name
            else:
                warning = (
                    f"DASH 合并失败: {merge_result.get('error')}; "
                    f"video={first_video_path.name}, audio={downloaded_audio_path.name}"
                )
                if merge_result.get("stderr_preview"):
                    warning += f"; stderr={merge_result.get('stderr_preview')}"
                print(f"[B站单作品] {warning}")
                bilibili_detail_warning = (
                    (bilibili_detail_warning + " | ") if bilibili_detail_warning else ""
                ) + warning

    if platform_key == "bilibili":
        bilibili_result = collect_bilibili_detail_csv(url, work_dir)
        if bilibili_result.get("ok"):
            bilibili_detail_csv = str(bilibili_result.get("csv_file"))
            downloaded_files["bilibili_detail_csv"] = bilibili_detail_csv
        else:
            bilibili_detail_warning = str(
                bilibili_result.get("error") or "B站视频详细数据CSV生成失败"
            )

    metadata = {
        "task_title": task_title,
        "task_description": task_desc,
        "source_url": url,
        "platform": platform_key,
        "platform_display_name": platform_dir_name,
        "parser_platform_type": parsed.get("platform_type"),
        "parser_platform_type_raw": parsed.get("platform_type_raw"),
        "collected_at": datetime.now().isoformat(timespec="seconds"),
        "content": extracted,
        "raw_info": parsed.get("raw_info"),
        "downloaded_files": downloaded_files,
        "bilibili_detail_csv": bilibili_detail_csv,
        "bilibili_detail_warning": bilibili_detail_warning,
        "bilibili_media_plan": bilibili_media_plan,
    }
    with open(work_dir / "data.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    return {
        "url": url,
        "success": True,
        "platform": platform_key,
        "platform_display_name": platform_dir_name,
        "folder_name": work_dir.name,
        "folder_path": str(work_dir.relative_to(BASE_DIR)),
        "title": extracted.get("title"),
        "bilibili_detail_csv": bilibili_detail_csv,
        "warning": bilibili_detail_warning,
    }
