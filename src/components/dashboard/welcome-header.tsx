import type { UserProfile } from "@/types/task"

interface WelcomeHeaderProps {
  user: UserProfile
}

export function WelcomeHeader({ user }: WelcomeHeaderProps) {
  return (
    <div className="mt-5 pl-5 space-y-3">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        欢迎回来，{user.name}
      </h1>
      <p className="text-base text-muted-foreground">
        准备好继续你的学习旅程了吗？
      </p>
    </div>
  )
}
