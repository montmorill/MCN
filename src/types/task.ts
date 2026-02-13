import type { FC } from "react"

export interface TaskLabel {
  id: string
  name: string
  color: string
}

export interface TaskUser {
  id: string
  name: string
  avatar: string
}

export interface TaskStatus {
  id: string
  name: string
  color: string
  icon: FC
}

export interface LearningTask {
  id: string
  title: string
  description: string
  status: TaskStatus
  assignees: TaskUser[]
  labels: TaskLabel[]
  date?: string
  comments: number
  attachments: number
  links: number
  progress: {
    completed: number
    total: number
  }
  priority: "low" | "medium" | "high" | "urgent" | "no-priority"
}

export interface UserProfile {
  name: string
  streak: number
  todayGoal: number
  todayCompleted: number
}
