import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { User as UserIcon, Send, Contact } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useNotification } from '@/context'
import { apiRequest } from '@/utils/api'
import { parseServerDate } from '@/utils'
import { Button, Modal, Alert } from '@/components/ui'
import { Checkbox, Textarea } from '@/components/forms'
import { AdminCallStats, UserCallStats } from '@/components/composite'

interface PendingRequest {
  message: string
  created_at: string
}

interface MyCallStats {
  total: number
  lastCallDate: string | null
}

const ProfilePage = () => {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const { showNotification } = useNotification()
  const isAdmin = user?.role === 'admin'

  const formatDateTime = (dateString?: string | null) =>
    dateString
      ? parseServerDate(dateString).toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : t('profile.never')

  // --- Non-admin: request a name/password change ---
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null)
  const [loadingRequest, setLoadingRequest] = useState(!isAdmin)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestName, setRequestName] = useState(false)
  const [requestPassword, setRequestPassword] = useState(false)
  const [requestDetails, setRequestDetails] = useState('')
  const [requestError, setRequestError] = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)

  // --- Non-admin: own call history summary ---
  const [myStats, setMyStats] = useState<MyCallStats>({ total: 0, lastCallDate: null })
  const [statsLoading, setStatsLoading] = useState(!isAdmin)

  useEffect(() => {
    if (isAdmin) return

    apiRequest('/profile-requests/mine')
      .then(res => setPendingRequest(res.data))
      .catch(() => {
        // Non-critical - just means the "pending request" notice won't show
      })
      .finally(() => setLoadingRequest(false))

    apiRequest('/pcr/stats/mine')
      .then(res => {
        const rows: Array<{ date: string | null }> = res.data || []
        // Call `date` is a plain YYYY-MM-DD string, not a server timestamp -
        // sorting lexicographically and displaying it as-is (rather than
        // through parseServerDate/toLocaleDateString) avoids a timezone
        // rollback shifting it to the wrong calendar day.
        const dates = rows.map(r => r.date).filter((d): d is string => !!d).sort()
        setMyStats({ total: rows.length, lastCallDate: dates.length ? dates[dates.length - 1] : null })
      })
      .catch(() => {
        // Non-critical - stats just stay at zero
      })
      .finally(() => setStatsLoading(false))
  }, [isAdmin])

  const openRequestModal = () => {
    setRequestName(false)
    setRequestPassword(false)
    setRequestDetails('')
    setRequestError('')
    setShowRequestModal(true)
  }

  const handleSubmitRequest = async () => {
    if (!requestName && !requestPassword) {
      setRequestError(t('profile.requestSelectAtLeastOne'))
      return
    }

    const parts: string[] = []
    if (requestName) parts.push(t('profile.requestNameLabel'))
    if (requestPassword) parts.push(t('profile.requestPasswordLabel'))
    let message = t('profile.requestMessagePrefix', { items: parts.join(', ') })
    if (requestDetails.trim()) {
      message += ` — ${requestDetails.trim()}`
    }

    try {
      setSubmittingRequest(true)
      const res = await apiRequest('/profile-requests', {
        method: 'POST',
        body: JSON.stringify({ message }),
      })
      setPendingRequest(res.data)
      setShowRequestModal(false)
      showNotification(t('profile.requestSuccess'), 'success')
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : t('profile.requestFailed'))
    } finally {
      setSubmittingRequest(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('profile.title')}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t('profile.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Personal Information */}
        <div className="lg:col-span-2">
          <div className="card h-full">
            <div className="card-header flex items-center gap-3">
              <span className="icon-chip icon-chip-primary w-9 h-9">
                <UserIcon className="w-4 h-4" />
              </span>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('profile.personalInfo')}</h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <label className="form-label">{t('profile.firstName')}</label>
                  <input className="form-input" value={user?.firstName || ''} readOnly />
                </div>
                <div>
                  <label className="form-label">{t('profile.lastName')}</label>
                  <input className="form-input" value={user?.lastName || ''} readOnly />
                </div>
                <div>
                  <label className="form-label">{t('profile.username')}</label>
                  <input className="form-input" value={user?.username || ''} readOnly />
                </div>
              </div>

              {isAdmin ? (
                <p className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                  {t('profile.adminEditHint')}
                </p>
              ) : loadingRequest ? null : pendingRequest ? (
                <div className="mt-4">
                  <Alert
                    type="info"
                    title={t('profile.requestPendingTitle')}
                    message={t('profile.requestPendingBody', { date: formatDateTime(pendingRequest.created_at) })}
                  />
                </div>
              ) : (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t('profile.requestHint')}</p>
                  <Button variant="secondary" leftIcon={<Send className="w-4 h-4" />} onClick={openRequestModal}>
                    {t('profile.requestChange')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Account Overview */}
        <div className="space-y-6">
          <div className="card">
            <div className="card-header flex items-center gap-3">
              <span className="icon-chip icon-chip-primary w-9 h-9">
                <Contact className="w-4 h-4" />
              </span>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('profile.accountOverview')}</h3>
            </div>
            <div className="card-body space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('profile.role')}</span>
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full uppercase ${
                    isAdmin
                      ? 'bg-burgundy-100 text-burgundy-700 dark:bg-burgundy-900/40 dark:text-burgundy-300'
                      : 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                  }`}
                >
                  {t(`common.role.${user?.role}`, user?.role || '')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('profile.status')}</span>
                <span
                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    user?.isActive
                      ? 'bg-success-100 text-success-800 dark:bg-success-900/40 dark:text-success-200'
                      : 'bg-danger-100 text-danger-800 dark:bg-danger-900/40 dark:text-danger-200'
                  }`}
                >
                  {user?.isActive ? t('profile.active') : t('profile.inactive')}
                </span>
              </div>
              <div className="text-sm pt-2 border-t border-gray-100 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">{t('profile.memberSince')}</p>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{formatDateTime(user?.createdAt)}</p>
              </div>
              <div className="text-sm">
                <p className="text-gray-500 dark:text-gray-400">{t('profile.lastLogin')}</p>
                <p className="mt-0.5 font-medium text-gray-900 dark:text-gray-100">{formatDateTime(user?.lastLogin)}</p>
              </div>

              {!isAdmin && (
                <>
                  <div className="flex items-center justify-between text-sm pt-2 border-t border-gray-100 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400">{t('profile.totalCalls')}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {statsLoading ? '—' : myStats.total}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t('profile.lastCallSubmitted')}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {statsLoading ? '—' : myStats.lastCallDate || t('profile.noneYet')}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Call history - moved here from the Dashboard */}
      {isAdmin ? <AdminCallStats /> : <UserCallStats />}

      {/* Request a name/password change (non-admin) */}
      <Modal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        title={t('profile.requestChangeTitle')}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('profile.requestChangeBody')}</p>

          <div className="space-y-2">
            <Checkbox
              label={t('profile.requestNameLabel')}
              checked={requestName}
              onChange={e => setRequestName(e.target.checked)}
            />
            <Checkbox
              label={t('profile.requestPasswordLabel')}
              checked={requestPassword}
              onChange={e => setRequestPassword(e.target.checked)}
            />
          </div>

          <Textarea
            label={t('profile.requestDetails')}
            placeholder={t('profile.requestDetailsPlaceholder')}
            value={requestDetails}
            onChange={e => setRequestDetails(e.target.value)}
            rows={3}
          />

          {requestError && <p className="text-sm text-danger-600 dark:text-danger-400">{requestError}</p>}

          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-700">
            <Button variant="secondary" onClick={() => setShowRequestModal(false)} disabled={submittingRequest}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmitRequest} loading={submittingRequest} disabled={submittingRequest}>
              {t('profile.requestSubmit')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ProfilePage
