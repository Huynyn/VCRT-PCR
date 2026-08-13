import { useState, useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
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

      {/* Drafts in Progress notice */}
      {!draftsLoading && drafts.length > 0 && (
        <div className="mb-6">
          <a
            href="#/reports"
            className="flex items-center gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 transition-colors"
          >
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
              {drafts.length} draft{drafts.length === 1 ? '' : 's'} in progress
            </span>
          </a>
        </div>
      )}

      {/* Call Stats */}
      <div className="mb-6">
        {user?.role === 'admin' ? <AdminCallStats /> : <UserCallStats />}
      </div>

      {user?.role === 'admin' ? <SupplyFormQrAdmin /> : <SupplyFormQrSection />}

      <SamplePcrSection />

      <MedicalGlossarySection />

      <DebriefQuestionsSection />
    </div>
  )
}

export default DashboardPage
