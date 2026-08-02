import React from 'react'
import { LogOut, Settings, User, Moon, Sun, Menu } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { cn } from '@/utils'

interface HeaderProps {
  user?: {
    name: string
    role: string
    avatar?: string
  }
  onLogout?: () => void
  onToggleTheme?: () => void
  onToggleSidebar?: () => void
  darkMode?: boolean
  sidebarOpen?: boolean
}

const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  onToggleTheme,
  onToggleSidebar,
  darkMode = false,
  sidebarOpen = true,
}) => {
  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
      <div className="flex items-center justify-between">
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

          <div className="flex items-center space-x-3">
            <img
              src="./images/vcrt_logo.png"
              alt="PCR logo"
              className="h-8 md:h-10 w-auto object-contain rounded-md"
            />
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Patient Care Report
              </h1>
            </div>
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center space-x-2">
          {/* Theme toggle */}
          <Tooltip content={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleTheme}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </Tooltip>

          {/* User info */}
          {user && (
            <div className="flex items-center space-x-3 ml-4 pl-4 border-l border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{user.role}</p>
                </div>
              </div>

              {/* Logout */}
              <Tooltip content="Logout">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="text-gray-500 hover:text-emergency-600 dark:text-gray-400 dark:hover:text-emergency-400"
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
