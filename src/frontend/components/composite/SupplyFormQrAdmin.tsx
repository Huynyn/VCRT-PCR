import React, { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui'
import { Input } from '@/components/forms'
import { apiRequest } from '@/utils/api'

const SupplyFormQrAdmin: React.FC = () => {
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiRequest('/settings/supply_form_url')
      .then(res => {
        const url = res.data?.value || null
        setSavedUrl(url)
        setInputValue(url || '')
      })
      .catch(() => setError('Failed to load current setting'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!savedUrl) {
      setQrDataUrl(null)
      return
    }
    QRCode.toDataURL(savedUrl, { width: 200, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null))
  }, [savedUrl])

  const handleSave = async () => {
    setError('')
    setSaved(false)
    try {
      setSaving(true)
      const res = await apiRequest('/settings/supply_form_url', {
        method: 'PUT',
        body: JSON.stringify({ value: inputValue.trim() }),
      })
      setSavedUrl(res.data?.value || null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-6">
      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Supply Usage Form QR Code
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Set the Microsoft Form link responders use to report supplies used from the bags
          </p>
        </div>
        <div className="card-body">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
          ) : (
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="flex-1 w-full space-y-3">
                {error && (
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                )}
                <Input
                  label="Microsoft Form URL"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder="https://forms.office.com/..."
                />
                <Button
                  onClick={handleSave}
                  loading={saving}
                  disabled={saving}
                  leftIcon={<Save className="w-4 h-4" />}
                >
                  {saved ? 'Saved!' : 'Save'}
                </Button>
              </div>

              {qrDataUrl && (
                <div className="shrink-0 p-3 bg-white rounded-lg border border-gray-200 dark:border-gray-600">
                  <img src={qrDataUrl} alt="QR code preview" width={160} height={160} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SupplyFormQrAdmin
