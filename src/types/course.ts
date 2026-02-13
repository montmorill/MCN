import type { LucideIcon } from "lucide-react"

export type CourseItemType =
  | "overview"
  | "slides"
  | "video"
  | "quiz"
  | "notes"
  | "assignment"

export interface CourseItem {
  id: string
  title: string
  type: CourseItemType
  description: string
  icon: LucideIcon
}

export interface CourseUnit {
  id: string
  title: string
  items: CourseItem[]
}

export interface Course {
  id: string
  name: string
  icon: LucideIcon
  units: CourseUnit[]
}
