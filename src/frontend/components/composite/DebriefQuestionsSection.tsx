import React, { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Edit, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { Modal, Button } from '@/components/ui'
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

const VISIBLE_QUESTIONS = 3

const DebriefQuestionsSection: React.FC = () => {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [questions, setQuestions] = useState<DebriefQuestionItem[]>(DEFAULT_DEBRIEF_QUESTIONS)
  const [loading, setLoading] = useState(true)
  const [startIndex, setStartIndex] = useState(0)

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

  useEffect(() => {
    setStartIndex(0)
  }, [questions])

  const maxStartIndex = Math.max(0, Math.ceil(questions.length / VISIBLE_QUESTIONS) - 1) * VISIBLE_QUESTIONS
  const canScrollUp = startIndex > 0
  const canScrollDown = startIndex < maxStartIndex

  const scrollUp = () => setStartIndex(i => Math.max(0, i - VISIBLE_QUESTIONS))
  const scrollDown = () => setStartIndex(i => Math.min(maxStartIndex, i + VISIBLE_QUESTIONS))

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      scrollUp()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      scrollDown()
    }
  }

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
      setError('Add at least one question')
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
              Debrief Questions
            </h3>
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
          </div>
        </div>

        <div className="card-body">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
          ) : (
            <div
              className="flex items-stretch gap-2 outline-none"
              tabIndex={0}
              onKeyDown={handleKeyDown}
              role="listbox"
              aria-label="Debrief questions"
            >
              <div className="flex flex-col gap-3 flex-1 min-w-0">
                {questions.slice(startIndex, startIndex + VISIBLE_QUESTIONS).map((item, i) => (
                  <div
                    key={startIndex + i}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <p className="text-base text-gray-900 dark:text-gray-100">
                      {item.question}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col items-center justify-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={scrollUp}
                  disabled={!canScrollUp}
                  aria-label="Show previous question"
                  className="p-1.5 rounded-full text-primary-600 hover:bg-primary-50 hover:text-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/30 dark:hover:text-primary-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500 select-none">
                  {Math.min(startIndex + VISIBLE_QUESTIONS, questions.length)}/{questions.length}
                </span>
                <button
                  type="button"
                  onClick={scrollDown}
                  disabled={!canScrollDown}
                  aria-label="Show next question"
                  className="p-1.5 rounded-full text-primary-600 hover:bg-primary-50 hover:text-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/30 dark:hover:text-primary-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Debrief Questions"
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
                    placeholder="Question text"
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
            Add Question
          </Button>

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

export default DebriefQuestionsSection
