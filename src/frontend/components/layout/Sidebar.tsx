import React from 'react'
import { FileText, Users, History, Settings, Home, Printer, Plus, Search } from 'lucide-react'
import { cn } from '@/utils'

interface SidebarItem {
  id: string
  label: string
  icon: React.ReactNode
  href: string
  badge?: string | number
  isActive?: boolean
}

interface SidebarProps {
  isOpen?: boolean
  currentPath?: string
  onNavigate?: (href: string) => void
  onClose?: () => void
  user?: {
    name: string
    role: string
  }
}

// Defined at module scope (not inside Sidebar) so its component identity is
// stable across renders — otherwise React would unmount/remount these
// buttons on every Sidebar re-render, sometimes swallowing the click that
// triggered the re-render in the first place.
const SidebarItemComponent: React.FC<{ item: SidebarItem; onClick: (href: string) => void }> = ({
  item,
  onClick,
}) => (
  <button
    onClick={() => onClick(item.href)}
    className={cn(
      'w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200',
      'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800',
      item.isActive
        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100',
    )}
  >
    <span className="mr-3 flex-shrink-0">{item.icon}</span>
    <span className="flex-1 text-left">{item.label}</span>
    {item.badge && (
      <span
        className={cn(
          'inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none rounded-full',
          item.isActive
            ? 'bg-primary-600 text-white'
            : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-200',
        )}
      >
        {item.badge}
      </span>
    )}
  </button>
)

const Sidebar: React.FC<SidebarProps> = ({
  isOpen = true,
  currentPath = '/',
  onNavigate,
  onClose,
  user,
}) => {
  const isAdmin = user?.role === 'admin'

  const navigationItems: SidebarItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <Home className="w-5 h-5" />,
      href: '/dashboard',
      isActive: currentPath === '/dashboard',
    },
    // Admins only manage/review existing PCRs - they don't submit their own,
    // so there's no need for a "New PCR" entry point in their sidebar.
    ...(isAdmin
      ? []
      : [
          {
            id: 'new-pcr',
            label: 'New PCR',
            icon: <Plus className="w-5 h-5" />,
            href: '/pcr/new',
            isActive: currentPath === '/pcr/new',
          },
        ]),
    {
      id: 'pcr-list',
      label: 'PCR Reports',
      icon: <FileText className="w-5 h-5" />,
      href: '/reports',
      isActive: currentPath === '/reports',
    },
  ]

  const adminItems: SidebarItem[] = [
    {
      id: 'logs',
      label: 'Activity Logs',
      icon: <History className="w-5 h-5" />,
      href: '/logs',
      isActive: currentPath === '/logs',
    },
    {
      id: 'users',
      label: 'User Management',
      icon: <Users className="w-5 h-5" />,
      href: '/admin/users',
      isActive: currentPath === '/admin/users',
    },
  ]

  const handleItemClick = (href: string) => {
    if (onNavigate) {
      onNavigate(href)
    }
    if (onClose) {
      onClose()
    }
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo area */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <img
              src="./images/vcrt_logo.png"
              alt="PCR logo"
              className="h-6 md:h-8 w-auto object-contain rounded-md"
            />
            <span className="ml-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
              Patient Care Report
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 overflow-y-auto">
            <div className="space-y-1">
              {navigationItems.map(item => (
                <SidebarItemComponent key={item.id} item={item} onClick={handleItemClick} />
              ))}
              {user?.role === 'admin' &&
                adminItems.map(item => (
                  <SidebarItemComponent key={item.id} item={item} onClick={handleItemClick} />
                ))}
            </div>
          </nav>

          {/* Footer */}
          <div className="flex-shrink-0 h-16 flex flex-col justify-center px-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">PCR v2.1</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Documentation System</p>
          </div>
        </div>
      </div>
    </>
  )
}

export default Sidebar
