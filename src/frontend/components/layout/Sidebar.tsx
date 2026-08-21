import React from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Users, History, Settings, LayoutDashboard, Printer, Plus, Search } from 'lucide-react'
import { cn } from '@/utils'
import { navIconProps } from './navIcon'

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

// Width of the icon-only rail on lg+ screens when the sidebar isn't pinned
// open. Shared between the rail itself and the layout spacer that reserves
// its space (see the `spacer` div below).
const RAIL_WIDTH = 'lg:w-[72px]'

// Hidden at rest, revealed once the rail is pinned open or the pointer is
// hovering it (via `group-hover`) - shared by every label/text element that
// only makes sense once the sidebar is wide enough to show it.
const revealWhenExpanded = (pinned: boolean) => !pinned && 'hidden lg:group-hover:block'


// Defined at module scope (not inside Sidebar) so its component identity is
// stable across renders — otherwise React would unmount/remount these
// buttons on every Sidebar re-render, sometimes swallowing the click that
// triggered the re-render in the first place.
const SidebarItemComponent: React.FC<{ item: SidebarItem; onClick: (href: string) => void; pinned: boolean }> = ({
  item,
  onClick,
  pinned,
}) => (
  <button
    onClick={() => onClick(item.href)}
    className={cn(
      'flex items-center gap-3 text-sm rounded-full transition-all duration-150',
      'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800',
      // Collapsed: a tight circle around just the icon (matching the header's
      // icon buttons), same as pinned/expanded once the rail grows on hover.
      pinned
        ? 'w-full px-3 py-2'
        : 'w-10 h-10 mx-auto justify-center lg:group-hover:w-full lg:group-hover:h-auto lg:group-hover:mx-0 lg:group-hover:justify-start lg:group-hover:px-3 lg:group-hover:py-2',
      item.isActive
        ? 'bg-primary-50 text-primary-700 font-semibold dark:bg-primary-900/40 dark:text-primary-300'
        : 'text-gray-600 font-medium hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-gray-100',
    )}
  >
    <span className="flex-shrink-0">{item.icon}</span>
    <span className={cn('flex-1 text-left whitespace-nowrap', revealWhenExpanded(pinned))}>{item.label}</span>
    {item.badge && (
      <span
        className={cn(
          'items-center justify-center px-2 py-1 text-xs font-bold leading-none rounded-full inline-flex',
          revealWhenExpanded(pinned),
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
  // `isOpen` doubles as "pinned open" once we're at the lg+ breakpoint: below
  // lg it's the familiar off-canvas drawer toggle, at lg+ it switches the
  // rail between a permanently-expanded sidebar and an icon-only rail that
  // expands temporarily on hover (see the `group-hover` rules throughout).
  const pinned = isOpen

  const isDashboardActive = currentPath === '/dashboard'
  const isNewPcrActive = currentPath === '/pcr/new'
  const isReportsActive = currentPath === '/reports'
  const isLogsActive = currentPath === '/logs'
  const isUsersActive = currentPath === '/admin/users'

  const navigationItems: SidebarItem[] = [
    {
      id: 'dashboard',
      label: t('nav.dashboard'),
      icon: <LayoutDashboard className="w-5 h-5" {...navIconProps(isDashboardActive)} />,
      href: '/dashboard',
      isActive: isDashboardActive,
    },
    // Admins only manage/review existing PCRs - they don't submit their own,
    // so there's no need for a "New PCR" entry point in their sidebar.
    ...(isAdmin
      ? []
      : [
          {
            id: 'new-pcr',
            label: t('nav.newPcr'),
            icon: <Plus className="w-5 h-5" {...navIconProps(isNewPcrActive)} />,
            href: '/pcr/new',
            isActive: isNewPcrActive,
          },
        ]),
    {
      id: 'pcr-list',
      label: t('nav.pcrReports'),
      icon: <FileText className="w-5 h-5" {...navIconProps(isReportsActive)} />,
      href: '/reports',
      isActive: isReportsActive,
    },
  ]

  const adminItems: SidebarItem[] = [
    {
      id: 'logs',
      label: t('nav.activityLogs'),
      icon: <History className="w-5 h-5" {...navIconProps(isLogsActive)} />,
      href: '/logs',
      isActive: isLogsActive,
    },
    {
      id: 'users',
      label: t('nav.userManagement'),
      icon: <Users className="w-5 h-5" {...navIconProps(isUsersActive)} />,
      href: '/admin/users',
      isActive: isUsersActive,
    },
  ]

  const handleItemClick = (href: string) => {
    if (onNavigate) {
      onNavigate(href)
    }
    // `onClose` collapses the sidebar - only desired for the mobile
    // off-canvas drawer (tap a link, drawer tucks away). At lg+, `onClose`
    // would also un-pin the permanently-expanded rail, so a page switch
    // shouldn't trigger it there; the rail only re-collapses when the
    // hamburger is pressed again. matchMedia mirrors Tailwind's `lg` (1024px).
    const isMobile = typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches
    if (onClose && isMobile) {
      onClose()
    }
  }

  return (
    <>
      {/* Mobile overlay - starts below the header (top-16) so the header
          (with its hamburger toggle) stays visible/usable while the drawer
          is open, rather than being covered by the dimmed backdrop too. */}
      {isOpen && (
        <div
          className="fixed left-0 right-0 top-16 bottom-0 z-[1050] bg-black bg-opacity-50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - `top-16 bottom-0` (instead of `inset-y-0`) so the fixed/
          floating rail starts below the header's fixed h-16 top bar instead
          of underlapping it; once pinned open it switches to `lg:static`
          and this is ignored, since static elements just follow normal
          document flow. z-[1100] (well above Leaflet's own panes/controls,
          which top out at z-index 1000) so the hover-expanded rail floats
          above any embedded map (e.g. CampusMapSection) instead of being
          cut by it. */}
      <div
        className={cn(
          'group fixed left-0 top-16 bottom-0 z-[1100] w-72 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          pinned ? 'lg:static lg:w-72' : cn(RAIL_WIDTH, 'lg:hover:w-72 lg:hover:shadow-2xl'),
        )}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Navigation */}
          <nav className="flex-1 px-3 py-5 overflow-y-auto overflow-x-hidden">
            <p
              className={cn(
                'mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase text-gray-400 dark:text-gray-500 whitespace-nowrap',
                revealWhenExpanded(pinned),
              )}
            >
              {t('nav.workflow')}
            </p>
            <div className="space-y-0.5">
              {navigationItems.map(item => (
                <SidebarItemComponent key={item.id} item={item} onClick={handleItemClick} pinned={pinned} />
              ))}
            </div>
            {isAdmin && (
              <>
                <p
                  className={cn(
                    'mt-5 mb-1.5 px-3 text-[11px] font-semibold tracking-wider uppercase text-gray-400 dark:text-gray-500 whitespace-nowrap',
                    revealWhenExpanded(pinned),
                  )}
                >
                  {t('nav.admin')}
                </p>
                <div className="space-y-0.5">
                  {adminItems.map(item => (
                    <SidebarItemComponent key={item.id} item={item} onClick={handleItemClick} pinned={pinned} />
                  ))}
                </div>
              </>
            )}
          </nav>

          {/* Footer */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-3">
            {user && (
              <button
                type="button"
                onClick={() => handleItemClick('/profile')}
                className={cn(
                  'flex items-center gap-2.5 rounded-full transition-all duration-150 text-left',
                  'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800',
                  pinned
                    ? 'w-full px-3 py-1.5'
                    : 'w-10 h-10 mx-auto justify-center lg:group-hover:w-full lg:group-hover:h-auto lg:group-hover:mx-0 lg:group-hover:justify-start lg:group-hover:px-3 lg:group-hover:py-1.5',
                  currentPath === '/profile'
                    ? 'bg-primary-50 dark:bg-primary-900/40'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                )}
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-600 text-white text-xs font-bold shrink-0">
                  {getInitials(user.name)}
                </span>
                <div className={cn('min-w-0', revealWhenExpanded(pinned))}>
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
              </button>
            )}
            <p className={cn('mt-2 px-1 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap', revealWhenExpanded(pinned))}>
              {t('login.brandAcronym')} v{__APP_VERSION__} · 2026
            </p>
          </div>
        </div>
      </div>

      {/* Layout spacer - reserves the rail's collapsed width in the flex row
          since the rail itself is `fixed` (floats above content so its
          hover-expand doesn't reflow the page). Pinned open, the rail goes
          back to `lg:static` and provides its own space, so no spacer is
          needed. */}
      <div aria-hidden="true" className={cn('hidden shrink-0', !pinned && cn('lg:block', RAIL_WIDTH))} />
    </>
  )
}

export default Sidebar
