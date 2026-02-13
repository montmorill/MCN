import type { CSSProperties } from "react"
import { TaskCard } from "./task-card"
import type { LearningTask, TaskStatus } from "@/types/task"

interface TaskColumnProps {
  status: TaskStatus
  tasks: LearningTask[]
}

export function TaskColumn({ status, tasks }: TaskColumnProps) {
  const StatusIcon = status.icon
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

  return (
    <div
      className="dark shrink-0 w-[300px] lg:w-[360px] flex h-full min-h-0 flex-col"
      style={squareTheme}
    >
      <div className="rounded-lg border border-border p-3 bg-muted/70 dark:bg-muted/50 flex h-full min-h-0 flex-col">
        <div className="mb-3 flex items-center justify-between rounded-lg">
          <div className="flex items-center gap-2">
            <div className="flex size-4 items-center justify-center">
              <StatusIcon />
            </div>
            <span className="text-sm font-medium">我的课程</span>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      </div>
    </div>
  )
}
