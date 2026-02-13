import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"
import { useRef, useEffect } from "react"
import type { ScheduleEvent } from "@/types/schedule"
import { categoryColors } from "@/types/schedule"
import {
  HOUR_HEIGHT,
  HOURS,
  START_HOUR,
  getEventTop,
  getEventHeight,
  getScheduledDays,
  formatDateKey,
  WEEKDAY_NAMES,
  scheduleEvents,
  getEventsForDate,
} from "@/data/schedule-data"

// 本组件配色（与项目 True Black 保持一致）
const scheduleTheme = {
  "--background": "oklch(0.12 0 0)",
  "--foreground": "oklch(0.98 0 0)",
  "--card": "oklch(0.18 0 0)",
  "--card-foreground": "oklch(0.98 0 0)",
  "--muted": "oklch(0.22 0 0)",
  "--muted-foreground": "oklch(0.7 0 0)",
  "--border": "oklch(1 0 0 / 10%)",
} as CSSProperties

interface ScheduleEventCardProps {
  event: ScheduleEvent
  style: CSSProperties
}

function ScheduleEventCard({ event, style }: ScheduleEventCardProps) {
  const colors = categoryColors[event.category || "other"]
  
  return (
    <div
      className={`absolute left-1 right-1 rounded-md px-2 py-1 z-10 cursor-pointer transition-colors border ${colors.bg} ${colors.border} hover:opacity-80`}
      style={style}
    >
      <div className="flex items-start gap-1.5 h-full overflow-hidden">
        <div className={`size-1.5 rounded-full ${colors.dot} shrink-0 mt-1`} />
        <div className="flex-1 min-w-0 overflow-hidden">
          <h4 className="text-[10px] font-medium text-foreground truncate leading-tight">
            {event.title}
          </h4>
          <p className="text-[9px] text-muted-foreground truncate">
            {event.startTime} - {event.endTime}
          </p>
        </div>
      </div>
    </div>
  )
}

interface DayColumnProps {
  events: ScheduleEvent[]
}

function DayColumn({ events }: DayColumnProps) {
  return (
    <div
      className="flex-1 border-r border-border last:border-r-0 relative min-w-[96px]"
    >
      {/* 时间格子背景 */}
      {HOURS.map((_, i) => (
        <div
          key={i}
          className="border-b border-border"
          style={{ height: `${HOUR_HEIGHT}px` }}
        />
      ))}
      
      {/* 事件卡片 */}
      {events.map((event) => {
        const top = getEventTop(event.startTime)
        const height = getEventHeight(event.startTime, event.endTime)
        
        return (
          <ScheduleEventCard
            key={event.id}
            event={event}
            style={{
              top: `${top + 2}px`,
              height: `${height - 4}px`,
            }}
          />
        )
      })}
    </div>
  )
}

function getCurrentTimePosition(): number {
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const totalMinutes = (hour - START_HOUR) * 60 + minute
  return Math.max(0, Math.round(totalMinutes * (HOUR_HEIGHT / 60)))
}

function CurrentTimeLine() {
  const top = getCurrentTimePosition()
  const now = new Date()
  const timeString = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`

  return (
    <div
      className="absolute left-0 right-0 z-50 flex items-center pointer-events-none -translate-y-1/2"
      style={{ top: `${top}px` }}
    >
      {/* 时间胶囊 - 粘性定位在左侧 */}
      <div className="sticky left-0 z-50 w-10 flex justify-end pr-1.5">
        <div className="bg-red-500 text-white text-[9px] font-medium px-1 py-[1px] rounded-full shadow-sm">
          {timeString}
        </div>
      </div>
      {/* 红线 - 贯穿整个宽度 */}
      <div className="flex-1 h-[1px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.4)]" />
    </div>
  )
}

export function WeeklySchedule() {
  // 日期范围匹配课程覆盖范围
  const today = new Date()
  const weekDays = getScheduledDays(scheduleEvents)
  const todayStr = formatDateKey(today)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({ isDragging: false, startX: 0, scrollLeft: 0 })

  // 初始滚动到当前时间附近
  useEffect(() => {
    if (!scrollContainerRef.current) return
    const now = new Date()
    const currentHour = now.getHours()
    const targetOffset = Math.max(0, (currentHour - START_HOUR - 2) * HOUR_HEIGHT)
    scrollContainerRef.current.scrollTop = targetOffset
    
    // 水平滚动到今天所在列
    const todayIndex = weekDays.findIndex(
      (day) => formatDateKey(day) === todayStr
    )
    const columnWidth = 96
    const index = todayIndex === -1 ? 0 : todayIndex
    scrollContainerRef.current.scrollLeft = Math.max(0, (index - 1) * columnWidth)
  }, [])
  
  // 获取每天的事件
  const eventsByDay: Record<string, ScheduleEvent[]> = {}
  weekDays.forEach((day) => {
    const dayStr = formatDateKey(day)
    eventsByDay[dayStr] = getEventsForDate(dayStr)
  })
  
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return
    const container = scrollContainerRef.current
    if (!container) return
    dragState.current = {
      isDragging: true,
      startX: event.clientX,
      scrollLeft: container.scrollLeft,
    }
    container.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.isDragging) return
    const container = scrollContainerRef.current
    if (!container) return
    const deltaX = event.clientX - dragState.current.startX
    container.scrollLeft = dragState.current.scrollLeft - deltaX
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragState.current.isDragging) return
    dragState.current.isDragging = false
    const container = scrollContainerRef.current
    if (container && container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <div
      className="flex flex-col h-full min-h-0 rounded-lg border border-border bg-card overflow-hidden"
      style={scheduleTheme}
    >
      {/* 可横向拖动的日程网格 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-auto cursor-grab active:cursor-grabbing select-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="min-w-full w-max">
          {/* 星期头部 */}
          <div className="sticky top-0 z-30 flex border-b border-border bg-card">
            <div className="sticky left-0 z-40 w-10 shrink-0 border-r border-border bg-card" />
            {weekDays.map((day) => {
              const dayStr = formatDateKey(day)
              const isToday = dayStr === todayStr
              const dayIndex = day.getDay() === 0 ? 6 : day.getDay() - 1
              return (
                <div
                  key={dayStr}
                  className={`flex-1 min-w-[96px] px-1 py-1.5 text-center border-r border-border last:border-r-0 ${
                    isToday ? "bg-primary/5" : ""
                  }`}
                >
                  <div
                    className={`text-[10px] font-medium ${
                      isToday ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {WEEKDAY_NAMES[dayIndex]}
                  </div>
                  <div
                    className={`text-xs font-semibold ${
                      isToday ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {day.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 时间网格区 */}
          <div className="flex relative">
            <CurrentTimeLine />
            
            {/* 左侧时间列 */}
            <div className="sticky left-0 z-20 w-10 shrink-0 border-r border-border bg-card">
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="border-b border-border px-1 text-[9px] text-muted-foreground"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                >
                  {hour}
                </div>
              ))}
            </div>

            {/* 每日列 */}
            {weekDays.map((day) => {
              const dayStr = formatDateKey(day)
              const dayEvents = eventsByDay[dayStr] || []
              return <DayColumn key={dayStr} events={dayEvents} />
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
