import type { CSSProperties } from "react"
import { useMemo, useState } from "react"
import { SidebarProvider } from "@/components/ui/sidebar"
import { WelcomeHeader } from "@/components/dashboard/welcome-header"
import { WeeklySchedule } from "@/components/dashboard/weekly-schedule"
import { TaskColumn } from "@/components/dashboard/task-column"
import { TaskListColumn } from "@/components/dashboard/task-list-column"
import { QuickStart } from "@/components/dashboard/quick-start"
import { CourseContent } from "@/components/dashboard/course-content"
import { AiChatPanel } from "@/components/dashboard/ai-chat-panel"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { currentUser, todayTasks, statuses } from "@/data/mock-data"
import { taskListItems, taskListStatuses } from "@/data/task-list-data.tsx"
import {
  getCourseItemById,
  getDefaultCourseItem,
} from "@/data/course-data"

function App() {
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null)
  const [activeCourseItemId, setActiveCourseItemId] = useState<string | null>(
    null
  )
  const frameTheme = {
    "--sidebar": "oklch(0.205 0 0)",
  } as CSSProperties
  const scheduleVisibleDays = 4
  const scheduleDayWidth = 96
  const taskListStatus = taskListStatuses[0]
  const taskListTasks = taskListItems.filter(
    (task) => task.status.id === taskListStatus.id
  )
  const quickStartItems = [
    "新建课程",
    "新建备考计划",
    "创建临时笔记",
    "随便聊聊",
    "在线解题",
  ]
  const courseViewData = useMemo(() => {
    if (!activeCourseId || !activeCourseItemId) {
      return null
    }
    return getCourseItemById(activeCourseId, activeCourseItemId)
  }, [activeCourseId, activeCourseItemId])

  return (
    <SidebarProvider className="bg-sidebar">
      <DashboardSidebar
        activeCourseId={activeCourseId}
        activeItemId={activeCourseItemId}
        onCourseSelect={(courseId) => {
          setActiveCourseId(courseId)
          const defaultData = getDefaultCourseItem(courseId)
          setActiveCourseItemId(defaultData?.item.id ?? null)
        }}
        onCourseItemSelect={(courseId, __, itemId) => {
          setActiveCourseId(courseId)
          setActiveCourseItemId(itemId)
        }}
        onCourseExit={() => {
          setActiveCourseId(null)
          setActiveCourseItemId(null)
        }}
      />
      {/* Main content wrapper - dashboard-4 style frame container */}
      <div
        className="h-svh overflow-hidden lg:p-2 lg:pl-0 w-full bg-sidebar"
        style={frameTheme}
      >
        <div className="lg:border lg:rounded-xl overflow-hidden flex flex-col h-full w-full bg-background">
          <main className="flex-1 overflow-hidden p-3 sm:p-4 [--main-padding:12px] sm:[--main-padding:16px] [--right-column-width:300px] lg:[--right-column-width:360px]">
            {courseViewData ? (
              <div
                className="grid h-full w-full min-h-0 -mr-3 sm:-mr-4"
                style={{
                  gridTemplateColumns:
                    "minmax(0, 1fr) calc(var(--right-column-width) + var(--main-padding))",
                }}
              >
                <div className="min-h-0 pr-3 sm:pr-4 overflow-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                  <CourseContent
                    course={courseViewData.course}
                    unit={courseViewData.unit}
                    item={courseViewData.item}
                  />
                </div>
                <div className="flex h-full min-h-0 border-l border-zinc-800">
                  <AiChatPanel />
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full min-h-0 gap-3 sm:gap-4">
                {/* 左侧：欢迎语 + 周课表 */}
                <div className="flex flex-col min-w-0 flex-1 min-h-0 gap-4">
                  <WelcomeHeader user={currentUser} />
                  <div
                    className="mt-2 grid items-start gap-3 sm:gap-4"
                    style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}
                  >
                    <div className="h-[360px] sm:h-[420px] justify-self-end">
                      <TaskListColumn
                        status={taskListStatus}
                        tasks={taskListTasks}
                        className="h-full"
                      />
                    </div>
                    <div
                      className="h-[360px] sm:h-[420px]"
                      style={{
                        width: `calc(2.5rem + ${
                          scheduleVisibleDays * scheduleDayWidth
                        }px + 2px)`,
                      }}
                    >
                      <WeeklySchedule />
                    </div>
                  </div>
                  <QuickStart items={quickStartItems} />
                </div>
                {/* 右侧：待办任务 */}
                <div className="flex h-full min-h-0 shrink-0">
                  <TaskColumn status={statuses[0]} tasks={todayTasks} />
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}

export default App
