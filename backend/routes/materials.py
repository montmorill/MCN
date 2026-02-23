"""
Material management routes.
"""

import csv
import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from main import read_author_meta

router = APIRouter(tags=["materials"])

BASE_DIR = Path(__file__).resolve().parent.parent
MATERIALS_ROOT = BASE_DIR / "materials"

USER_UPLOAD_PLATFORM_KEY = "user-upload"
USER_UPLOAD_PLATFORM_NAME = "用户上传"

PLATFORM_DIRS = {
    "bilibili": "哔哩哔哩",
    "xiaohongshu": "小红书",
    "douyin": "抖音",
    USER_UPLOAD_PLATFORM_KEY: USER_UPLOAD_PLATFORM_NAME,
}
DEFAULT_SECOND_LEVEL_DIRS = ("单个作品", "指定作者")
BILIBILI_UNDOWNLOADED_AUTHOR_DIR = "已采集未下载作者"
BILIBILI_EXTRA_SECOND_LEVEL_DIRS = (BILIBILI_UNDOWNLOADED_AUTHOR_DIR,)
BILIBILI_AUTHOR_TREE_DIRS = {"指定作者", BILIBILI_UNDOWNLOADED_AUTHOR_DIR}
INTERNAL_MATERIAL_FILE_NAMES = {".ds_store", "_author_meta.json"}


# ---------- Pydantic models ----------


class MaterialsDeleteRequest(BaseModel):
    paths: list[str] = Field(..., min_length=1)


class UserUploadFolderCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    parent_path: str | None = None


class MaterialResolvePathRequest(BaseModel):
    relative_path: str = Field(..., min_length=1)


# ---------- Helper functions ----------


def ensure_material_tree() -> None:
    for platform_key, platform_name in PLATFORM_DIRS.items():
        root_dir = MATERIALS_ROOT / platform_name
        root_dir.mkdir(parents=True, exist_ok=True)
        for second in get_second_level_dirs(platform_key):
            (root_dir / second).mkdir(parents=True, exist_ok=True)


def get_second_level_dirs(platform_key: str) -> tuple[str, ...]:
    if platform_key == USER_UPLOAD_PLATFORM_KEY:
        return ()
    if platform_key == "bilibili":
        return (*DEFAULT_SECOND_LEVEL_DIRS, *BILIBILI_EXTRA_SECOND_LEVEL_DIRS)
    return DEFAULT_SECOND_LEVEL_DIRS


def is_bilibili_author_tree(platform_key: str, second_dir_name: str) -> bool:
    return platform_key == "bilibili" and second_dir_name in BILIBILI_AUTHOR_TREE_DIRS


def infer_author_name_from_video_csv(author_dir: Path) -> str | None:
    try:
        csv_candidates = sorted(
            list(author_dir.glob("*/video_data.csv")) + list(author_dir.glob("*.csv")),
            key=lambda item: item.name.lower(),
        )
        for csv_path in csv_candidates:
            with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    author_name = str(row.get("author_name") or "").strip()
                    if author_name:
                        return author_name
                    break
    except Exception:
        return None
    return None


def to_base_relative_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(BASE_DIR))
    except Exception:
        return str(path)


def build_entry_nodes(parent_dir: Path, id_prefix: str, depth: int) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []
    entries = sorted(
        [
            entry
            for entry in parent_dir.iterdir()
            if entry.name
            and entry.name.lower() not in INTERNAL_MATERIAL_FILE_NAMES
            and not entry.name.startswith(".")
        ],
        key=lambda entry: entry.name.lower(),
    )
    for entry in entries:
        node_id = f"{id_prefix}-{entry.name}"
        node: dict[str, Any] = {
            "id": node_id,
            "name": entry.name,
            "children": [],
            "relative_path": to_base_relative_path(entry),
            "is_dir": entry.is_dir(),
        }
        if depth > 0 and entry.is_dir():
            node["children"] = build_entry_nodes(entry, node_id, depth - 1)
        nodes.append(node)
    return nodes


def normalize_material_delete_path(path: str) -> str:
    normalized = str(path or "").strip().replace("\\", "/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    normalized = normalized.lstrip("/")
    return normalized


def resolve_material_delete_target(relative_path: str) -> Path | None:
    normalized = normalize_material_delete_path(relative_path)
    if not normalized:
        return None
    try:
        target = (BASE_DIR / normalized).resolve()
        target.relative_to(MATERIALS_ROOT.resolve())
        return target
    except Exception:
        return None


def validate_material_delete_target(target: Path) -> tuple[bool, str]:
    if not target.exists():
        return False, "目标不存在"

    try:
        relative_to_materials = target.resolve().relative_to(MATERIALS_ROOT.resolve())
    except Exception:
        return False, "目标不在素材目录内"

    parts = list(relative_to_materials.parts)
    depth = len(parts)
    platform_name = parts[0] if len(parts) > 0 else ""
    second_name = parts[1] if len(parts) > 1 else ""

    if target.name.lower() in INTERNAL_MATERIAL_FILE_NAMES:
        return False, "系统内部文件不允许删除"

    if depth == 2 and target.is_dir() and platform_name == USER_UPLOAD_PLATFORM_NAME:
        return True, ""

    if platform_name == USER_UPLOAD_PLATFORM_NAME and depth >= 2:
        return True, ""

    if depth <= 2:
        return False, "禁止删除系统默认目录（一级目录和二级目录）"

    if depth == 3 and target.is_dir():
        return True, ""

    if depth == 4 and target.is_file():
        return True, ""

    if depth == 3 and target.is_file() and platform_name == USER_UPLOAD_PLATFORM_NAME:
        return True, ""

    if (
        depth == 4
        and target.is_dir()
        and platform_name == PLATFORM_DIRS["bilibili"]
        and second_name in BILIBILI_AUTHOR_TREE_DIRS
    ):
        return True, ""

    if (
        depth == 5
        and target.is_file()
        and platform_name == PLATFORM_DIRS["bilibili"]
        and second_name in BILIBILI_AUTHOR_TREE_DIRS
    ):
        return True, ""

    return False, "仅允许删除作者目录、作品目录及作品目录内文件"


def sanitize_folder_name(name: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "_", name).strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        cleaned = "未命名作品"
    return cleaned[:80]


def sanitize_file_name(name: str) -> str:
    basename = Path(str(name or "").strip()).name
    cleaned = re.sub(r'[\\/:*?"<>|]', "_", basename).strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    if not cleaned:
        cleaned = f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    return cleaned[:120]


def make_unique_file_path(base_dir: Path, file_name: str) -> Path:
    candidate = base_dir / file_name
    if not candidate.exists():
        return candidate

    stem = Path(file_name).stem or "upload"
    suffix = Path(file_name).suffix
    index = 2
    while True:
        next_candidate = base_dir / f"{stem}_{index}{suffix}"
        if not next_candidate.exists():
            return next_candidate
        index += 1


# ---------- Constants ----------


PREVIEWABLE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".ico",
    ".mp4", ".webm", ".mov", ".avi", ".mkv",
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a",
    ".pdf", ".txt", ".csv", ".json", ".md", ".log",
    ".m4s",
}


# ---------- Routes ----------


@router.post("/api/materials/delete")
def delete_material_entries(payload: MaterialsDeleteRequest) -> dict[str, Any]:
    ensure_material_tree()
    normalized_paths = [
        normalize_material_delete_path(path) for path in payload.paths if str(path).strip()
    ]
    unique_paths = list(dict.fromkeys(normalized_paths))

    if not unique_paths:
        return {
            "success": False,
            "message": "未提供可删除的路径",
            "deleted_paths": [],
            "failures": [],
            "success_count": 0,
            "failure_count": 0,
        }

    deleted_paths: list[str] = []
    failures: list[dict[str, str]] = []

    unique_paths.sort(key=lambda path: len(Path(path).parts), reverse=True)

    for relative_path in unique_paths:
        target = resolve_material_delete_target(relative_path)
        if target is None:
            failures.append({"path": relative_path, "reason": "非法路径"})
            continue

        allowed, reason = validate_material_delete_target(target)
        if not allowed:
            failures.append({"path": relative_path, "reason": reason})
            continue

        try:
            if target.is_dir():
                shutil.rmtree(target)
            else:
                target.unlink()
            deleted_paths.append(relative_path)
        except Exception as e:
            failures.append({"path": relative_path, "reason": f"删除失败: {e}"})

    success_count = len(deleted_paths)
    failure_count = len(failures)
    return {
        "success": failure_count == 0,
        "message": "删除完成" if failure_count == 0 else "部分路径删除失败",
        "deleted_paths": deleted_paths,
        "failures": failures,
        "success_count": success_count,
        "failure_count": failure_count,
    }


@router.post("/api/materials/user-upload/folders")
def create_user_upload_folder(payload: UserUploadFolderCreateRequest) -> dict[str, Any]:
    ensure_material_tree()

    folder_name = sanitize_folder_name(payload.name)
    if not folder_name:
        return {"success": False, "message": "目录名不能为空"}

    upload_root = MATERIALS_ROOT / USER_UPLOAD_PLATFORM_NAME

    parent_relative = getattr(payload, "parent_path", None) or ""
    if parent_relative:
        parent_target = resolve_material_delete_target(parent_relative)
        if parent_target is None or not parent_target.exists() or not parent_target.is_dir():
            return {"success": False, "message": "父目录不存在"}
        try:
            parent_target.resolve().relative_to(upload_root.resolve())
        except Exception:
            return {"success": False, "message": "仅允许在用户上传目录下创建子目录"}
        target_dir = parent_target / folder_name
    else:
        target_dir = upload_root / folder_name

    if target_dir.exists():
        return {"success": False, "message": "同名目录已存在"}

    try:
        target_dir.mkdir(parents=True, exist_ok=False)
    except Exception as e:
        return {"success": False, "message": f"创建目录失败: {e}"}

    return {
        "success": True,
        "message": "目录创建成功",
        "folder": {
            "name": folder_name,
            "relative_path": to_base_relative_path(target_dir),
        },
    }


@router.post("/api/materials/user-upload/files")
def upload_user_material_file(
    folder_path: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    ensure_material_tree()

    target_dir = resolve_material_delete_target(folder_path)
    if target_dir is None or not target_dir.exists() or not target_dir.is_dir():
        return {"success": False, "message": "上传目录不存在"}

    try:
        relative_to_materials = target_dir.resolve().relative_to(MATERIALS_ROOT.resolve())
    except Exception:
        return {"success": False, "message": "上传目录非法"}

    parts = list(relative_to_materials.parts)
    if len(parts) < 1 or parts[0] != USER_UPLOAD_PLATFORM_NAME:
        return {"success": False, "message": "仅允许上传到用户上传目录下"}

    original_name = str(file.filename or "").strip()
    if not original_name:
        return {"success": False, "message": "文件名不能为空"}

    safe_name = sanitize_file_name(original_name)
    target_file = make_unique_file_path(target_dir, safe_name)

    try:
        with open(target_file, "wb") as out:
            shutil.copyfileobj(file.file, out)
    except Exception as e:
        return {"success": False, "message": f"文件上传失败: {e}"}
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    return {
        "success": True,
        "message": "文件上传成功",
        "file": {
            "name": target_file.name,
            "relative_path": to_base_relative_path(target_file),
            "size": target_file.stat().st_size,
        },
    }


@router.get("/api/materials/preview")
def preview_material_file(path: str = "") -> Any:
    target = resolve_material_delete_target(path)
    if target is None or not target.exists() or not target.is_file():
        return {"success": False, "message": "文件不存在"}

    try:
        target.resolve().relative_to(MATERIALS_ROOT.resolve())
    except Exception:
        return {"success": False, "message": "文件路径非法"}

    ext = target.suffix.lower()
    if ext not in PREVIEWABLE_EXTENSIONS:
        return {"success": False, "message": f"不支持预览此文件类型 ({ext})"}

    return FileResponse(
        path=str(target),
        filename=target.name,
        media_type=None,
    )


@router.get("/api/materials/tree")
def get_material_tree() -> dict[str, Any]:
    ensure_material_tree()
    roots = []

    for platform_key, platform_display_name in PLATFORM_DIRS.items():
        root_dir = MATERIALS_ROOT / platform_display_name
        second_children = []
        if platform_key == USER_UPLOAD_PLATFORM_KEY:
            second_dirs = sorted(
                [
                    item
                    for item in root_dir.iterdir()
                    if item.is_dir() and not item.name.startswith(".")
                ],
                key=lambda item: item.name.lower(),
            )
            for second_dir in second_dirs:
                second_id = f"{platform_key}-{second_dir.name}"
                second_children.append(
                    {
                        "id": second_id,
                        "name": second_dir.name,
                        "children": build_entry_nodes(second_dir, second_id, depth=4),
                        "relative_path": to_base_relative_path(second_dir),
                        "is_dir": True,
                    }
                )
        else:
            for second in get_second_level_dirs(platform_key):
                second_dir = root_dir / second
                third_folders = sorted(
                    [item for item in second_dir.iterdir() if item.is_dir()],
                    key=lambda item: item.name.lower(),
                )
                third_nodes: list[dict[str, Any]] = []
                for folder in third_folders:
                    third_id = f"{platform_key}-{second}-{folder.name}"
                    display_name = folder.name
                    author_uid: str | None = None

                    if is_bilibili_author_tree(platform_key, second):
                        meta = read_author_meta(folder)
                        if isinstance(meta, dict):
                            author_uid = str(meta.get("uid") or "").strip() or None
                            author_name = str(meta.get("author_name") or "").strip()
                            if author_name:
                                display_name = author_name
                        if author_uid is None and folder.name.isdigit():
                            author_uid = folder.name
                        if display_name == folder.name:
                            inferred_author_name = infer_author_name_from_video_csv(folder)
                            if inferred_author_name:
                                display_name = inferred_author_name

                    third_node: dict[str, Any] = {
                        "id": third_id,
                        "name": display_name,
                        "children": build_entry_nodes(folder, third_id, depth=1),
                        "relative_path": to_base_relative_path(folder),
                        "is_dir": True,
                    }
                    if author_uid:
                        third_node["author_uid"] = author_uid
                    third_nodes.append(third_node)

                second_children.append(
                    {
                        "id": f"{platform_key}-{second}",
                        "name": second,
                        "children": third_nodes,
                        "relative_path": to_base_relative_path(second_dir),
                        "is_dir": True,
                    }
                )

        roots.append(
            {
                "id": platform_key,
                "name": platform_display_name,
                "children": second_children,
                "relative_path": to_base_relative_path(root_dir),
                "is_dir": True,
            }
        )

    return {"roots": roots}


@router.post("/api/materials/resolve-path")
def resolve_material_path(payload: MaterialResolvePathRequest) -> dict[str, Any]:
    """Return the absolute path on disk for a material file (for the publisher)."""
    target = resolve_material_delete_target(payload.relative_path)
    if target is None:
        return {"success": False, "message": "非法路径"}
    if not target.exists():
        return {"success": False, "message": "文件不存在"}
    if not target.is_file():
        return {"success": False, "message": "路径不是文件"}
    try:
        target.resolve().relative_to(MATERIALS_ROOT.resolve())
    except Exception:
        return {"success": False, "message": "文件路径非法"}
    return {"success": True, "local_path": str(target)}
