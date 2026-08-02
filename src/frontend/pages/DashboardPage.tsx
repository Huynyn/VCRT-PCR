import { useMemo, useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { apiRequest } from '../utils/api'
import { UserCallStats, AdminCallStats } from '../components/composite'

interface DraftReport {
  id: string
  status: string
  created_at: string
  updated_at: string
  report_number: string | null
  patient_name: string | null
}

type AcronymCategory = 'General' | 'Assessment' | 'Respiratory' | 'Cardiac' | 'Neuro' | 'Transfer'

interface AcronymItem {
  acronym: string
  meaning: string
  category: AcronymCategory
}

type DebriefCategory = 'General' | 'Clinical Performance' | 'Teamwork' | 'Wellbeing' | 'Safety' | 'Documentation'

interface DebriefQuestionItem {
  question: string
  category: DebriefCategory
}

const DashboardPage = () => {
  const { user, isAuthenticated } = useAuth()
  const [drafts, setDrafts] = useState<DraftReport[]>([])
  const [draftsLoading, setDraftsLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) return
    const fetchDrafts = async () => {
      try {
        const data = await apiRequest('/pcr?status=draft')
        setDrafts(data.data || [])
      } catch {
        // Silently fail - drafts section is non-critical
      } finally {
        setDraftsLoading(false)
      }
    }
    fetchDrafts()
  }, [isAuthenticated])

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)

    return date.toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
  }

  // Medical Acronyms
  const medicalAcronyms: AcronymItem[] = [
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

  // Debrief Questions
  const debriefQuestions: DebriefQuestionItem[] = [
    { question: 'What do you feel went well on this call?', category: 'General' },
    { question: 'What do you feel didn\'t go well on this call?', category: 'General' },
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

  const samplePCRText = `VCRT (all responders full names) recieved a call at [24:00 time] for a patient (PT) [chief complaint protection told you over the phone] at [reported location]. VCRT arrived on scene [specify location if different from reported location] at [24:00 time] to find PT (full name) [PT position] [scene description; ex. with/without Protection and/or sports services on scene). VCRT approached PT and obtained consent to begin treatment. [any info reported by bystanders/Protection). VCRT (responder name) conducted primary assessment and RBS [any findings requiring intervention or not; ex. RBS found ..., SMR was ruled out + reason]. VCRT (responder name) began taking 1st set of vitals while VCRT (responder name) obtained SAMPLE [and OPQRST if pain reported]. First set of vitals [normal/out of range, obtained/not obtained + reason or any interventions]. PT reported [events prior/background & situation details/complaints]. VCRT (responder name) [describe any treatment done and PT's response to any treatment] [describe any additional info or details PT reports and any advice given to PT]. VCRT (responder name) obtained second set of vitals [in/out, etc.] [any further care / details].`

  const categories: Array<'All' | AcronymCategory> = [
    'All',
    'General',
    'Assessment',
    'Respiratory',
    'Cardiac',
    'Neuro',
    'Transfer',
  ]

  const [acronymQuery, setAcronymQuery] = useState('')
  const [acronymCategory, setAcronymCategory] = useState<'All' | AcronymCategory>('All')
  const [showAllAcronyms, setShowAllAcronyms] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const filteredAcronyms = useMemo(() => {
    const q = acronymQuery.trim().toLowerCase()

    const filtered = medicalAcronyms.filter(item => {
      const matchesCategory = acronymCategory === 'All' || item.category === acronymCategory
      const matchesQuery =
        q.length === 0 ||
        item.acronym.toLowerCase().includes(q) ||
        item.meaning.toLowerCase().includes(q)

      return matchesCategory && matchesQuery
    })

    // Alphabetical order by acronym
    return [...filtered].sort((a, b) =>
      a.acronym.localeCompare(b.acronym, undefined, { sensitivity: 'base' }),
    )
  }, [acronymQuery, acronymCategory])

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

  const handleCopySamplePCR = async () => {
    try {
      await navigator.clipboard.writeText(samplePCRText)
      setCopiedKey('sample-pcr')
      setTimeout(() => setCopiedKey(null), 1200)
    } catch {
      // Clipboard may fail silently
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Welcome section */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}!
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {drafts.length > 0
            ? `You have ${drafts.length} draft${drafts.length === 1 ? '' : 's'} in progress.`
            : 'You have no drafts in progress.'}
        </p>
      </div>

      {/* Call Stats */}
      <div className="mb-6">
        {user?.role === 'admin' ? <AdminCallStats /> : <UserCallStats />}
      </div>

      {/* Drafts in Progress */}
      {!draftsLoading && drafts.length > 0 && (
        <div className="mb-6">
          <div className="card">
            <div className="card-header">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    Drafts in Progress
                  </h3>
                  <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                    {drafts.length}
                  </span>
                </div>
                <a
                  href="#/reports"
                  className="text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  View all reports
                </a>
              </div>
            </div>
            <div className="card-body">
              <div className="space-y-3">
                {drafts.slice(0, 5).map(draft => (
                  <a
                    key={draft.id}
                    href={`#/pcr/new?draftId=${draft.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {draft.report_number ? `#${draft.report_number}` : 'No Report ID'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>{formatTimeAgo(draft.updated_at)}</span>
                    </div>
                  </a>
                ))}
                {drafts.length > 5 && (
                  <a
                    href="#/reports"
                    className="block text-center text-sm font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 pt-1"
                  >
                    +{drafts.length - 5} more drafts
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sample PCR Section */}
      <div className="mb-6">
        <div className="card">
          <div className="card-header">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Sample PCR
                </h3>
              </div>

              <button
                type="button"
                onClick={handleCopySamplePCR}
                className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-100 text-gray-700 dark:border-gray-600 dark:hover:bg-gray-600 dark:text-gray-300"
              >
                {copiedKey === 'sample-pcr' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="card-body">
            <pre className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
      {samplePCRText}
            </pre>
          </div>
        </div>
      </div>

      {/* Debrief Questions section */}
      <div className="mb-6">
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
              Debrief Questions
            </h3>
          </div>

          <div className="card-body">
            <div className="flex flex-col gap-3">
              {debriefQuestions.map(item => (
                <div
                  key={item.question}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:hover:bg-gray-700"
                >
                  <p className="text-base text-gray-900 dark:text-gray-100">
                    {item.question}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Medical Acronyms section */}
      <div className="mt-2">
        <div className="card">
          <div className="card-header">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Medical Glossary Terms
                </h3>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={acronymQuery}
                  onChange={e => setAcronymQuery(e.target.value)}
                  placeholder="Search acronym or meaning..."
                  className="w-full sm:w-72 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400"
                />
                <select
                  value={acronymCategory}
                  onChange={e => setAcronymCategory(e.target.value as 'All' | AcronymCategory)}
                  className="w-full sm:w-56 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="card-body">
            {filteredAcronyms.length === 0 ? (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                No acronyms found for this filter.
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
                            <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-200">
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
                          {copiedKey === item.acronym ? 'Copied' : 'Copy'}
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
                      {showAllAcronyms ? 'Show less' : `Show all (${filteredAcronyms.length})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardPage