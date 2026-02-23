import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Activity,
  BarChart3,
  Bookmark,
  Calendar,
  CheckCircle2,
  Circle,
  Eye,
  Hash,
  Heart,
  Infinity,
  Loader2,
  MessageCircle,
  Minus,
  Plus,
  Quote,
  RefreshCw,
  Repeat2,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserRound,
  Users,
  X,
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
import { cn } from "@/lib/utils"

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"

type SnapshotData = {
  followers_count?: number
  following_count?: number
  tweet_count?: number
  listed_count?: number
  profile_name?: string
  profile_image_url?: string
  bio?: string
  created_at?: string
  captured_at?: string
}

type RegularScope =
  | { type: "count"; count: number }
  | { type: "days"; days: number }

type HighlightsScope =
  | { type: "count"; count: number }
  | { type: "days"; days: number }

type CollectScope =
  | { mode: "full" }
  | { mode: "custom"; regular: RegularScope; highlights?: HighlightsScope | null }

type MonitoredAccount = {
  id: string
  username: string
  note?: string | null
  refresh_interval_hours?: number
  collect_scope?: CollectScope
  added_at: string
  last_scraped_at?: string | null
  latest_snapshot: SnapshotData | null
}

type FollowerHistoryPoint = { date: string; followers: number }

type TweetMetric = {
  tweet_id: string
  text: string
  created_at: string
  views: number
  likes: number
  retweets: number
  replies: number
  quotes: number
  bookmarks: number
  media_urls?: string[]
  author_name?: string
  author_handle?: string
}

type ScopeState = {
  isFull: boolean
  regularType: "count" | "days"
  regularCount: number
  regularDays: number
  hlEnabled: boolean
  hlType: "count" | "days"
  hlCount: number
  hlDays: number
}

type AddEntry = {
  username: string
  custom: boolean
  scope: ScopeState
}

function makeDefaultEntry(): AddEntry {
  return {
    username: "",
    custom: false,
    scope: {
      isFull: false, regularType: "count", regularCount: 200, regularDays: 30,
      hlEnabled: false, hlType: "count", hlCount: 100, hlDays: 30,
    },
  }
}

function scopeStateToCollectScope(s: ScopeState): CollectScope {
  if (s.isFull) return { mode: "full" }
  const regular: RegularScope = s.regularType === "count"
    ? { type: "count", count: Math.max(1, s.regularCount) }
    : { type: "days", days: Math.max(1, s.regularDays) }
  const highlights: HighlightsScope | null = s.hlEnabled
    ? s.hlType === "count"
      ? { type: "count", count: Math.max(1, s.hlCount) }
      : { type: "days", days: Math.max(1, s.hlDays) }
    : null
  return { mode: "custom", regular, highlights }
}

type DashboardData = {
  account: { id: string; username: string }
  overview: SnapshotData
  followers_history: FollowerHistoryPoint[]
  tweets: TweetMetric[]
}

function formatDateTime(value?: string | null): string {
  const normalized = String(value || "").trim()
  if (!normalized) return "-"
  return normalized.replace("T", " ").slice(0, 19)
}

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "--"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return "--"
  return iso.replace("T", " ").slice(0, 16)
}

function formatScope(scope: CollectScope | undefined): string {
  if (!scope) return ""
  if (scope.mode === "full") return "全量采集"
  const parts: string[] = []
  if (scope.regular.type === "count") parts.push(`最近 ${scope.regular.count} 条`)
  else parts.push(`最近 ${scope.regular.days} 天`)
  if (scope.highlights) {
    if (scope.highlights.type === "count") parts.push(`高光 ${scope.highlights.count} 条`)
    else parts.push(`高光 ${scope.highlights.days} 天`)
  }
  return parts.join(" + ")
}

/* ─── Dashboard sub-components ─── */

function OverviewCard({
  icon: Icon,
  label,
  value,
  subtext,
  trend,
}: {
  icon: typeof Users
  label: string
  value: string
  subtext?: string
  trend?: "up" | "down" | null
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs text-zinc-500">
          <Icon className="size-3.5" />
          {label}
        </span>
        {trend === "up" && <TrendingUp className="size-3.5 text-emerald-400" />}
        {trend === "down" && <TrendingDown className="size-3.5 text-red-400" />}
      </div>
      <span className="text-2xl font-semibold tracking-tight text-zinc-100">{value}</span>
      {subtext && <span className="text-[11px] text-zinc-500">{subtext}</span>}
    </div>
  )
}

function TweetRow({ tweet, expanded, onToggle }: { tweet: TweetMetric; expanded: boolean; onToggle: () => void }) {
  const hasMedia = tweet.media_urls && tweet.media_urls.length > 0
  return (
    <div className="border-b border-white/[0.05] last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      >
        {hasMedia && (
          <img
            src={tweet.media_urls![0] + "?format=jpg&name=thumb"}
            alt=""
            className="size-10 shrink-0 rounded object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-relaxed text-zinc-300">
            {tweet.text || "(无内容)"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
            <span>{formatDate(tweet.created_at)}</span>
            <span className="flex items-center gap-0.5">
              <Eye className="size-2.5" /> {formatNumber(tweet.views)}
            </span>
            <span className="flex items-center gap-0.5">
              <Heart className="size-2.5" /> {formatNumber(tweet.likes)}
            </span>
            <span className="flex items-center gap-0.5">
              <Repeat2 className="size-2.5" /> {formatNumber(tweet.retweets)}
            </span>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.04] bg-white/[0.015] px-4 py-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {tweet.text}
          </p>
          {hasMedia && (
            <div className={cn(
              "mt-3 grid gap-1.5",
              tweet.media_urls!.length === 1 ? "grid-cols-1" : "grid-cols-2"
            )}>
              {tweet.media_urls!.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img
                    src={url + "?format=jpg&name=small"}
                    alt=""
                    className="w-full rounded-md object-cover"
                    style={{ maxHeight: tweet.media_urls!.length === 1 ? 280 : 160 }}
                  />
                </a>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1" title="浏览量">
              <Eye className="size-3" /> {formatNumber(tweet.views)}
            </span>
            <span className="flex items-center gap-1" title="点赞">
              <Heart className="size-3" /> {formatNumber(tweet.likes)}
            </span>
            <span className="flex items-center gap-1" title="转发">
              <Repeat2 className="size-3" /> {formatNumber(tweet.retweets)}
            </span>
            <span className="flex items-center gap-1" title="评论">
              <MessageCircle className="size-3" /> {formatNumber(tweet.replies)}
            </span>
            <span className="flex items-center gap-1" title="引用">
              <Quote className="size-3" /> {formatNumber(tweet.quotes)}
            </span>
            <span className="flex items-center gap-1" title="书签">
              <Bookmark className="size-3" /> {formatNumber(tweet.bookmarks)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-600">
            <span>{formatDate(tweet.created_at)}</span>
            <a
              href={`https://x.com/${tweet.author_handle || "i"}/status/${tweet.tweet_id}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400/70 hover:text-blue-400"
            >
              在 X 上查看
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function FollowerChart({ history }: { history: FollowerHistoryPoint[] }) {
  if (history.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
        暂无粉丝历史数据，数据采集后将自动展示
      </div>
    )
  }
  const maxVal = Math.max(...history.map((p) => p.followers), 1)
  const minVal = Math.min(...history.map((p) => p.followers), 0)
  const range = maxVal - minVal || 1
  const chartH = 120
  const barW = Math.max(2, Math.min(12, 600 / history.length - 1))
  return (
    <div className="flex items-end gap-px overflow-x-auto px-2 py-2" style={{ height: chartH + 24 }}>
      {history.map((point, i) => {
        const h = Math.max(4, ((point.followers - minVal) / range) * chartH)
        return (
          <div key={i} className="group relative flex flex-col items-center" style={{ minWidth: barW }}>
            <div
              className="w-full rounded-t bg-blue-500/60 transition-colors group-hover:bg-blue-400"
              style={{ height: h, width: barW }}
            />
            <div className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-[10px] text-zinc-300 shadow-lg group-hover:block">
              {point.followers.toLocaleString()} · {point.date.slice(5, 10)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Main Component ─── */

export function MonitoringMainContent() {
  const [accounts, setAccounts] = useState<MonitoredAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const [selectMode, setSelectMode] = useState(false)
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [dashboardLoading, setDashboardLoading] = useState(false)

  const [isBatchRemoving, setIsBatchRemoving] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [addInterval, setAddInterval] = useState(24)
  const [isFull, setIsFull] = useState(false)
  const [regularType, setRegularType] = useState<"count" | "days">("count")
  const [regularCount, setRegularCount] = useState(200)
  const [regularDays, setRegularDays] = useState(30)
  const [hlEnabled, setHlEnabled] = useState(false)
  const [hlType, setHlType] = useState<"count" | "days">("count")
  const [hlCount, setHlCount] = useState(100)
  const [hlDays, setHlDays] = useState(30)
  const [addEntries, setAddEntries] = useState<AddEntry[]>([makeDefaultEntry()])
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false)

  const [tweetViewTab, setTweetViewTab] = useState<"regular" | "highlights">("regular")
  const [expandedTweetId, setExpandedTweetId] = useState<string | null>(null)

  const [editOpen, setEditOpen] = useState(false)
  const [editIsFull, setEditIsFull] = useState(false)
  const [editRegularType, setEditRegularType] = useState<"count" | "days">("count")
  const [editRegularCount, setEditRegularCount] = useState(200)
  const [editRegularDays, setEditRegularDays] = useState(30)
  const [editHlEnabled, setEditHlEnabled] = useState(false)
  const [editHlType, setEditHlType] = useState<"count" | "days">("count")
  const [editHlCount, setEditHlCount] = useState(100)
  const [editHlDays, setEditHlDays] = useState(30)
  const [editInterval, setEditInterval] = useState(24)
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false)

  /* ─── Load accounts ─── */

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/accounts`)
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.message || "加载失败")
      setAccounts(data.accounts ?? [])
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "加载失败")
      setAccounts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  /* ─── Selection ─── */

  const toggleAccountSelect = useCallback((id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  const isAllSelected = useMemo(
    () => accounts.length > 0 && selectedAccountIds.length === accounts.length,
    [accounts, selectedAccountIds]
  )

  const handleToggleSelectAll = useCallback(() => {
    setSelectedAccountIds(isAllSelected ? [] : accounts.map((a) => a.id))
  }, [isAllSelected, accounts])

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  )

  const [isBatchScraping, setIsBatchScraping] = useState(false)
  const [isSingleScraping, setIsSingleScraping] = useState(false)

  /* ─── Dashboard ─── */

  const loadDashboard = useCallback(async (accountId: string, source: "regular" | "highlights" = "regular") => {
    setDashboardLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/accounts/${accountId}/dashboard?source=${source}`)
      const data = await res.json()
      if (data?.success) setDashboard(data)
      else setDashboard(null)
    } catch {
      setDashboard(null)
    } finally {
      setDashboardLoading(false)
    }
  }, [])

  /* ─── Batch remove ─── */

  const handleBatchRemove = useCallback(async () => {
    if (selectedAccountIds.length === 0) return
    setIsBatchRemoving(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/accounts/batch-remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_ids: selectedAccountIds }),
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.message || "操作失败")
      setStatusMessage(data.message)
      setSelectedAccountIds([])
      if (selectedAccountId && selectedAccountIds.includes(selectedAccountId)) {
        setSelectedAccountId(null)
        setDashboard(null)
      }
      await loadAccounts()
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "操作失败")
    } finally {
      setIsBatchRemoving(false)
    }
  }, [selectedAccountIds, selectedAccountId, loadAccounts])

  /* ─── Batch scrape (refresh data) ─── */

  const handleBatchScrape = useCallback(async () => {
    if (selectedAccountIds.length === 0) return
    setIsBatchScraping(true)
    setErrorMessage(null)
    setStatusMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/scrape-batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_ids: selectedAccountIds }),
      })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.message || "刷新失败")
      setStatusMessage(data.summary || "刷新完成")
      await loadAccounts()
      if (selectedAccountId) {
        await loadDashboard(selectedAccountId, tweetViewTab)
      }
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "刷新失败")
    } finally {
      setIsBatchScraping(false)
    }
  }, [selectedAccountIds, selectedAccountId, tweetViewTab, loadAccounts, loadDashboard])

  const handleSingleScrape = useCallback(async () => {
    if (!selectedAccountId) return
    setIsSingleScraping(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/accounts/${selectedAccountId}/scrape`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok || !data?.success) throw new Error(data?.error || "刷新失败")
      await loadAccounts()
      await loadDashboard(selectedAccountId, tweetViewTab)
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "刷新失败")
    } finally {
      setIsSingleScraping(false)
    }
  }, [selectedAccountId, tweetViewTab, loadAccounts, loadDashboard])

  /* ─── Add accounts ─── */

  const addEntryField = useCallback(() => {
    setAddEntries((prev) => [...prev, makeDefaultEntry()])
  }, [])

  const updateEntryUsername = useCallback((index: number, value: string) => {
    setAddEntries((prev) => prev.map((e, i) => (i === index ? { ...e, username: value } : e)))
  }, [])

  const removeEntryField = useCallback((index: number) => {
    setAddEntries((prev) => {
      if (prev.length <= 1) return [makeDefaultEntry()]
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const toggleEntryCustom = useCallback((index: number) => {
    setAddEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, custom: !e.custom } : e))
    )
  }, [])

  const updateEntryScope = useCallback((index: number, patch: Partial<ScopeState>) => {
    setAddEntries((prev) =>
      prev.map((e, i) =>
        i === index ? { ...e, scope: { ...e.scope, ...patch } } : e
      )
    )
  }, [])

  const canSubmitAdd = useMemo(
    () => addEntries.some((e) => e.username.trim().replace(/^@/, "").length > 0),
    [addEntries]
  )

  const buildDefaultScope = useCallback((): CollectScope => {
    return scopeStateToCollectScope({ isFull, regularType, regularCount, regularDays, hlEnabled, hlType, hlCount, hlDays })
  }, [isFull, regularType, regularCount, regularDays, hlEnabled, hlType, hlCount, hlDays])

  const handleAddAccounts = useCallback(async () => {
    const defaultScope = buildDefaultScope()
    const items = addEntries
      .filter((e) => e.username.trim().replace(/^@/, "").length > 0)
      .map((e) => ({
        username: e.username.trim().replace(/^@/, ""),
        collect_scope: e.custom ? scopeStateToCollectScope(e.scope) : defaultScope,
      }))
    if (items.length === 0) return
    setIsSubmittingAdd(true)
    setErrorMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/accounts/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accounts: items,
          refresh_interval_hours: addInterval,
        }),
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.message || "添加失败")
      setAddOpen(false)
      setAddEntries([makeDefaultEntry()])
      setStatusMessage(data.message)
      await loadAccounts()
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "添加失败")
    } finally {
      setIsSubmittingAdd(false)
    }
  }, [addEntries, addInterval, buildDefaultScope, loadAccounts])

  /* ─── Per-account edit ─── */

  const openEditDialog = useCallback(() => {
    if (!selectedAccount) return
    const sc = selectedAccount.collect_scope
    if (sc?.mode === "full") {
      setEditIsFull(true)
      setEditRegularType("count"); setEditRegularCount(200); setEditRegularDays(30)
      setEditHlEnabled(false); setEditHlType("count"); setEditHlCount(100); setEditHlDays(30)
    } else if (sc?.mode === "custom") {
      setEditIsFull(false)
      setEditRegularType(sc.regular.type)
      setEditRegularCount(sc.regular.type === "count" ? sc.regular.count : 200)
      setEditRegularDays(sc.regular.type === "days" ? sc.regular.days : 30)
      if (sc.highlights) {
        setEditHlEnabled(true)
        setEditHlType(sc.highlights.type)
        setEditHlCount(sc.highlights.type === "count" ? sc.highlights.count : 100)
        setEditHlDays(sc.highlights.type === "days" ? sc.highlights.days : 30)
      } else {
        setEditHlEnabled(false); setEditHlType("count"); setEditHlCount(100); setEditHlDays(30)
      }
    } else {
      setEditIsFull(false)
      setEditRegularType("count"); setEditRegularCount(200); setEditRegularDays(30)
      setEditHlEnabled(false); setEditHlType("count"); setEditHlCount(100); setEditHlDays(30)
    }
    setEditInterval(selectedAccount.refresh_interval_hours ?? 24)
    setEditOpen(true)
  }, [selectedAccount])

  const handleSaveEdit = useCallback(async () => {
    if (!selectedAccount) return
    setIsSubmittingEdit(true)
    const scope: CollectScope = editIsFull
      ? { mode: "full" }
      : {
          mode: "custom",
          regular: editRegularType === "count"
            ? { type: "count", count: Math.max(1, editRegularCount) }
            : { type: "days", days: Math.max(1, editRegularDays) },
          highlights: editHlEnabled
            ? editHlType === "count"
              ? { type: "count", count: Math.max(1, editHlCount) }
              : { type: "days", days: Math.max(1, editHlDays) }
            : null,
        }
    try {
      const res = await fetch(`${API_BASE}/api/monitoring/accounts/${selectedAccount.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collect_scope: scope,
          refresh_interval_hours: editInterval,
        }),
      })
      const data = await res.json()
      if (!data?.success) throw new Error(data?.message || "保存失败")
      setEditOpen(false)
      setStatusMessage("设置已更新")
      await loadAccounts()
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "保存失败")
    } finally {
      setIsSubmittingEdit(false)
    }
  }, [selectedAccount, editIsFull, editRegularType, editRegularCount, editRegularDays, editHlEnabled, editHlType, editHlCount, editHlDays, editInterval, loadAccounts])

  /* ─── Dashboard computed values ─── */

  const overview = dashboard?.overview
  const tweets = dashboard?.tweets ?? []
  const history = dashboard?.followers_history ?? []

  const totalEngagement = useMemo(() => {
    if (tweets.length === 0) return null
    const total = tweets.reduce(
      (sum, t) => sum + (t.likes ?? 0) + (t.retweets ?? 0) + (t.replies ?? 0) + (t.quotes ?? 0),
      0
    )
    const totalViews = tweets.reduce((sum, t) => sum + (t.views ?? 0), 0)
    if (totalViews === 0) return null
    return ((total / totalViews) * 100).toFixed(2)
  }, [tweets])

  /* ─── Render ─── */

  return (
    <div className="flex h-full flex-col">
      {/* ━━━ Header bar ━━━ */}
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
                onClick={() => void handleBatchScrape()}
                disabled={selectedAccountIds.length === 0 || isBatchScraping}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/40 bg-blue-500/10 px-3.5 py-1 text-[13px] font-medium text-blue-300 transition-colors duration-100 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={cn("size-3.5", isBatchScraping && "animate-spin")} />
                <span>
                  {isBatchScraping
                    ? "刷新中..."
                    : `刷新数据${selectedAccountIds.length > 0 ? ` (${selectedAccountIds.length})` : ""}`}
                </span>
              </button>
              <button
                onClick={() => void handleBatchRemove()}
                disabled={selectedAccountIds.length === 0 || isBatchRemoving}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/10 px-3.5 py-1 text-[13px] font-medium text-red-300 transition-colors duration-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
                <span>
                  {isBatchRemoving
                    ? "移除中..."
                    : `移出列表${selectedAccountIds.length > 0 ? ` (${selectedAccountIds.length})` : ""}`}
                </span>
              </button>
            </>
          )}
          <button
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1 text-[13px] font-medium text-black transition-colors duration-100 hover:bg-zinc-200"
          >
            <Plus className="size-3.5" />
            <span>添加监控</span>
          </button>
        </div>
      </div>

      {/* ━━━ Status messages ━━━ */}
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

      {/* ━━━ Main body ━━━ */}
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* ── Account list ── */}
          <section className="min-w-0 flex-1 overflow-y-auto">
            {loading && accounts.length === 0 ? (
              <div className="px-5 py-4 text-sm text-zinc-400">加载中...</div>
            ) : accounts.length === 0 ? (
              <div className="mx-5 mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-zinc-400">
                暂无监控账号。点击右上角"添加监控"添加要监控的 Twitter 账号。
              </div>
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {accounts.map((item) => {
                  const isSelected = selectedAccountId === item.id
                  const isChecked = selectedAccountIds.includes(item.id)
                  const snap = item.latest_snapshot
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectMode) {
                            toggleAccountSelect(item.id)
                            return
                          }
                          const nextId = selectedAccountId === item.id ? null : item.id
                          setSelectedAccountId(nextId)
                          if (nextId) void loadDashboard(nextId)
                          else setDashboard(null)
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
                            <span className="truncate">@{item.username}</span>
                            {snap ? (
                              <>
                                <span className="mx-1 text-zinc-600">·</span>
                                <span className="truncate text-zinc-500">
                                  {formatNumber(snap.followers_count)} 粉丝
                                </span>
                                <span className="mx-1 text-zinc-600">·</span>
                                <span className="truncate text-zinc-500">
                                  {formatNumber(snap.tweet_count)} 推文
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="mx-1 text-zinc-600">·</span>
                                <span className="text-zinc-600">等待采集</span>
                              </>
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                          {formatDateTime(item.added_at)}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ── Right panel: monitoring dashboard ── */}
          <aside
            className={cn(
              "min-h-0 shrink-0 overflow-hidden border-l border-white/[0.06] bg-black/30 transition-[width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              selectedAccount ? "w-[520px] xl:w-[600px] opacity-100" : "w-0 opacity-0"
            )}
          >
            <div
              className={cn(
                "h-full min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden transition-opacity duration-200",
                selectedAccount ? "opacity-100 delay-75" : "pointer-events-none opacity-0"
              )}
            >
              {selectedAccount && (
                <div className="flex min-h-0 flex-col p-5">
                  {/* Panel header */}
                  <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
                    <div>
                      <p className="text-sm text-zinc-100">@{selectedAccount.username}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        添加于 {formatDateTime(selectedAccount.added_at)}
                        {selectedAccount.last_scraped_at
                          ? ` · 上次刷新 ${formatDateTime(selectedAccount.last_scraped_at)}`
                          : " · 尚未刷新"}
                        {selectedAccount.collect_scope
                          ? ` · ${formatScope(selectedAccount.collect_scope)}`
                          : ""}
                        {selectedAccount.refresh_interval_hours
                          ? ` · 每 ${selectedAccount.refresh_interval_hours}h`
                          : ""}
                        {selectedAccount.note && ` · ${selectedAccount.note}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => void handleSingleScrape()}
                        disabled={isSingleScraping}
                        className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300 disabled:opacity-50"
                        title="刷新数据"
                      >
                        <RefreshCw className={cn("size-4", isSingleScraping && "animate-spin")} />
                      </button>
                      <button
                        onClick={openEditDialog}
                        className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
                        title="采集设置"
                      >
                        <Settings className="size-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedAccountId(null)
                          setDashboard(null)
                        }}
                        className="rounded-full p-1.5 text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-zinc-300"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>

                  {dashboardLoading ? (
                    <div className="flex flex-1 items-center justify-center py-12">
                      <Loader2 className="size-5 animate-spin text-zinc-500" />
                    </div>
                  ) : (
                    <>
                      {/* Overview cards */}
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <OverviewCard
                          icon={Users}
                          label="粉丝数"
                          value={formatNumber(overview?.followers_count)}
                          subtext={
                            overview?.captured_at
                              ? `更新于 ${formatDate(overview.captured_at)}`
                              : undefined
                          }
                        />
                        <OverviewCard
                          icon={UserPlus}
                          label="关注数"
                          value={formatNumber(overview?.following_count)}
                        />
                        <OverviewCard
                          icon={MessageCircle}
                          label="推文总数"
                          value={formatNumber(overview?.tweet_count)}
                        />
                        <OverviewCard
                          icon={Activity}
                          label="互动率"
                          value={totalEngagement != null ? `${totalEngagement}%` : "--"}
                          subtext={
                            tweets.length > 0
                              ? `基于最近 ${tweets.length} 条推文`
                              : undefined
                          }
                        />
                      </div>

                      {/* Follower trend */}
                      <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02]">
                        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                          <span className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                            <TrendingUp className="size-4 text-blue-400" />
                            粉丝增长趋势
                          </span>
                          <span className="text-[11px] text-zinc-600">
                            近 {history.length} 个数据点
                          </span>
                        </div>
                        <FollowerChart history={history} />
                      </div>

                      {/* Tweet performance — tab switcher */}
                      <div className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.02]">
                        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setTweetViewTab("regular")
                                setExpandedTweetId(null)
                                if (selectedAccountId) void loadDashboard(selectedAccountId, "regular")
                              }}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                                tweetViewTab === "regular"
                                  ? "bg-white/[0.08] text-zinc-200"
                                  : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              <BarChart3 className="size-3.5" />
                              普通推文
                            </button>
                            <button
                              onClick={() => {
                                setTweetViewTab("highlights")
                                setExpandedTweetId(null)
                                if (selectedAccountId) void loadDashboard(selectedAccountId, "highlights")
                              }}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                                tweetViewTab === "highlights"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "text-zinc-500 hover:text-zinc-300"
                              )}
                            >
                              <Sparkles className="size-3.5" />
                              高光推文
                            </button>
                          </div>
                          <span className="text-[11px] text-zinc-600">
                            {tweets.length > 0 ? `${tweets.length} 条推文` : "暂无数据"}
                          </span>
                        </div>
                        {tweets.length > 0 ? (
                          <div className="max-h-[400px] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {tweets.map((t) => (
                              <TweetRow
                                key={t.tweet_id}
                                tweet={t}
                                expanded={expandedTweetId === t.tweet_id}
                                onToggle={() => setExpandedTweetId(
                                  expandedTweetId === t.tweet_id ? null : t.tweet_id
                                )}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex h-24 items-center justify-center text-sm text-zinc-600">
                            {tweetViewTab === "highlights"
                              ? "暂无高光推文数据（需目标账号有 Highlights 分区）"
                              : "数据采集后将自动展示推文表现"}
                          </div>
                        )}
                      </div>

                      {overview?.created_at && (
                        <div className="mt-4 flex items-center gap-4 text-[11px] text-zinc-600">
                          <span>账号创建于 {formatDate(overview.created_at)}</span>
                          {overview.listed_count != null && (
                            <span>被列入 {overview.listed_count} 个列表</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>

      {/* ━━━ Dialog: Add monitoring accounts ━━━ */}
      <Dialog
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next)
          if (!next) {
            setAddEntries([makeDefaultEntry()])
            setAddInterval(24)
            setIsFull(false)
            setRegularType("count"); setRegularCount(200); setRegularDays(30)
            setHlEnabled(false); setHlType("count"); setHlCount(100); setHlDays(30)
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <DialogHeader>
            <DialogTitle>添加监控账号</DialogTitle>
            <DialogDescription>
              输入要监控的 Twitter 用户名，可添加多个。点击用户名右侧的设置图标可单独配置采集范围。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-5">
            {/* ── Account entries ── */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs tracking-[0.12em] uppercase text-zinc-500">
                  Twitter 用户名
                </p>
                <button
                  type="button"
                  onClick={addEntryField}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.12] px-2.5 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
                >
                  <Plus className="size-3.5" />
                  <span>添加</span>
                </button>
              </div>
              <div className="space-y-1.5">
                {addEntries.map((entry, index) => (
                  <div key={`entry-${index}`}>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={entry.username}
                        onChange={(e) => updateEntryUsername(index, e.target.value)}
                        placeholder={`用户名 ${index + 1}（如 elonmusk）`}
                        className="h-9 w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
                      />
                      <button
                        type="button"
                        onClick={() => toggleEntryCustom(index)}
                        title={entry.custom ? "使用默认采集配置" : "自定义采集配置"}
                        className={cn(
                          "inline-flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors",
                          entry.custom
                            ? "border-white/30 bg-white/[0.10] text-zinc-200"
                            : "border-white/[0.12] text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-300"
                        )}
                      >
                        <SlidersHorizontal className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEntryField(index)}
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-white/[0.12] text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={addEntries.length === 1}
                        aria-label="删除该账号"
                      >
                        <Minus className="size-3.5" />
                      </button>
                    </div>
                    {entry.custom && (
                      <div className="mt-1.5 mb-2 rounded-lg border border-white/[0.08] bg-white/[0.02] p-3">
                        <ScopeConfigSection
                          isFull={entry.scope.isFull}
                          setIsFull={(v) => updateEntryScope(index, { isFull: v })}
                          regularType={entry.scope.regularType}
                          setRegularType={(v) => updateEntryScope(index, { regularType: v })}
                          regularCount={entry.scope.regularCount}
                          setRegularCount={(v) => updateEntryScope(index, { regularCount: v })}
                          regularDays={entry.scope.regularDays}
                          setRegularDays={(v) => updateEntryScope(index, { regularDays: v })}
                          hlEnabled={entry.scope.hlEnabled}
                          setHlEnabled={(v) => updateEntryScope(index, { hlEnabled: v })}
                          hlType={entry.scope.hlType}
                          setHlType={(v) => updateEntryScope(index, { hlType: v })}
                          hlCount={entry.scope.hlCount}
                          setHlCount={(v) => updateEntryScope(index, { hlCount: v })}
                          hlDays={entry.scope.hlDays}
                          setHlDays={(v) => updateEntryScope(index, { hlDays: v })}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Default collect scope ── */}
            <div>
              <p className="mb-1 text-[11px] text-zinc-600">
                未单独配置的账号将使用以下默认采集范围
              </p>
              <ScopeConfigSection
                isFull={isFull} setIsFull={setIsFull}
                regularType={regularType} setRegularType={setRegularType}
                regularCount={regularCount} setRegularCount={setRegularCount}
                regularDays={regularDays} setRegularDays={setRegularDays}
                hlEnabled={hlEnabled} setHlEnabled={setHlEnabled}
                hlType={hlType} setHlType={setHlType}
                hlCount={hlCount} setHlCount={setHlCount}
                hlDays={hlDays} setHlDays={setHlDays}
              />
            </div>

            {/* ── Refresh interval ── */}
            <IntervalSelector value={addInterval} onChange={setAddInterval} />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="h-8 rounded-full border border-white/[0.12] px-4 hover:bg-white/[0.05]"
              onClick={() => setAddOpen(false)}
              disabled={isSubmittingAdd}
            >
              取消
            </Button>
            <Button
              className="h-8 rounded-full bg-white px-4 text-black hover:bg-zinc-200"
              onClick={() => void handleAddAccounts()}
              disabled={isSubmittingAdd || !canSubmitAdd}
            >
              {isSubmittingAdd ? "添加中..." : "确认添加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ━━━ Dialog: Edit per-account settings ━━━ */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <DialogHeader>
            <DialogTitle>
              采集设置 {selectedAccount ? `· @${selectedAccount.username}` : ""}
            </DialogTitle>
            <DialogDescription>
              修改该账号的采集范围和刷新间隔。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-5">
            <ScopeConfigSection
              isFull={editIsFull} setIsFull={setEditIsFull}
              regularType={editRegularType} setRegularType={setEditRegularType}
              regularCount={editRegularCount} setRegularCount={setEditRegularCount}
              regularDays={editRegularDays} setRegularDays={setEditRegularDays}
              hlEnabled={editHlEnabled} setHlEnabled={setEditHlEnabled}
              hlType={editHlType} setHlType={setEditHlType}
              hlCount={editHlCount} setHlCount={setEditHlCount}
              hlDays={editHlDays} setHlDays={setEditHlDays}
            />
            <IntervalSelector value={editInterval} onChange={setEditInterval} />
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              className="h-8 rounded-full border border-white/[0.12] px-4 hover:bg-white/[0.05]"
              onClick={() => setEditOpen(false)}
              disabled={isSubmittingEdit}
            >
              取消
            </Button>
            <Button
              className="h-8 rounded-full bg-white px-4 text-black hover:bg-zinc-200"
              onClick={() => void handleSaveEdit()}
              disabled={isSubmittingEdit}
            >
              {isSubmittingEdit ? "保存中..." : "保存设置"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Reusable sub-components for scope config ─── */

const pillCls = (active: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
    active
      ? "border-white/30 bg-white/[0.10] text-zinc-100"
      : "border-white/[0.12] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
  )

const smallPillCls = (active: boolean) =>
  cn(
    "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
    active
      ? "border-white/25 bg-white/[0.08] text-zinc-200"
      : "border-white/[0.12] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"
  )

const numInputCls =
  "h-8 w-24 rounded-full border border-white/[0.12] bg-white/[0.03] px-3 text-center text-[13px] text-zinc-200 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"

function ScopeConfigSection({
  isFull, setIsFull,
  regularType, setRegularType,
  regularCount, setRegularCount,
  regularDays, setRegularDays,
  hlEnabled, setHlEnabled,
  hlType, setHlType,
  hlCount, setHlCount,
  hlDays, setHlDays,
}: {
  isFull: boolean; setIsFull: (v: boolean) => void
  regularType: "count" | "days"; setRegularType: (v: "count" | "days") => void
  regularCount: number; setRegularCount: (v: number) => void
  regularDays: number; setRegularDays: (v: number) => void
  hlEnabled: boolean; setHlEnabled: (v: boolean) => void
  hlType: "count" | "days"; setHlType: (v: "count" | "days") => void
  hlCount: number; setHlCount: (v: number) => void
  hlDays: number; setHlDays: (v: number) => void
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs tracking-[0.12em] uppercase text-zinc-500">
          采集范围
        </p>
        <button
          type="button"
          onClick={() => setIsFull(!isFull)}
          className={pillCls(isFull)}
        >
          <Infinity className="size-3.5 shrink-0" />
          <span>全量采集</span>
        </button>
        {isFull && (
          <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300/80">
            全量采集将获取该用户的所有历史推文（含高光），对于推文较多的账号可能需要较长时间。
          </p>
        )}
      </div>

      {!isFull && (
        <>
          {/* ── Regular tweets ── */}
          <div>
            <p className="mb-2 text-xs text-zinc-500">普通推文</p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setRegularType("count")} className={smallPillCls(regularType === "count")}>
                <Hash className="size-3" /> 按条数
              </button>
              <button type="button" onClick={() => setRegularType("days")} className={smallPillCls(regularType === "days")}>
                <Calendar className="size-3" /> 按日期
              </button>
              <span className="shrink-0 text-xs text-zinc-500">采集最近</span>
              {regularType === "count" ? (
                <input type="number" min={1} value={regularCount} onChange={(e) => setRegularCount(Number(e.target.value) || 1)} className={numInputCls} />
              ) : (
                <input type="number" min={1} value={regularDays} onChange={(e) => setRegularDays(Number(e.target.value) || 1)} className={numInputCls} />
              )}
              <span className="shrink-0 text-xs text-zinc-500">
                {regularType === "count" ? "条" : "天"}
              </span>
            </div>
          </div>

          {/* ── Highlights ── */}
          <div>
            <p className="mb-2 text-xs text-zinc-500">高光推文</p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setHlEnabled(!hlEnabled)}
                className={smallPillCls(hlEnabled)}
              >
                <Sparkles className="size-3" /> {hlEnabled ? "已开启" : "未开启"}
              </button>
              {hlEnabled && (
                <>
                  <button type="button" onClick={() => setHlType("count")} className={smallPillCls(hlType === "count")}>
                    <Hash className="size-3" /> 按条数
                  </button>
                  <button type="button" onClick={() => setHlType("days")} className={smallPillCls(hlType === "days")}>
                    <Calendar className="size-3" /> 按天数
                  </button>
                  <span className="shrink-0 text-xs text-zinc-500">采集最近</span>
                  {hlType === "count" ? (
                    <input type="number" min={1} value={hlCount} onChange={(e) => setHlCount(Number(e.target.value) || 1)} className={numInputCls} />
                  ) : (
                    <input type="number" min={1} value={hlDays} onChange={(e) => setHlDays(Number(e.target.value) || 1)} className={numInputCls} />
                  )}
                  <span className="shrink-0 text-xs text-zinc-500">
                    {hlType === "count" ? "条" : "天"}
                  </span>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function IntervalSelector({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs tracking-[0.12em] uppercase text-zinc-500">
        数据刷新间隔
      </p>
      <div className="flex flex-wrap gap-2">
        {[
          { label: "每小时", v: 1 },
          { label: "每 6 小时", v: 6 },
          { label: "每 12 小时", v: 12 },
          { label: "每天", v: 24 },
          { label: "每 3 天", v: 72 },
          { label: "每周", v: 168 },
        ].map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChange(opt.v)}
            className={pillCls(value === opt.v)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
