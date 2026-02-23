import { useCallback, useEffect, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type QueueItem = {
  id: string
  account_id: string
  tweet_type: string
  content: { text?: string; media_paths?: string[] | null }
  strategy: { type: string; scheduled_time?: string | null }
  status: string
  priority: number
  retry_count: number
  max_retries: number
  result: { tweet_id?: string | null; tweet_url?: string | null; error?: string | null }
  created_at: string
  updated_at: string
}

type AccountInfo = { id: string; account: string }

const STATUS_LABELS: Record<string, string> = {
  pending: "待发布",
  scheduled: "已计划",
  publishing: "发布中",
  success: "成功",
  failed: "失败",
  paused: "已暂停",
  cancelled: "已取消",
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-500/15 text-blue-400",
  scheduled: "bg-indigo-500/15 text-indigo-400",
  publishing: "bg-amber-500/15 text-amber-400",
  success: "bg-emerald-500/15 text-emerald-400",
  failed: "bg-destructive/15 text-destructive",
  paused: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
}

export function PublishQueue() {
  const [items, setItems] = useState<QueueItem[]>([])
  const [accounts, setAccounts] = useState<AccountInfo[]>([])
  const [filterAccount, setFilterAccount] = useState("")
  const [filterStatus, setFilterStatus] = useState("")
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterAccount) params.set("account_id", filterAccount)
      if (filterStatus) params.set("status", filterStatus)
      const res = await fetch(`/api/publish/queue?${params}`)
      const data = await res.json()
      setItems(data.items || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }, [filterAccount, filterStatus])

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

  useEffect(() => {
    fetchQueue()
    const interval = setInterval(fetchQueue, 10_000)
    return () => clearInterval(interval)
  }, [fetchQueue])

  const accountName = (accountId: string) =>
    accounts.find((a) => a.id === accountId)?.account || accountId.slice(0, 8)

  const handleDelete = async (id: string) => {
    setActionLoading(id)
    await fetch(`/api/publish/queue/${id}`, { method: "DELETE" })
    await fetchQueue()
    setActionLoading(null)
  }

  const handleReorder = async (id: string, delta: number) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    setActionLoading(id)
    await fetch("/api/publish/queue/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id: id, new_priority: item.priority + delta }),
    })
    await fetchQueue()
    setActionLoading(null)
  }

  const handlePause = async (accountId: string) => {
    setActionLoading(`pause-${accountId}`)
    await fetch(`/api/publish/queue/pause/${accountId}`, { method: "POST" })
    await fetchQueue()
    setActionLoading(null)
  }

  const handleResume = async (accountId: string) => {
    setActionLoading(`resume-${accountId}`)
    await fetch(`/api/publish/queue/resume/${accountId}`, { method: "POST" })
    await fetchQueue()
    setActionLoading(null)
  }

  const handleTriggerScan = async () => {
    setActionLoading("trigger")
    await fetch("/api/publish/scheduler/trigger", { method: "POST" })
    setTimeout(fetchQueue, 1500)
    setActionLoading(null)
  }

  // Group by account
  const grouped = items.reduce<Record<string, QueueItem[]>>((acc, item) => {
    const key = item.account_id
    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {})

  return (
    <div className="p-6 space-y-4">
      {/* Toolbar */}
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
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleTriggerScan} disabled={!!actionLoading}>
          <RefreshCw className={cn("size-3.5", actionLoading === "trigger" && "animate-spin")} />
          立即执行
        </Button>
        <Button variant="outline" size="sm" onClick={fetchQueue} disabled={loading}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          刷新
        </Button>
      </div>

      {/* Queue list */}
      {items.length === 0 ? (
        <div className="text-center text-muted-foreground text-sm py-12">
          {loading ? "加载中..." : "队列为空"}
        </div>
      ) : (
        Object.entries(grouped).map(([accountId, group]) => (
          <div key={accountId} className="border rounded-lg overflow-hidden">
            {/* Account header */}
            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
              <span className="text-sm font-medium">@{accountName(accountId)}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{group.length} 项</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handlePause(accountId)}
                  disabled={!!actionLoading}
                  title="暂停此账号队列"
                >
                  <Pause className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleResume(accountId)}
                  disabled={!!actionLoading}
                  title="恢复此账号队列"
                >
                  <Play className="size-3" />
                </Button>
              </div>
            </div>

            {/* Items */}
            <div className="divide-y">
              {group.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                  {/* Status badge */}
                  <span
                    className={cn(
                      "shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-medium",
                      STATUS_COLORS[item.status] || "bg-muted text-muted-foreground"
                    )}
                  >
                    {STATUS_LABELS[item.status] || item.status}
                  </span>

                  {/* Content preview */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="truncate text-foreground">
                      {item.content?.text || <span className="text-muted-foreground italic">无文本</span>}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{item.tweet_type}</span>
                      {item.strategy?.scheduled_time && (
                        <span>计划: {new Date(item.strategy.scheduled_time).toLocaleString("zh-CN")}</span>
                      )}
                      {item.retry_count > 0 && (
                        <span className="text-amber-400">
                          重试 {item.retry_count}/{item.max_retries}
                        </span>
                      )}
                      {item.result?.error && (
                        <span className="text-destructive truncate max-w-[200px]">
                          {item.result.error}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleReorder(item.id, -1)}
                      disabled={!!actionLoading}
                      title="上移"
                    >
                      <ArrowUp className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleReorder(item.id, 1)}
                      disabled={!!actionLoading}
                      title="下移"
                    >
                      <ArrowDown className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleDelete(item.id)}
                      disabled={!!actionLoading}
                      title="删除"
                      className="text-destructive hover:text-destructive"
                    >
                      {actionLoading === item.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
