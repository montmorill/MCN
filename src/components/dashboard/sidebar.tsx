import type { CSSProperties } from "react"
import * as React from "react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  Search,
  BarChart3,
  Layers,
  Calendar,
  FileText,
  Users,
  Building,
  Globe,
  Folder,
  File,
  Megaphone,
  Code,
  Headphones,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Settings,
  UserPlus,
  LogOut,
  PanelLeftIcon,
  BookOpen,
  ChevronLeft,
} from "lucide-react"
import { courses } from "@/data/course-data"

const navItems = [
  { title: "Search", icon: Search, shortcut: "/" },
  { title: "Dashboard", icon: BarChart3, isActive: true },
  { title: "我的课程", icon: BookOpen, id: "my-courses" },
  { title: "Projects", icon: Layers },
  { title: "Calendar", icon: Calendar },
  { title: "Documents", icon: FileText },
  { title: "Teams", icon: Users },
  { title: "Company", icon: Building },
]

type DashboardSidebarProps = React.ComponentProps<typeof Sidebar> & {
  activeCourseId?: string | null
  activeItemId?: string | null
  onCourseSelect?: (courseId: string) => void
  onCourseItemSelect?: (courseId: string, unitId: string, itemId: string) => void
  onCourseExit?: () => void
}

const workgroups = [
  {
    id: "all-work",
    name: "All Work",
    icon: Globe,
    children: [
      {
        id: "website-copy",
        name: "Website Copy",
        icon: Folder,
        children: [
          { id: "client-website", name: "Client website", icon: File },
          { id: "personal-project", name: "Personal project", icon: File },
        ],
      },
      { id: "ux-research", name: "UX Research", icon: Folder },
      { id: "assets-library", name: "Assets Library", icon: Folder },
    ],
  },
  { id: "marketing", name: "Marketing", icon: Megaphone },
  { id: "development", name: "Development", icon: Code },
  { id: "support", name: "Support", icon: Headphones },
]

export function DashboardSidebar({
  activeCourseId,
  activeItemId,
  onCourseSelect,
  onCourseItemSelect,
  onCourseExit,
  ...props
}: DashboardSidebarProps) {
  const { toggleSidebar } = useSidebar()
  const squareTheme = {
    "--background": "oklch(0.145 0 0)",
    "--foreground": "oklch(0.985 0 0)",
    "--card": "oklch(0.205 0 0)",
    "--card-foreground": "oklch(0.985 0 0)",
    "--popover": "oklch(0.205 0 0)",
    "--popover-foreground": "oklch(0.985 0 0)",
    "--primary": "oklch(0.922 0 0)",
    "--primary-foreground": "oklch(0.205 0 0)",
    "--secondary": "oklch(0.269 0 0)",
    "--secondary-foreground": "oklch(0.985 0 0)",
    "--muted": "oklch(0.269 0 0)",
    "--muted-foreground": "oklch(0.708 0 0)",
    "--accent": "oklch(0.269 0 0)",
    "--accent-foreground": "oklch(0.985 0 0)",
    "--border": "oklch(1 0 0 / 10%)",
    "--input": "oklch(1 0 0 / 15%)",
    "--ring": "oklch(0.556 0 0)",
    "--sidebar": "oklch(0.205 0 0)",
    "--sidebar-foreground": "oklch(0.985 0 0)",
    "--sidebar-primary": "oklch(0.488 0.243 264.376)",
    "--sidebar-primary-foreground": "oklch(0.985 0 0)",
    "--sidebar-accent": "oklch(0.269 0 0)",
    "--sidebar-accent-foreground": "oklch(0.985 0 0)",
    "--sidebar-border": "oklch(1 0 0 / 10%)",
    "--sidebar-ring": "oklch(0.556 0 0)",
  } as CSSProperties
  const [expandedItems, setExpandedItems] = React.useState<string[]>([
    "all-work",
    "website-copy",
  ])
  const [view, setView] = React.useState<"main" | "courses" | "course-details">(
    "main"
  )

  const toggleItem = (id: string) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const renderWorkgroupItem = (
    item: (typeof workgroups)[0],
    level: number = 0,
    isSubItem: boolean = false
  ) => {
    const hasChildren = "children" in item && item.children
    const isExpanded = expandedItems.includes(item.id)
    const Icon = item.icon
    const paddingLeft = level * 12
    const Wrapper = isSubItem ? SidebarMenuSubItem : SidebarMenuItem

    if (hasChildren) {
      return (
        <Wrapper key={item.id}>
          <Collapsible
            open={isExpanded}
            onOpenChange={() => toggleItem(item.id)}
          >
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                className="h-7 text-sm"
                style={{ paddingLeft: `${8 + paddingLeft}px` }}
              >
                <Icon className="size-3.5" />
                <span className="flex-1">{item.name}</span>
                {isExpanded ? (
                  <ChevronDown className="size-3" />
                ) : (
                  <ChevronRight className="size-3" />
                )}
              </SidebarMenuButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub className="mr-0 pr-0">
                {item.children?.map((child) =>
                  renderWorkgroupItem(
                    child as (typeof workgroups)[0],
                    level + 1,
                    true
                  )
                )}
              </SidebarMenuSub>
            </CollapsibleContent>
          </Collapsible>
        </Wrapper>
      )
    }

    return (
      <Wrapper key={item.id}>
        <SidebarMenuButton
          className="h-7 text-sm"
          style={{ paddingLeft: `${8 + paddingLeft}px` }}
        >
          <Icon className="size-3.5" />
          <span>{item.name}</span>
        </SidebarMenuButton>
      </Wrapper>
    )
  }

  const selectedCourse =
    courses.find((course) => course.id === activeCourseId) ?? null
  const units = selectedCourse?.units ?? []

  return (
    <Sidebar
      className="lg:border-r-0! dark"
      style={squareTheme}
      collapsible="icon"
      {...props}
    >
      <SidebarHeader className="px-2.5 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-md p-1 -m-1 transition-colors hover:bg-sidebar-accent shrink-0">
              <div className="flex size-7 items-center justify-center rounded-lg bg-foreground text-background shrink-0">
                <span className="text-sm font-bold">L</span>
              </div>
              <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
                <span className="text-sm font-medium">Lemma AI</span>
                <ChevronsUpDown className="size-3 text-muted-foreground ml-auto" />
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem>
              <Settings className="size-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <UserPlus className="size-4" />
              <span>Invite members</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive">
              <LogOut className="size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <SidebarContent className="px-2.5">
        {view === "main" ? (
          <>
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      {item.id === "my-courses" ? (
                        <SidebarMenuButton
                          className="h-7"
                          onClick={() => setView("courses")}
                          isActive={item.isActive}
                        >
                          <item.icon className="size-3.5" />
                          <span className="text-sm">{item.title}</span>
                          <ChevronRight className="ml-auto size-3 opacity-50" />
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          asChild
                          isActive={item.isActive}
                          className="h-7"
                        >
                          <a href="#">
                            <item.icon className="size-3.5" />
                            <span className="text-sm">{item.title}</span>
                            {item.shortcut && (
                              <span className="ml-auto flex size-5 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground">
                                {item.shortcut}
                              </span>
                            )}
                          </a>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="p-0 mt-4">
              <SidebarGroupLabel className="flex h-6 items-center justify-between px-0">
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground">
                  Workgroups
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="size-5">
                    <Search className="size-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-5">
                    <Plus className="size-3" />
                  </Button>
                </div>
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {workgroups.map((item) => renderWorkgroupItem(item))}
                  <SidebarMenuItem>
                    <SidebarMenuButton className="h-7 text-sm text-muted-foreground">
                      <Plus className="size-3.5" />
                      <span>Create Group</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : view === "courses" ? (
          <SidebarGroup className="p-0">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    onCourseExit?.()
                    setView("main")
                  }}
                  className="h-7 mb-2 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="size-3.5" />
                  <span className="text-sm">Back</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <div className="px-2 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              我的课程
            </div>
            <SidebarMenu>
              {courses.map((course) => (
                <SidebarMenuItem key={course.id}>
                  <SidebarMenuButton
                    className="h-7"
                    onClick={() => {
                      setView("course-details")
                      onCourseSelect?.(course.id)
                    }}
                    isActive={activeCourseId === course.id}
                  >
                    <course.icon className="size-3.5" />
                    <span>{course.name}</span>
                    <ChevronRight className="ml-auto size-3 opacity-50" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          <SidebarGroup className="p-0">
            <div className="px-2 mb-3 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 px-2 text-sidebar-foreground">
                {selectedCourse && <selectedCourse.icon className="size-5" />}
                <span className="font-semibold text-base">
                  {selectedCourse?.name ?? "课程"}
                </span>
              </div>
            </div>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setView("courses")
                    onCourseExit?.()
                  }}
                  className="h-7 mb-3 text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="size-3.5" />
                  <span className="text-sm">Back to Courses</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <SidebarMenu>
              {units.map((unit) => (
                <Collapsible
                  key={unit.id}
                  defaultOpen
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton className="h-7 font-medium">
                        <span>{unit.title}</span>
                        <ChevronDown className="ml-auto size-3 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="mr-0 pr-0">
                        {unit.items.map((item) => (
                          <SidebarMenuSubItem key={item.id}>
                            <SidebarMenuSubButton
                              asChild
                              size="md"
                              isActive={activeItemId === item.id}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  selectedCourse &&
                                  onCourseItemSelect?.(
                                    selectedCourse.id,
                                    unit.id,
                                    item.id
                                  )
                                }
                              >
                                <item.icon className="size-3.5" />
                                <span>{item.title}</span>
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="px-2.5 pb-3">
        <div className="group-data-[collapsible=icon]:hidden">
          <div className="group/sidebar relative flex flex-col gap-2 rounded-lg border p-4 text-sm w-full bg-background">
            <div className="text-balance text-lg font-semibold leading-tight group-hover/sidebar:underline">
              Intelligent learning, crafted for focus.
            </div>
            <div className="text-muted-foreground">
              Curated learning paths and daily insights for steady progress.
            </div>
            <Button size="sm" className="w-full">
              Explore Lemma AI
            </Button>
          </div>
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-7 text-sm" onClick={toggleSidebar}>
              <PanelLeftIcon className="size-3.5" />
              <span>Collapse</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
