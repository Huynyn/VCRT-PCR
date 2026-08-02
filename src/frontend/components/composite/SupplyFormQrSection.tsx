import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { ClipboardList } from 'lucide-react'
import { apiRequest } from '@/utils/api'

const SupplyFormQrSection: React.FC = () => {
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
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Report Supplies Used
          </h3>
        </div>
        <div className="card-body">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
          ) : !url ? (
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <ClipboardList className="w-5 h-5 shrink-0" />
              <p>An admin hasn't set up the supply-usage form link yet.</p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-1 text-base text-gray-700 dark:text-gray-300">
                <p>
                  Scan this QR code with your phone to open the Microsoft Form and report any
                  medical supplies used from the bags during a call. Make sure to do that even
                  if no supplies were used, so we can track usage and restock the bags as needed.
                </p>
              </div>
              <div className="shrink-0 p-3 bg-white rounded-lg border border-gray-200 dark:border-gray-600">
                {qrDataUrl && (
                  <img src={qrDataUrl} alt="QR code for supply usage form" width={160} height={160} />
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
