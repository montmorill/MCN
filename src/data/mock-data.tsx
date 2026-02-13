import type { LearningTask, TaskLabel, TaskStatus, TaskUser, UserProfile } from "@/types/task"

// Status Icons (SVG components matching Square UI)
const ToDoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle
      cx="7"
      cy="7"
      r="6"
      fill="none"
      stroke="#53565A"
      strokeWidth="2"
      strokeDasharray="3.14 0"
      strokeDashoffset="-0.7"
    />
    <circle
      className="progress"
      cx="7"
      cy="7"
      r="2"
      fill="none"
      stroke="#53565A"
      strokeWidth="4"
      strokeDasharray="0 100"
      strokeDashoffset="0"
      transform="rotate(-90 7 7)"
    />
  </svg>
)

const InProgressIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle
      cx="7"
      cy="7"
      r="6"
      fill="none"
      stroke="#facc15"
      strokeWidth="2"
      strokeDasharray="3.14 0"
      strokeDashoffset="-0.7"
    />
    <circle
      className="progress"
      cx="7"
      cy="7"
      r="2"
      fill="none"
      stroke="#facc15"
      strokeWidth="4"
      strokeDasharray="2.0839231268812295 100"
      strokeDashoffset="0"
      transform="rotate(-90 7 7)"
    />
  </svg>
)

// Statuses
export const statuses: TaskStatus[] = [
  { id: "to-do", name: "Todo", color: "#53565A", icon: ToDoIcon },
  { id: "in-progress", name: "In Progress", color: "#facc15", icon: InProgressIcon },
]

// Labels
export const labels: TaskLabel[] = [
  {
    id: "design",
    name: "Design",
    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-400",
  },
  {
    id: "marketing",
    name: "Marketing",
    color: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
  },
  {
    id: "product",
    name: "Product",
    color: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-400",
  },
  {
    id: "new-releases",
    name: "New releases",
    color:
      "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
  },
  {
    id: "new-features",
    name: "New features",
    color:
      "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400",
  },
]

// Users
export const users: TaskUser[] = [
  { id: "1", name: "Saki", avatar: "https://api.dicebear.com/9.x/glass/svg?seed=Saki" },
  { id: "2", name: "AI Tutor", avatar: "https://api.dicebear.com/9.x/glass/svg?seed=AITutor" },
]

// Today's Learning Tasks
export const todayTasks: LearningTask[] = [
  {
    id: "1",
    title: "Linear algebra fundamentals",
    description: "Complete matrix operations and vector spaces module",
    status: statuses[1],
    assignees: [users[0], users[1]],
    labels: [labels[0], labels[3]],
    date: "今天",
    comments: 4,
    attachments: 2,
    links: 3,
    progress: { completed: 2, total: 5 },
    priority: "urgent",
  },
  {
    id: "2",
    title: "Design system update",
    description: "Refine typography scale and spacing guidelines",
    status: statuses[0],
    assignees: [users[0]],
    labels: [labels[0], labels[4]],
    date: "今天",
    comments: 2,
    attachments: 5,
    links: 0,
    progress: { completed: 1, total: 4 },
    priority: "high",
  },
  {
    id: "3",
    title: "Retention rate by 23%",
    description: "Launch lifecycle experiment for returning learners",
    status: statuses[0],
    assignees: [users[1]],
    labels: [labels[1], labels[2]],
    date: "今天",
    comments: 0,
    attachments: 0,
    links: 2,
    progress: { completed: 0, total: 4 },
    priority: "medium",
  },
  {
    id: "4",
    title: "Icon system",
    description: "Develop scalable icons for cohesive platform visuals",
    status: statuses[0],
    assignees: [users[0], users[1]],
    labels: [labels[0]],
    date: "今天",
    comments: 8,
    attachments: 0,
    links: 5,
    progress: { completed: 1, total: 4 },
    priority: "high",
  },
  {
    id: "5",
    title: "AI tutor session",
    description: "Schedule guided practice and reflection session",
    status: statuses[0],
    assignees: [users[1]],
    labels: [labels[2], labels[3]],
    date: "今天",
    comments: 3,
    attachments: 1,
    links: 12,
    progress: { completed: 4, total: 4 },
    priority: "no-priority",
  },
]

export const currentUser: UserProfile = {
  name: "Saki",
  streak: 7,
  todayGoal: 3,
  todayCompleted: 1,
}
