import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, Save } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useNotification } from '@/context'
import { apiRequest } from '@/utils/api'
import { Button, Alert } from '@/components/ui'
import { Input } from '@/components/forms'
import { cn } from '@/utils'

const ToggleSwitch: React.FC<{ checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  disabled = false,
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={cn(
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800',
      disabled && 'opacity-50 cursor-not-allowed',
      checked ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600',
    )}
  >
    <span
      className={cn(
        'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
        checked ? 'translate-x-6' : 'translate-x-1',
      )}
    />
  </button>
)

const TempLoginSettingsPage = () => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { showNotification } = useNotification()
  const isAdmin = user?.role === 'admin'

  const [loading, setLoading] = useState(true)
  const [enabled, setEnabled] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (isAdmin) return

    apiRequest('/auth/temp-login')
      .then(res => {
        setEnabled(!!res.data?.enabled)
        setHasPassword(!!res.data?.hasPassword)
      })
      .catch(() => setError(t('tempLogin.loadFailed')))
      .finally(() => setLoading(false))
  }, [isAdmin, t])

  // The toggle takes effect immediately, same as flipping any other on/off
  // setting - Save is only needed to set/change the password itself. The
  // one exception: enabling for the first time requires a password, so that
  // case just updates the switch locally and waits for Save.
  const handleToggle = async (next: boolean) => {
    setEnabled(next)

    if (next && !hasPassword) return

    setError('')
    try {
      setToggling(true)
      await apiRequest('/auth/temp-login', {
        method: 'PUT',
        body: JSON.stringify({ enabled: next }),
      })
      showNotification(t('tempLogin.saved'), 'success')
    } catch (err) {
      setEnabled(!next)
      setError(err instanceof Error ? err.message : t('tempLogin.saveFailed'))
    } finally {
      setToggling(false)
    }
  }

  const handleSave = async () => {
    setError('')

    if (enabled && !hasPassword && !password) {
      setError(t('tempLogin.passwordRequired'))
      return
    }

    try {
      setSaving(true)
      await apiRequest('/auth/temp-login', {
        method: 'PUT',
        body: JSON.stringify({ enabled, password: password || undefined }),
      })
      if (password) {
        setHasPassword(true)
        setPassword('')
      }
      showNotification(t('tempLogin.saved'), 'success')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('tempLogin.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Alert type="error" message={t('tempLogin.accessDeniedMessage')} />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('tempLogin.title')}</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t('tempLogin.subtitle')}</p>
      </div>

      <div className="card">
        <div className="card-body space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
          ) : (
            <>
              {error && <Alert type="error" message={error} />}

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('tempLogin.enableLabel')}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('tempLogin.enableDescription')}</p>
                </div>
                <ToggleSwitch checked={enabled} onChange={handleToggle} disabled={toggling} label={t('tempLogin.enableLabel')} />
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  label={hasPassword ? t('tempLogin.newPasswordLabel') : t('tempLogin.passwordLabel')}
                  helpText={t('tempLogin.passwordHelp')}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={hasPassword ? t('tempLogin.newPasswordPlaceholder') : t('tempLogin.passwordPlaceholder')}
                  autoComplete="new-password"
                  rightIcon={
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="pointer-events-auto text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                      aria-label={showPassword ? t('tempLogin.hidePassword') : t('tempLogin.showPassword')}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  }
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={handleSave}
                  loading={saving}
                  disabled={saving}
                  leftIcon={<Save className="w-4 h-4" />}
                >
                  {saving ? t('common.saving') : t('common.save')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default TempLoginSettingsPage
