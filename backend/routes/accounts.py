"""
Account management routes.
"""

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from store_utils import mask_secret
from account_store import (
    canonical_field_name,
    create_account_record,
    delete_account_record,
    get_account_record,
    list_account_records,
    update_account_record,
)
from proxy_store import remove_account_binding
from twitter_account_verifier import (
    TwitterAccountVerifierSession,
    map_verification_to_account_status,
    parse_auth_token,
)

router = APIRouter(tags=["accounts"])


# ---------- Pydantic models ----------


class AccountCreateRequest(BaseModel):
    platform: str = "twitter"
    account: str
    password: str | None = None
    twofa: str | None = None
    token: str | None = None
    email: str | None = None
    email_password: str | None = None
    status: str = "unverified"
    pool: str | None = None


class AccountBatchCreateRequest(BaseModel):
    platform: str = "twitter"
    raw_text: str = Field(..., min_length=1)
    delimiter: str = "----"
    field_order: list[str] = Field(..., min_length=1)
    status: str = "unverified"
    pool: str | None = None


class AccountVerifyRequest(BaseModel):
    account_ids: list[str] = Field(..., min_length=1)


# ---------- Helpers ----------


def serialize_account_record(record: dict[str, Any]) -> dict[str, Any]:
    raw_status = record.get("status")
    status = str(raw_status or "unverified").strip().lower()
    if status in ("suspended", "disabled"):
        status = "abnormal"

    return {
        "id": record.get("id"),
        "platform": record.get("platform"),
        "account": record.get("account"),
        "password_masked": mask_secret(record.get("password")),
        "twofa_masked": mask_secret(record.get("twofa")),
        "token_masked": mask_secret(record.get("token")),
        "email": record.get("email"),
        "email_password_masked": mask_secret(record.get("email_password")),
        "status": status,
        "verify_status": record.get("verify_status"),
        "verify_message": record.get("verify_message"),
        "verify_checked_at": record.get("verify_checked_at"),
        "verify_http_status": record.get("verify_http_status"),
        "verify_latency_ms": record.get("verify_latency_ms"),
        "pool": record.get("pool"),
        "extra_fields": record.get("extra_fields") or {},
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


def normalize_delimiter(value: str | None) -> str:
    delimiter = str(value or "").strip()
    if delimiter == r"\t":
        return "\t"
    return delimiter


def parse_account_line(
    *, line: str, delimiter: str, field_order: list[str]
) -> tuple[dict[str, str], dict[str, str]]:
    if not delimiter:
        raise ValueError("分隔符不能为空")
    parts = [segment.strip() for segment in str(line).split(delimiter)]
    if len(parts) != len(field_order):
        raise ValueError(
            f"字段数量不匹配，期望 {len(field_order)} 列，实际 {len(parts)} 列"
        )

    original_fields: dict[str, str] = {}
    canonical_fields: dict[str, str] = {}
    for index, field_name in enumerate(field_order):
        raw_name = str(field_name or "").strip()
        if not raw_name:
            raise ValueError(f"字段模板第 {index + 1} 个名称为空")
        value = parts[index]
        original_fields[raw_name] = value

        canonical_name = canonical_field_name(raw_name)
        if canonical_name and canonical_name not in canonical_fields and value:
            canonical_fields[canonical_name] = value

    return original_fields, canonical_fields


# ---------- Routes ----------


@router.get("/api/accounts")
def get_accounts(platform: str = "twitter", pool: str | None = None) -> dict[str, Any]:
    records = list_account_records(platform=platform, pool=pool)
    serialized = [serialize_account_record(item) for item in reversed(records)]
    return {"success": True, "accounts": serialized, "count": len(serialized)}


@router.post("/api/accounts")
def create_account(payload: AccountCreateRequest) -> dict[str, Any]:
    try:
        record = create_account_record(
            platform=payload.platform,
            account=payload.account,
            password=payload.password,
            twofa=payload.twofa,
            token=payload.token,
            email=payload.email,
            email_password=payload.email_password,
            status=payload.status,
            pool=payload.pool,
        )
    except ValueError as e:
        return {"success": False, "message": str(e)}
    except Exception as e:
        return {"success": False, "message": f"创建账号失败: {e}"}

    return {
        "success": True,
        "message": "账号已添加",
        "account": serialize_account_record(record),
    }


@router.post("/api/accounts/batch")
def create_account_batch(payload: AccountBatchCreateRequest) -> dict[str, Any]:
    delimiter = normalize_delimiter(payload.delimiter)
    if not delimiter:
        return {
            "success": False,
            "message": "分隔符不能为空",
            "success_count": 0,
            "failure_count": 0,
            "accounts": [],
            "failures": [],
        }

    field_order = [str(item).strip() for item in payload.field_order if str(item).strip()]
    if not field_order:
        return {
            "success": False,
            "message": "字段模板不能为空",
            "success_count": 0,
            "failure_count": 0,
            "accounts": [],
            "failures": [],
        }

    lines = [
        line.strip()
        for line in str(payload.raw_text or "").splitlines()
        if str(line).strip()
    ]
    if not lines:
        return {
            "success": False,
            "message": "未提供可导入账号行",
            "success_count": 0,
            "failure_count": 0,
            "accounts": [],
            "failures": [],
        }

    created: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    for index, line in enumerate(lines, start=1):
        try:
            original_fields, canonical_fields = parse_account_line(
                line=line, delimiter=delimiter, field_order=field_order
            )
            account_value = str(
                canonical_fields.get("account")
                or (line.split(delimiter)[0].strip() if delimiter in line else "")
            ).strip()
            if not account_value:
                raise ValueError("无法识别账号字段，请在字段模板中包含 account/账号")

            record = create_account_record(
                platform=payload.platform,
                account=account_value,
                password=canonical_fields.get("password"),
                twofa=canonical_fields.get("twofa"),
                token=canonical_fields.get("token"),
                email=canonical_fields.get("email"),
                email_password=canonical_fields.get("email_password"),
                status=payload.status,
                pool=payload.pool,
                extra_fields=original_fields,
                raw_line=line,
            )
            created.append(record)
        except Exception as e:
            failures.append({"line_number": index, "line": line, "reason": str(e)})

    success_count = len(created)
    failure_count = len(failures)
    message = "批量导入完成"
    if success_count == 0:
        message = "批量导入失败"
    elif failure_count > 0:
        message = "批量导入完成（部分失败）"

    return {
        "success": success_count > 0,
        "partial_success": success_count > 0 and failure_count > 0,
        "message": message,
        "success_count": success_count,
        "failure_count": failure_count,
        "accounts": [serialize_account_record(item) for item in created],
        "failures": failures,
    }


@router.delete("/api/accounts/{account_id}")
def delete_account(account_id: str) -> dict[str, Any]:
    record = get_account_record(account_id)
    if record is None:
        return {"success": False, "message": "账号不存在"}

    deleted = delete_account_record(account_id)
    if not deleted:
        return {"success": False, "message": "账号删除失败"}

    try:
        remove_account_binding(
            platform=str(record.get("platform") or "twitter"),
            account_uid=str(record.get("account") or ""),
        )
    except Exception:
        pass

    return {"success": True, "message": "账号已删除"}


@router.post("/api/accounts/verify")
def verify_accounts(payload: AccountVerifyRequest) -> dict[str, Any]:
    def _mask_token_for_log(token: str | None) -> str:
        normalized = str(token or "").strip()
        if not normalized:
            return "(empty)"
        if len(normalized) <= 8:
            return f"{normalized[:2]}***{normalized[-1:]}"
        return f"{normalized[:4]}***{normalized[-4:]}"

    requested_ids = [str(item).strip() for item in payload.account_ids if str(item).strip()]
    unique_ids = list(dict.fromkeys(requested_ids))
    if not unique_ids:
        return {
            "success": False,
            "message": "未提供可验证账号",
            "results": [],
            "success_count": 0,
            "failure_count": 0,
            "missing_ids": [],
        }

    all_accounts = list_account_records(platform="twitter")
    account_by_id = {str(item.get("id")): item for item in all_accounts}
    missing_ids = [account_id for account_id in unique_ids if account_id not in account_by_id]
    target_accounts = [account_by_id[account_id] for account_id in unique_ids if account_id in account_by_id]

    if not target_accounts:
        return {
            "success": False,
            "message": "待验证账号不存在",
            "results": [],
            "success_count": 0,
            "failure_count": 0,
            "missing_ids": missing_ids,
        }

    verifiers: dict[str, TwitterAccountVerifierSession] = {}
    results: list[dict[str, Any]] = []
    failure_details: list[dict[str, Any]] = []
    success_count = 0
    failure_count = 0

    print(
        f"[verify_accounts] start total_requested={len(unique_ids)} "
        f"existing={len(target_accounts)} missing={len(missing_ids)}"
    )
    if missing_ids:
        print(f"[verify_accounts] missing_account_ids={missing_ids}")

    try:
        for account in target_accounts:
            account_id = str(account.get("id") or "")
            account_name = str(account.get("account") or "")
            previous_status = str(account.get("status") or "unverified")
            auth_token = parse_auth_token(str(account.get("token") or ""))
            print(
                f"[verify_accounts] checking account_id={account_id} "
                f"account=@{account_name} has_token={bool(auth_token)} "
                f"token_mask={_mask_token_for_log(auth_token)}"
            )

            if not auth_token:
                verify_result = {
                    "status": "token_missing",
                    "message": "账号缺少 auth_token，无法验证",
                    "http_status": None,
                    "latency_ms": None,
                    "debug": {
                        "hint": "请在账号 token 字段中填入 auth_token 或包含 auth_token=... 的 cookie 字符串"
                    },
                }
            else:
                verifier = verifiers.get(auth_token)
                if verifier is None:
                    verifier = TwitterAccountVerifierSession(auth_token=auth_token)
                    verifiers[auth_token] = verifier
                verify_result = verifier.verify_screen_name(account_name)

            verify_status = str(verify_result.get("status") or "unknown")
            mapped_status = map_verification_to_account_status(verify_status, previous_status)
            verify_message = str(verify_result.get("message") or "").strip() or None
            verify_http_status = verify_result.get("http_status")
            verify_latency_ms = verify_result.get("latency_ms")
            verify_debug = verify_result.get("debug")
            verify_checked_at = datetime.now().isoformat(timespec="seconds")

            updated_record = update_account_record(
                account_id,
                status=mapped_status,
                verify_status=verify_status,
                verify_message=verify_message,
                verify_checked_at=verify_checked_at,
                verify_http_status=verify_http_status,
                verify_latency_ms=verify_latency_ms,
            )

            is_definitive_status = (
                verify_status in {"active", "protected", "suspended", "locked", "not_found"}
                or verify_status.startswith("unavailable_")
            )
            if is_definitive_status:
                success_count += 1
            else:
                failure_count += 1
                failure_detail = {
                    "account_id": account_id,
                    "account": account_name,
                    "verify_status": verify_status,
                    "verify_message": verify_message,
                    "verify_http_status": verify_http_status,
                    "verify_latency_ms": verify_latency_ms,
                    "debug": verify_debug,
                }
                failure_details.append(failure_detail)
                print(
                    "[verify_accounts][failed] "
                    f"account_id={account_id} account=@{account_name} "
                    f"verify_status={verify_status} message={verify_message} "
                    f"http_status={verify_http_status} latency_ms={verify_latency_ms}"
                )
                if verify_debug:
                    try:
                        print(
                            "[verify_accounts][failed][debug] "
                            + json.dumps(verify_debug, ensure_ascii=False)
                        )
                    except Exception:
                        print(f"[verify_accounts][failed][debug] {verify_debug}")

            if is_definitive_status:
                print(
                    "[verify_accounts][ok] "
                    f"account_id={account_id} account=@{account_name} "
                    f"verify_status={verify_status} mapped_status={mapped_status} "
                    f"http_status={verify_http_status} latency_ms={verify_latency_ms}"
                )

            results.append(
                {
                    "account_id": account_id,
                    "account": account_name,
                    "status_before": previous_status,
                    "status_after": mapped_status,
                    "verify_status": verify_status,
                    "verify_message": verify_message,
                    "verify_http_status": verify_http_status,
                    "verify_latency_ms": verify_latency_ms,
                    "verify_debug": verify_debug,
                    "checked_at": verify_checked_at,
                    "record": serialize_account_record(updated_record or account),
                }
            )
    finally:
        for verifier in verifiers.values():
            try:
                verifier.close()
            except Exception:
                pass

    message = "账号验证完成"
    if success_count == 0:
        message = "账号验证失败"
    elif failure_count > 0:
        message = "账号验证完成（部分失败）"

    print(
        f"[verify_accounts] done success_count={success_count} "
        f"failure_count={failure_count} partial_success={success_count > 0 and failure_count > 0}"
    )

    return {
        "success": success_count > 0,
        "partial_success": success_count > 0 and failure_count > 0,
        "message": message,
        "results": results,
        "failure_details": failure_details,
        "success_count": success_count,
        "failure_count": failure_count,
        "missing_ids": missing_ids,
    }
