import React from 'react'
import { useTranslation } from 'react-i18next'
import { LogOut, Moon, Sun, Menu } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { cn } from '@/utils'
import NotificationBell from './NotificationBell'
import LanguageToggle from './LanguageToggle'

interface HeaderProps {
  user?: {
    name: string
    role: string
    avatar?: string
  }
  pageTitle?: string
  onLogout?: () => void
  onNavigate?: (href: string) => void
  onToggleTheme?: () => void
  onToggleSidebar?: () => void
  darkMode?: boolean
  sidebarOpen?: boolean
}

const Header: React.FC<HeaderProps> = ({
  user,
  pageTitle,
  onLogout,
  onNavigate,
  onToggleTheme,
  onToggleSidebar,
  darkMode = false,
  sidebarOpen = true,
}) => {
  const { t } = useTranslation()

  return (
    <header className="h-16 shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4">
      <div className="h-full flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center space-x-4">
          {/* Hamburger + logo + brand - fixed to the sidebar's pinned-open
              width (w-72, minus this header's own px-4 left padding) once
              the sidebar is open, so the title pill right after it lines up
              with the sidebar's right edge instead of trailing wherever
              this content's natural width happens to end. */}
          <div className={cn('flex items-center gap-4 shrink-0', sidebarOpen && 'lg:w-[256px]')}>
            <Tooltip content={sidebarOpen ? t('header.collapseSidebar') : t('header.expandSidebar')}>
              <Button
                variant="icon"
                onClick={onToggleSidebar}
                className="hover:text-primary-600 dark:hover:text-primary-400"
                aria-label={sidebarOpen ? t('header.collapseSidebar') : t('header.expandSidebar')}
              >
                <Menu className="w-5 h-5" />
              </Button>
            </Tooltip>

            <img
              src="./images/vcrt_logo.png"
              alt={t('common.logoAlt')}
              className="h-8 w-auto object-contain rounded-md shrink-0"
            />

            <span className="text-sm font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap shrink-0">
              VCRT <span className="font-medium">|</span> ÉBIC
            </span>
          </div>

          {/* Fixed width so the pill doesn't grow/shrink as the page title
              changes between routes - wide enough for the longest title in
              either language ("Rapport de soins préhospitaliers"). */}
          <div className="w-80 h-10 shrink-0 flex items-center justify-center rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 px-4">
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
              {pageTitle || t('header.patientCareReport')}
            </h1>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <LanguageToggle />

          {/* Theme toggle */}
          <Tooltip content={darkMode ? t('header.switchToLight') : t('header.switchToDark')}>
            <Button
              variant="icon"
              onClick={onToggleTheme}
              className="hover:text-primary-600 dark:hover:text-primary-400"
              aria-label={darkMode ? t('header.switchToLight') : t('header.switchToDark')}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </Tooltip>

          {/* Notifications */}
          {user && <NotificationBell user={user} onNavigate={onNavigate} />}

          {/* Logout */}
          {user && (
            <>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
              <Tooltip content={t('header.logout')}>
                <Button
                  variant="icon"
                  onClick={onLogout}
                  className="hover:text-burgundy-600 dark:hover:text-burgundy-400"
                  aria-label={t('header.logout')}
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
