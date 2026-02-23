import { useEffect, useMemo, useState } from "react"
import {
  FolderOpen,
  Hash,
  Image,
  MessageSquare,
  Video,
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
import { MaterialPickerDialog } from "./dashboard/material-picker-dialog"
import { cn } from "@/lib/utils"

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000"

type PublishMode = "single-tweet" | null

type AccountRecord = {
  id: string
  account: string
  platform: string
  status: string
}

type MediaEntry = {
  _id: string
  file: File | null
  localPath: string | null
  uploading: boolean
  preview: string
}

type CreatePublishTaskDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate?: (payload: {
    publishMode: "single-tweet"
    accountId: string
    text: string
    mediaPaths: string[]
    isSensitive: boolean
    strategyType: "immediate" | "scheduled"
    scheduledTime: string | null
    title: string
    description: string
  }) => void | Promise<void>
}

export function CreatePublishTaskDialog({
  open,
  onOpenChange,
  onCreate,
}: CreatePublishTaskDialogProps) {
  const [publishMode, setPublishMode] = useState<PublishMode>(null)
  const [accounts, setAccounts] = useState<AccountRecord[]>([])
  const [selectedAccount, setSelectedAccount] = useState("")
  const [tweetText, setTweetText] = useState("")
  const [mediaFiles, setMediaFiles] = useState<MediaEntry[]>([])
  const [strategyType, setStrategyType] = useState<"immediate" | "scheduled">(
    "immediate"
  )
  const [scheduledTime, setScheduledTime] = useState("")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch(`${API_BASE}/api/accounts?platform=twitter&pool=publish`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.success && Array.isArray(data.accounts)) {
          setAccounts(
            data.accounts.filter(
              (a: AccountRecord) => a.status === "active"
            )
          )
        }
      })
      .catch(() => {})
  }, [open])

  const charCount = tweetText.length
  const charOver = charCount > 280

  const hasVideo = mediaFiles.some((m) => {
    if (m.file) {
      const ext = m.file.name.split(".").pop()?.toLowerCase() ?? ""
      return ["mp4", "mov", "avi", "webm"].includes(ext)
    }
    // material-library entry: check preview URL or localPath
    const path = m.localPath ?? m.preview ?? ""
    const ext = path.split(".").pop()?.toLowerCase() ?? ""
    return ["mp4", "mov", "avi", "webm"].includes(ext)
  })

  const canAddMedia = mediaFiles.length < (hasVideo ? 1 : 4) && !hasVideo

  const defaultMeta = useMemo(() => {
    const mediaLabel =
      mediaFiles.length > 0
        ? hasVideo
          ? "视频"
          : "图片"
        : "文本"
    return {
      title: `发布推文 — ${mediaLabel}`,
      description: "执行 Twitter 推文发布。",
    }
  }, [mediaFiles, hasVideo])

  const canCreate = useMemo(() => {
    if (!publishMode) return false
    if (!selectedAccount) return false
    if (!tweetText.trim() && mediaFiles.length === 0) return false
    if (charOver) return false
    if (strategyType === "scheduled" && !scheduledTime) return false
    if (mediaFiles.some((m) => m.uploading)) return false
    return true
  }, [
    publishMode,
    selectedAccount,
    tweetText,
    mediaFiles,
    charOver,
    strategyType,
    scheduledTime,
  ])

  const handleClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setPublishMode(null)
      setSelectedAccount("")
      setTweetText("")
      setMediaFiles([])
      setStrategyType("immediate")
      setScheduledTime("")
      setTaskTitle("")
      setTaskDescription("")
      setErrorMessage(null)
      setIsSubmitting(false)
    }
  }

  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      const id = crypto.randomUUID()
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : ""
      const entry: MediaEntry = {
        _id: id,
        file,
        localPath: null,
        uploading: true,
        preview,
      }
      setMediaFiles((prev) => [...prev, entry])

      try {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch(`${API_BASE}/api/media/upload`, {
          method: "POST",
          body: formData,
        })
        const data = await res.json()
        if (data?.success) {
          setMediaFiles((prev) =>
            prev.map((m) =>
              m._id === id
                ? { ...m, localPath: data.local_path, uploading: false }
                : m
            )
          )
        } else {
          setMediaFiles((prev) =>
            prev.map((m) =>
              m._id === id ? { ...m, uploading: false } : m
            )
          )
        }
      } catch {
        setMediaFiles((prev) =>
          prev.map((m) =>
            m._id === id ? { ...m, uploading: false } : m
          )
        )
      }
    }
  }

  const removeMedia = (index: number) => {
    setMediaFiles((prev) => {
      const entry = prev[index]
      if (entry?.preview) URL.revokeObjectURL(entry.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  const insertHashtag = () => {
    setTweetText((prev) => (prev.endsWith(" ") ? prev + "#" : prev + " #"))
  }

  const handleMaterialConfirm = async (
    files: { relativePath: string; name: string; isVideo: boolean }[]
  ) => {
    for (const f of files) {
      const id = crypto.randomUUID()
      const previewUrl = `${API_BASE}/api/materials/preview?path=${encodeURIComponent(f.relativePath)}`
      const entry: MediaEntry = {
        _id: id,
        file: null,
        localPath: null,
        uploading: true,
        preview: f.isVideo ? "" : previewUrl,
      }
      setMediaFiles((prev) => [...prev, entry])

      try {
        const res = await fetch(`${API_BASE}/api/materials/resolve-path`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ relative_path: f.relativePath }),
        })
        const data = await res.json()
        if (data?.success) {
          setMediaFiles((prev) =>
            prev.map((m) =>
              m._id === id
                ? { ...m, localPath: data.local_path, uploading: false }
                : m
            )
          )
        } else {
          setMediaFiles((prev) => prev.filter((m) => m._id !== id))
        }
      } catch {
        setMediaFiles((prev) => prev.filter((m) => m._id !== id))
      }
    }
  }

  const handleCreate = async () => {
    if (!canCreate || !publishMode) return
    const title = taskTitle.trim() || defaultMeta.title
    const description = taskDescription.trim() || defaultMeta.description
    const mediaPaths = mediaFiles
      .map((m) => m.localPath)
      .filter((p): p is string => Boolean(p))

    try {
      setIsSubmitting(true)
      setErrorMessage(null)
      await onCreate?.({
        publishMode,
        accountId: selectedAccount,
        text: tweetText,
        mediaPaths,
        isSensitive: false,
        strategyType,
        scheduledTime: strategyType === "scheduled" ? scheduledTime : null,
        title,
        description,
      })
      handleClose(false)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "创建任务失败"
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DialogHeader>
          <DialogTitle>创建发布任务</DialogTitle>
          <DialogDescription>
            配置推文内容和发布策略，创建后任务将自动执行。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-5">
          {/* Step 1: 发布模式 */}
          <div>
            <p className="mb-2 text-xs tracking-[0.12em] uppercase text-zinc-500">
              发布模式
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPublishMode("single-tweet")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                  publishMode === "single-tweet"
                    ? "border-white/30 bg-white/[0.10] text-zinc-100"
                    : "border-white/[0.12] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                )}
              >
                <MessageSquare className="size-3.5 shrink-0" />
                <span>单条推文</span>
              </button>
            </div>
          </div>

          {/* Step 2: 发布账号 */}
          {publishMode && (
            <div>
              <p className="mb-2 text-xs tracking-[0.12em] uppercase text-zinc-500">
                发布账号
              </p>
              {accounts.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  暂无可用账号（需要状态为 active 的 Twitter 账号）
                </p>
              ) : (
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  className="h-9 w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
                >
                  <option value="">请选择账号</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.account}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Step 3: 推文内容 */}
          {publishMode && selectedAccount && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs tracking-[0.12em] uppercase text-zinc-500">
                  推文内容
                </p>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    charOver ? "text-red-400" : "text-zinc-500"
                  )}
                >
                  {charCount}/280
                </span>
              </div>
              <textarea
                value={tweetText}
                onChange={(e) => setTweetText(e.target.value)}
                placeholder="有什么新鲜事？"
                rows={4}
                className="w-full resize-none rounded-lg border border-white/[0.12] bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
              />

              {/* Toolbar */}
              <div className="mt-2 flex items-center gap-2">
                <label
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-white/[0.12] px-2.5 text-xs transition-colors hover:bg-white/[0.05]",
                    canAddMedia
                      ? "text-zinc-400 hover:text-zinc-200"
                      : "cursor-not-allowed text-zinc-600 opacity-60"
                  )}
                >
                  <Image className="size-3.5" />
                  <span>图片/视频</span>
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple={!hasVideo}
                    className="hidden"
                    disabled={!canAddMedia}
                    onChange={(e) => handleFileSelect(e.target.files)}
                  />
                </label>
                <button
                  type="button"
                  onClick={insertHashtag}
                  className="inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.12] px-2.5 text-xs text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-zinc-200"
                >
                  <Hash className="size-3.5" />
                  <span>话题</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMaterialPickerOpen(true)}
                  disabled={!canAddMedia}
                  className={cn(
                    "inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.12] px-2.5 text-xs transition-colors hover:bg-white/[0.05]",
                    canAddMedia
                      ? "text-zinc-400 hover:text-zinc-200"
                      : "cursor-not-allowed text-zinc-600 opacity-60"
                  )}
                >
                  <FolderOpen className="size-3.5" />
                  <span>素材库</span>
                </button>
              </div>

              {/* Media previews */}
              {mediaFiles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {mediaFiles.map((entry, i) => (
                    <div
                      key={`media-${i}`}
                      className="group relative h-16 w-16 overflow-hidden rounded-lg border border-white/[0.12] bg-white/[0.03]"
                    >
                      {entry.preview ? (
                        <img
                          src={entry.preview}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Video className="size-5 text-zinc-500" />
                        </div>
                      )}
                      {entry.uploading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                          <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMedia(i)}
                        className="absolute right-0.5 top-0.5 hidden size-5 items-center justify-center rounded-full bg-black/70 text-white group-hover:flex"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 4: 发布策略 */}
          {publishMode && selectedAccount && (
            <div>
              <p className="mb-2 text-xs tracking-[0.12em] uppercase text-zinc-500">
                发布策略
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setStrategyType("immediate")}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                    strategyType === "immediate"
                      ? "border-white/30 bg-white/[0.10] text-zinc-100"
                      : "border-white/[0.12] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                  )}
                >
                  <span>立即发布</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStrategyType("scheduled")}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors",
                    strategyType === "scheduled"
                      ? "border-white/30 bg-white/[0.10] text-zinc-100"
                      : "border-white/[0.12] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
                  )}
                >
                  <span>定时发布</span>
                </button>
              </div>
              {strategyType === "scheduled" && (
                <input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="mt-2 h-9 w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
                />
              )}
            </div>
          )}

          {/* Step 5: 任务信息 */}
          {publishMode && selectedAccount && (
            <div>
              <p className="mb-2 text-xs tracking-[0.12em] uppercase text-zinc-500">
                任务信息
              </p>
              <div className="space-y-2">
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={`任务标题（留空默认：${defaultMeta.title}）`}
                  className="h-9 w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
                />
                <input
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder={`任务描述（留空默认：${defaultMeta.description}）`}
                  className="h-9 w-full rounded-full border border-white/[0.12] bg-white/[0.03] px-4 text-[13px] text-zinc-200 placeholder:text-zinc-500 outline-none transition-colors focus:border-white/[0.22] focus:bg-white/[0.06]"
                />
              </div>
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="mt-3 rounded-md border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {errorMessage}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            className="h-8 rounded-full border border-white/[0.12] px-4 hover:bg-white/[0.05]"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            取消
          </Button>
          <Button
            className="h-8 rounded-full bg-white px-4 text-black hover:bg-zinc-200"
            onClick={handleCreate}
            disabled={!canCreate || isSubmitting}
          >
            {isSubmitting ? "处理中..." : "创建任务"}
          </Button>
        </DialogFooter>
      </DialogContent>
      <MaterialPickerDialog
        open={materialPickerOpen}
        onOpenChange={setMaterialPickerOpen}
        maxImages={4 - mediaFiles.length}
        hasVideoAlready={hasVideo}
        onConfirm={handleMaterialConfirm}
      />
    </Dialog>
  )
}
