import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react"
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleAlert,
  Plus,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type AccountStatus = "active" | "suspended" | "disabled"

type AccountItem = {
  id: string
  platform: string
  account: string
  email?: string | null
  status: AccountStatus
  verify_status?: string | null
  verify_message?: string | null
  verify_checked_at?: string | null
  verify_http_status?: number | null
  verify_latency_ms?: number | null
  password_masked?: string | null
  twofa_masked?: string | null
  token_masked?: string | null
  email_password_masked?: string | null
  extra_fields?: Record<string, string>
  created_at?: string
  updated_at?: string
}

type SingleAccountForm = {
  account: string
  password: string
  twofa: string
  token: string
  email: string
  emailPassword: string
}

type AccountDrawer = {
  id: AccountStatus
  label: string
  icon: ComponentType<{ className?: string }>
  emptyTitle: string
  emptyDescription: string
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"

const accountDrawers: AccountDrawer[] = [
  {
    id: "active",
    label: "正常账号",
    icon: CheckCircle2,
    emptyTitle: "暂无正常账号",
    emptyDescription: "状态正常的账号会显示在这里。",
  },
  {
    id: "suspended",
    label: "风控账号",
    icon: CircleAlert,
    emptyTitle: "暂无风控账号",
    emptyDescription: "触发风控或限制的账号会显示在这里。",
  },
  {
    id: "disabled",
    label: "停用账号",
    icon: CircleAlert,
    emptyTitle: "暂无停用账号",
    emptyDescription: "手动停用或失效的账号会显示在这里。",
  },
]

function createDefaultSingleForm(): SingleAccountForm {
  return {
    account: "",
    password: "",
    twofa: "",
    token: "",
    email: "",
    emailPassword: "",
  }
}

function getStatusLabel(status: string): string {
  if (status === "active") return "正常"
  if (status === "suspended") return "风控"
  if (status === "disabled") return "停用"
  return status || "未知"
}

function getVerifyStatusLabel(status?: string | null): string {
  const value = String(status || "").trim().toLowerCase()
  if (!value) return "-"
  if (value === "active") return "正常"
  if (value === "protected") return "私密正常"
  if (value === "suspended") return "封禁"
  if (value === "locked") return "锁定"
  if (value === "not_found") return "不存在"
  if (value === "rate_limited") return "限流"
  if (value === "auth_token_expired") return "Token失效"
  if (value === "token_missing") return "缺少Token"
  if (value.startsWith("http_error_")) return `HTTP异常(${value.replace("http_error_", "")})`
  if (value.startsWith("unavailable_")) return `不可用(${value.replace("unavailable_", "")})`
  return value
}

function formatDateTime(value?: string): string {
  const normalized = String(value || "").trim()
  if (!normalized) return "-"
  return normalized.replace("T", " ").slice(0, 19)
}

export function AccountMainContent() {
  const [openMap, setOpenMap] = useState<Record<AccountStatus, boolean>>({
    active: true,
    suspended: false,
    disabled: false,
  })
  const [accountItems, setAccountItems] = useState<AccountItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const [singleOpen, setSingleOpen] = useState(false)
  const [batchOpen, setBatchOpen] = useState(false)
  const [singleForm, setSingleForm] = useState<SingleAccountForm>(createDefaultSingleForm)
  const [batchRawText, setBatchRawText] = useState("")
  const [batchDelimiter, setBatchDelimiter] = useState("----")
  const [batchFieldTemplate, setBatchFieldTemplate] = useState(
    "account,password,email,email_password,2fa,token"
  )
  const [batchResult, setBatchResult] = useState<string | null>(null)

  const [isSubmittingSingle, setIsSubmittingSingle] = useState(false)
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false)
  const [isDeletingAccountId, setIsDeletingAccountId] = useState<string | null>(null)
  const [isBatchDeleting, setIsBatchDeleting] = useState(false)
  const [isVerifyingStatus, setIsVerifyingStatus] = useState(false)

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const response = await fetch(`${API_BASE}/api/accounts?platform=twitter`)
      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "账号列表加载失败")
      }
      setAccountItems(Array.isArray(payload?.accounts) ? payload.accounts : [])
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "账号列表加载失败")
      setAccountItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const accountsByStatus = useMemo(
    () => ({
      active: accountItems.filter((item) => item.status === "active"),
      suspended: accountItems.filter((item) => item.status === "suspended"),
      disabled: accountItems.filter((item) => item.status === "disabled"),
    }),
    [accountItems]
  )

  const selectedAccount =
    accountItems.find((item) => item.id === selectedAccountId) ?? null

  const allImportedAccountIds = useMemo(
    () => accountItems.map((item) => item.id),
    [accountItems]
  )
  const isAllSelected =
    allImportedAccountIds.length > 0 &&
    allImportedAccountIds.every((id) => selectedAccountIds.includes(id))

  useEffect(() => {
    if (!selectMode) {
      setSelectedAccountIds([])
      return
    }
    setSelectedAccountId(null)
  }, [selectMode])

  useEffect(() => {
    setSelectedAccountIds((prev) =>
      prev.filter((id) => accountItems.some((item) => item.id === id))
    )
  }, [accountItems])

  const toggleAccountSelect = (accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    )
  }

  const handleToggleSelectAll = () => {
    setSelectedAccountIds((prev) => (prev.length === allImportedAccountIds.length ? [] : allImportedAccountIds))
  }

  const handleCreateSingle = async () => {
    if (!singleForm.account.trim()) {
      setErrorMessage("账号不能为空")
      return
    }

    try {
      setIsSubmittingSingle(true)
      setErrorMessage(null)
      const response = await fetch(`${API_BASE}/api/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "twitter",
          account: singleForm.account.trim(),
          password: singleForm.password.trim() || null,
          twofa: singleForm.twofa.trim() || null,
          token: singleForm.token.trim() || null,
          email: singleForm.email.trim() || null,
          email_password: singleForm.emailPassword.trim() || null,
          status: "active",
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "添加账号失败")
      }
      setSingleOpen(false)
      setSingleForm(createDefaultSingleForm())
      await loadAccounts()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "添加账号失败")
    } finally {
      setIsSubmittingSingle(false)
    }
  }

  const handleCreateBatch = async () => {
    const delimiter = batchDelimiter || ""
    if (!delimiter) {
      setErrorMessage("分隔符不能为空")
      return
    }
    const fieldOrder = batchFieldTemplate
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
    if (fieldOrder.length === 0) {
      setErrorMessage("字段模板不能为空")
      return
    }
    if (!batchRawText.trim()) {
      setErrorMessage("导入内容不能为空")
      return
    }

    try {
      setIsSubmittingBatch(true)
      setErrorMessage(null)
      setBatchResult(null)
      const response = await fetch(`${API_BASE}/api/accounts/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "twitter",
          raw_text: batchRawText,
          delimiter,
          field_order: fieldOrder,
          status: "active",
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload?.message || "批量导入请求失败")
      }

      const successCount = Number(payload?.success_count ?? 0)
      const failureCount = Number(payload?.failure_count ?? 0)
      if (successCount <= 0) {
        throw new Error(payload?.message || "批量导入失败")
      }

      let resultText = `批量导入完成：成功 ${successCount} 条，失败 ${failureCount} 条。`
      const failures = Array.isArray(payload?.failures) ? payload.failures : []
      if (failures.length > 0) {
        const preview = failures
          .slice(0, 2)
          .map(
            (item: { line_number?: number; reason?: string }) =>
              `第${item.line_number ?? "-"}行: ${item.reason ?? "失败"}`
          )
          .join("；")
        resultText += ` 示例失败：${preview}`
      }

      setBatchResult(resultText)
      setBatchRawText("")
      await loadAccounts()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "批量导入失败")
    } finally {
      setIsSubmittingBatch(false)
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    const confirmed = window.confirm("确认删除该账号吗？")
    if (!confirmed) return

    try {
      setIsDeletingAccountId(accountId)
      setErrorMessage(null)
      const response = await fetch(`${API_BASE}/api/accounts/${accountId}`, {
        method: "DELETE",
      })
      const payload = await response.json()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "删除账号失败")
      }

      if (selectedAccountId === accountId) {
        setSelectedAccountId(null)
      }
      setSelectedAccountIds((prev) => prev.filter((id) => id !== accountId))
      await loadAccounts()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "删除账号失败")
    } finally {
      setIsDeletingAccountId(null)
    }
  }

  const handleDeleteSelectedAccounts = async () => {
    if (selectedAccountIds.length === 0) {
      setErrorMessage("请先选择要删除的账号")
      return
    }
    const confirmed = window.confirm(`确认删除选中的 ${selectedAccountIds.length} 个账号吗？`)
    if (!confirmed) return

    try {
      setIsBatchDeleting(true)
      setErrorMessage(null)
      const failures: string[] = []
      for (const accountId of selectedAccountIds) {
        try {
          const response = await fetch(`${API_BASE}/api/accounts/${accountId}`, {
            method: "DELETE",
          })
          const payload = await response.json()
          if (!response.ok || !payload?.success) {
            throw new Error(payload?.message || "删除账号失败")
          }
        } catch (error) {
          failures.push(error instanceof Error ? error.message : "删除账号失败")
        }
      }

      if (failures.length > 0) {
        setErrorMessage(`批量删除完成，但有 ${failures.length} 条失败`)
      }
      setSelectedAccountIds([])
      setSelectedAccountId(null)
      await loadAccounts()
    } finally {
      setIsBatchDeleting(false)
    }
  }

  const handleVerifySelectedAccountsStatus = async () => {
    if (selectedAccountIds.length === 0) {
      setErrorMessage("请先选择要验证状态的账号")
      return
    }

    try {
      setIsVerifyingStatus(true)
      setErrorMessage(null)
      setStatusMessage(null)
      const response = await fetch(`${API_BASE}/api/accounts/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_ids: selectedAccountIds,
        }),
      })
      const payload = await response.json()
      console.groupCollapsed(
        `[账号验证] response status=${response.status} success=${Boolean(payload?.success)}`
      )
      console.log("payload:", payload)
      const resultItems = Array.isArray(payload?.results) ? payload.results : []
      resultItems.forEach((item: Record<string, unknown>, index: number) => {
        const status = String(item?.verify_status || "unknown")
        if (
          status === "active" ||
          status === "protected" ||
          status === "suspended" ||
          status === "locked" ||
          status === "not_found" ||
          status.startsWith("unavailable_")
        ) {
          console.log(`[账号验证][${index + 1}]`, item)
        } else {
          console.error(`[账号验证][${index + 1}][FAILED]`, item)
        }
      })
      const failureDetails = Array.isArray(payload?.failure_details)
        ? payload.failure_details
        : []
      if (failureDetails.length > 0) {
        console.error("[账号验证] failure_details:", failureDetails)
      }
      console.groupEnd()
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "账号状态验证失败")
      }

      const successCount = Number(payload?.success_count ?? 0)
      const failureCount = Number(payload?.failure_count ?? 0)
      let message = `验证完成：成功 ${successCount} 个，失败 ${failureCount} 个。`
      if (Array.isArray(payload?.missing_ids) && payload.missing_ids.length > 0) {
        message += `（缺失账号 ${payload.missing_ids.length} 个）`
      }
      if (failureCount > 0) {
        message += "（失败详情见浏览器控制台）"
      }
      setStatusMessage(message)
      await loadAccounts()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "账号状态验证失败")
    } finally {
      setIsVerifyingStatus(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.08] px-5">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setSelectMode((prev) => !prev)}
            className={cn(
              "mr-1 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors duration-100",
              selectMode
                ? "border-white/[0.24] bg-white/[0.10] text-zinc-100"
                : "border-white/[0.12] text-zinc-300 hover:bg-white/[0.05]"
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            <span>选择</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {selectMode && (
            <>
              <button
                onClick={handleToggleSelectAll}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-3.5 py-1 text-[13px] font-medium text-zinc-200 transition-colors duration-100 hover:bg-white/[0.05]"
              >
                <span>{isAllSelected ? "取消全选" : "全选账号"}</span>
              </button>
              <button
                onClick={() => void handleVerifySelectedAccountsStatus()}
                disabled={selectedAccountIds.length === 0 || isVerifyingStatus || isBatchDeleting}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] px-3.5 py-1 text-[13px] font-medium text-zinc-200 transition-colors duration-100 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>
                  {isVerifyingStatus
                    ? "验证中..."
                    : `验证状态${selectedAccountIds.length > 0 ? ` (${selectedAccountIds.length})` : ""}`}
                </span>
              </button>
              <button
                onClick={() => void handleDeleteSelectedAccounts()}
                disabled={selectedAccountIds.length === 0 || isBatchDeleting || isVerifyingStatus}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/10 px-3.5 py-1 text-[13px] font-medium text-red-300 transition-colors duration-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span>
                  {isBatchDeleting
                    ? "删除中..."
                    : `删除选中${selectedAccountIds.length > 0 ? ` (${selectedAccountIds.length})` : ""}`}
                </span>
              </button>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-[13px] font-medium text-black transition-colors duration-100 hover:bg-zinc-200">
                <Plus className="size-3.5" />
                <span>添加账号</span>
                <ChevronDown className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40 border-white/[0.12] bg-zinc-900 text-zinc-100"
            >
              <DropdownMenuItem onSelect={() => setSingleOpen(true)}>
                添加单个账号
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setBatchOpen(true)}>
                批量添加账号
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {errorMessage && (
        <div className="border-b border-red-400/20 bg-red-500/10 px-5 py-2 text-xs text-red-300">
          {errorMessage}
        </div>
      )}
      {statusMessage && (
        <div className="border-b border-emerald-400/20 bg-emerald-500/10 px-5 py-2 text-xs text-emerald-300">
          {statusMessage}
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full">
          <section className="min-w-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="px-5 text-sm text-zinc-400">加载中...</div>
            ) : accountItems.length === 0 ? (
              <div className="mx-5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-zinc-400">
                暂无账号数据。
              </div>
            ) : (
              <>
                {accountDrawers.map((drawer) => {
                  const DrawerIcon = drawer.icon

                  const accounts = accountsByStatus[drawer.id]
                  const isOpen = Boolean(openMap[drawer.id])
                  return (
                    <Collapsible
                      key={drawer.id}
                      open={isOpen}
                      onOpenChange={(open) =>
                        setOpenMap((prev) => ({ ...prev, [drawer.id]: open }))
                      }
                      className="border-b border-white/[0.05] first:border-t first:border-white/[0.05]"
                    >
                      <CollapsibleTrigger asChild>
                        <button className="flex h-11 w-full items-center bg-black/45 px-5 text-left transition-colors hover:bg-black/35">
                          <span className="flex items-center gap-2.5 text-sm text-zinc-200">
                            <ChevronDown
                              className={cn(
                                "size-4 text-zinc-500 transition-transform duration-200 ease-out",
                                isOpen && "rotate-180"
                              )}
                            />
                            <DrawerIcon className="size-4 text-zinc-300" />
                            <span>{drawer.label}</span>
                            <span className="text-zinc-500">({accounts.length})</span>
                          </span>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent
                        forceMount
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                          isOpen
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0"
                        )}
                      >
                        <div className="overflow-hidden border-t border-white/[0.05] bg-white/[0.01]">
                          {accounts.length > 0 ? (
                            <ul className="divide-y divide-white/[0.05]">
                              {accounts.map((item) => {
                                const isSelected = selectedAccountId === item.id
                                const isChecked = selectedAccountIds.includes(item.id)
                                return (
                                  <li key={item.id}>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (selectMode) {
                                          toggleAccountSelect(item.id)
                                          return
                                        }
                                        setSelectedAccountId((prev) =>
                                          prev === item.id ? null : item.id
                                        )
                                      }}
                                      className={cn(
                                        "flex h-11 w-full items-center justify-between px-5 text-left transition-colors hover:bg-white/[0.025]",
                                        (isSelected || (selectMode && isChecked)) && "bg-white/[0.05]"
                                      )}
                                    >
                                      <div className="min-w-0 pr-3">
                                        <div className="flex items-center gap-2.5 truncate text-sm text-zinc-200">
                                          {selectMode &&
                                            (isChecked ? (
                                              <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
                                            ) : (
                                              <Circle className="size-4 shrink-0 text-zinc-500" />
                                            ))}
                                          <UserRound className="size-4 shrink-0 text-zinc-500" />
                                          <span className="truncate">{item.account}</span>
                                          <span className="mx-1 text-zinc-600">·</span>
                                          <span className="truncate text-zinc-500">
                                            {item.email || "未填写邮箱"}
                                          </span>
                                        </div>
                                      </div>
                                      <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                                        {formatDateTime(item.created_at)}
                                      </span>
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          ) : (
                            <div className="px-5 py-4">
                              <p className="text-sm text-zinc-300">{drawer.emptyTitle}</p>
                              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                                {drawer.emptyDescription}
                              </p>
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )
                })}
              </>
            )}
          </section>

          <aside
            className={cn(
              "min-h-0 shrink-0 overflow-hidden border-l border-white/[0.06] bg-black/30 transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              selectedAccount ? "w-[360px] xl:w-[420px] opacity-100" : "w-0 opacity-0"
            )}
          >
            <div
              className={cn(
                "min-h-0 h-full px-5 py-4 transition-opacity duration-200",
                selectedAccount ? "opacity-100 delay-75" : "pointer-events-none opacity-0"
              )}
            >
              {selectedAccount && (
                <div className="flex h-full min-h-0 flex-col">
                  <div className="border-b border-white/[0.06] pb-3">
                    <p className="text-sm text-zinc-100">{selectedAccount.account}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      平台: {selectedAccount.platform} / 状态: {getStatusLabel(selectedAccount.status)}
                    </p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">密码</span>
                      <span className="text-zinc-200">{selectedAccount.password_masked || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">2FA</span>
                      <span className="text-zinc-200">{selectedAccount.twofa_masked || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">Token</span>
                      <span className="text-zinc-200">{selectedAccount.token_masked || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">邮箱</span>
                      <span className="text-zinc-200">{selectedAccount.email || "-"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">邮箱密码</span>
                      <span className="text-zinc-200">
                        {selectedAccount.email_password_masked || "-"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">更新时间</span>
                      <span className="text-zinc-200">{formatDateTime(selectedAccount.updated_at)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">验证状态</span>
                      <span className="text-zinc-200">
                        {getVerifyStatusLabel(selectedAccount.verify_status)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">最近验证</span>
                      <span className="text-zinc-200">
                        {formatDateTime(selectedAccount.verify_checked_at || undefined)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-zinc-500">验证延迟</span>
                      <span className="text-zinc-200">
                        {selectedAccount.verify_latency_ms != null
                          ? `${selectedAccount.verify_latency_ms}ms`
                          : "-"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 min-h-0 flex-1 overflow-auto rounded-lg border border-white/[0.08] bg-black/35 p-3">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-500">原始导入字段</p>
                    {selectedAccount.verify_message && (
                      <p className="mt-2 text-[12px] leading-5 text-amber-300">
                        验证信息: {selectedAccount.verify_message}
                      </p>
                    )}
                    <div className="mt-2 space-y-1 text-[12px] leading-5 text-zinc-400">
                      {selectedAccount.extra_fields &&
                      Object.keys(selectedAccount.extra_fields).length > 0 ? (
                        Object.entries(selectedAccount.extra_fields).map(([key, value]) => (
                          <p key={key}>
                            {key}: {value || "-"}
                          </p>
                        ))
                      ) : (
                        <p>无</p>
                      )}
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 self-end rounded-full border-red-400/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                    onClick={() => void handleDeleteAccount(selectedAccount.id)}
                    disabled={isDeletingAccountId === selectedAccount.id}
                  >
                    <Trash2 className="size-3.5" />
                    {isDeletingAccountId === selectedAccount.id ? "删除中..." : "删除账号"}
                  </Button>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      <Dialog open={singleOpen} onOpenChange={setSingleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加单个账号</DialogTitle>
            <DialogDescription>填写账号与凭证信息，保存到本地账号池。</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <input
              value={singleForm.account}
              onChange={(event) =>
                setSingleForm((prev) => ({ ...prev, account: event.target.value }))
              }
              placeholder="账号（必填）"
              className="h-9 rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
            <input
              value={singleForm.password}
              onChange={(event) =>
                setSingleForm((prev) => ({ ...prev, password: event.target.value }))
              }
              placeholder="密码"
              className="h-9 rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
            <input
              value={singleForm.twofa}
              onChange={(event) =>
                setSingleForm((prev) => ({ ...prev, twofa: event.target.value }))
              }
              placeholder="2FA / TOTP"
              className="h-9 rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
            <input
              value={singleForm.token}
              onChange={(event) =>
                setSingleForm((prev) => ({ ...prev, token: event.target.value }))
              }
              placeholder="Token / Cookie"
              className="h-9 rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
            <input
              value={singleForm.email}
              onChange={(event) =>
                setSingleForm((prev) => ({ ...prev, email: event.target.value }))
              }
              placeholder="邮箱"
              className="h-9 rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
            <input
              value={singleForm.emailPassword}
              onChange={(event) =>
                setSingleForm((prev) => ({ ...prev, emailPassword: event.target.value }))
              }
              placeholder="邮箱密码"
              className="h-9 rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="h-8 rounded-full border border-white/[0.12] px-4 hover:bg-white/[0.05]"
              onClick={() => setSingleOpen(false)}
              disabled={isSubmittingSingle}
            >
              取消
            </Button>
            <Button
              className="h-8 rounded-full bg-white px-4 text-black hover:bg-zinc-200"
              onClick={() => void handleCreateSingle()}
              disabled={isSubmittingSingle}
            >
              {isSubmittingSingle ? "提交中..." : "确认添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchOpen} onOpenChange={setBatchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量导入账号</DialogTitle>
            <DialogDescription>
              可自定义字段模板和分隔符，按“每行一个账号”导入。
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            <input
              value={batchDelimiter}
              onChange={(event) => setBatchDelimiter(event.target.value)}
              placeholder="分隔符（例如 ----，或 ,）"
              className="h-9 w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
            <input
              value={batchFieldTemplate}
              onChange={(event) => setBatchFieldTemplate(event.target.value)}
              placeholder="字段模板，逗号分隔（如 account,password,2fa,token）"
              className="h-9 w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
            <textarea
              value={batchRawText}
              onChange={(event) => setBatchRawText(event.target.value)}
              placeholder={
                "JessicaFer20452----oC7rFGm9GT----stepanova.7pziv@rambler.ru----wSBrH0Bs42xDWD----RHW65QIADO2QBWMU----f5ee5a62f08ddc..."
              }
              className="min-h-[180px] w-full rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
            />
            {batchResult && (
              <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                {batchResult}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              className="h-8 rounded-full border border-white/[0.12] px-4 hover:bg-white/[0.05]"
              onClick={() => setBatchOpen(false)}
              disabled={isSubmittingBatch}
            >
              关闭
            </Button>
            <Button
              className="h-8 rounded-full bg-white px-4 text-black hover:bg-zinc-200"
              onClick={() => void handleCreateBatch()}
              disabled={isSubmittingBatch}
            >
              {isSubmittingBatch ? "导入中..." : "开始导入"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
