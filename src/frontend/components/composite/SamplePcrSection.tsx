import React, { useEffect, useState } from 'react'
import { Edit } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { Modal, Button } from '@/components/ui'
import { Textarea } from '@/components/forms'

const DEFAULT_SAMPLE_PCR = `VCRT (all responders full names) recieved a call at [24:00 time] for a patient (PT) [chief complaint protection told you over the phone] at [reported location]. VCRT arrived on scene [specify location if different from reported location] at [24:00 time] to find PT (full name) [PT position] [scene description; ex. with/without Protection and/or sports services on scene). VCRT approached PT and obtained consent to begin treatment. [any info reported by bystanders/Protection]. VCRT (responder name) conducted primary assessment and RBS [any findings requiring intervention or not; ex. RBS found ..., SMR was ruled out + reason]. VCRT (responder name) began taking 1st set of vitals while VCRT (responder name) obtained SAMPLE [and OPQRST if pain reported]. First set of vitals [normal/out of range, obtained/not obtained + reason or any interventions]. PT reported [events prior/background & situation details/complaints]. VCRT (responder name) [describe any treatment done and PT's response to any treatment] [describe any additional info or details PT reports and any advice given to PT]. VCRT (responder name) obtained second set of vitals [in/out, etc.] [any further care / details, any UTOs / DNOs reasoning...].`

const SamplePcrSection: React.FC = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [text, setText] = useState(DEFAULT_SAMPLE_PCR)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

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
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-6">
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Sample PCR
            </h3>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={openEdit}
                  className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300 inline-flex items-center gap-1"
                >
                  <Edit className="w-3 h-3" />
                  Edit
                </button>
              )}
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className="card-body">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
          ) : (
            <pre className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
              {text}
            </pre>
          )}
        </div>
      </div>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Sample PCR"
        size="lg"
      >
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={14} />
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowEditModal(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={saving}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default SamplePcrSection
