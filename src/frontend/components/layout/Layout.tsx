import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Header from './Header'
import Sidebar from './Sidebar'
import { cn } from '@/utils'

interface LayoutProps {
  children: React.ReactNode
  currentPath?: string
  user?: {
    name: string
    role: string
    avatar?: string
  }
  onLogout?: () => void
  onNavigate?: (href: string) => void
  darkMode?: boolean
  onToggleTheme?: () => void
}

const PAGE_TITLE_KEYS: Array<[string, string]> = [
  ['/dashboard', 'nav.dashboard'],
  ['/pcr/new', 'nav.newPcr'],
  ['/reports', 'nav.pcrReports'],
  ['/pcr', 'nav.pcrReports'],
  ['/logs', 'nav.activityLogs'],
  ['/admin/users', 'nav.userManagement'],
  ['/profile', 'nav.profile'],
]

function pageTitleFor(path: string, t: (key: string) => string): string {
  const key = PAGE_TITLE_KEYS.find(([prefix]) => path.startsWith(prefix))?.[1]
  return key ? t(key) : t('header.patientCareReport')
}

const Layout: React.FC<LayoutProps> = ({
  children,
  currentPath = '/',
  user,
  onLogout,
  onNavigate,
  darkMode = false,
  onToggleTheme,
}) => {
  const { t } = useTranslation()
  // Same flag drives two different things depending on breakpoint: below lg
  // it's the off-canvas drawer's open/closed state, at lg+ it's the sidebar's
  // pinned-open state (see the comment on `pinned` in Sidebar.tsx).
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const closeSidebar = () => {
    setSidebarOpen(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header - a full-width top bar (hamburger + logo + brand never
            collapse) sitting above the sidebar rail rather than beside it,
            so those stay put regardless of the rail's collapsed/expanded/
            pinned state below. */}
        <Header
          user={user}
          pageTitle={pageTitleFor(currentPath, t)}
          onLogout={onLogout}
          onNavigate={onNavigate}
          onToggleTheme={onToggleTheme}
          onToggleSidebar={toggleSidebar}
          darkMode={darkMode}
          sidebarOpen={sidebarOpen}
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <Sidebar
            isOpen={sidebarOpen}
            currentPath={currentPath}
            onNavigate={onNavigate}
            onClose={closeSidebar}
            user={user}
          />

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default Layout