import { useState, useEffect } from 'react'
import { AlertTriangle, MessageSquare, ShieldCheck, User } from 'lucide-react'
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
  const [changesRequested, setChangesRequested] = useState<DraftReport[]>([])

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

    // Admins already get a global "awaiting approval" banner - this is the
    // regular-user equivalent, surfacing reports sent back that still need
    // the user's attention.
    if (user?.role !== 'admin') {
      apiRequest('/pcr?status=changes_requested')
        .then(res => setChangesRequested(res.data || []))
        .catch(() => {
          // Silently fail - banner is non-critical
        })
    }
  }, [isAuthenticated, user?.role])

  const isAdmin = user?.role === 'admin'
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Welcome hero */}
      <div className="mb-6 rounded-xl border border-primary-100 dark:border-transparent bg-gradient-to-br from-primary-50 via-white to-burgundy-50 dark:from-primary-900 dark:via-primary-700 dark:to-burgundy-800 px-6 py-5 sm:px-8 sm:py-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-white/60 mb-1">{today}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
            Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-white/75">
            {isAdmin
              ? "Here's how the team is doing."
              : 'Your call history and shift resources, all in one place.'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-primary-200 text-primary-800 dark:bg-white/15 dark:border-white/20 dark:text-white px-3 py-1.5 text-sm font-semibold shrink-0">
          {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
          <span className="capitalize">{user?.role}</span>
        </span>
      </div>

      {/* Alerts */}
      {((!draftsLoading && drafts.length > 0) || changesRequested.length > 0) && (
        <div className="mb-6 space-y-2">
          {!draftsLoading && drafts.length > 0 && (
            <a
              href="#/reports"
              className="flex items-center gap-3 p-4 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 transition-colors"
            >
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {drafts.length} draft{drafts.length === 1 ? '' : 's'} in progress
              </span>
            </a>
          )}

          {changesRequested.length > 0 && (
            <a
              href="#/reports"
              className="flex items-center gap-3 p-4 rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 dark:border-orange-800/60 dark:bg-orange-900/20 dark:hover:bg-orange-900/30 transition-colors"
            >
              <MessageSquare className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
              <span className="text-sm font-medium text-orange-800 dark:text-orange-200">
                {changesRequested.length} report{changesRequested.length === 1 ? '' : 's'} sent back with changes requested
              </span>
            </a>
          )}
        </div>
      )}

      {/* Call Stats */}
      <div className="mb-6">
        {isAdmin ? <AdminCallStats /> : <UserCallStats />}
      </div>

      {isAdmin ? <SupplyFormQrAdmin /> : <SupplyFormQrSection />}

      <SamplePcrSection />

      <MedicalGlossarySection />

      <DebriefQuestionsSection />
    </div>
  )
}

export default DashboardPage
