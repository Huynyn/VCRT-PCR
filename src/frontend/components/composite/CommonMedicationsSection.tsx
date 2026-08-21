import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Edit, Pill, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { Modal, Button, TitleBadge } from '@/components/ui'
import { Input } from '@/components/forms'
import { cn } from '@/utils'

interface MedicationItem {
  genericName: string
  brandName: string
  category: string
  indications: string
  dose: string
}

// Transcribed from the printed medication reference sheets posted in the
// office. Lamotrigine/Lamictal appears on both sheets (once under
// Anticonvulsants, once under Mood stabilizers) - kept as a single
// Anticonvulsants entry here since its indications line already covers both
// uses, rather than listing the same drug twice.
const DEFAULT_MEDICATIONS: MedicationItem[] = [
  { genericName: 'Ibuprofen', brandName: 'Advil', category: 'Analgesics / NSAIDs', indications: 'Pain, inflammation', dose: '200-800 mg' },
  { genericName: 'Naproxen', brandName: 'Aleve', category: 'Analgesics / NSAIDs', indications: 'Pain, inflammation', dose: '225-500 mg' },
  { genericName: 'Tramadol', brandName: 'Tramacet', category: 'Opioids', indications: 'Pain', dose: '50-100 mg' },
  { genericName: 'Hydromorphone', brandName: 'Dilaudid', category: 'Opioids', indications: 'Pain', dose: '1-4 mg' },
  { genericName: 'Morphine', brandName: 'Statex / MS IR', category: 'Opioids', indications: 'Pain', dose: '5-30 mg' },
  { genericName: 'Warfarin', brandName: 'Coumadin', category: 'Anticoagulants', indications: 'Thrombosis prevention', dose: '2-10 mg' },
  { genericName: 'Apixaban', brandName: 'Eliquis', category: 'Anticoagulants', indications: 'Thrombosis prevention', dose: '2.5-5 mg' },
  { genericName: 'Salbutamol (Blue pump)', brandName: 'Ventolin', category: 'Bronchodilators / Emergency', indications: 'Asthma, COPD', dose: '100-200 mcg' },
  { genericName: 'Tiotropium bromide (White, light blue cap)', brandName: 'Spiriva Respimat', category: 'Bronchodilators / Long-acting', indications: 'Asthma, COPD', dose: '50 mcg' },
  { genericName: 'Fluticasone (Orange pump)', brandName: 'Flovent', category: 'Inhaled steroids', indications: 'Asthma', dose: '100-500 mcg' },
  { genericName: 'Ciclesonide (Brown pump 100mcg / Red pump 200mcg)', brandName: 'Alvesco', category: 'Inhaled steroids', indications: 'Asthma', dose: '100-400 mcg' },
  { genericName: 'Fluticasone / Salmeterol (Purple pump)', brandName: 'Advair', category: 'Combination inhalers', indications: 'Asthma, COPD', dose: '1 inhalation' },
  { genericName: 'Budesonide / Formoterol (White tube, red twist cap)', brandName: 'Symbicort', category: 'Combination inhalers', indications: 'Asthma, COPD', dose: '2 inhalations' },
  { genericName: 'Levothyroxine', brandName: 'Synthroid', category: 'Thyroid meds', indications: 'Hypothyroidism', dose: '25-200 mcg' },
  { genericName: 'Furosemide', brandName: 'Lasix', category: 'Diuretics', indications: 'Edema, hypertension', dose: '20-80 mg' },
  { genericName: 'Carbamazepine', brandName: 'Tegretol', category: 'Anticonvulsants', indications: 'Epilepsy', dose: '200-1200 mg' },
  { genericName: 'Lamotrigine', brandName: 'Lamictal', category: 'Anticonvulsants', indications: 'Bipolar disorder AND epilepsy', dose: '25-200 mg' },
  { genericName: 'Fluconazole', brandName: 'Diflucan', category: 'Antifungals', indications: 'Vaginal fungal infections', dose: '150-400 mg' },
  { genericName: 'Amoxicillin', brandName: 'Amoxil', category: 'Antibiotics', indications: 'Bacterial infections (mostly ENT)', dose: '250-1000 mg' },
  { genericName: 'Amoxicillin / Clavulanate', brandName: 'Clavulin', category: 'Antibiotics', indications: 'Bacterial infections (mostly ENT)', dose: '500/125 - 850/125 mg' },
  { genericName: 'Azithromycin', brandName: 'Zithromax', category: 'Antibiotics', indications: 'Bacterial infections (ENT and STD)', dose: '250-500 mg' },
  { genericName: 'Doxycycline', brandName: 'Doxycin', category: 'Antibiotics', indications: 'Bacterial infections (STD and acne)', dose: '40-100 mg' },
  { genericName: 'Mometasone', brandName: 'Nasonex', category: 'Nasal / Allergy', indications: 'Allergic rhinitis, nasal polyps', dose: '1-2 sprays per nostril' },
  { genericName: 'Fluticasone nasal', brandName: 'Flonase', category: 'Nasal / Allergy', indications: 'Allergic rhinitis', dose: '1-2 sprays per nostril' },
  { genericName: 'Sertraline', brandName: 'Zoloft', category: 'Antidepressants', indications: 'Depression, anxiety', dose: '25-200 mg' },
  { genericName: 'Escitalopram', brandName: 'Cipralex / Lexapro', category: 'Antidepressants', indications: 'Depression, anxiety', dose: '10-20 mg' },
  { genericName: 'Venlafaxine', brandName: 'Effexor XR', category: 'Antidepressants', indications: 'Depression, anxiety', dose: '75-225 mg' },
  { genericName: 'Citalopram', brandName: 'Celexa', category: 'Antidepressants', indications: 'Depression, anxiety', dose: '10-40 mg' },
  { genericName: 'Fluoxetine', brandName: 'Prozac', category: 'Antidepressants', indications: 'Depression, anxiety', dose: '10-80 mg' },
  { genericName: 'Desvenlafaxine', brandName: 'Pristiq', category: 'Antidepressants', indications: 'Depression, anxiety', dose: '50-100 mg' },
  { genericName: 'Amitriptyline', brandName: 'Elavil', category: 'Antidepressants', indications: 'Depression, anxiety, neuropathic pain', dose: '10-100 mg' },
  { genericName: 'Lorazepam', brandName: 'Ativan', category: 'Anxiolytics / Benzodiazepines', indications: 'Anxiety, sedation', dose: '0.5-2 mg' },
  { genericName: 'Diazepam', brandName: 'Valium', category: 'Anxiolytics / Benzodiazepines', indications: 'Anxiety, muscle spasm', dose: '2-10 mg' },
  { genericName: 'Clonazepam', brandName: 'Rivotril / Klonopin', category: 'Anxiolytics / Benzodiazepines', indications: 'Anxiety, panic disorder, seizures', dose: '0.25-2 mg' },
  { genericName: 'Quetiapine', brandName: 'Seroquel', category: 'Antipsychotics', indications: 'Schizophrenia, bipolar', dose: '50-800 mg' },
  { genericName: 'Aripiprazole', brandName: 'Abilify', category: 'Antipsychotics', indications: 'Schizophrenia, bipolar disorder (in some cases, depression)', dose: '10-30 mg (Depression: 2-5 mg)' },
  { genericName: 'Risperidone', brandName: 'Risperdal', category: 'Antipsychotics', indications: 'Schizophrenia, bipolar', dose: '0.5-6 mg' },
  { genericName: 'Metformin', brandName: 'Glucophage', category: 'Antidiabetics', indications: 'Type 2 diabetes', dose: '500-1000 mg' },
  { genericName: 'Gliclazide', brandName: 'Diamicron', category: 'Antidiabetics', indications: 'Type 2 diabetes', dose: '30-60 mg' },
  { genericName: 'Perindopril', brandName: 'Coversyl', category: 'Antihypertensives', indications: 'Hypertension', dose: '4-8 mg' },
  { genericName: 'Amlodipine', brandName: 'Norvasc', category: 'Antihypertensives', indications: 'Hypertension', dose: '2.5-10 mg' },
  { genericName: 'Candesartan', brandName: 'Atacand', category: 'Antihypertensives', indications: 'Hypertension', dose: '8-32 mg' },
  { genericName: 'Ticagrelor', brandName: 'Brilinta', category: 'Antiplatelets', indications: 'Acute coronary syndrome (ACS)', dose: '60-90 mg' },
  { genericName: 'Clopidogrel', brandName: 'Plavix', category: 'Antiplatelets', indications: 'Acute coronary syndrome (ACS), stroke prevention', dose: '75 mg' },
  { genericName: 'Atorvastatin', brandName: 'Lipitor', category: 'Statins', indications: 'Hyperlipidemia (cholesterol)', dose: '10-80 mg' },
  { genericName: 'Rosuvastatin', brandName: 'Crestor', category: 'Statins', indications: 'Hyperlipidemia (cholesterol)', dose: '5-40 mg' },
  { genericName: 'Cetirizine', brandName: 'Reactine', category: 'Antihistamines', indications: 'Allergies', dose: '10-20 mg' },
  { genericName: 'Loratadine', brandName: 'Claritin', category: 'Antihistamines', indications: 'Allergies', dose: '10 mg' },
  { genericName: 'Bilastine', brandName: 'Blexten', category: 'Antihistamines', indications: 'Allergic rhinitis, urticaria', dose: '10-20 mg' },
  { genericName: 'Montelukast', brandName: 'Singulair', category: 'Respiratory / Allergy', indications: 'Asthma, allergies', dose: '4-10 mg' },
  { genericName: 'Omeprazole', brandName: 'Losec', category: 'Proton pump inhibitors', indications: 'GERD, ulcers', dose: '20-40 mg' },
  { genericName: 'Pantoprazole', brandName: 'Pantoloc', category: 'Proton pump inhibitors', indications: 'GERD, ulcers', dose: '20-40 mg' },
]

const CommonMedicationsSection: React.FC = () => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [medications, setMedications] = useState<MedicationItem[]>(DEFAULT_MEDICATIONS)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const categoryRef = useRef<HTMLDivElement>(null)
  const [showAll, setShowAll] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [showEditModal, setShowEditModal] = useState(false)
  const [draft, setDraft] = useState<MedicationItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/settings/common_medications')
      .then(res => {
        if (res.data?.value) {
          try {
            const parsed = JSON.parse(res.data.value)
            if (Array.isArray(parsed) && parsed.length > 0) setMedications(parsed)
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setCategoryOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const categoryOptions = useMemo(
    () => ['All', ...Array.from(new Set(medications.map(m => m.category))).sort((a, b) => a.localeCompare(b))],
    [medications],
  )

  const filteredMedications = useMemo(() => {
    const q = query.trim().toLowerCase()

    const filtered = medications.filter(item => {
      const matchesCategory = category === 'All' || item.category === category
      const matchesQuery =
        q.length === 0 ||
        item.genericName.toLowerCase().includes(q) ||
        item.brandName.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.indications.toLowerCase().includes(q)

      return matchesCategory && matchesQuery
    })

    return [...filtered].sort((a, b) =>
      a.genericName.localeCompare(b.genericName, undefined, { sensitivity: 'base' }),
    )
  }, [medications, query, category])

  const displayedMedications = showAll ? filteredMedications : filteredMedications.slice(0, 8)

  const handleCopy = async (item: MedicationItem) => {
    const text = `${item.genericName} (${item.brandName}) - ${item.category}: ${item.indications}. ${t('medications.doseLabel')}: ${item.dose}`
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(`${item.genericName}-${item.brandName}`)
      setTimeout(() => setCopiedKey(null), 1200)
    } catch {
      // Clipboard can fail in some browser contexts
    }
  }

  const openEdit = () => {
    setDraft(medications.map(m => ({ ...m })))
    setError('')
    setShowEditModal(true)
  }

  const updateDraftItem = (index: number, field: keyof MedicationItem, value: string) => {
    setDraft(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeDraftItem = (index: number) => {
    setDraft(prev => prev.filter((_, i) => i !== index))
  }

  const addDraftItem = () => {
    // Prepend rather than append: the list can already be long enough
    // (50+ medications by default) that a row added at the end would land
    // below the modal's visible scroll area, making the click look like it
    // did nothing.
    setDraft(prev => [{ genericName: '', brandName: '', category: '', indications: '', dose: '' }, ...prev])
  }

  const handleSave = async () => {
    const cleaned = draft
      .map(d => ({
        genericName: d.genericName.trim(),
        brandName: d.brandName.trim(),
        category: d.category.trim(),
        indications: d.indications.trim(),
        dose: d.dose.trim(),
      }))
      .filter(d => d.genericName && d.category)

    if (cleaned.length === 0) {
      setError(t('medications.addAtLeastOne'))
      return
    }

    try {
      setSaving(true)
      await apiRequest('/settings/common_medications', {
        method: 'PUT',
        body: JSON.stringify({ value: JSON.stringify(cleaned) }),
      })
      setMedications(cleaned)
      setShowEditModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('medications.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="card h-full min-w-0 flex flex-col">
        <div className="flex-1 min-w-0 flex flex-col items-start gap-3 px-6 pt-4 pb-6">
          <TitleBadge icon={<Pill className="w-5 h-5" />} className="w-full">{t('medications.title')}</TitleBadge>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">{t('medications.description')}</p>
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

      <Modal isOpen={expanded} onClose={() => setExpanded(false)} title={t('medications.title')} size="xl">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-end">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('medications.searchPlaceholder')}
              className="w-full sm:w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400"
            />
            <div className="relative w-full sm:w-56" ref={categoryRef}>
              <button
                type="button"
                onClick={() => setCategoryOpen(prev => !prev)}
                className="w-full flex items-center justify-between gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
              >
                <span className="truncate">{category === 'All' ? t('common.all') : category}</span>
                <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
              </button>

              {categoryOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-56 overflow-y-auto">
                  {categoryOptions.map(cat => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => {
                        setCategory(cat)
                        setCategoryOpen(false)
                      }}
                      className={cn(
                        'block w-full text-left px-3 py-2 text-sm hover:bg-primary-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100',
                        category === cat && 'bg-primary-50 dark:bg-gray-700 font-medium',
                      )}
                    >
                      {cat === 'All' ? t('common.all') : cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
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
          ) : filteredMedications.length === 0 ? (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {t('medications.noResults')}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {displayedMedications.map(item => (
                  <div
                    key={`${item.genericName}-${item.brandName}`}
                    className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {item.genericName}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ({item.brandName})
                          </span>
                        </div>
                        <span className="mt-1.5 inline-flex px-2 py-0.5 text-xs rounded-full bg-primary-100 text-primary-700 dark:bg-primary-700/50 dark:text-primary-200">
                          {item.category}
                        </span>
                        <p className="mt-1.5 text-sm text-gray-700 dark:text-gray-300">
                          {item.indications}
                        </p>
                        <p className="mt-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                          {t('medications.doseLabel')}: {item.dose}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopy(item)}
                        className="shrink-0 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300"
                      >
                        {copiedKey === `${item.genericName}-${item.brandName}` ? t('common.copied') : t('common.copy')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {filteredMedications.length > 8 && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setShowAll(prev => !prev)}
                    className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {showAll
                      ? t('common.showLess')
                      : t('common.showAll', { count: filteredMedications.length })}
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
        title={t('medications.editTitle')}
        size="xl"
      >
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="space-y-3">
            {draft.map((item, i) => (
              <div key={i} className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
                <div className="w-full sm:w-40">
                  <Input
                    value={item.genericName}
                    onChange={e => updateDraftItem(i, 'genericName', e.target.value)}
                    placeholder={t('medications.genericNamePlaceholder')}
                  />
                </div>
                <div className="w-full sm:w-32">
                  <Input
                    value={item.brandName}
                    onChange={e => updateDraftItem(i, 'brandName', e.target.value)}
                    placeholder={t('medications.brandNamePlaceholder')}
                  />
                </div>
                <div className="w-full sm:w-36">
                  <Input
                    value={item.category}
                    onChange={e => updateDraftItem(i, 'category', e.target.value)}
                    placeholder={t('medications.categoryPlaceholder')}
                  />
                </div>
                <div className="flex-1 w-full">
                  <Input
                    value={item.indications}
                    onChange={e => updateDraftItem(i, 'indications', e.target.value)}
                    placeholder={t('medications.indicationsPlaceholder')}
                  />
                </div>
                <div className="w-full sm:w-32">
                  <Input
                    value={item.dose}
                    onChange={e => updateDraftItem(i, 'dose', e.target.value)}
                    placeholder={t('medications.dosePlaceholder')}
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
            {t('medications.addMedication')}
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

export default CommonMedicationsSection
