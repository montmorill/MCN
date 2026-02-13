import { IconCircleDot } from "@tabler/icons-react"
import type { TaskListItem, TaskListStatus, TaskListUser } from "@/types/task-list"

const TodoIcon: TaskListStatus["icon"] = ({ className, style }) => (
  <IconCircleDot className={className} style={style} size={16} />
)

export const taskListStatuses: TaskListStatus[] = [
  {
    id: "todo",
    name: "Todo",
    color: "#3b82f6",
    icon: TodoIcon,
  },
]

export const taskListUsers: TaskListUser[] = [
  {
    id: "1",
    name: "Leonel Ngoya",
    avatar: "https://api.dicebear.com/9.x/glass/svg?seed=john",
  },
  {
    id: "2",
    name: "LN",
    avatar: "https://api.dicebear.com/9.x/glass/svg?seed=sarah",
  },
  {
    id: "3",
    name: "Mike Chen",
    avatar: "https://api.dicebear.com/9.x/glass/svg?seed=mike",
  },
]

export const taskListItems: TaskListItem[] = [
  {
    id: "1",
    title: "Follow up with Rajesh Kumar",
    project: "TechCorp Upgrade",
    status: taskListStatuses[0],
    assignees: [taskListUsers[0], taskListUsers[1]],
    priority: "urgent",
    dueDate: "Jan 14, 25",
    comments: 21,
    attachments: 12,
  },
  {
    id: "2",
    title: "Send Proposal to Bytebase",
    project: "Bytebase",
    status: taskListStatuses[0],
    assignees: [taskListUsers[0], taskListUsers[1]],
    priority: "medium",
    dueDate: "Jan 14, 25",
    comments: 21,
    attachments: 12,
  },
  {
    id: "3",
    title: "Prepare quarterly report",
    project: "TechCorp Upgrade",
    status: taskListStatuses[0],
    assignees: [taskListUsers[2]],
    priority: "low",
    dueDate: "Jan 18, 25",
    comments: 8,
    attachments: 5,
  },
]
