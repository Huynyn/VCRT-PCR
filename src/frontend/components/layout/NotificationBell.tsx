import React, { useEffect, useRef, useState } from 'react'
import { Bell, FileEdit, AlertTriangle, ClipboardCheck } from 'lucide-react'
import { Button, Tooltip } from '@/components/ui'
import { apiRequest } from '@/utils/api'
import { parseServerDate, cn } from '@/utils'

interface NotificationBellProps {
  /** Only `role` is used, to decide which notifications apply. */
  user?: { role: string }
  onNavigate?: (href: string) => void
}

interface PCRNotification {
  id: string
  status: string
  updated_at: string
  report_number?: string | null
}

const STATUS_META: Record<string, { label: string; icon: typeof FileEdit }> = {
  draft: { label: 'Draft in progress', icon: FileEdit },
  changes_requested: { label: 'Changes requested', icon: AlertTriangle },
  submitted: { label: 'Awaiting approval', icon: ClipboardCheck },
}

// Refetch on an interval so the badge doesn't go stale during a long session.
const REFRESH_INTERVAL_MS = 60 * 1000

const NotificationBell: React.FC<NotificationBellProps> = ({ user, onNavigate }) => {
  const isAdmin = user?.role === 'admin'
  const [items, setItems] = useState<PCRNotification[]>([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) return

    let cancelled = false

    const fetchNotifications = async () => {
      try {
        const endpoint = isAdmin ? '/pcr?status=submitted' : '/pcr'
        const data = await apiRequest(endpoint)
        if (cancelled) return

        const reports: PCRNotification[] = data.data || []
        const relevant = isAdmin
          ? reports
          : reports.filter((r) => r.status === 'draft' || r.status === 'changes_requested')

        setItems(relevant)
      } catch {
        // Notifications are a convenience, not critical - fail silently and
        // just leave the previous (or empty) list in place.
      }
    }

    fetchNotifications()
    const interval = setInterval(fetchNotifications, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [user, isAdmin])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!user) return null

  const handleItemClick = () => {
    setOpen(false)
    onNavigate?.('/reports')
  }

  const count = items.length
  const badgeText = count > 9 ? '9+' : String(count)
  const panelTitle = isAdmin ? 'Reports awaiting approval' : 'Reports needing attention'

  return (
    <div className="relative" ref={containerRef}>
      <Tooltip content="Notifications">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="relative text-gray-500 hover:text-primary-600 dark:text-gray-400 dark:hover:text-primary-400"
          aria-label={`Notifications${count > 0 ? ` (${count} unread)` : ''}`}
        >
          <Bell className="w-4 h-4" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-burgundy-600 text-white text-[10px] font-semibold leading-none">
              {badgeText}
            </span>
          )}
        </Button>
      </Tooltip>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{panelTitle}</h3>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-center text-gray-500 dark:text-gray-400">
              You're all caught up.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {items.map((item) => {
                const meta = STATUS_META[item.status] ?? { label: item.status, icon: Bell }
                const Icon = meta.icon
                const title = item.report_number || 'No Report ID'

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={handleItemClick}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left',
                        'hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors'
                      )}
                    >
                      <Icon className="w-4 h-4 mt-0.5 shrink-0 text-primary-600 dark:text-primary-400" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {title}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">
                          {meta.label} · {parseServerDate(item.updated_at).toLocaleDateString()}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700">
            <button
              type="button"
              onClick={handleItemClick}
              className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
            >
              View all reports
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
