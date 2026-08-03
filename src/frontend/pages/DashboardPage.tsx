import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiRequest } from '../utils/api'
import {
  UserCallStats,
  AdminCallStats,
  SupplyFormQrSection,
  SupplyFormQrAdmin,
  SamplePcrSection,
  DebriefQuestionsSection,
  MedicalGlossarySection,
} from '../components/composite'

interface DraftReport {
  id: string
  status: string
  created_at: string
  updated_at: string
  report_number: string | null
  patient_name: string | null
}

const DashboardPage = () => {
  const { user, isAuthenticated } = useAuth()
  const [drafts, setDrafts] = useState<DraftReport[]>([])
  const [draftsLoading, setDraftsLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return
    const fetchDrafts = async () => {
      try {
        const data = await apiRequest('/pcr?status=draft')
        setDrafts(data.data || [])
      } catch {
        // Silently fail - drafts section is non-critical
      } finally {
        setDraftsLoading(false)
      }
    }
    fetchDrafts()
  }, [isAuthenticated])

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)

    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Welcome section */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {drafts.length > 0
            ? `You have ${drafts.length} draft${drafts.length === 1 ? '' : 's'} in progress.`
            : 'You have no drafts in progress.'}
        </p>
      </div>

      {/* Drafts in Progress */}
      {!draftsLoading && drafts.length > 0 && (
        <div className="mb-6">
          <div className="card">
            <div className="card-header">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    Drafts in Progress
                  </h3>
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                    {drafts.length}
                  </span>
                </div>
                <a
                  href="#/reports"
                  className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  View all reports
                </a>
              </div>
            </div>
            <div className="card-body">
              <div className="space-y-3">
                {drafts.slice(0, 5).map(draft => (
                  <a
                    key={draft.id}
                    href={`#/pcr/new?draftId=${draft.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {draft.report_number ? `#${draft.report_number}` : 'No Report ID'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(draft.updated_at)}</span>
                    </div>
                  </a>
                ))}
                {drafts.length > 5 && (
                  <a
                    href="#/reports"
                    className="block text-center text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 pt-1"
                  >
                    +{drafts.length - 5} more drafts
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Call Stats */}
      <div className="mb-6">
        {user?.role === 'admin' ? <AdminCallStats /> : <UserCallStats />}
      </div>

      <SamplePcrSection />

      {user?.role === 'admin' ? <SupplyFormQrAdmin /> : <SupplyFormQrSection />}

      <DebriefQuestionsSection />

      <MedicalGlossarySection />
    </div>
  )
}

export default DashboardPage
