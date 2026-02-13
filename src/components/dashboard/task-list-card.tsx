import { Badge } from "@/components/ui/badge"
import type { TaskListItem } from "@/types/task-list"
import {
  IconCalendarEvent,
  IconDots,
} from "@tabler/icons-react"

interface TaskListCardProps {
  task: TaskListItem
}

const priorityColors: Record<string, { bg: string; text: string }> = {
  urgent: {
    bg: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-600 dark:text-red-400",
  },
  medium: {
    bg: "bg-yellow-100 dark:bg-yellow-900/30",
    text: "text-yellow-600 dark:text-yellow-400",
  },
  low: {
    bg: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-600 dark:text-green-400",
  },
}

export function TaskListCard({ task }: TaskListCardProps) {
  const priorityStyle = priorityColors[task.priority] || priorityColors.low

  return (
    <div className="rounded-2xl border border-border/70 bg-background p-4">
      <div className="flex items-start justify-between mb-4">
        <Badge
          className={`${priorityStyle.bg} ${priorityStyle.text} border-0 text-[10px] font-medium capitalize`}
        >
          {task.priority}
        </Badge>
        <IconDots className="size-4 text-muted-foreground cursor-pointer hover:text-foreground" />
      </div>

      <div className="mb-3">
        <h3 className="text-xs font-medium mb-2">{task.title}</h3>
      </div>

      <div className="flex items-center gap-1.5 text-muted-foreground">
        <IconCalendarEvent className="size-4" />
        <span className="text-xs">Due date:</span>
        <span className="text-xs text-foreground">{task.dueDate}</span>
      </div>
    </div>
  )
}
