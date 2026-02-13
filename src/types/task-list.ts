import type { ComponentType, CSSProperties } from "react"

export interface TaskListUser {
  id: string
  name: string
  avatar: string
}

export interface TaskListStatus {
  id: string
  name: string
  color: string
  icon: ComponentType<{ className?: string; style?: CSSProperties }>
}

export interface TaskListItem {
  id: string
  title: string
  project: string
  status: TaskListStatus
  assignees: TaskListUser[]
  priority: "low" | "medium" | "urgent"
  dueDate: string
  comments: number
  attachments: number
}
