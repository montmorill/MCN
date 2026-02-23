import { PublishTaskFilterBar } from "@/components/dashboard/publish-task-filter-bar"
import { PublishTaskStatusDrawers } from "@/components/dashboard/publish-task-status-drawers"

export function PublishTaskMainContent() {
  return (
    <div className="flex h-full flex-col">
      <PublishTaskFilterBar />
      <main className="flex-1 overflow-auto">
        <PublishTaskStatusDrawers />
      </main>
    </div>
  )
}
