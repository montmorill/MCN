"""
Account-proxy binding management routes.
"""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel, Field

from account_store import get_account_record
from proxy_store import (
    detect_ip_reuse_conflicts,
    get_proxy_record,
    list_account_bindings,
    list_proxy_records,
    remove_account_binding,
    upsert_account_binding,
)

router = APIRouter(tags=["bindings"])

BIND_LOG = "[bindings]"


# ---------- Pydantic models ----------


class BindingUpsertRequest(BaseModel):
    """绑定/更新 账号与代理的一对一关系"""
    account_id: str = Field(..., min_length=1)
    proxy_id: str = Field(..., min_length=1)


class BindingRemoveRequest(BaseModel):
    """解除绑定"""
    account_id: str = Field(..., min_length=1)


class BatchBindRequest(BaseModel):
    """批量自动绑定：将选中的账号自动分配空闲代理"""
    account_ids: list[str] = Field(..., min_length=1)
    proxy_type: str = "publish"


class BatchVerifyRequest(BaseModel):
    """批量验证绑定状态"""
    account_ids: list[str] = Field(..., min_length=1)


# ---------- Routes ----------


@router.get("/api/bindings")
def api_list_bindings():
    """查询所有账号-代理绑定关系，并附带账号名和代理地址方便前端展示"""
    print(f"{BIND_LOG} GET /api/bindings 查询所有绑定关系", flush=True)
    bindings = list_account_bindings()
    print(f"{BIND_LOG}   当前绑定数量: {len(bindings)}", flush=True)
    enriched = []
    for b in bindings:
        proxy = get_proxy_record(b.get("proxy_id", ""))
        proxy_label = None
        if proxy:
            proxy_label = f"{proxy['protocol']}://{proxy['ip']}:{proxy['port']}"
        enriched.append({
            **b,
            "proxy_label": proxy_label,
            "proxy_status": proxy.get("status") if proxy else None,
        })
    print(f"{BIND_LOG}   返回 {len(enriched)} 条绑定记录", flush=True)
    return {"success": True, "bindings": enriched}


@router.post("/api/bindings")
def api_upsert_binding(req: BindingUpsertRequest):
    """绑定账号到代理（一对一，重复调用会更新绑定）"""
    print(f"{BIND_LOG} POST /api/bindings account_id={req.account_id} proxy_id={req.proxy_id}", flush=True)

    account = get_account_record(req.account_id)
    if account is None:
        print(f"{BIND_LOG}   账号不存在: {req.account_id}", flush=True)
        return {"success": False, "message": f"账号不存在: {req.account_id}"}
    print(f"{BIND_LOG}   账号: {account.get('account')} (platform={account.get('platform')})", flush=True)

    proxy = get_proxy_record(req.proxy_id)
    if proxy is None:
        print(f"{BIND_LOG}   代理不存在: {req.proxy_id}", flush=True)
        return {"success": False, "message": f"代理不存在: {req.proxy_id}"}
    proxy_label = f"{proxy['protocol']}://{proxy['ip']}:{proxy['port']}"
    print(f"{BIND_LOG}   代理: {proxy_label} (type={proxy.get('type')}, status={proxy.get('status')})", flush=True)

    if proxy.get("type") != "publish":
        print(f"{BIND_LOG}   代理类型不是 publish: {proxy.get('type')}", flush=True)
        return {
            "success": False,
            "message": f"只能绑定「发布用」代理，当前代理类型为: {proxy.get('type')}",
        }

    try:
        binding = upsert_account_binding(
            platform=account.get("platform", "twitter"),
            account_uid=req.account_id,
            account_name=account.get("account"),
            proxy_id=req.proxy_id,
        )
        print(f"{BIND_LOG}   绑定成功: {account.get('account')} -> {proxy_label}", flush=True)
    except ValueError as e:
        print(f"{BIND_LOG}   绑定失败: {e}", flush=True)
        return {"success": False, "message": str(e)}

    return {
        "success": True,
        "message": f"已将 {account.get('account')} 绑定到 {proxy_label}",
        "binding": binding,
    }


@router.delete("/api/bindings/{account_id}")
def api_remove_binding(account_id: str):
    """解除账号的代理绑定"""
    print(f"{BIND_LOG} DELETE /api/bindings/{account_id}", flush=True)
    account = get_account_record(account_id)
    account_name = account.get("account", account_id) if account else account_id
    platform = account.get("platform", "twitter") if account else "twitter"

    removed = remove_account_binding(platform=platform, account_uid=account_id)
    if not removed:
        print(f"{BIND_LOG}   账号 {account_name} 没有绑定任何代理", flush=True)
        return {"success": False, "message": f"账号 {account_name} 没有绑定任何代理"}

    print(f"{BIND_LOG}   已解除 {account_name} 的代理绑定", flush=True)
    return {"success": True, "message": f"已解除 {account_name} 的代理绑定"}


@router.get("/api/bindings/conflicts")
def api_detect_binding_conflicts():
    """检测同一出口 IP 下是否绑定了多个账号（防关联告警）"""
    print(f"{BIND_LOG} GET /api/bindings/conflicts 检测IP复用冲突", flush=True)
    conflicts = detect_ip_reuse_conflicts()
    print(f"{BIND_LOG}   冲突数量: {len(conflicts)}", flush=True)
    if not conflicts:
        return {
            "success": True,
            "has_conflicts": False,
            "message": "未检测到 IP 复用冲突，所有账号 IP 隔离正常",
            "conflicts": [],
        }
    return {
        "success": True,
        "has_conflicts": True,
        "message": f"检测到 {len(conflicts)} 个 IP 存在多账号复用风险",
        "conflicts": conflicts,
    }


@router.post("/api/bindings/verify")
def api_verify_binding(req: BindingUpsertRequest):
    """验证账号与代理的绑定是否真正生效（手动指定 account_id + proxy_id）"""
    from binding_verifier import verify_binding as do_verify

    print(f"{BIND_LOG} POST /api/bindings/verify account_id={req.account_id} proxy_id={req.proxy_id}", flush=True)

    account = get_account_record(req.account_id)
    if account is None:
        print(f"{BIND_LOG}   账号不存在: {req.account_id}", flush=True)
        return {"success": False, "message": f"账号不存在: {req.account_id}"}

    proxy = get_proxy_record(req.proxy_id)
    if proxy is None:
        print(f"{BIND_LOG}   代理不存在: {req.proxy_id}", flush=True)
        return {"success": False, "message": f"代理不存在: {req.proxy_id}"}

    print(f"{BIND_LOG}   开始验证: {account.get('account')} <-> {proxy.get('ip')}:{proxy.get('port')}", flush=True)
    result = do_verify(account=account, proxy=proxy)
    print(f"{BIND_LOG}   验证结果: success={result['success']} summary={result['summary']}", flush=True)

    return {"success": True, "verification": result}


@router.post("/api/bindings/verify-by-account/{account_id}")
def api_verify_binding_by_account(account_id: str):
    """根据账号 ID 验证其已绑定的代理是否生效"""
    from binding_verifier import verify_binding as do_verify

    print(f"{BIND_LOG} POST /api/bindings/verify-by-account/{account_id}", flush=True)

    account = get_account_record(account_id)
    if account is None:
        print(f"{BIND_LOG}   账号不存在: {account_id}", flush=True)
        return {"success": False, "message": f"账号不存在: {account_id}"}
    print(f"{BIND_LOG}   账号: {account.get('account')}", flush=True)

    bindings = list_account_bindings()
    binding = next(
        (b for b in bindings if b.get("account_uid") == account_id),
        None,
    )
    if binding is None:
        print(f"{BIND_LOG}   账号未绑定代理", flush=True)
        return {
            "success": False,
            "message": f"账号 {account.get('account')} 尚未绑定任何代理",
        }
    print(f"{BIND_LOG}   绑定的 proxy_id={binding.get('proxy_id')}", flush=True)

    proxy = get_proxy_record(binding.get("proxy_id", ""))
    if proxy is None:
        print(f"{BIND_LOG}   绑定的代理已被删除", flush=True)
        return {
            "success": False,
            "message": f"绑定的代理已被删除 (proxy_id={binding.get('proxy_id')})",
        }
    print(f"{BIND_LOG}   代理: {proxy.get('ip')}:{proxy.get('port')} (status={proxy.get('status')})", flush=True)

    print(f"{BIND_LOG}   开始两层验证...", flush=True)
    result = do_verify(account=account, proxy=proxy)
    print(f"{BIND_LOG}   验证结果: success={result['success']}", flush=True)

    return {"success": True, "verification": result}


# ---------- Batch bind + batch verify ----------


@router.post("/api/bindings/batch-auto-bind")
def api_batch_auto_bind(req: BatchBindRequest):
    """
    批量自动绑定：为选中的账号自动分配空闲的发布代理。
    空闲代理 = publish 类型 + active/slow 状态 + 未被任何账号绑定。
    """
    proxy_type = req.proxy_type or "publish"
    print(f"{BIND_LOG} POST /api/bindings/batch-auto-bind 账号数={len(req.account_ids)} proxy_type={proxy_type}", flush=True)

    all_proxies = list_proxy_records()
    publish_proxies = [
        p for p in all_proxies
        if p.get("type") == proxy_type and p.get("status") in ("active", "slow")
    ]
    print(f"{BIND_LOG}   可用{proxy_type}代理总数: {len(publish_proxies)}", flush=True)

    existing_bindings = list_account_bindings()
    bound_proxy_ids = {b.get("proxy_id") for b in existing_bindings}
    print(f"{BIND_LOG}   已被绑定的代理数: {len(bound_proxy_ids)}", flush=True)

    free_proxies = [p for p in publish_proxies if p["id"] not in bound_proxy_ids]
    print(f"{BIND_LOG}   空闲代理数: {len(free_proxies)}", flush=True)

    bound_account_ids = {b.get("account_uid") for b in existing_bindings}
    accounts_to_bind = []
    for aid in req.account_ids:
        if aid in bound_account_ids:
            print(f"{BIND_LOG}   跳过已绑定账号: {aid}", flush=True)
            continue
        acc = get_account_record(aid)
        if acc is None:
            print(f"{BIND_LOG}   跳过不存在的账号: {aid}", flush=True)
            continue
        accounts_to_bind.append(acc)
    print(f"{BIND_LOG}   需要绑定的账号数: {len(accounts_to_bind)}", flush=True)

    if not accounts_to_bind:
        return {
            "success": True,
            "message": "所有选中的账号已经绑定了代理，无需操作",
            "bound_count": 0,
            "skipped_count": len(req.account_ids),
            "results": [],
        }

    if len(free_proxies) < len(accounts_to_bind):
        print(f"{BIND_LOG}   空闲代理不足: 需要{len(accounts_to_bind)}个，只有{len(free_proxies)}个", flush=True)

    results: list[dict[str, Any]] = []
    bound_count = 0
    for i, acc in enumerate(accounts_to_bind):
        if i >= len(free_proxies):
            results.append({
                "account_id": acc["id"],
                "account_name": acc.get("account"),
                "success": False,
                "message": "空闲代理已用完",
            })
            print(f"{BIND_LOG}   [{i+1}/{len(accounts_to_bind)}] {acc.get('account')} -> 无空闲代理", flush=True)
            continue

        proxy = free_proxies[i]
        proxy_label = f"{proxy['protocol']}://{proxy['ip']}:{proxy['port']}"
        try:
            upsert_account_binding(
                platform=acc.get("platform", "twitter"),
                account_uid=acc["id"],
                account_name=acc.get("account"),
                proxy_id=proxy["id"],
            )
            results.append({
                "account_id": acc["id"],
                "account_name": acc.get("account"),
                "proxy_id": proxy["id"],
                "proxy_label": proxy_label,
                "success": True,
                "message": f"已绑定到 {proxy_label}",
            })
            bound_count += 1
            print(f"{BIND_LOG}   [{i+1}/{len(accounts_to_bind)}] {acc.get('account')} -> {proxy_label}", flush=True)
        except ValueError as e:
            results.append({
                "account_id": acc["id"],
                "account_name": acc.get("account"),
                "success": False,
                "message": str(e),
            })
            print(f"{BIND_LOG}   [{i+1}/{len(accounts_to_bind)}] {acc.get('account')} -> {e}", flush=True)

    msg = f"批量绑定完成: 成功 {bound_count}/{len(accounts_to_bind)}"
    if len(free_proxies) < len(accounts_to_bind):
        msg += f"（空闲代理不足，缺少 {len(accounts_to_bind) - len(free_proxies)} 个）"
    print(f"{BIND_LOG}   {msg}", flush=True)

    return {
        "success": bound_count > 0,
        "message": msg,
        "bound_count": bound_count,
        "skipped_count": len(req.account_ids) - len(accounts_to_bind),
        "failed_count": len(accounts_to_bind) - bound_count,
        "results": results,
    }


@router.post("/api/bindings/batch-verify")
def api_batch_verify(req: BatchVerifyRequest):
    """批量验证选中账号的绑定状态（两层验证）"""
    from binding_verifier import verify_binding as do_verify

    print(f"{BIND_LOG} POST /api/bindings/batch-verify 账号数={len(req.account_ids)}", flush=True)

    all_bindings = list_account_bindings()
    binding_map = {b.get("account_uid"): b for b in all_bindings}

    results: list[dict[str, Any]] = []
    for i, account_id in enumerate(req.account_ids):
        print(f"{BIND_LOG}   [{i+1}/{len(req.account_ids)}] 验证账号 {account_id}", flush=True)

        account = get_account_record(account_id)
        if account is None:
            print(f"{BIND_LOG}     账号不存在", flush=True)
            results.append({
                "account_id": account_id,
                "account_name": None,
                "success": False,
                "summary": "账号不存在",
            })
            continue

        binding = binding_map.get(account_id)
        if binding is None:
            print(f"{BIND_LOG}     未绑定代理", flush=True)
            results.append({
                "account_id": account_id,
                "account_name": account.get("account"),
                "success": False,
                "summary": "未绑定代理",
            })
            continue

        proxy = get_proxy_record(binding.get("proxy_id", ""))
        if proxy is None:
            print(f"{BIND_LOG}     绑定的代理已被删除", flush=True)
            results.append({
                "account_id": account_id,
                "account_name": account.get("account"),
                "success": False,
                "summary": "绑定的代理已被删除",
            })
            continue

        print(f"{BIND_LOG}     开始验证 {account.get('account')} <-> {proxy.get('ip')}:{proxy.get('port')}", flush=True)
        verification = do_verify(account=account, proxy=proxy)
        print(f"{BIND_LOG}     结果: success={verification['success']}", flush=True)

        results.append({
            "account_id": account_id,
            "account_name": account.get("account"),
            "success": verification["success"],
            "summary": verification["summary"],
            "verification": verification,
        })

    success_count = sum(1 for r in results if r["success"])
    fail_count = len(results) - success_count
    msg = f"批量验证完成: {success_count} 通过, {fail_count} 失败 (共 {len(results)})"
    print(f"{BIND_LOG}   {msg}", flush=True)

    return {
        "success": True,
        "message": msg,
        "success_count": success_count,
        "fail_count": fail_count,
        "results": results,
    }
