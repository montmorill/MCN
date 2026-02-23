import { useCallback, useEffect, useMemo, useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Check,
  Image as ImageIcon,
  Video,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { apiFetch, API_BASE } from "@/lib/api"

const MEDIA_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".mp4", ".mov", ".webm", ".avi",
])
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".avi"])

type TreeNode = {
  id: string
  name: string
  is_dir: boolean
  relative_path: string
  children: TreeNode[]
}

type MaterialPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  maxImages: number
  hasVideoAlready: boolean
  onConfirm: (
    files: { relativePath: string; name: string; isVideo: boolean }[]
  ) => void
}

function getExt(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot >= 0 ? name.slice(dot).toLowerCase() : ""
}

function isMediaFile(name: string): boolean {
  return MEDIA_EXTENSIONS.has(getExt(name))
}

function isVideoFile(name: string): boolean {
  return VIDEO_EXTENSIONS.has(getExt(name))
}

function collectMediaFiles(node: TreeNode): TreeNode[] {
  if (!node.is_dir && isMediaFile(node.name)) return [node]
  if (!node.is_dir) return []
  return node.children.flatMap(collectMediaFiles)
}

/* ── Tree item (recursive) ─────────────────────────────────────────── */

function TreeItem({
  node,
  depth,
  selectedFolder,
  onSelectFolder,
}: {
  node: TreeNode
  depth: number
  selectedFolder: string | null
  onSelectFolder: (path: string, node: TreeNode) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)
  const hasDirChildren = node.children.some((c) => c.is_dir)
  const isSelected = selectedFolder === node.relative_path

  if (!node.is_dir) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelectFolder(node.relative_path, node)
          setExpanded(true)
        }}
        className={cn(
          "flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs transition-colors",
          isSelected
            ? "bg-white/[0.10] text-zinc-100"
            : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200"
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {hasDirChildren ? (
          <span
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
          </span>
        ) : (
          <span className="size-3 shrink-0" />
        )}
        {expanded ? (
          <FolderOpen className="size-3.5 shrink-0 text-zinc-500" />
        ) : (
          <Folder className="size-3.5 shrink-0 text-zinc-500" />
        )}
        <span className="truncate">{node.name}</span>
      </button>
      {expanded &&
        node.children
          .filter((c) => c.is_dir)
          .map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedFolder={selectedFolder}
              onSelectFolder={onSelectFolder}
            />
          ))}
    </div>
  )
}

/* ── Main dialog ───────────────────────────────────────────────────── */

export function MaterialPickerDialog({
  open,
  onOpenChange,
  maxImages,
  hasVideoAlready,
  onConfirm,
}: MaterialPickerDialogProps) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [activeFolderNode, setActiveFolderNode] = useState<TreeNode | null>(
    null
  )
  const [selected, setSelected] = useState<Set<string>>(new Set())

  /* fetch tree on open */
  useEffect(() => {
    if (!open) return
    setLoading(true)
    apiFetch<{ roots?: TreeNode[] }>("/api/materials/tree")
      .then((data) => {
        if (data?.roots) setTree(data.roots)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open])

  /* reset on close */
  useEffect(() => {
    if (!open) {
      setSelected(new Set())
      setSelectedFolder(null)
      setActiveFolderNode(null)
    }
  }, [open])

  /* files in the active folder */
  const folderFiles = useMemo(() => {
    if (!activeFolderNode) return []
    return collectMediaFiles(activeFolderNode)
  }, [activeFolderNode])

  const handleSelectFolder = useCallback(
    (path: string, node: TreeNode) => {
      setSelectedFolder(path)
      setActiveFolderNode(node)
    },
    []
  )

  const toggleFile = useCallback(
    (relativePath: string, name: string) => {
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(relativePath)) {
          next.delete(relativePath)
          return next
        }
        // enforce limits
        const isVid = isVideoFile(name)
        if (isVid && (hasVideoAlready || next.size > 0)) return prev
        if (!isVid && hasVideoAlready) return prev
        // check if any already-selected is video
        const hasVidSelected = [...next].some((p) => {
          const ext = getExt(p)
          return VIDEO_EXTENSIONS.has(ext)
        })
        if (hasVidSelected) return prev
        if (isVid) {
          // video replaces all
          return new Set([relativePath])
        }
        if (next.size >= maxImages) return prev
        next.add(relativePath)
        return next
      })
    },
    [hasVideoAlready, maxImages]
  )

  const handleConfirm = () => {
    const files = [...selected].map((rp) => {
      const name = rp.split("/").pop() ?? rp
      return { relativePath: rp, name, isVideo: isVideoFile(name) }
    })
    onConfirm(files)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>素材库</DialogTitle>
          <DialogDescription>
            浏览并选择素材文件（最多 {maxImages} 张图片或 1 个视频）
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0 border-t border-white/[0.08]">
          {/* Left: tree */}
          <div className="w-48 shrink-0 border-r border-white/[0.08] overflow-y-auto py-2 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {loading ? (
              <p className="px-3 py-4 text-xs text-zinc-500">加载中...</p>
            ) : tree.length === 0 ? (
              <p className="px-3 py-4 text-xs text-zinc-500">暂无素材</p>
            ) : (
              tree.map((root) => (
                <TreeItem
                  key={root.id}
                  node={root}
                  depth={0}
                  selectedFolder={selectedFolder}
                  onSelectFolder={handleSelectFolder}
                />
              ))
            )}
          </div>

          {/* Right: file grid */}
          <div className="flex-1 overflow-y-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {!selectedFolder ? (
              <p className="py-8 text-center text-xs text-zinc-500">
                请在左侧选择一个目录
              </p>
            ) : folderFiles.length === 0 ? (
              <p className="py-8 text-center text-xs text-zinc-500">
                该目录下没有媒体文件
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {folderFiles.map((file) => {
                  const isSelected = selected.has(file.relative_path)
                  const isVid = isVideoFile(file.name)
                  const previewUrl = `${API_BASE}/api/materials/preview?path=${encodeURIComponent(file.relative_path)}`

                  return (
                    <button
                      key={file.id}
                      type="button"
                      onClick={() =>
                        toggleFile(file.relative_path, file.name)
                      }
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-lg border transition-all",
                        isSelected
                          ? "border-blue-500 ring-1 ring-blue-500/50"
                          : "border-white/[0.10] hover:border-white/[0.25]"
                      )}
                    >
                      {isVid ? (
                        <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
                          <Video className="size-6 text-zinc-500" />
                        </div>
                      ) : (
                        <img
                          src={previewUrl}
                          alt={file.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      )}
                      {/* file name overlay */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
                        <span className="block truncate text-[10px] text-zinc-300">
                          {file.name}
                        </span>
                      </div>
                      {/* type badge */}
                      <div className="absolute left-1 top-1">
                        {isVid ? (
                          <Video className="size-3 text-zinc-400" />
                        ) : (
                          <ImageIcon className="size-3 text-zinc-400" />
                        )}
                      </div>
                      {/* selection indicator */}
                      {isSelected && (
                        <div className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-blue-500">
                          <Check className="size-2.5 text-white" />
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-white/[0.08] px-5 py-3">
          <span className="mr-auto text-xs text-zinc-500">
            已选 {selected.size} 个文件
          </span>
          <Button
            variant="ghost"
            className="h-8 rounded-full border border-white/[0.12] px-4 hover:bg-white/[0.05]"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            className="h-8 rounded-full bg-white px-4 text-black hover:bg-zinc-200"
            disabled={selected.size === 0}
            onClick={handleConfirm}
          >
            确认选择
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
