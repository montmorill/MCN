import type { CSSProperties } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { Navigate, Route, Routes } from "react-router-dom"
import { MaterialManagementPage } from "@/pages/material-management-page"
import { TaskPublishPage } from "@/pages/task-publish-page"
import { AccountManagementPage } from "@/pages/account-management-page"
import { PublishProxyPoolPage } from "@/pages/publish-proxy-pool-page"
import { MonitorProxyPoolPage } from "@/pages/monitor-proxy-pool-page"

function App() {
  const frameTheme = {
    "--sidebar": "oklch(0 0 0)",
    "--background": "oklch(0.17 0 0)",
  } as CSSProperties

  return (
    <div className="dark min-h-svh bg-background text-foreground">
      <SidebarProvider className="bg-sidebar">
        <DashboardSidebar />

        <div
          className="h-svh overflow-hidden lg:p-2 lg:pl-0 w-full bg-sidebar"
          style={frameTheme}
        >
          <div className="lg:border lg:rounded-lg overflow-hidden flex flex-col h-full w-full bg-background">
            <Routes>
              <Route path="/" element={<Navigate to="/task-publish" replace />} />
              <Route path="/task-publish" element={<TaskPublishPage />} />
              <Route path="/materials" element={<MaterialManagementPage />} />
              <Route path="/accounts" element={<AccountManagementPage />} />
              <Route path="/proxy-pools/publish" element={<PublishProxyPoolPage />} />
              <Route path="/proxy-pools/monitor" element={<MonitorProxyPoolPage />} />
              <Route path="*" element={<Navigate to="/task-publish" replace />} />
            </Routes>
          </div>
        </div>
      </SidebarProvider>
    </div>
  )
}

export default App
