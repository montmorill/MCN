// 学习日程类型定义
export interface ScheduleEvent {
  id: string
  title: string
  startTime: string // "HH:mm" format
  endTime: string
  date: string // "YYYY-MM-DD" format
  category?: "math" | "programming" | "language" | "science" | "review" | "other"
  location?: string
}

// 分类颜色映射
export const categoryColors: Record<string, { bg: string; border: string; dot: string }> = {
  math: { bg: "bg-blue-500/10", border: "border-blue-500/30", dot: "bg-blue-500" },
  programming: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", dot: "bg-emerald-500" },
  language: { bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-500" },
  science: { bg: "bg-purple-500/10", border: "border-purple-500/30", dot: "bg-purple-500" },
  review: { bg: "bg-rose-500/10", border: "border-rose-500/30", dot: "bg-rose-500" },
  other: { bg: "bg-zinc-500/10", border: "border-zinc-500/30", dot: "bg-zinc-500" },
}
