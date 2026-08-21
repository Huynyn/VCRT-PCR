import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Filter, User, Activity, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { Button, Loading, Alert, Modal } from '@/components/ui'
import { Select, DatePicker } from '@/components/forms'
import { useAuth } from '@/context/AuthContext'
import { useNotification } from '@/context/NotificationContext'
import { apiRequest } from '@/utils/api'
import { parseServerDate } from '@/utils'
import type { ActivityLog, PaginatedResponse } from '@/types'

interface LogFilters {
  action: string
  username: string
  dateFrom: string
  dateTo: string
  page: number
  limit: number
}

const ActivityLogsPage = () => {
  const { t, i18n } = useTranslation()
  const { token, isAuthenticated, user: currentUser } = useAuth()
  const { showNotification } = useNotification()
  const [logs, setLogs] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState<LogFilters>({
    action: '',
    username: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
    limit: 50
  })
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [showCleanModal, setShowCleanModal] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [usernameOptions, setUsernameOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: t('activityLogs.allUsers') },
  ])

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      setError(t('activityLogs.accessDeniedMessage'))
      setLoading(false)
      return
    }
    fetchLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, filters])

  useEffect(() => {
    if (!isAuthenticated || !token || currentUser?.role !== 'admin') return

    const fetchUsernames = async () => {
      try {
        const data = await apiRequest('/users')
        const users = (data.data ?? []).filter((u: any) => u.username)

        const options = users
          .map((u: any) => ({
            value: u.username,
            label: `${u.firstName ?? ''} ${u.lastName ?? ''} (@${u.username})`.trim(),
          }))
          .sort((a: any, b: any) => a.label.localeCompare(b.label))

        setUsernameOptions([
          { value: '', label: t('activityLogs.allUsers') },
          ...options,
        ])
      } catch {
        // Fallback: build from whatever logs are currently loaded
        const unique = Array.from(new Set((logs ?? []).map((l) => l.username).filter(Boolean))).sort()
        setUsernameOptions([
          { value: '', label: t('activityLogs.allUsers') },
          ...unique.map((u) => ({ value: u, label: `@${u}` })),
        ])
      }
    }

    fetchUsernames()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, currentUser?.role])

  const fetchLogs = async () => {
    try {
      setLoading(true)

      if (!isAuthenticated || !token) {
        setError(t('activityLogs.loginToView'))
        setLoading(false)
        return
      }

      const queryParams = new URLSearchParams()
      queryParams.append('page', filters.page.toString())
      queryParams.append('limit', filters.limit.toString())

      if (filters.action) queryParams.append('action', filters.action)
      if (filters.username) queryParams.append('username', filters.username)
      if (filters.dateFrom) queryParams.append('dateFrom', filters.dateFrom)
      if (filters.dateTo) queryParams.append('dateTo', filters.dateTo)

      const data: PaginatedResponse<ActivityLog> = await apiRequest(`/logs?${queryParams.toString()}`)
      setLogs(data.items || [])
      setTotalPages(data.totalPages || 1)
      setTotalCount(data.totalCount || 0)
    } catch (err) {
      setError(t('activityLogs.loadFailed'))
      console.error('Error fetching logs:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCleanLogs = async () => {
    try {
      setCleaning(true)
      const res = await apiRequest('/logs/cleanup', { method: 'DELETE' })
      const deletedCount = res.data?.deletedCount ?? 0
      showNotification(
        deletedCount > 0
          ? t('activityLogs.deletedLogs', { count: deletedCount })
          : t('activityLogs.noLogsToDelete'),
        'success'
      )
      setShowCleanModal(false)
      fetchLogs()
    } catch (err) {
      showNotification(err instanceof Error ? err.message : t('activityLogs.cleanupFailed'), 'error')
    } finally {
      setCleaning(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }))
  }

  const handleFilterChange = (key: keyof LogFilters, value: string | number) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }))
  }

  const clearFilters = () => {
    setFilters({
      action: '',
      username: '',
      dateFrom: '',
      dateTo: '',
      page: 1,
      limit: 50
    })
  }

  const formatDate = (dateString: string) => {
    return parseServerDate(dateString).toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const getActionBadgeColor = (action: string) => {
    const colors: Record<string, string> = {
      login: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700/60',
      logout: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:border-slate-600/60',
      create_user: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700/60',
      update_user: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700/60',
      delete_user: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700/60',
      change_password: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700/60',
      create_responder: 'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-200 dark:border-cyan-700/60',
      update_responder: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/40 dark:text-sky-200 dark:border-sky-700/60',
      delete_responder: 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-900/40 dark:text-pink-200 dark:border-pink-700/60',
      create_psm_member: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700/60',
      update_psm_member: 'bg-stone-100 text-stone-800 border-stone-200 dark:bg-stone-900/40 dark:text-stone-200 dark:border-stone-600/60',
      delete_psm_member: 'bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-900/40 dark:text-zinc-200 dark:border-zinc-600/60',
      create_pcr: 'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-200 dark:border-indigo-700/60',
      update_pcr: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-200 dark:border-yellow-700/60',
      submit_pcr: 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/40 dark:text-teal-200 dark:border-teal-700/60',
      delete_pcr: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700/60',
      approve_pcr: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700/60',
      manual_cleanup: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700/60',
      update_setting: 'bg-lime-100 text-lime-800 border-lime-200 dark:bg-lime-900/40 dark:text-lime-200 dark:border-lime-700/60',
      cleanup_pcr_reports: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200 dark:bg-fuchsia-900/40 dark:text-fuchsia-200 dark:border-fuchsia-700/60',
      cleanup_activity_logs: 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/40 dark:text-violet-200 dark:border-violet-700/60',
    }
    return colors[action] || 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500/60'
  }

  const formatAction = (action: string) => {
    const titled = action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    const fallback = titled.replace(/\bPcr\b/g, 'PCR').replace(/\bPsm\b/g, 'PSM')
    return t(`activityLogs.actions.${action}`, fallback)
  }

  const formatUserName = (log: ActivityLog) => {
    if (log.first_name && log.last_name) {
      return `${log.first_name} ${log.last_name}`
    }
    if (log.username) {
      return `@${log.username}`
    }
    return t('activityLogs.unknownUser')
  }

  const parseDetails = (details: string | undefined) => {
    if (!details) return null
    try {
      return JSON.parse(details)
    } catch {
      return null
    }
  }

  if (currentUser?.role !== 'admin') {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-16">
          <History className="mx-auto h-12 w-12 text-gray-400" />
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">{t('activityLogs.accessDenied')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('activityLogs.accessDeniedBody')}
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('activityLogs.title')}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t('activityLogs.subtitle')}
          </p>
        </div>
        <Loading />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('activityLogs.title')}</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {t('activityLogs.subtitleFull')}
            </p>
            {totalCount > 0 && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {t('activityLogs.showingCount', { shown: logs.length, total: totalCount })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setShowCleanModal(true)}
              variant="secondary"
            >
              {t('activityLogs.clean')}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert type="error" message={error} onClose={() => setError('')} />
      )}

      {/* Filters */}
      <div className="card mb-6">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('activityLogs.filters')}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.1fr_1.1fr_0.6fr] gap-4">
            <Select
              label={t('activityLogs.actionLabel')}
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              options={[
                { value: '', label: t('activityLogs.allActions') },
                { value: 'login', label: t('activityLogs.actions.login') },
                { value: 'logout', label: t('activityLogs.actions.logout') },
                { value: 'create_user', label: t('activityLogs.actions.create_user') },
                { value: 'update_user', label: t('activityLogs.actions.update_user') },
                { value: 'delete_user', label: t('activityLogs.actions.delete_user') },
                { value: 'change_password', label: t('activityLogs.actions.change_password') },
                { value: 'create_responder', label: t('activityLogs.actions.create_responder') },
                { value: 'update_responder', label: t('activityLogs.actions.update_responder') },
                { value: 'delete_responder', label: t('activityLogs.actions.delete_responder') },
                { value: 'create_psm_member', label: t('activityLogs.actions.create_psm_member') },
                { value: 'update_psm_member', label: t('activityLogs.actions.update_psm_member') },
                { value: 'delete_psm_member', label: t('activityLogs.actions.delete_psm_member') },
                { value: 'create_pcr', label: t('activityLogs.actions.create_pcr') },
                { value: 'update_pcr', label: t('activityLogs.actions.update_pcr') },
                { value: 'submit_pcr', label: t('activityLogs.actions.submit_pcr') },
                { value: 'delete_pcr', label: t('activityLogs.actions.delete_pcr') },
                { value: 'approve_pcr', label: t('activityLogs.actions.approve_pcr') },
                { value: 'update_setting', label: t('activityLogs.actions.update_setting') },
                { value: 'manual_cleanup', label: t('activityLogs.actions.manual_cleanup') },
                { value: 'cleanup_pcr_reports', label: t('activityLogs.actions.cleanup_pcr_reports') },
                { value: 'cleanup_activity_logs', label: t('activityLogs.actions.cleanup_activity_logs') },
              ]}
            />

            <Select
              label={t('activityLogs.usernameLabel')}
              value={filters.username}
              onChange={(e) => handleFilterChange('username', e.target.value)}
              options={usernameOptions}
            />

            <DatePicker
              label={t('activityLogs.dateFrom')}
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            />

            <DatePicker
              label={t('activityLogs.dateTo')}
              value={filters.dateTo}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
            />

            <div className="space-y-1">
              <p aria-hidden="true" className="form-label select-none">&nbsp;</p>
              <Button
                variant="secondary"
                onClick={clearFilters}
                className="w-full"
              >
                {t('activityLogs.clear')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Logs Table */}
      {logs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">{t('activityLogs.noLogsFound')}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {Object.values(filters).some(v => v) ?
                  t('activityLogs.tryAdjustingFilters') :
                  t('activityLogs.activityWillAppear')
                }
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-700 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[180px]">
                        {t('activityLogs.columnTimestamp')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px]">
                        {t('activityLogs.columnUser')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[140px]">
                        {t('activityLogs.columnAction')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {formatDate(log.created_at)}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-8 w-8">
                              <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                                <User className="h-4 w-4 text-gray-600 dark:text-gray-200" />
                              </div>
                            </div>
                            <div className="ml-3">
                              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                {formatUserName(log)}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {log.username ? `@${log.username}` : t('activityLogs.idPrefix', { id: log.user_id })}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${getActionBadgeColor(log.action)}`}>
                            {formatAction(log.action)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 sm:px-6 mt-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {t('activityLogs.page')} <span className="font-medium">{filters.page}</span> {t('activityLogs.of')}{' '}
                    <span className="font-medium">{totalPages}</span>
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handlePageChange(filters.page - 1)}
                      disabled={filters.page <= 1}
                      aria-label={t('activityLogs.previousPage')}
                      className="p-1.5 rounded-md text-primary-600 hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:text-primary-400 dark:hover:bg-primary-900/30"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePageChange(filters.page + 1)}
                      disabled={filters.page >= totalPages}
                      aria-label={t('activityLogs.nextPage')}
                      className="p-1.5 rounded-md text-primary-600 hover:bg-primary-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:text-primary-400 dark:hover:bg-primary-900/30"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

      <Modal
        isOpen={showCleanModal}
        onClose={() => setShowCleanModal(false)}
        title={t('activityLogs.cleanupModalTitle')}
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('activityLogs.cleanupModalBody')}
          </p>
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowCleanModal(false)} disabled={cleaning}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleCleanLogs} loading={cleaning} disabled={cleaning}>
              {t('activityLogs.deleteOldLogs')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ActivityLogsPage