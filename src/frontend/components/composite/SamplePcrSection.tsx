import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Edit, FileText } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { Modal, Button, TitleBadge } from '@/components/ui'
import { Textarea } from '@/components/forms'

const DEFAULT_SAMPLE_PCR = `VCRT (all responders full names) recieved a call at [24:00 time] for a patient (PT) [chief complaint protection told you over the phone] at [reported location]. VCRT arrived on scene [specify location if different from reported location] at [24:00 time] to find PT (full name) [PT position] [scene description; ex. with/without Protection and/or sports services on scene). VCRT approached PT and obtained consent to begin treatment. [any info reported by bystanders/Protection]. VCRT (responder name) conducted primary assessment and RBS [any findings requiring intervention or not; ex. RBS found ..., SMR was ruled out + reason]. VCRT (responder name) began taking 1st set of vitals while VCRT (responder name) obtained SAMPLE [and OPQRST if pain reported]. First set of vitals [normal/out of range, obtained/not obtained + reason or any interventions]. PT reported [events prior/background & situation details/complaints]. VCRT (responder name) [describe any treatment done and PT's response to any treatment] [describe any additional info or details PT reports and any advice given to PT]. VCRT (responder name) obtained second set of vitals [in/out, etc.] [any further care / details, any UTOs / DNOs reasoning...].`

const SamplePcrSection: React.FC = () => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [text, setText] = useState(DEFAULT_SAMPLE_PCR)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const [showEditModal, setShowEditModal] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/settings/sample_pcr_text')
      .then(res => {
        if (res.data?.value) setText(res.data.value)
      })
      .catch(() => {
        // Silently fail - falls back to the default text
      })
      .finally(() => setLoading(false))
  }, [])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // Clipboard can fail in some browser contexts
    }
  }

  const openEdit = () => {
    setDraft(text)
    setError('')
    setShowEditModal(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      await apiRequest('/settings/sample_pcr_text', {
        method: 'PUT',
        body: JSON.stringify({ value: draft }),
      })
      setText(draft)
      setShowEditModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('samplePcr.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="card h-full min-w-0 flex flex-col">
        <div className="flex-1 min-w-0 flex flex-col items-start gap-3 px-6 pt-4 pb-6">
          <TitleBadge icon={<FileText className="w-5 h-5" />} className="w-full">{t('samplePcr.title')}</TitleBadge>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">{t('samplePcr.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={t('common.expand')}
          className="flex items-center justify-center py-3 border-t border-gray-200 dark:border-gray-700 text-gray-400 hover:text-primary-600 hover:bg-gray-50 dark:text-gray-500 dark:hover:text-primary-400 dark:hover:bg-gray-700/50 transition-colors rounded-b-lg"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
      </div>

      <Modal isOpen={expanded} onClose={() => setExpanded(false)} title={t('samplePcr.title')} size="lg">
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300"
            >
              {copied ? t('common.copied') : t('common.copy')}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={openEdit}
                className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300 inline-flex items-center gap-1"
              >
                <Edit className="w-3 h-3" />
                {t('common.edit')}
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
          ) : (
            <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/40 p-4 rounded-lg border border-gray-100 dark:border-gray-700">
              {text}
            </pre>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('samplePcr.editTitle')}
        size="lg"
      >
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={14} />
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowEditModal(false)} disabled={saving}>
              {t('common.cancel')}
            </Button>
            <Button variant="outline" onClick={handleSave} loading={saving} disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

export default SamplePcrSection
