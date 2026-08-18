import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { ShieldCheck, User } from 'lucide-react'
import {
  SupplyFormQrSection,
  SupplyFormQrAdmin,
  SamplePcrSection,
  DebriefQuestionsSection,
  MedicalGlossarySection,
} from '../components/composite'

const DashboardPage = () => {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const today = new Date().toLocaleDateString(i18n.language === 'fr' ? 'fr-CA' : 'en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Welcome hero */}
      <div className="card mb-6 px-6 py-5 sm:px-8 sm:py-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{today}</p>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            {t('dashboard.welcomeBack', { name: user?.firstName ? `, ${user.firstName}` : '' })}
          </h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {isAdmin ? t('dashboard.adminSubtitle') : t('dashboard.userSubtitle')}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 border border-gray-200 text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 px-3 py-1.5 text-sm font-semibold shrink-0">
          {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
          <span className="capitalize">{t(`common.role.${user?.role}`, user?.role || '')}</span>
        </span>
      </div>

      {isAdmin ? <SupplyFormQrAdmin /> : <SupplyFormQrSection />}

      <SamplePcrSection />

      <MedicalGlossarySection />

      <DebriefQuestionsSection />
    </div>
  )
}

export default DashboardPage
