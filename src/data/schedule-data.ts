import type { ScheduleEvent } from "@/types/schedule"

// 获取当前周的日期数组 (周一到周日)
export function getWeekDays(baseDate: Date = new Date(), length: number = 7): Date[] {
  const day = baseDate.getDay()
  const diff = day === 0 ? -6 : 1 - day // 调整到周一
  const monday = new Date(baseDate)
  monday.setDate(baseDate.getDate() + diff)
  
  return Array.from({ length }, (_, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return date
  })
}

export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

// 中文星期
export const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

// Mock 学习日程数据
const today = new Date()
const weekDays = getWeekDays(today)

export const scheduleEvents: ScheduleEvent[] = [
  // 周一
  {
    id: "1",
    title: "线性代数 - 矩阵运算",
    startTime: "08:00",
    endTime: "09:30",
    date: formatDateKey(weekDays[0]),
    category: "math",
    location: "教室 A101",
  },
  {
    id: "2",
    title: "Python 编程基础",
    startTime: "10:00",
    endTime: "11:30",
    date: formatDateKey(weekDays[0]),
    category: "programming",
  },
  {
    id: "3",
    title: "英语听力训练",
    startTime: "14:00",
    endTime: "15:00",
    date: formatDateKey(weekDays[0]),
    category: "language",
  },
  {
    id: "4",
    title: "每日复习",
    startTime: "20:00",
    endTime: "21:00",
    date: formatDateKey(weekDays[0]),
    category: "review",
  },
  // 周二
  {
    id: "5",
    title: "微积分 - 极限",
    startTime: "09:00",
    endTime: "10:30",
    date: formatDateKey(weekDays[1]),
    category: "math",
  },
  {
    id: "6",
    title: "数据结构",
    startTime: "13:30",
    endTime: "15:00",
    date: formatDateKey(weekDays[1]),
    category: "programming",
  },
  {
    id: "7",
    title: "物理实验",
    startTime: "16:00",
    endTime: "18:00",
    date: formatDateKey(weekDays[1]),
    category: "science",
    location: "实验楼 B203",
  },
  // 周三
  {
    id: "8",
    title: "线性代数 - 向量空间",
    startTime: "08:00",
    endTime: "09:30",
    date: formatDateKey(weekDays[2]),
    category: "math",
  },
  {
    id: "9",
    title: "算法设计",
    startTime: "10:00",
    endTime: "11:30",
    date: formatDateKey(weekDays[2]),
    category: "programming",
  },
  {
    id: "10",
    title: "日语入门",
    startTime: "14:00",
    endTime: "15:30",
    date: formatDateKey(weekDays[2]),
    category: "language",
  },
  // 周四
  {
    id: "11",
    title: "概率论",
    startTime: "09:00",
    endTime: "10:30",
    date: formatDateKey(weekDays[3]),
    category: "math",
  },
  {
    id: "12",
    title: "Web 开发",
    startTime: "13:00",
    endTime: "15:00",
    date: formatDateKey(weekDays[3]),
    category: "programming",
  },
  {
    id: "13",
    title: "化学基础",
    startTime: "15:30",
    endTime: "17:00",
    date: formatDateKey(weekDays[3]),
    category: "science",
  },
  // 周五
  {
    id: "14",
    title: "数学建模",
    startTime: "08:30",
    endTime: "10:00",
    date: formatDateKey(weekDays[4]),
    category: "math",
  },
  {
    id: "15",
    title: "机器学习导论",
    startTime: "14:00",
    endTime: "16:00",
    date: formatDateKey(weekDays[4]),
    category: "programming",
  },
  {
    id: "16",
    title: "周复习总结",
    startTime: "19:00",
    endTime: "21:00",
    date: formatDateKey(weekDays[4]),
    category: "review",
  },
  // 周六
  {
    id: "17",
    title: "英语口语练习",
    startTime: "10:00",
    endTime: "11:30",
    date: formatDateKey(weekDays[5]),
    category: "language",
  },
  {
    id: "18",
    title: "项目实践",
    startTime: "14:00",
    endTime: "17:00",
    date: formatDateKey(weekDays[5]),
    category: "programming",
  },
]

const DAY_MS = 24 * 60 * 60 * 1000

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function getScheduleDateBounds(events: ScheduleEvent[]): {
  start: Date
  end: Date
} {
  if (events.length === 0) {
    const today = new Date()
    return { start: today, end: today }
  }

  let min = parseDateKey(events[0].date)
  let max = parseDateKey(events[0].date)

  events.forEach((event) => {
    const date = parseDateKey(event.date)
    if (date < min) min = date
    if (date > max) max = date
  })

  return { start: min, end: max }
}

export function getDateRangeDays(startDate: Date, endDate: Date): Date[] {
  const start = new Date(startDate)
  const end = new Date(endDate)
  start.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)
  const diffDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS))

  return Array.from({ length: diffDays + 1 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    return date
  })
}

export function getScheduledDays(events: ScheduleEvent[]): Date[] {
  if (events.length === 0) {
    return [new Date()]
  }

  const uniqueKeys = Array.from(new Set(events.map((event) => event.date))).sort()
  return uniqueKeys.map(parseDateKey)
}

// 动态计算时间范围
const times = scheduleEvents.reduce(
  (acc, event) => {
    const start = parseInt(event.startTime.split(":")[0])
    const endParts = event.endTime.split(":")
    const end = parseInt(endParts[0]) + (endParts[1] === "00" ? 0 : 1)
    return {
      min: Math.min(acc.min, start),
      max: Math.max(acc.max, end),
    }
  },
  { min: 24, max: 0 }
)

// 上下各预留1小时缓冲，但不超过0-24范围
export const START_HOUR = Math.max(0, times.min - 1)
export const END_HOUR = Math.min(24, times.max + 1)
export const HOUR_HEIGHT = 48 // 每小时格子高度 (px)

export const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
  const hour = i + START_HOUR
  if (hour === 12) return "12:00"
  if (hour < 12) return `${hour}:00`
  return `${hour}:00`
})

export function getEventTop(startTime: string): number {
  const [hour, minute] = startTime.split(":").map(Number)
  const totalMinutes = (hour - START_HOUR) * 60 + (minute || 0)
  return Math.max(0, Math.round(totalMinutes * (HOUR_HEIGHT / 60)))
}

export function getEventHeight(startTime: string, endTime: string): number {
  const [startHour, startMin] = startTime.split(":").map(Number)
  const [endHour, endMin] = endTime.split(":").map(Number)
  const startTotal = startHour * 60 + (startMin || 0)
  const endTotal = endHour * 60 + (endMin || 0)
  const duration = endTotal - startTotal
  return Math.max(20, Math.round((duration / 60) * HOUR_HEIGHT))
}

export function getEventsForDate(date: string): ScheduleEvent[] {
  return scheduleEvents.filter((event) => event.date === date)
}
