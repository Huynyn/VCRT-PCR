import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { ClipboardList } from 'lucide-react'
import { apiRequest } from '@/utils/api'
import { TitleBadge } from '@/components/ui'

const SupplyFormQrSection: React.FC = () => {
  const { t } = useTranslation()
  const [url, setUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest('/settings/supply_form_url')
      .then(res => setUrl(res.data?.value || null))
      .catch(() => {
        // Silently fail - section just won't show a QR code
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!url) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(url, { width: 200, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [url])

  return (
    <div className="mb-6">
      <div className="card">
        <div className="card-header-flush">
          <TitleBadge icon={<ClipboardList className="w-5 h-5" />}>{t('supplyForm.title')}</TitleBadge>
        </div>
        <div className="card-body">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
          ) : !url ? (
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <ClipboardList className="w-5 h-5 shrink-0" />
              <p>{t('supplyForm.notSetUp')}</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-1 text-base text-gray-700 dark:text-gray-300">
                <p>{t('supplyForm.instructions')}</p>
              </div>
              <div className="shrink-0 p-3 bg-white rounded-lg border border-gray-200 dark:border-gray-600">
                {qrDataUrl && (
                  <img src={qrDataUrl} alt={t('supplyForm.qrAlt')} width={160} height={160} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SupplyFormQrSection
