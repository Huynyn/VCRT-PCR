import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, ChevronDown, Edit, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { Modal, Button, TitleBadge } from '@/components/ui'
import { Input, Select } from '@/components/forms'

type AcronymCategory = 'General' | 'Assessment' | 'Respiratory' | 'Cardiac' | 'Neuro' | 'Transfer'

interface AcronymItem {
  acronym: string
  meaning: string
  category: AcronymCategory
}

const DEFAULT_MEDICAL_ACRONYMS: AcronymItem[] = [
  { acronym: 'SOB', meaning: 'Shortness of breath', category: 'Respiratory' },
  { acronym: 'LOC', meaning: 'Level of consciousness', category: 'Neuro' },
  { acronym: 'GCS', meaning: 'Glasgow Coma Scale', category: 'Neuro' },
  {
    acronym: 'A&O x3',
    meaning: 'Alert and oriented to person, place, and time',
    category: 'Assessment',
  },
  { acronym: 'Hx', meaning: 'History', category: 'Assessment' },
  { acronym: 'Tx', meaning: 'Treatment', category: 'Assessment' },
  { acronym: 'SpO2', meaning: 'Peripheral oxygen saturation', category: 'Respiratory' },
  { acronym: 'RR', meaning: 'Respiratory rate', category: 'Respiratory' },
  { acronym: 'HR', meaning: 'Heart rate', category: 'Cardiac' },
  { acronym: 'BP', meaning: 'Blood pressure', category: 'Cardiac' },
  { acronym: 'PTA', meaning: 'Prior to arrival', category: 'Transfer' },
  { acronym: 'ETA', meaning: 'Estimated time of arrival', category: 'Transfer' },
  { acronym: 'TOC', meaning: 'Transfer of care', category: 'Transfer' },
  { acronym: 'NKA', meaning: 'No known allergies', category: 'Assessment' },
  { acronym: 'NKDA', meaning: 'No known drug allergies', category: 'Assessment' },
  { acronym: 'Cap refill', meaning: 'Capillary refill time', category: 'Cardiac' },
  { acronym: 'Diaphoretic', meaning: 'Sweaty/clammy', category: 'General' },
  { acronym: 'O2', meaning: 'Oxygen', category: 'Respiratory' },
  { acronym: 'NC', meaning: 'Nasal cannula', category: 'Respiratory' },
  { acronym: 'NRB', meaning: 'Non-rebreather mask', category: 'Respiratory' },
  { acronym: 'BVM', meaning: 'Bag-valve-mask', category: 'Respiratory' },
  { acronym: 'Wheeze', meaning: 'Wheezing on auscultation', category: 'Respiratory' },
  { acronym: 'Crackles', meaning: 'Crackles/rales present', category: 'Respiratory' },
  { acronym: 'Stridor', meaning: 'Upper airway high-pitched sound', category: 'Respiratory' },
  {
    acronym: 'Dyspnea',
    meaning: 'Difficult or labored breathing (shortness of breath)',
    category: 'Respiratory',
  },
  { acronym: 'Bradypnea vs. Tachypnea', meaning: 'Slow vs. fast breathing rate', category: 'Respiratory' },
  { acronym: 'Apnea', meaning: 'Absense of breathing', category: 'Respiratory' },
  { acronym: 'Distension', meaning: 'Abdominal bloating/swelling', category: 'General' },
  { acronym: 'Hematemesis', meaning: 'Blood in vomit', category: 'General' },
  { acronym: 'Dysuria', meaning: 'Painful urination', category: 'General' },
  { acronym: 'Hematuria', meaning: 'Blood in urine', category: 'General' },
  { acronym: 'WNL', meaning: 'Within normal limits', category: 'Assessment' },
  { acronym: 'Acute', meaning: 'Sudden/recent onset', category: 'Assessment' },
  { acronym: 'Chronic', meaning: 'Ongoing/longstanding', category: 'Assessment' },
  { acronym: 'Baseline', meaning: 'Usual condition', category: 'Assessment' },
  { acronym: 'MOI', meaning: 'Mechanism of injury', category: 'Assessment' },
  { acronym: 'Deformity', meaning: 'Visible structural change', category: 'Assessment' },
  { acronym: 'Ecchymosis', meaning: 'Bruising', category: 'Assessment' },
  { acronym: 'Laceration', meaning: 'Jagged tear or slice in the skin and underlying tissues', category: 'Assessment' },
  { acronym: 'Puncture', meaning: 'Deep narrow injury from a sharp object', category: 'Assessment' },
  { acronym: 'Contusion', meaning: 'An injury from blunt force that damages tissues and vessels, causing minor bleeding of tissues', category: 'Assessment' },
  { acronym: 'Abrasion', meaning: 'Superficial skin injury', category: 'Assessment' },
  { acronym: 'Avulsion', meaning: 'Tissue torn away', category: 'Assessment' },
  { acronym: 'RRR', meaning: 'Regular rate and rhythm (cardiac exam)', category: 'Cardiac' },
  {
    acronym: 'AVPU',
    meaning: 'Alert, Voice, Pain, Unresponsive responsiveness scale',
    category: 'Neuro',
  },
  { acronym: 'VS', meaning: 'Vital signs', category: 'Assessment' },
  {
    acronym: 'PERRLA',
    meaning: 'Pupils equal, round, reactive to light and accommodation',
    category: 'Assessment',
  },
  { acronym: 'WDN', meaning: 'Warm, dry, normal skin', category: 'Assessment' },
  { acronym: 'Sweaty/Damp vs. Dry', meaning: 'Accumlation of moisture on skin vs. lack of', category: 'Assessment' },
  { acronym: 'Clammy', meaning: 'Cold and moist', category: 'Assessment' },
  { acronym: 'Cool vs. Hot', meaning: 'Abnormal temperature of skin', category: 'Assessment' },
  { acronym: 'Flushed', meaning: 'Temporary reddening of face', category: 'Assessment' },
  { acronym: 'Pale', meaning: 'Lack of colour on skin and lips', category: 'Assessment' },
  { acronym: 'Supine', meaning: 'Lying flat on their back', category: 'Assessment' },
  { acronym: 'Tripod', meaning: 'Sitting forward at a 45 degree angle', category: 'Assessment' },
  { acronym: 'Prone', meaning: 'Lying flat on their stomach', category: 'Assessment' },
  { acronym: 'Semi-prone', meaning: 'Recovery position', category: 'Assessment' },
  { acronym: 'Regular vs. Irregular', meaning: 'Normal breathing vs. Disorganized breathing', category: 'Respiratory' },
  { acronym: 'Laboured', meaning: 'Working hard to breathe', category: 'Respiratory' },
  { acronym: 'Shallow', meaning: 'Small breaths that don\'t fully expand the lungs', category: 'Respiratory' },
  { acronym: 'Patent vs. Obstructued', meaning: 'Open vs. blocked airway', category: 'Respiratory' },
]

const FILTER_CATEGORY_OPTIONS: Array<'All' | AcronymCategory> = [
  'All',
  'General',
  'Assessment',
  'Respiratory',
  'Cardiac',
  'Neuro',
  'Transfer',
]

const EDIT_CATEGORY_OPTIONS: AcronymCategory[] = [
  'General',
  'Assessment',
  'Respiratory',
  'Cardiac',
  'Neuro',
  'Transfer',
]

const MedicalGlossarySection: React.FC = () => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [acronyms, setAcronyms] = useState<AcronymItem[]>(DEFAULT_MEDICAL_ACRONYMS)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const [acronymQuery, setAcronymQuery] = useState('')
  const [acronymCategory, setAcronymCategory] = useState<'All' | AcronymCategory>('All')
  const [showAllAcronyms, setShowAllAcronyms] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [showEditModal, setShowEditModal] = useState(false)
  const [draft, setDraft] = useState<AcronymItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/settings/medical_glossary')
      .then(res => {
        if (res.data?.value) {
          try {
            const parsed = JSON.parse(res.data.value)
            if (Array.isArray(parsed) && parsed.length > 0) setAcronyms(parsed)
          } catch {
            // Ignore malformed stored value, keep defaults
          }
        }
      })
      .catch(() => {
        // Silently fail - falls back to the default list
      })
      .finally(() => setLoading(false))
  }, [])

  const filteredAcronyms = useMemo(() => {
    const q = acronymQuery.trim().toLowerCase()

    const filtered = acronyms.filter(item => {
      const matchesCategory = acronymCategory === 'All' || item.category === acronymCategory
      const matchesQuery =
        q.length === 0 ||
        item.acronym.toLowerCase().includes(q) ||
        item.meaning.toLowerCase().includes(q)

      return matchesCategory && matchesQuery
    })

    return [...filtered].sort((a, b) =>
      a.acronym.localeCompare(b.acronym, undefined, { sensitivity: 'base' }),
    )
  }, [acronyms, acronymQuery, acronymCategory])

  const displayedAcronyms = showAllAcronyms ? filteredAcronyms : filteredAcronyms.slice(0, 8)

  const handleCopyAcronym = async (item: AcronymItem) => {
    const text = `${item.acronym}: ${item.meaning}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(item.acronym)
      setTimeout(() => setCopiedKey(null), 1200)
    } catch {
      // Clipboard can fail in some browser contexts
    }
  }

  const openEdit = () => {
    setDraft(acronyms.map(a => ({ ...a })))
    setError('')
    setShowEditModal(true)
  }

  const updateDraftItem = (index: number, field: keyof AcronymItem, value: string) => {
    setDraft(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeDraftItem = (index: number) => {
    setDraft(prev => prev.filter((_, i) => i !== index))
  }

  const addDraftItem = () => {
    // Prepend rather than append: the list can already be long enough
    // (60+ terms by default) that a row added at the end would land below
    // the modal's visible scroll area, making the click look like it did
    // nothing.
    setDraft(prev => [{ acronym: '', meaning: '', category: 'General' }, ...prev])
  }

  const handleSave = async () => {
    const cleaned = draft
      .map(d => ({ ...d, acronym: d.acronym.trim(), meaning: d.meaning.trim() }))
      .filter(d => d.acronym && d.meaning)

    if (cleaned.length === 0) {
      setError(t('glossary.addAtLeastOne'))
      return
    }

    try {
      setSaving(true)
      await apiRequest('/settings/medical_glossary', {
        method: 'PUT',
        body: JSON.stringify({ value: JSON.stringify(cleaned) }),
      })
      setAcronyms(cleaned)
      setShowEditModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('glossary.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="card h-full min-w-0 flex flex-col">
        <div className="flex-1 min-w-0 flex flex-col items-start gap-3 px-6 pt-4 pb-6">
          <TitleBadge icon={<BookOpen className="w-5 h-5" />} className="w-full">{t('glossary.title')}</TitleBadge>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">{t('glossary.description')}</p>
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

      <Modal isOpen={expanded} onClose={() => setExpanded(false)} title={t('glossary.title')} size="xl">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-end">
            <input
              value={acronymQuery}
              onChange={e => setAcronymQuery(e.target.value)}
              placeholder={t('glossary.searchPlaceholder')}
              className="w-full sm:w-48 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400"
            />
            <select
              value={acronymCategory}
              onChange={e => setAcronymCategory(e.target.value as 'All' | AcronymCategory)}
              className="w-full sm:w-32 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            >
              {FILTER_CATEGORY_OPTIONS.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? t('common.all') : cat}
                </option>
              ))}
            </select>
            {isAdmin && (
              <button
                type="button"
                onClick={openEdit}
                className="text-xs px-3 py-2 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300 inline-flex items-center justify-center gap-1 shrink-0"
              >
                <Edit className="w-3 h-3" />
                {t('common.edit')}
              </button>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
          ) : filteredAcronyms.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {t('glossary.noResults')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {displayedAcronyms.map(item => (
                  <div
                    key={`${item.acronym}-${item.category}`}
                    className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {item.acronym}
                          </span>
                          <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-primary-100 text-primary-700 dark:bg-primary-700/50 dark:text-primary-200">
                            {item.category}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                          {item.meaning}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyAcronym(item)}
                        className="shrink-0 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300"
                      >
                        {copiedKey === item.acronym ? t('common.copied') : t('common.copy')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredAcronyms.length > 8 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowAllAcronyms(prev => !prev)}
                    className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {showAllAcronyms
                      ? t('common.showLess')
                      : t('common.showAll', { count: filteredAcronyms.length })}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('glossary.editTitle')}
        size="xl"
      >
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="space-y-3">
            {draft.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-32">
                  <Input
                    value={item.acronym}
                    onChange={e => updateDraftItem(i, 'acronym', e.target.value)}
                    placeholder={t('glossary.acronymPlaceholder')}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    value={item.meaning}
                    onChange={e => updateDraftItem(i, 'meaning', e.target.value)}
                    placeholder={t('glossary.meaningPlaceholder')}
                  />
                </div>
                <div className="w-40">
                  <Select
                    value={item.category}
                    onChange={e => updateDraftItem(i, 'category', e.target.value)}
                    options={EDIT_CATEGORY_OPTIONS.map(c => ({ value: c, label: c }))}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDraftItem(i)}
                  className="text-red-600 hover:text-red-700 mt-1"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addDraftItem} leftIcon={<Plus className="w-4 h-4" />}>
            {t('glossary.addTerm')}
          </Button>

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

export default MedicalGlossarySection
