import { Button } from "@/components/ui/button"
import {
  BookOpen,
  Calendar,
  FileText,
  MessageCircle,
  Code,
} from "lucide-react"

interface QuickStartProps {
  items: string[]
}

const iconMap: Record<string, typeof BookOpen> = {
  新建课程: BookOpen,
  新建备考计划: Calendar,
  创建临时笔记: FileText,
  随便聊聊: MessageCircle,
  在线解题: Code,
}

const blueItems = ["新建课程", "新建备考计划"]

export function QuickStart({ items }: QuickStartProps) {
  return (
    <section className="pl-5 pr-2 mt-4">
      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          快速开始
        </h2>
        <p className="text-base text-muted-foreground">
          选择功能快速开始你的学习
        </p>
      </div>
      <div className="mt-5 flex flex-wrap gap-2.5">
        {items.map((item) => {
          const Icon = iconMap[item]
          const isBlue = blueItems.includes(item)
          
          return (
            <Button
              key={item}
              variant="secondary"
              className={`h-10 rounded-full border px-4 text-sm font-medium gap-2 ${
                isBlue
                  ? "border-blue-500/30 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                  : "border-border/40 bg-zinc-800/60 text-foreground hover:bg-zinc-800/80"
              }`}
            >
              {Icon && <Icon className="size-4" />}
              {item}
            </Button>
          )
        })}
      </div>
    </section>
  )
}
