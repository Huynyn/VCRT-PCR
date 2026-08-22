import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Header from './Header'
import Sidebar from './Sidebar'

interface LayoutProps {
  children: React.ReactNode
  currentPath?: string
  user?: {
    name: string
    role: string
    avatar?: string
    viaTempLogin?: boolean
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
  ['/account/temp-login', 'nav.tempLogin'],
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
    // Matches the header/sidebar's own gray-100 (not gray-50) - main's
    // rounded-tl-lg corner clips a small sliver of whatever's behind it
    // down to this wrapper, so it has to match their background exactly or
    // that curve shows an inconsistent color.
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
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

          {/* Main content - the header and sidebar share one gray "back
              panel" background (see their own components) with no border
              between them; this frame is the white "front panel" floating
              on top of it, inset by the header's height and the sidebar's
              width so that back panel's icons still show above and to the
              left of it. A rounded top-left corner (same radius as the
              app's cards) marks where the two frames meet, Gmail-style. */}
          <main className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-800 rounded-tl-lg">
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