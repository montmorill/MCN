import { useState } from "react"
import { cn } from "@/lib/utils"
import { TweetComposer } from "@/components/dashboard/tweet-composer"
import { PublishQueue } from "@/components/dashboard/publish-queue"
import { PublishHistory } from "@/components/dashboard/publish-history"

const tabs = [
  { id: "compose" as const, label: "发布推文" },
  { id: "queue" as const, label: "发布队列" },
  { id: "history" as const, label: "发布历史" },
]

type TabId = (typeof tabs)[number]["id"]

export function PublishMainContent() {
  const [activeTab, setActiveTab] = useState<TabId>("compose")

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b px-6 py-2 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-1.5 text-sm rounded-md transition-colors",
              activeTab === tab.id
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <main className="flex-1 overflow-auto">
        {activeTab === "compose" && <TweetComposer />}
        {activeTab === "queue" && <PublishQueue />}
        {activeTab === "history" && <PublishHistory />}
      </main>
    </div>
  )
}
