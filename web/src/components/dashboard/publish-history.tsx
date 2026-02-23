import { useCallback, useEffect, useState } from "react"
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type HistoryItem = {
  id: string
  account_id: string
  tweet_type: string
  content: { text?: string; media_paths?: string[] | null }
  status: string
  tweet_id?: string | null
  tweet_url?: string | null
  error_message?: string | null
  published_at: string
}

type AccountInfo = { id: string; account: string }

export function PublishHistory() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [filterAccount, setFilterAccount] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 20

  useEffect(() => {
    fetch("/api/accounts?platform=twitter&pool=publish")
      .then((r) => r.json())
      .then((data) => {
        const list = (data.accounts || data || [])
          .filter((a: any) => a.platform === "twitter")
          .map((a: any) => ({ id: a.id, account: a.account }))
        setAccounts(list)
      })
      .catch(() => {})
  }, [])

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAccount) params.set("account_id", filterAccount)
      if (filterStatus) params.set("status", filterStatus)
      params.set("limit", "200")
      const res = await fetch(`/api/publish/history?${params}`)
      const data = await res.json()
      setItems(data.items || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }, [filterAccount, filterStatus])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  useEffect(() => {
    setPage(1)
  }, [filterAccount, filterStatus])

  const accountName = (accountId: string) =>
    accounts.find((a) => a.id === accountId)?.account || accountId.slice(0, 8)

  const paged = items.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  return (
    <div className="p-6 space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={filterAccount}
          onChange={(e) => setFilterAccount(e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        >
          <option value="">全部账号</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.account}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
        </select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-12">
          {loading ? "加载中..." : "暂无发布记录"}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-4 py-2 font-medium">状态</th>
                <th className="text-left px-4 py-2 font-medium">账号</th>
                <th className="text-left px-4 py-2 font-medium">类型</th>
                <th className="text-left px-4 py-2 font-medium">内容</th>
                <th className="text-left px-4 py-2 font-medium">时间</th>
                <th className="text-left px-4 py-2 font-medium">链接</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {paged.map((item) => (
                <tr key={item.id} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    {item.status === "success" ? (
                      <CheckCircle2 className="size-4 text-emerald-400" />
                    ) : (
                      <XCircle className="size-4 text-destructive" />
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs">@{accountName(item.account_id)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{item.tweet_type}</td>
                  <td className="px-4 py-2 max-w-[240px]">
                    <p className="truncate text-foreground text-xs">
                      {item.content?.text || "-"}
                    </p>
                    {item.status === "failed" && item.error_message && (
                      <p className="truncate text-destructive text-[11px] mt-0.5">
                        {item.error_message}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {item.published_at
                      ? new Date(item.published_at).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "-"}
                  </td>
                  <td className="px-4 py-2">
                    {item.tweet_url ? (
                      <a
                        href={item.tweet_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:underline inline-flex items-center gap-1 text-xs"
                      >
                        查看
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <Button
            variant="outline"
            size="xs"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <span className="text-muted-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  )
}
