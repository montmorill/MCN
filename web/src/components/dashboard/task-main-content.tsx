import { TaskFilterBar } from "@/components/dashboard/task-filter-bar"
import { TaskStatusDrawers } from "@/components/dashboard/task-status-drawers"

export function TaskMainContent() {
  return (
    <div className="flex h-full flex-col">
      <TaskFilterBar />
      <main className="flex-1 overflow-auto">
        <TaskStatusDrawers />
      </main>
    </div>
  )
}
