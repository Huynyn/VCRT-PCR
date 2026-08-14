import React from 'react'
import { LogOut, Moon, Sun, Menu } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { cn } from '@/utils'

interface HeaderProps {
  user?: {
    name: string
    role: string
    avatar?: string
  }
  pageTitle?: string
  onLogout?: () => void
  onToggleTheme?: () => void
  onToggleSidebar?: () => void
  darkMode?: boolean
  sidebarOpen?: boolean
}

const Header: React.FC<HeaderProps> = ({
  user,
  pageTitle,
  onLogout,
  onToggleTheme,
  onToggleSidebar,
  darkMode = false,
  sidebarOpen = true,
}) => {
  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4">
      <div className="h-full flex items-center justify-between">
        {/* Left side */}
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleSidebar}
            className="lg:hidden"
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
          >
            <Menu className="w-5 h-5" />
          </Button>

          <img
            src="./images/vcrt_logo.png"
            alt="PCR logo"
            className="h-8 w-auto object-contain rounded-md lg:hidden"
          />

          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {pageTitle || 'Patient Care Report'}
          </h1>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <Tooltip content={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleTheme}
              className="text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </Tooltip>

          {/* Logout */}
          {user && (
            <>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
              <Tooltip content="Logout">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="text-gray-500 hover:text-burgundy-600 dark:text-gray-400 dark:hover:text-burgundy-400"
                  aria-label="Logout"
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
