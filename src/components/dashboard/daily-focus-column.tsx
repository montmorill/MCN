import { WelcomeHeader } from "./welcome-header"
import type { UserProfile } from "@/types/task"

interface DailyFocusColumnProps {
  user: UserProfile
}

export function DailyFocusColumn({ user }: DailyFocusColumnProps) {
  return (
    <div className="flex flex-col gap-7 w-full max-w-2xl">
      <WelcomeHeader user={user} />
    </div>
  )
}
