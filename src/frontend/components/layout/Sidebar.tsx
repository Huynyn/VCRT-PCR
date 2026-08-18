import React from 'react'
import { useTranslation } from 'react-i18next'
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
      'w-full flex items-center gap-3 pl-[9px] pr-3 py-2 text-sm rounded-md border-l-[3px] transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800',
      item.isActive
        ? 'border-primary-600 bg-primary-50 text-primary-700 font-semibold dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-300'
        : 'border-transparent text-gray-600 font-medium hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100',
    )}
  >
    <span className="flex-shrink-0">{item.icon}</span>
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const Sidebar: React.FC<SidebarProps> = ({
  isOpen = true,
  currentPath = '/',
  onNavigate,
  onClose,
  user,
}) => {
  const { t } = useTranslation()
  const isAdmin = user?.role === 'admin'

  const navigationItems: SidebarItem[] = [
    {
      id: 'dashboard',
      label: t('nav.dashboard'),
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
            label: t('nav.newPcr'),
            icon: <Plus className="w-5 h-5" />,
            href: '/pcr/new',
            isActive: currentPath === '/pcr/new',
          },
        ]),
    {
      id: 'pcr-list',
      label: t('nav.pcrReports'),
      icon: <FileText className="w-5 h-5" />,
      href: '/reports',
      isActive: currentPath === '/reports',
    },
  ]

  const adminItems: SidebarItem[] = [
    {
      id: 'logs',
      label: t('nav.activityLogs'),
      icon: <History className="w-5 h-5" />,
      href: '/logs',
      isActive: currentPath === '/logs',
    },
    {
      id: 'users',
      label: t('nav.userManagement'),
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
          'fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo area */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <img
              src="./images/vcrt_logo.png"
              alt={t('common.logoAlt')}
              className="h-8 md:h-9 w-auto object-contain rounded-md"
            />
            <div className="ml-3 leading-tight">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                VCRT <span className="font-medium">|</span> ÉBIC
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('header.patientCareReport')}</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-5 overflow-y-auto">
            <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase text-gray-400 dark:text-gray-500">
              {t('nav.workflow')}
            </p>
            <div className="space-y-0.5">
              {navigationItems.map(item => (
                <SidebarItemComponent key={item.id} item={item} onClick={handleItemClick} />
              ))}
            </div>
            {isAdmin && (
              <>
                <p className="mt-5 mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase text-gray-400 dark:text-gray-500">
                  {t('nav.admin')}
                </p>
                <div className="space-y-0.5">
                  {adminItems.map(item => (
                    <SidebarItemComponent key={item.id} item={item} onClick={handleItemClick} />
                  ))}
                </div>
              </>
            )}
          </nav>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-3">
            {user && (
              <div className="flex items-center gap-2.5 px-1 py-1.5">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-bold shrink-0">
                  {getInitials(user.name)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user.name}
                  </p>
                  <span
                    className={cn(
                      'inline-flex text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded',
                      isAdmin
                        ? 'bg-burgundy-100 text-burgundy-700 dark:bg-burgundy-900/40 dark:text-burgundy-300'
                        : 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
                    )}
                  >
                    {t(`common.role.${user.role}`, user.role)}
                  </span>
                </div>
              </div>
            )}
            <p className="mt-2 px-1 text-xs text-gray-400 dark:text-gray-500">
              {t('login.brandAcronym')} v{__APP_VERSION__} · 2026
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

export default Sidebar
