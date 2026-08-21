import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Edit, HelpCircle, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { Modal, Button, TitleBadge } from '@/components/ui'
import { Input, Select } from '@/components/forms'

type DebriefCategory = 'General' | 'Clinical Performance' | 'Teamwork' | 'Wellbeing' | 'Safety' | 'Documentation'

interface DebriefQuestionItem {
  question: string
  category: DebriefCategory
}

const DEFAULT_DEBRIEF_QUESTIONS: DebriefQuestionItem[] = [
  { question: 'What do you feel went well / didn\'t go well on this call?', category: 'General' },
  { question: 'What do you think I did well as a supervisor and what do you think I can improve on?', category: 'General' },
  { question: 'Is there anything you would do differently if you could run the call again?', category: 'General' },
  { question: 'Was there anything about the call that surprised you or that you weren\'t expecting?', category: 'General' },
  { question: 'Did you feel prepared going into this call?', category: 'General' },
  { question: 'Is there anything you want to practice after the call?', category: 'Clinical Performance' },
  { question: 'Did you feel confident in your treatment decisions during the call?', category: 'Clinical Performance' },
  { question: 'How did communication flow between you and your partner(s) during the call?', category: 'Teamwork' },
  { question: 'Were roles and responsibilities clear between team members on scene?', category: 'Teamwork' },
  { question: 'Was communication with the patient and any bystanders/family clear and effective?', category: 'Teamwork' },
  { question: 'Was the handover or transfer of care communicated clearly?', category: 'Teamwork' },
  { question: 'How are you feeling after this call?', category: 'Wellbeing' },
  { question: 'Was there anything about this call that was emotionally difficult for you?', category: 'Wellbeing' },
  { question: 'Is there anything you\'d like to talk through privately rather than as a group?', category: 'Wellbeing' },
]

const CATEGORY_OPTIONS: DebriefCategory[] = [
  'General',
  'Clinical Performance',
  'Teamwork',
  'Wellbeing',
  'Safety',
  'Documentation',
]

const DebriefQuestionsSection: React.FC = () => {
  const { t } = useTranslation()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [questions, setQuestions] = useState<DebriefQuestionItem[]>(DEFAULT_DEBRIEF_QUESTIONS)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  const [showEditModal, setShowEditModal] = useState(false)
  const [draft, setDraft] = useState<DebriefQuestionItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/settings/debrief_questions')
      .then(res => {
        if (res.data?.value) {
          try {
            const parsed = JSON.parse(res.data.value)
            if (Array.isArray(parsed) && parsed.length > 0) setQuestions(parsed)
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

  const openEdit = () => {
    setDraft(questions.map(q => ({ ...q })))
    setError('')
    setShowEditModal(true)
  }

  const updateDraftItem = (index: number, field: keyof DebriefQuestionItem, value: string) => {
    setDraft(prev => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
  }

  const removeDraftItem = (index: number) => {
    setDraft(prev => prev.filter((_, i) => i !== index))
  }

  const addDraftItem = () => {
    // Prepend rather than append: the list box has a fixed max height, and an
    // existing list can already be long enough that a row added at the end
    // would land below the visible scroll area, making the click look like
    // it did nothing.
    setDraft(prev => [{ question: '', category: 'General' }, ...prev])
  }

  const handleSave = async () => {
    const cleaned = draft
      .map(d => ({ ...d, question: d.question.trim() }))
      .filter(d => d.question)

    if (cleaned.length === 0) {
      setError(t('debrief.addAtLeastOne'))
      return
    }

    try {
      setSaving(true)
      await apiRequest('/settings/debrief_questions', {
        method: 'PUT',
        body: JSON.stringify({ value: JSON.stringify(cleaned) }),
      })
      setQuestions(cleaned)
      setShowEditModal(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('debrief.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="card h-full min-w-0 flex flex-col">
        <div className="flex-1 min-w-0 flex flex-col items-start gap-3 px-6 pt-4 pb-6">
          <TitleBadge icon={<HelpCircle className="w-5 h-5" />} className="w-full">{t('debrief.title')}</TitleBadge>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-snug">{t('debrief.description')}</p>
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

      <Modal isOpen={expanded} onClose={() => setExpanded(false)} title={t('debrief.title')} size="lg">
        <div className="space-y-4">
          {isAdmin && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={openEdit}
                className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300 inline-flex items-center gap-1"
              >
                <Edit className="w-3 h-3" />
                {t('common.edit')}
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
          ) : (
            <div
              className="flex flex-col gap-3"
              role="listbox"
              aria-label={t('debrief.ariaLabel')}
            >
              {questions.map((item, i) => (
                <div
                  key={i}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <p className="text-base text-gray-900 dark:text-gray-100">
                    {item.question}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('debrief.editTitle')}
        size="xl"
      >
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
            {draft.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="flex-1">
                  <Input
                    value={item.question}
                    onChange={e => updateDraftItem(i, 'question', e.target.value)}
                    placeholder={t('debrief.questionPlaceholder')}
                  />
                </div>
                <div className="w-48">
                  <Select
                    value={item.category}
                    onChange={e => updateDraftItem(i, 'category', e.target.value)}
                    options={CATEGORY_OPTIONS.map(c => ({ value: c, label: c }))}
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
            {t('debrief.addQuestion')}
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

export default DebriefQuestionsSection
