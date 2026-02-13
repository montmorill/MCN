import type { CSSProperties } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { TaskListItem, TaskListStatus } from "@/types/task-list"
import { TaskListCard } from "./task-list-card"

interface TaskListColumnProps {
  status: TaskListStatus
  tasks: TaskListItem[]
  className?: string
}

const squareTheme = {
  "--background": "oklch(0.145 0 0)",
  "--foreground": "oklch(0.985 0 0)",
  "--card": "oklch(0.205 0 0)",
  "--card-foreground": "oklch(0.985 0 0)",
  "--popover": "oklch(0.205 0 0)",
  "--popover-foreground": "oklch(0.985 0 0)",
  "--primary": "oklch(0.922 0 0)",
  "--primary-foreground": "oklch(0.205 0 0)",
  "--secondary": "oklch(0.269 0 0)",
  "--secondary-foreground": "oklch(0.985 0 0)",
  "--muted": "oklch(0.269 0 0)",
  "--muted-foreground": "oklch(0.708 0 0)",
  "--accent": "oklch(0.269 0 0)",
  "--accent-foreground": "oklch(0.985 0 0)",
  "--border": "oklch(1 0 0 / 10%)",
  "--input": "oklch(1 0 0 / 15%)",
  "--ring": "oklch(0.556 0 0)",
} as CSSProperties

export function TaskListColumn({ status, tasks, className }: TaskListColumnProps) {
  const StatusIcon = status.icon

  return (
    <div
      className={cn(
        "dark shrink-0 w-[300px] lg:w-[340px] flex flex-col h-full",
        className
      )}
      style={squareTheme}
    >
      <div className="rounded-2xl border border-border/50 p-2 bg-muted/70 dark:bg-muted/50 flex h-full min-h-0 flex-col space-y-2">
        <div className="flex items-center gap-2 justify-between">
          <div
            className="flex items-center gap-2 rounded-full bg-muted px-2.5 py-1.5 text-sm font-medium"
            style={{ backgroundColor: `${status.color}20` }}
          >
            <StatusIcon style={{ color: status.color }} />
            <span className="text-xs font-medium" style={{ color: status.color }}>
              {status.name}
            </span>
          </div>
          <Badge
            variant="secondary"
            className="rounded-full text-xs p-0 size-7 font-medium bg-background"
          >
            {tasks.length}
          </Badge>
        </div>

        {tasks.length > 0 && (
          <div className="space-y-3 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
            {tasks.map((task) => (
              <TaskListCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
