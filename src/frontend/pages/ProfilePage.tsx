import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'

const ProfilePage = () => {
  const { t } = useTranslation()
  const { user } = useAuth()

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('profile.title')}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {t('profile.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('profile.personalInfo')}</h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="form-label">{t('profile.firstName')}</label>
                  <input className="form-input" value={user?.firstName || ''} readOnly />
                </div>
                <div>
                  <label className="form-label">{t('profile.lastName')}</label>
                  <input className="form-input" value={user?.lastName || ''} readOnly />
                </div>
                <div>
                  <label className="form-label">{t('profile.email')}</label>
                  <input className="form-input" value={user?.email || ''} readOnly />
                </div>
                <div>
                  <label className="form-label">{t('profile.username')}</label>
                  <input className="form-input" value={user?.username || ''} readOnly />
                </div>
                <div>
                  <label className="form-label">{t('profile.licenseNumber')}</label>
                  <input className="form-input" value={user?.licenseNumber || ''} readOnly />
                </div>
                <div>
                  <label className="form-label">{t('profile.department')}</label>
                  <input className="form-input" value={user?.department || ''} readOnly />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('profile.roleStatus')}</h3>
            </div>
            <div className="card-body">
              <div className="space-y-4">
                <div>
                  <label className="form-label">{t('profile.role')}</label>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 uppercase">
                    {t(`common.role.${user?.role}`, user?.role || '')}
                  </div>
                </div>
                <div>
                  <label className="form-label">{t('profile.status')}</label>
                  <div className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    user?.isActive
                      ? 'bg-success-100 text-success-800 dark:bg-success-900/40 dark:text-success-200'
                      : 'bg-danger-100 text-danger-800 dark:bg-danger-900/40 dark:text-danger-200'
                  }`}>
                    {user?.isActive ? t('profile.active') : t('profile.inactive')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfilePage