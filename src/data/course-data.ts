import {
  BookOpen,
  Code,
  Headphones,
  FileText,
  File,
  Video,
  HelpCircle,
  StickyNote,
  GraduationCap,
} from "lucide-react"
import type { Course, CourseItem } from "@/types/course"

export const courses: Course[] = [
  {
    id: "math101",
    name: "Linear Algebra",
    icon: BookOpen,
    units: [
      {
        id: "math-u1",
        title: "单元一 · 向量与向量空间",
        items: [
          {
            id: "math-u1-overview",
            title: "概述",
            type: "overview",
            description: "本单元核心概念与学习目标。",
            icon: FileText,
          },
          {
            id: "math-u1-slides",
            title: "幻灯片",
            type: "slides",
            description: "向量基础与几何直觉。",
            icon: File,
          },
          {
            id: "math-u1-video",
            title: "视频",
            type: "video",
            description: "向量空间与线性组合讲解。",
            icon: Video,
          },
          {
            id: "math-u1-quiz",
            title: "小测",
            type: "quiz",
            description: "检验向量运算与空间概念。",
            icon: HelpCircle,
          },
          {
            id: "math-u1-notes",
            title: "笔记",
            type: "notes",
            description: "关键公式与推导摘要。",
            icon: StickyNote,
          },
          {
            id: "math-u1-assignment",
            title: "作业",
            type: "assignment",
            description: "向量与矩阵基础练习。",
            icon: GraduationCap,
          },
        ],
      },
      {
        id: "math-u2",
        title: "单元二 · 矩阵运算",
        items: [
          {
            id: "math-u2-overview",
            title: "概述",
            type: "overview",
            description: "矩阵变换与运算框架。",
            icon: FileText,
          },
          {
            id: "math-u2-slides",
            title: "幻灯片",
            type: "slides",
            description: "矩阵乘法与线性变换。",
            icon: File,
          },
          {
            id: "math-u2-video",
            title: "视频",
            type: "video",
            description: "矩阵运算核心技巧。",
            icon: Video,
          },
          {
            id: "math-u2-quiz",
            title: "小测",
            type: "quiz",
            description: "矩阵运算与性质测验。",
            icon: HelpCircle,
          },
          {
            id: "math-u2-notes",
            title: "笔记",
            type: "notes",
            description: "矩阵运算速记与例题。",
            icon: StickyNote,
          },
        ],
      },
    ],
  },
  {
    id: "cs101",
    name: "Python Basics",
    icon: Code,
    units: [
      {
        id: "cs-u1",
        title: "单元一 · 语言与环境",
        items: [
          {
            id: "cs-u1-overview",
            title: "概述",
            type: "overview",
            description: "课程结构与学习路径。",
            icon: FileText,
          },
          {
            id: "cs-u1-slides",
            title: "幻灯片",
            type: "slides",
            description: "开发环境与基础语法。",
            icon: File,
          },
          {
            id: "cs-u1-video",
            title: "视频",
            type: "video",
            description: "变量、类型与输入输出。",
            icon: Video,
          },
          {
            id: "cs-u1-notes",
            title: "笔记",
            type: "notes",
            description: "常用语法速查表。",
            icon: StickyNote,
          },
        ],
      },
    ],
  },
  {
    id: "eng101",
    name: "English Listening",
    icon: Headphones,
    units: [
      {
        id: "eng-u1",
        title: "单元一 · 听力基础",
        items: [
          {
            id: "eng-u1-overview",
            title: "概述",
            type: "overview",
            description: "听力节奏与语音特征。",
            icon: FileText,
          },
          {
            id: "eng-u1-video",
            title: "视频",
            type: "video",
            description: "真实语速材料训练。",
            icon: Video,
          },
          {
            id: "eng-u1-quiz",
            title: "小测",
            type: "quiz",
            description: "重点语音辨识与理解。",
            icon: HelpCircle,
          },
          {
            id: "eng-u1-notes",
            title: "笔记",
            type: "notes",
            description: "听力策略与关键词。",
            icon: StickyNote,
          },
        ],
      },
    ],
  },
]

export const getCourseById = (courseId: string | null) =>
  courses.find((course) => course.id === courseId) ?? null

export const getDefaultCourseItem = (courseId: string) => {
  const course = getCourseById(courseId)
  const firstUnit = course?.units[0]
  const firstItem = firstUnit?.items[0]
  if (!course || !firstUnit || !firstItem) {
    return null
  }

  return {
    course,
    unit: firstUnit,
    item: firstItem,
  }
}

export const getCourseItemById = (courseId: string, itemId: string) => {
  const course = getCourseById(courseId)
  if (!course) return null

  for (const unit of course.units) {
    const item = unit.items.find((unitItem) => unitItem.id === itemId)
    if (item) {
      return { course, unit, item }
    }
  }

  return null
}

export const getCourseItemLabel = (type: CourseItem["type"]) => {
  switch (type) {
    case "overview":
      return "概述"
    case "slides":
      return "幻灯片"
    case "video":
      return "视频"
    case "quiz":
      return "小测"
    case "notes":
      return "笔记"
    case "assignment":
      return "作业"
    default:
      return "内容"
  }
}
