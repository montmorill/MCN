import { useCallback, useEffect, useRef, useState } from "react"
import {
  Calendar,
  Check,
  Hash,
  Image,
  Loader2,
  Send,
  ListPlus,
  Video,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type AccountItem = {
  id: string
  platform: string
  account: string
  status: string
}

type MediaPreview = {
  file: File
  localUrl: string
  type: "image" | "video" | "gif"
}

const MAX_CHARS = 280
const MAX_IMAGES = 4

export function TweetComposer() {
  const [accounts, setAccounts] = useState<AccountItem[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState("")
  const [text, setText] = useState("")
  const [media, setMedia] = useState<MediaPreview[]>([])
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  // Strategy
  const [mode, setMode] = useState<"immediate" | "scheduled">("immediate")
  const [scheduledTime, setScheduledTime] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load active accounts
  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const active = (data.accounts || data || []).filter(
          (a: AccountItem) => a.status === "active" && a.platform === "twitter"
        )
        setAccounts(active)
        if (active.length > 0 && !selectedAccountId) {
          setSelectedAccountId(active[0].id)
        }
      })
      .catch(() => {})
  }, [])

  const charCount = text.length
  const charOverflow = charCount > MAX_CHARS

  const hasVideo = media.some((m) => m.type === "video")
  const canAddMedia = !hasVideo && media.length < MAX_IMAGES

  // ---- Media handling ----

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || [])
      if (!files.length) return

      const newMedia: MediaPreview[] = []
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || ""
        let type: MediaPreview["type"] = "image"
        if (["mp4", "mov", "avi", "webm"].includes(ext)) type = "video"
        else if (ext === "gif") type = "gif"

        if (type === "video" && media.length > 0) continue
        if (type !== "video" && hasVideo) continue
        if (media.length + newMedia.length >= MAX_IMAGES && type !== "video") continue

        newMedia.push({ file, localUrl: URL.createObjectURL(file), type })
        if (type === "video") break
      }

      setMedia((prev) => [...prev, ...newMedia])
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [media, hasVideo]
  )

  const removeMedia = (index: number) => {
    setMedia((prev) => {
      const removed = prev[index]
      if (removed) URL.revokeObjectURL(removed.localUrl)
      return prev.filter((_, i) => i !== index)
    })
  }

  const insertHashtag = () => {
    setText((prev) => (prev.endsWith(" ") || prev === "" ? prev + "#" : prev + " #"))
  }

  // ---- Publish ----

  const handlePublish = async () => {
    if (!selectedAccountId) return
    if (charOverflow) return
    if (!text.trim() && media.length === 0) return

    setPublishing(true)
    setResult(null)

    try {
      // Upload media files first
      const mediaPaths: string[] = []
      for (const m of media) {
        const formData = new FormData()
        formData.append("account_id", selectedAccountId)
        formData.append("file", m.file)
        const uploadRes = await fetch("/api/publish/upload-media", {
          method: "POST",
          body: formData,
        })
        const uploadData = await uploadRes.json()
        if (!uploadData.success) throw new Error(uploadData.error || "媒体上传失败")
        mediaPaths.push(uploadData.local_path)
      }

      if (mode === "immediate") {
        const res = await fetch("/api/publish/tweet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: selectedAccountId,
            text,
            media_paths: mediaPaths.length ? mediaPaths : null,
          }),
        })
        const data = await res.json()
        if (data.success) {
          setResult({ success: true, message: `发布成功: ${data.tweet_url || data.tweet_id}` })
          setText("")
          setMedia([])
        } else {
          setResult({ success: false, message: data.message || data.error || "发布失败" })
        }
      } else {
        // Add to queue as scheduled
        const tweetType = mediaPaths.length
          ? media[0]?.type === "video"
            ? "video"
            : "image"
          : "text"
        const res = await fetch("/api/publish/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: selectedAccountId,
            tweet_type: tweetType,
            content: {
              text,
              media_paths: mediaPaths.length ? mediaPaths : null,
            },
            strategy: {
              type: "scheduled",
              scheduled_time: scheduledTime || null,
            },
          }),
        })
        const data = await res.json()
        if (data.success) {
          setResult({ success: true, message: "已加入发布队列" })
          setText("")
          setMedia([])
          setScheduledTime("")
        } else {
          setResult({ success: false, message: data.error || "加入队列失败" })
        }
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || "未知错误" })
    } finally {
      setPublishing(false)
    }
  }

  const handleAddToQueue = async () => {
    if (!selectedAccountId) return
    if (!text.trim() && media.length === 0) return

    setPublishing(true)
    setResult(null)

    try {
      const mediaPaths: string[] = []
      for (const m of media) {
        const formData = new FormData()
        formData.append("account_id", selectedAccountId)
        formData.append("file", m.file)
        const uploadRes = await fetch("/api/publish/upload-media", {
          method: "POST",
          body: formData,
        })
        const uploadData = await uploadRes.json()
        if (!uploadData.success) throw new Error(uploadData.error || "媒体上传失败")
        mediaPaths.push(uploadData.local_path)
      }

      const tweetType = mediaPaths.length
        ? media[0]?.type === "video"
          ? "video"
          : "image"
        : "text"

      const res = await fetch("/api/publish/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccountId,
          tweet_type: tweetType,
          content: {
            text,
            media_paths: mediaPaths.length ? mediaPaths : null,
          },
          strategy: { type: "immediate" },
        }),
      })
      const data = await res.json()
      if (data.success) {
        setResult({ success: true, message: "已加入发布队列" })
        setText("")
        setMedia([])
      } else {
        setResult({ success: false, message: data.error || "加入队列失败" })
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || "未知错误" })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-5">
      {/* Account selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          发布账号
        </label>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {accounts.length === 0 && <option value="">无可用账号</option>}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              @{a.account}
            </option>
          ))}
        </select>
      </div>

      {/* Text editor */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            推文内容
          </label>
          <span
            className={cn(
              "text-xs tabular-nums",
              charOverflow ? "text-destructive font-medium" : "text-muted-foreground"
            )}
          >
            {charCount}/{MAX_CHARS}
          </span>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="有什么新鲜事？"
          rows={5}
          className={cn(
            "w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground",
            charOverflow && "border-destructive focus:ring-destructive"
          )}
        />
      </div>

      {/* Media previews */}
      {media.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {media.map((m, i) => (
            <div
              key={i}
              className="relative group rounded-lg overflow-hidden border border-input w-24 h-24"
            >
              {m.type === "video" ? (
                <div className="w-full h-full flex items-center justify-center bg-muted">
                  <Video className="size-8 text-muted-foreground" />
                </div>
              ) : (
                <img src={m.localUrl} className="w-full h-full object-cover" alt="" />
              )}
              <button
                onClick={() => removeMedia(i)}
                className="absolute top-1 right-1 size-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="size-3" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white text-center py-0.5">
                {m.type}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/mp4,video/quicktime,.gif"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canAddMedia}
          title={hasVideo ? "已添加视频，不能再添加媒体" : `最多 ${MAX_IMAGES} 张图片或 1 个视频`}
        >
          <Image className="size-3.5" />
          媒体
        </Button>
        <Button variant="outline" size="sm" onClick={insertHashtag}>
          <Hash className="size-3.5" />
          标签
        </Button>
      </div>

      {/* Strategy selector */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 border rounded-md overflow-hidden">
          <button
            onClick={() => setMode("immediate")}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors",
              mode === "immediate"
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            立即发布
          </button>
          <button
            onClick={() => setMode("scheduled")}
            className={cn(
              "px-3 py-1.5 text-xs transition-colors",
              mode === "scheduled"
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Calendar className="size-3 inline mr-1" />
            定时发布
          </button>
        </div>

        {mode === "scheduled" && (
          <Input
            type="datetime-local"
            value={scheduledTime}
            onChange={(e) => setScheduledTime(e.target.value)}
            className="w-auto text-xs"
          />
        )}
      </div>

      {/* Result message */}
      {result && (
        <div
          className={cn(
            "px-3 py-2 rounded-md text-sm",
            result.success
              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-destructive/10 text-destructive border border-destructive/20"
          )}
        >
          {result.success ? <Check className="size-3.5 inline mr-1.5" /> : null}
          {result.message}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button
          onClick={handlePublish}
          disabled={publishing || (!text.trim() && media.length === 0) || !selectedAccountId || charOverflow}
          className="flex-1"
        >
          {publishing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          {mode === "immediate" ? "发布" : "定时发布"}
        </Button>
        <Button
          variant="outline"
          onClick={handleAddToQueue}
          disabled={publishing || (!text.trim() && media.length === 0) || !selectedAccountId}
        >
          <ListPlus className="size-4" />
          加入队列
        </Button>
      </div>
    </div>
  )
}
