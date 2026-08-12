import { useState, useEffect } from 'react'
import { History, Filter, Calendar, User, Activity, RefreshCw, ChevronLeft, ChevronRight, Search, Trash2 } from 'lucide-react'
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
  const [refreshing, setRefreshing] = useState(false)
  const [showCleanModal, setShowCleanModal] = useState(false)
  const [cleaning, setCleaning] = useState(false)
  const [usernameOptions, setUsernameOptions] = useState<{ value: string; label: string }[]>([
    { value: '', label: 'All Users' },
  ])

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      setError('Access denied. Admin privileges required.')
      setLoading(false)
      return
    }
    fetchLogs()
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
          { value: '', label: 'All Users' },
          ...options,
        ])
      } catch {
        // Fallback: build from whatever logs are currently loaded
        const unique = Array.from(new Set((logs ?? []).map((l) => l.username).filter(Boolean))).sort()
        setUsernameOptions([
          { value: '', label: 'All Users' },
          ...unique.map((u) => ({ value: u, label: `@${u}` })),
        ])
      }
    }

    fetchUsernames()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token, currentUser?.role])

  const fetchLogs = async () => {
    try {
      if (!refreshing) setLoading(true)

      if (!isAuthenticated || !token) {
        setError('Please log in to view activity logs')
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
      setError('Failed to load activity logs')
      console.error('Error fetching logs:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchLogs()
  }

  const handleCleanLogs = async () => {
    try {
      setCleaning(true)
      const res = await apiRequest('/logs/cleanup', { method: 'DELETE' })
      const deletedCount = res.data?.deletedCount ?? 0
      showNotification(
        deletedCount > 0
          ? `Deleted ${deletedCount} log${deletedCount === 1 ? '' : 's'} older than 1 week`
          : 'No logs older than 1 week to delete',
        'success'
      )
      setShowCleanModal(false)
      fetchLogs()
    } catch (err) {
      showNotification(err instanceof Error ? err.message : 'Failed to clean up logs', 'error')
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
    return parseServerDate(dateString).toLocaleDateString('en-CA', {
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
      login: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
      logout: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-200',
      create_user: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
      update_user: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
      delete_user: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200',
      change_password: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
      create_responder: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-200',
      update_responder: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200',
      delete_responder: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200',
      create_pcr: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
      update_pcr: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
      submit_pcr: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200',
      delete_pcr: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
      approve_pcr: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
      manual_cleanup: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
      update_setting: 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-200',
      cleanup_pcr_reports: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-200',
      cleanup_activity_logs: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-200',
    }
    return colors[action] || 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'
  }

  const formatAction = (action: string) => {
    const titled = action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    return titled.replace(/\bPcr\b/g, 'PCR')
  }

  const formatUserName = (log: ActivityLog) => {
    if (log.first_name && log.last_name) {
      return `${log.first_name} ${log.last_name}`
    }
    if (log.username) {
      return `@${log.username}`
    }
    return 'Unknown User'
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
          <h2 className="mt-4 text-lg font-medium text-gray-900 dark:text-gray-100">Access Denied</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You need admin privileges to access activity logs.
          </p>
        </div>
      </div>
    )
  }

  if (loading && !refreshing) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Activity Logs</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Monitor system activity and user actions
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Activity Logs</h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Monitor system activity and user actions across the platform
            </p>
            {totalCount > 0 && (
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Showing {logs.length} of {totalCount} activities
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setShowCleanModal(true)}
              variant="secondary"
            >
              Clean
            </Button>
            <Button
              leftIcon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
              onClick={handleRefresh}
              disabled={refreshing}
              variant="secondary"
            >
              Refresh
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
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Select
              label="Action"
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              options={[
                { value: '', label: 'All Actions' },
                { value: 'login', label: 'Login' },
                { value: 'logout', label: 'Logout' },
                { value: 'create_user', label: 'Create User' },
                { value: 'update_user', label: 'Update User' },
                { value: 'delete_user', label: 'Delete User' },
                { value: 'change_password', label: 'Change Password' },
                { value: 'create_responder', label: 'Create Responder' },
                { value: 'update_responder', label: 'Update Responder' },
                { value: 'delete_responder', label: 'Delete Responder' },
                { value: 'create_pcr', label: 'Create PCR' },
                { value: 'update_pcr', label: 'Update PCR' },
                { value: 'submit_pcr', label: 'Submit PCR' },
                { value: 'delete_pcr', label: 'Delete PCR' },
                { value: 'approve_pcr', label: 'Approve PCR' },
                { value: 'update_setting', label: 'Update Setting' },
                { value: 'manual_cleanup', label: 'Manual Cleanup' },
                { value: 'cleanup_pcr_reports', label: 'Automatic Cleanup' },
                { value: 'cleanup_activity_logs', label: 'Clean Activity Logs' },
              ]}
            />

            <Select
              label="Username"
              value={filters.username}
              onChange={(e) => handleFilterChange('username', e.target.value)}
              options={usernameOptions}
            />

            <DatePicker
              label="Date From"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
            />

            <DatePicker
              label="Date To"
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
                Clear Filters
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Logs Table */}
      <div className="card">
        <div className="card-body">
          {logs.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No activity logs found</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {Object.values(filters).some(v => v) ?
                  'Try adjusting your filters to see more results.' :
                  'System activity will appear here as users interact with the platform.'
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
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[200px]">
                        User
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[140px]">
                        Action
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
                                {log.username ? `@${log.username}` : `ID: ${log.user_id}`}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getActionBadgeColor(log.action)}`}>
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
                <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 sm:px-6 mt-4">
                  <div className="flex flex-1 justify-between sm:hidden">
                    <Button
                      onClick={() => handlePageChange(filters.page - 1)}
                      disabled={filters.page <= 1}
                      variant="secondary"
                    >
                      Previous
                    </Button>
                    <Button
                      onClick={() => handlePageChange(filters.page + 1)}
                      disabled={filters.page >= totalPages}
                      variant="secondary"
                    >
                      Next
                    </Button>
                  </div>
                  <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Showing page <span className="font-medium">{filters.page}</span> of{' '}
                        <span className="font-medium">{totalPages}</span>
                      </p>
                    </div>
                    <div>
                      <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                        <Button
                          onClick={() => handlePageChange(filters.page - 1)}
                          disabled={filters.page <= 1}
                          variant="secondary"
                          leftIcon={<ChevronLeft className="w-4 h-4" />}
                        >
                          Previous
                        </Button>
                        <Button
                          onClick={() => handlePageChange(filters.page + 1)}
                          disabled={filters.page >= totalPages}
                          variant="secondary"
                          rightIcon={<ChevronRight className="w-4 h-4" />}
                        >
                          Next
                        </Button>
                      </nav>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={showCleanModal}
        onClose={() => setShowCleanModal(false)}
        title="Clean Up Activity Logs"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            This will permanently delete all activity logs older than 1 week. This cannot be undone.
            Are you sure you want to continue?
          </p>
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowCleanModal(false)} disabled={cleaning}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleCleanLogs} loading={cleaning} disabled={cleaning}>
              Delete Old Logs
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ActivityLogsPage