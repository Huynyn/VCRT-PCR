import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, RotateCcw, AlertTriangle, Clock, CheckCircle, Save, UserCheck, Plus, Trash2, ChevronLeft, ChevronRight, Upload, FileText, X } from 'lucide-react'
import { Button, Card, Alert, Modal, Tooltip } from '@/components/ui'
import {
  Input,
  Select,
  RadioGroup,
  Checkbox,
  CheckboxGroup,
  DatePicker,
  TimePicker,
  Textarea,
  FormSection,
} from '@/components/forms'
import { VitalSignsTable, InjuryLocationMap, OxygenProtocolForm, SearchableSelect, SignaturePad } from '@/components/composite'
import { useForm } from '../context/FormContext'
import { useNotification } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { cn, getCurrentTime, formatDate, generateId, MARKER_COLORS } from '../utils'
import { pdfService } from '../services/pdf.service'
import { apiRequest } from '../utils/api'
import { setPcrCloseHandler } from '../utils/electronCloseGuard'
import { setPcrNavigationGuard } from '../utils/navigationGuard'
import type { PCRFormData, VitalSign, OPQRSTEntry } from '../types'

// Reshapes form_data saved before responders became a plain list: those rows
// have fixed responder1/2/3 (and matching signatures.responder1/2/3) keys
// instead of a responders[] array. Re-indexing keeps each signature image
// paired with the responder it was actually drawn for.
function normalizeLegacyResponders(formData: PCRFormData): PCRFormData {
  const legacy = formData as any
  if (!legacy || Array.isArray(legacy.responders)) return formData

  const nameSlots: Array<string | undefined> = [legacy.responder1, legacy.responder2, legacy.responder3]
  if (!nameSlots.some(Boolean)) return formData

  const signatureSlots: Array<string | undefined> = [
    legacy.signatures?.responder1,
    legacy.signatures?.responder2,
    legacy.signatures?.responder3,
  ]

  const responders: string[] = []
  const responderSignatures: Array<string | undefined> = []
  nameSlots.forEach((name, i) => {
    if (name) {
      responders.push(name)
      responderSignatures.push(signatureSlots[i])
    }
  })

  return {
    ...formData,
    responders,
    signatures: Array.isArray(legacy.signatures?.responders)
      ? legacy.signatures
      : { ...legacy.signatures, responders: responderSignatures },
  }
}

const MAX_SIGN_OFF_MB = 15

const PCRPage: React.FC = () => {
  const { t } = useTranslation()

  const FIRST_AGENCY_ON_SCENE_OPTIONS = [
    t('pcr.agencyOptions.protectionServices'),
    t('pcr.agencyOptions.vcrt'),
    t('pcr.agencyOptions.fireServices'),
    t('pcr.agencyOptions.paramedics'),
    t('pcr.agencyOptions.lifeguards'),
  ]

  const PARAMEDICS_CALLED_BY_OPTIONS = [
    t('pcr.agencyOptions.protectionServices'),
    t('pcr.agencyOptions.vcrt'),
    t('pcr.agencyOptions.sportsServices'),
    t('pcr.agencyOptions.lifeguards'),
  ]
  const {
    data,
    updateField,
    updateFieldSilently,
    errors: rawErrors,
    isDirty,
    isValid,
    reset,
    validateField,
    validateAll,
    loadData,
  } = useForm()
  // validationSchema (FormContext.tsx) stores i18n keys, not literal text, so
  // the same schema drives both languages - translate right before display.
  const errors = Object.fromEntries(
    Object.entries(rawErrors).map(([field, key]) => [field, t(key)])
  ) as typeof rawErrors
  const { showNotification } = useNotification()
  const { token, isAuthenticated, user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null)
  const [adminComments, setAdminComments] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [signOffPdf, setSignOffPdf] = useState<File | null>(null)
  const [signOffPdfError, setSignOffPdfError] = useState<string>('')
  const [isDraggingSignOff, setIsDraggingSignOff] = useState(false)
  const [responderOptions, setResponderOptions] = useState<string[]>([])
  const [psmOptions, setPsmOptions] = useState<string[]>([])
  const [signerIndex, setSignerIndex] = useState(0)
  const [autoCallNumber, setAutoCallNumber] = useState<string | null>(null)
  const [showCloseSaveModal, setShowCloseSaveModal] = useState(false)
  const [closeReason, setCloseReason] = useState<'app-close' | 'navigate'>('app-close')
  const closeResolveRef = useRef<((okToClose: boolean) => void) | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    apiRequest('/responders')
      .then(res => setResponderOptions((res.data || []).map((r: { name: string }) => r.name)))
      .catch(() => {
        // Silently fail - responders just won't be suggested, free text still works
      })
    apiRequest('/psm-members')
      .then(res => setPsmOptions((res.data || []).map((m: { name: string }) => m.name)))
      .catch(() => {
        // Silently fail - PSM members just won't be suggested, free text still works
      })
  }, [isAuthenticated])

  // Helper function to convert File to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        // Remove the data URL prefix (e.g., "data:application/pdf;base64,")
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = error => reject(error)
    })
  }

  // Helper function to convert base64 to File
  const base64ToFile = (base64: string, filename: string): File => {
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    return new File([byteArray], filename, { type: 'application/pdf' })
  }

  useEffect(() => {
    let ignore = false

    const loadFromUrl = async () => {
      // For HashRouter, params are in the hash: /#/pcr/new?draftId=xxx
      const hash = window.location.hash
      const queryString = hash.includes('?') ? hash.split('?')[1] : ''
      const urlParams = new URLSearchParams(queryString)
      const draftId = urlParams.get('draftId')
      const reportId = urlParams.get('reportId')

      if (draftId && isAuthenticated && token) {
        setIsLoadingDraft(true)
        setCurrentDraftId(draftId)

        try {
          const data = await apiRequest(`/pcr/${draftId}`)
          if (ignore) return
          const draftData = data.data

          if (draftData.status === 'draft') {
            loadData(normalizeLegacyResponders(draftData.form_data))
            setLoadedStatus('draft')
            // Restore sign-off attachment if present
            if (draftData.sign_off_attachment && draftData.sign_off_filename) {
              const file = base64ToFile(draftData.sign_off_attachment, draftData.sign_off_filename)
              setSignOffPdf(file)
            }
            showNotification(t('pcr.notifications.draftLoaded'), 'success')
          } else {
            showNotification(t('pcr.notifications.notADraft'), 'error')
          }
        } catch (error) {
          if (ignore) return
          console.error('Failed to load draft:', error)
          showNotification(t('pcr.notifications.draftLoadFailed'), 'error')
        } finally {
          if (!ignore) setIsLoadingDraft(false)
        }
      } else if (reportId && isAuthenticated && token) {
        // Admin editing a submitted report, or the owner editing a report the
        // admin sent back with change requests
        setIsLoadingDraft(true)
        setCurrentReportId(reportId)

        try {
          const data = await apiRequest(`/pcr/${reportId}`)
          if (ignore) return
          const reportData = data.data

          if (isAdmin || reportData.status === 'changes_requested') {
            loadData(normalizeLegacyResponders(reportData.form_data))
            setLoadedStatus(reportData.status)
            setAdminComments(reportData.admin_comments || null)
            // Restore sign-off attachment if present
            if (reportData.sign_off_attachment && reportData.sign_off_filename) {
              const file = base64ToFile(reportData.sign_off_attachment, reportData.sign_off_filename)
              setSignOffPdf(file)
            }
            showNotification(t('pcr.notifications.reportLoaded'), 'success')
          } else {
            showNotification(t('pcr.notifications.reportNotEditable'), 'error')
          }
        } catch (error) {
          if (ignore) return
          console.error('Failed to load report:', error)
          showNotification(t('pcr.notifications.reportLoadFailed'), 'error')
        } finally {
          if (!ignore) setIsLoadingDraft(false)
        }
      }

      if (!ignore && !data.date) {
        const todayISO = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
        updateFieldSilently('date', todayISO)
      }
    }

    loadFromUrl()

    return () => {
      ignore = true
    }
  }, [isAuthenticated, token, isAdmin, loadData, showNotification])

  // Auto-populate Call Number for a brand-new report: 001 for the first
  // draft/submitted PCR of the call date (across all users), incrementing
  // from there. Only applies while starting fresh (not editing an existing
  // draft/report) and never overwrites a value the user typed themselves -
  // re-fetched whenever the Date field changes, since that's what "the
  // first call of the day" is scoped to.
  useEffect(() => {
    if (currentDraftId || currentReportId) return
    if (!isAuthenticated || !data.date) return
    if (data.callNumber && data.callNumber !== autoCallNumber) return

    let ignore = false
    apiRequest(`/pcr/stats/next-call-number?date=${encodeURIComponent(data.date)}`)
      .then(res => {
        if (ignore) return
        const next = res.data?.callNumber
        if (next) {
          updateFieldSilently('callNumber', next)
          setAutoCallNumber(next)
        }
      })
      .catch(() => {
        // Silently fail - Call Number just won't be pre-filled, still editable by hand
      })

    return () => {
      ignore = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.date, currentDraftId, currentReportId, isAuthenticated])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Validate all form fields
      const formErrors = validateAll()
      if (Object.keys(formErrors).length > 0) {
        const errorMessages = Object.values(formErrors).slice(0, 5).map(key => t(key))
        const remaining = Object.keys(formErrors).length - 5
        const message =
          remaining > 0
            ? `${errorMessages.join(', ')} ${t('pcr.notifications.andMore', { count: remaining })}`
            : errorMessages.join(', ')
        showNotification(t('pcr.notifications.completeRequiredFields', { message }), 'error')

        // Scroll to the first invalid field after React re-renders the errors
        requestAnimationFrame(() => {
          const firstInvalid = document.querySelector('[aria-invalid="true"]')
          if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' })
            if (firstInvalid instanceof HTMLElement) firstInvalid.focus()
          }
        })

        setIsSubmitting(false)
        return
      }

      // Validate form data for PDF generation
      const validation = pdfService.validateDataForPDF(data)
      if (!validation.isValid) {
        showNotification(
          t('pcr.notifications.completeRequiredFields', { message: validation.errors.join(', ') }),
          'error',
        )
        setIsSubmitting(false)
        return
      }

      // Generate PDF and show download confirmation workflow
      await pdfService.confirmDownloadedWorkflow(
        data,
        { appendPdf: signOffPdf ?? undefined },
        async (confirmed, timestamp) => {
          if (confirmed) {
            try {
              // Determine URL and method based on context
              // Admin editing submitted report, updating draft, or creating new
              const reportIdToUpdate = currentReportId || currentDraftId
              const url = reportIdToUpdate ? `/pcr/${reportIdToUpdate}` : '/submissions'
              const method = reportIdToUpdate ? 'PUT' : 'POST'

              // Convert sign-off PDF to base64 if present
              let signOffBase64: string | null = null
              let signOffFilename: string | null = null
              if (signOffPdf) {
                signOffBase64 = await fileToBase64(signOffPdf)
                signOffFilename = signOffPdf.name
              }

              await apiRequest(url, {
                method,
                body: JSON.stringify(
                  reportIdToUpdate
                    ? {
                        form_data: {
                          ...data,
                          downloadedAt: timestamp,
                          downloadConfirmed: true,
                        },
                        status: 'submitted',
                        sign_off_attachment: signOffBase64,
                        sign_off_filename: signOffFilename,
                      }
                    : {
                        data: {
                          ...data,
                          downloadedAt: timestamp,
                          downloadConfirmed: true,
                        },
                        sign_off_attachment: signOffBase64,
                        sign_off_filename: signOffFilename,
                      },
                ),
              })

              const successMessage = currentReportId
                ? t('pcr.notifications.reportUpdated')
                : currentDraftId
                  ? t('pcr.notifications.draftSubmitted')
                  : t('pcr.notifications.formSubmitted')
              showNotification(successMessage, 'success')
              reset()
              setSignOffPdf(null)
              // Clear state and URL to start fresh
              setCurrentReportId(null)
              setCurrentDraftId(null)
              setLoadedStatus(null)
              setAdminComments(null)
              window.location.hash = '#/pcr/new'
            } catch (submitError) {
              console.error('Submission failed:', submitError)
              showNotification(t('pcr.notifications.submitFailed'), 'error')
            }
          } else {
            // User cancelled - don't submit to backend
            showNotification(t('pcr.notifications.submitCancelled'), 'info')
          }
          setIsSubmitting(false)
        },
        { allowDownload: isAdmin },
      )
    } catch (error) {
      console.error('PDF generation failed:', error)
      showNotification(
        signOffPdf
          ? t('pcr.notifications.pdfGenerationFailedWithSignOff')
          : t('pcr.notifications.pdfGenerationFailed'),
        'error',
      )
      setIsSubmitting(false)
    }
  }

  const handleReset = () => {
    if (isDirty || signOffPdf) {
      setShowUnsavedChangesModal(true)
    } else {
      reset()
      showNotification(t('pcr.notifications.formReset'), 'success')
    }
  }

  const confirmReset = () => {
    reset()
    setSignOffPdf(null)
    setSignOffPdfError('')
    setShowUnsavedChangesModal(false)
    showNotification(t('pcr.notifications.formReset'), 'success')
  }

  // Shared by the normal Save Draft button and fillSampleData (which fills
  // then saves in one step). Takes an explicit data override because state
  // updates from fillSampleData's updateField calls haven't landed in `data`
  // yet by the time it wants to save.
  const saveDraft = async (overrideData?: Partial<PCRFormData>) => {
    if (!isAuthenticated || !token) {
      showNotification(t('pcr.notifications.loginToSaveDrafts'), 'error')
      return
    }

    const dataToSave = overrideData ?? data

    setIsSavingDraft(true)

    try {
      // If we're editing an existing draft, update it. Otherwise create new draft.
      const url = currentDraftId ? `/pcr/${currentDraftId}` : '/pcr'
      const method = currentDraftId ? 'PUT' : 'POST'

      // Convert sign-off PDF to base64 if present
      let signOffBase64: string | null = null
      let signOffFilename: string | null = null
      if (signOffPdf) {
        signOffBase64 = await fileToBase64(signOffPdf)
        signOffFilename = signOffPdf.name
      }

      const responseData = await apiRequest(url, {
        method,
        body: JSON.stringify({
          form_data: dataToSave,
          status: 'draft',
          sign_off_attachment: signOffBase64,
          sign_off_filename: signOffFilename,
        }),
      })

      // If this was a new draft, update our current draft ID
      if (!currentDraftId && responseData.data?.id) {
        setCurrentDraftId(responseData.data.id)
        // Update URL to include draft ID for future saves (HashRouter compatible)
        const currentHash = window.location.hash.split('?')[0] // Get path without query
        window.location.hash = `${currentHash}?draftId=${responseData.data.id}`
      }

      // Marks the form clean so leaving right after this save doesn't
      // re-trigger the "save draft before leaving?" prompt.
      loadData(dataToSave)

      // Fixed id: saving repeatedly in quick succession (e.g. the fill-sample
      // testing button) replaces the previous toast instead of stacking a new
      // one on top of it each time.
      showNotification(t('pcr.notifications.draftSaved'), 'success', 'pcr-draft-save')
    } catch (error) {
      console.error('Save draft failed:', error)
      showNotification(t('pcr.notifications.draftSaveFailed'), 'error', 'pcr-draft-save')
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleSaveDraft = () => saveDraft()

  // Ctrl+S (or Cmd+S on macOS) saves a draft without leaving the page,
  // instead of triggering the browser/OS "save page" dialog.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (!isSavingDraft) handleSaveDraft()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSavingDraft, isAuthenticated, token, currentDraftId, data, signOffPdf])

  // Registers with the Electron close flow (see electronCloseGuard) so that
  // closing the app while this form has unsaved changes prompts to save the
  // draft first, instead of silently discarding it.
  useEffect(() => {
    const handleAppCloseRequest = (): Promise<boolean> => {
      if (!isDirty) return Promise.resolve(true)
      return new Promise<boolean>(resolve => {
        closeResolveRef.current = resolve
        setCloseReason('app-close')
        setShowCloseSaveModal(true)
      })
    }

    setPcrCloseHandler(handleAppCloseRequest)
    return () => setPcrCloseHandler(null)
  }, [isDirty])

  // Same idea, but for navigating away in-app (e.g. clicking another sidebar
  // item) instead of closing the whole app - see navigationGuard. Works the
  // same in Electron and in a plain browser tab.
  useEffect(() => {
    const handleNavigateAway = (): Promise<boolean> => {
      if (!isDirty) return Promise.resolve(true)
      return new Promise<boolean>(resolve => {
        closeResolveRef.current = resolve
        setCloseReason('navigate')
        setShowCloseSaveModal(true)
      })
    }

    setPcrNavigationGuard(handleNavigateAway)
    return () => setPcrNavigationGuard(null)
  }, [isDirty])

  const resolveCloseSaveModal = (okToClose: boolean) => {
    setShowCloseSaveModal(false)
    closeResolveRef.current?.(okToClose)
    closeResolveRef.current = null
  }

  const handleSaveDraftAndClose = async () => {
    await handleSaveDraft()
    resolveCloseSaveModal(true)
  }

  const handleVitalSignsChange = (vitalSigns: VitalSign[]) => {
    updateField('vitalSigns', vitalSigns)
  }

  const opqrstEntries: OPQRSTEntry[] = data.opqrstEntries || []

  // Numbers the top-level form sections in the order they're rendered below.
  // "Injury Location" is a subsection of OPQRST Assessment, not its own
  // numbered section, so it's left out of this list.
  const sectionOrder = [
    'basicInformation',
    'patientInformation',
    'patientMedicalHistory',
    'treatmentPerformed',
    'opqrstAssessment',
    'vitalSigns',
    'oxygenProtocol',
    'additionalInformation',
    'additionalAttachments',
    'addSignatures',
  ] as const
  const sectionNumber = (key: (typeof sectionOrder)[number]) => sectionOrder.indexOf(key) + 1

  const addOpqrstEntry = () => {
    if (opqrstEntries.length >= 4) return
    updateField('opqrstEntries', [...opqrstEntries, { id: generateId() }])
  }

  const updateOpqrstEntry = (id: string, field: keyof OPQRSTEntry, value: string) => {
    updateField(
      'opqrstEntries',
      opqrstEntries.map((entry: OPQRSTEntry) => (entry.id === id ? { ...entry, [field]: value } : entry))
    )
  }

  const removeOpqrstEntry = (id: string) => {
    updateField('opqrstEntries', opqrstEntries.filter((entry: OPQRSTEntry) => entry.id !== id))
  }

  const calculateAgeFromDOB = (dob: string): number => {
    const birthDate = new Date(dob)
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }

    return age
  }

  const handleDOBChange = (dob: string) => {
    updateField('dob', dob)

    if (dob && dob.trim()) {
      const calculatedAge = calculateAgeFromDOB(dob)
      if (calculatedAge >= 0 && calculatedAge <= 150) {
        updateField('age', calculatedAge.toString())
      }
    }

    // Clear age/DOB validation error when either field is updated
    if (errors.ageOrDob) {
      validateField('ageOrDob')
    }
  }

  const handleAgeChange = (age: string) => {
    updateField('age', age)

    // Clear age/DOB validation error when either field is updated
    if (errors.ageOrDob) {
      validateField('ageOrDob')
    }
  }

  // Test function to fill sample data and save it right away
  const fillSampleData = async () => {
    const sampleData: Partial<PCRFormData> = {
      // --- Basic Information (required) ---
      date: formatDate(new Date()),
      location: 'Montpetit Hall, Gymnasium A',
      callNumber: '014',
      reportNumber: '2026-014',
      supervisor: 'Sarah Chen',
      primaryPSM: 'Marc Tremblay',
      responders: ['Daniel Osei', 'Priya Nair'],
      timeNotified: '19:42',
      workplaceInjury: 'No',
      onScene: '19:45',
      clearedScene: '20:20',
      firstAgencyOnScene: 'Protection Services',

      // Optional-but-nice
      transportArrived: '20:10',
      paramedicsCalledBy: 'Responder 1',

      // --- Patient Information ---
      patientName: 'Emily Tran',
      age: '20',
      sex: 'Female',
      status: 'Student',

      // requireUnknown fields in this section
      studentEmployeeNumber: '300512847',
      emergencyContactName: 'Linh Tran (Mother)',
      emergencyContactPhone: '(613) 555-0148',
      contacted: 'Yes',
      contactedBy: 'Responder 2',

      // --- Treatment / Findings ---
      positionOfPatient: 'Seated',
      airwayManagement: [],
      hemorrhageControl: [],
      immobilization: ['Splints'],

      // CPR/AED (optional)
      timeStarted: '',
      numberOfCycles: '',
      numberOfShocks: '',
      shockNotAdvised: '',

      // --- OPQRST (optional) ---
      opqrstEntries: [
        {
          id: generateId(),
          area: 'Left ankle',
          onset: 'Acute - twisted stepping down from a jump',
          provocation: 'Weight-bearing and movement worsen it; rest and elevation ease it',
          quality: 'Sharp, throbbing',
          radiation: 'None',
          scale: '6',
          time: '19:40',
        },
      ],

      // --- Medical History (all these textareas were set with requireUnknown) ---
      chiefComplaint: 'Left ankle pain after twisting it during an intramural basketball game',
      signsSymptoms: 'Swelling and bruising over the lateral ankle, pain on weight-bearing, no obvious deformity',
      allergies: 'NKDA',
      medications: 'None',
      medicalHistory: 'No significant medical history',
      lastMeal: 'Sandwich, ~3 hours ago, tolerated well',
      bodySurvey: 'No other injuries noted on full body survey',

      // --- Vital Signs (2 sets, ~5 min apart) ---
      vitalSigns: [
        {
          time: '19:47',
          pulse: '82, regular, strong',
          resp: '16, regular, unlaboured',
          spo2: '98',
          bp: '118/76',
          loc: 'A&O x4',
          skin: 'Warm, dry, normal colour',
        },
        {
          time: '19:52',
          pulse: '78, regular, strong',
          resp: '16, regular, unlaboured',
          spo2: '98',
          bp: '116/74',
          loc: 'A&O x4',
          skin: 'Warm, dry, normal colour',
        },
      ],

      // --- Oxygen Protocol (optional) ---
      oxygenProtocol: {
        saturation_range: 'Other (95-100%)',
        spo2: '98',
        spo2_acceptable: 'Yes',
        oxygen_given: 'no',
      } as any,

      // --- Additional Information (required group) ---
      comments:
        'VCRT (Daniel Osei, Priya Nair) received a call at 19:42 for a patient (PT) reported by Protection Services to have a possible ankle injury at Montpetit Hall, Gymnasium A. VCRT arrived on scene at 19:45 to find PT (Emily Tran) seated on the gym floor holding her left ankle, with a Protection Services officer and several teammates present. VCRT approached PT and obtained consent to begin treatment. Teammates reported PT landed awkwardly after a jump during an intramural basketball game and was unable to bear weight afterward. VCRT (Daniel Osei) conducted primary assessment and RBS; no findings requiring intervention, SMR was ruled out as the mechanism was isolated to the ankle with no head, neck, or back involvement. VCRT (Priya Nair) began taking the 1st set of vitals while VCRT (Daniel Osei) obtained SAMPLE and OPQRST, given reported pain. First set of vitals were within normal range. PT reported twisting her left ankle stepping down from a jump, with immediate sharp pain and visible swelling. VCRT (Daniel Osei) splinted and elevated the ankle; PT tolerated treatment well and reported some relief with ice and elevation. VCRT (Priya Nair) obtained a second set of vitals, within normal range; PT remained alert and stable throughout.',
      transferComments:
        'Care was transferred to paramedics on scene at 20:12. VCRT (Daniel Osei) gave a verbal handover covering mechanism of injury, vitals, and treatment provided (splinting and elevation); PT was alert and in stable condition at handover. PT was advised to avoid weight-bearing on the ankle until assessed by a physician, to follow up with Health and Wellness or a walk-in clinic if pain or swelling persisted, and to keep the ankle iced and elevated in the interim.',
      patientCareTransferred: 'Paramedics',
      hospitalDestination: 'The Ottawa Hospital - Civic Campus',
      unitNumber: 'A-142',
      timeCareTransferred: '20:12',
    }

    Object.entries(sampleData).forEach(([key, value]) => {
      updateField(key as keyof PCRFormData, value as any)
    })

    await saveDraft({ ...data, ...sampleData })
  }

  // Drop-box for sign-off
  const validateAndSetSignOff = (file: File | null) => {
    setSignOffPdfError('')
    if (!file) {
      setSignOffPdf(null)
      return
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const maxBytes = MAX_SIGN_OFF_MB * 1024 * 1024

    if (!isPdf) {
      setSignOffPdf(null)
      setSignOffPdfError(t('pcr.attachments.invalidFile'))
      return
    }

    if (file.size > maxBytes) {
      setSignOffPdf(null)
      setSignOffPdfError(t('pcr.attachments.tooLarge', { maxMb: MAX_SIGN_OFF_MB }))
      return
    }

    setSignOffPdf(file)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const hasTourniquet =
    Array.isArray(data.hemorrhageControl) && data.hemorrhageControl.includes('Tourniquet')

  // Always show at least one row to fill in, up to 4 responders (on top of the supervisor).
  const MAX_RESPONDERS = 4
  const responderList = data.responders && data.responders.length > 0 ? data.responders : ['']
  const updateResponderAt = (index: number, value: string) => {
    const next = [...responderList]
    next[index] = value
    updateField('responders', next)
  }
  const removeResponderAt = (index: number) => {
    updateField('responders', responderList.filter((_, i) => i !== index))
  }
  const addResponder = () => {
    if (responderList.length >= MAX_RESPONDERS) return
    updateField('responders', [...responderList, ''])
  }

  // Supervisor signs first, then whichever responders were actually added to
  // the call. A responder's signature is tracked by its position in
  // data.responders (there's no fixed field per responder any more, since
  // the list can be any length), while the supervisor keeps its own named slot.
  type SignerRef = { kind: 'supervisor' } | { kind: 'responder'; index: number }
  const signers: Array<{ ref: SignerRef; reactKey: string; label: string; name: string }> = [
    { ref: { kind: 'supervisor' }, reactKey: 'supervisor', label: t('pcr.signatures.supervisor'), name: data.supervisor || '' },
    ...(data.responders || [])
      .map((name, index) => ({
        ref: { kind: 'responder' as const, index },
        reactKey: `responder-${index}`,
        label: t('pcr.basicInfo.responder', { index: index + 1 }),
        name,
      }))
      .filter(s => s.name.trim()),
  ]

  const getSignatureValue = (ref: SignerRef): string | undefined =>
    ref.kind === 'supervisor' ? data.signatures?.supervisor : data.signatures?.responders?.[ref.index]

  const handleSignatureChange = (ref: SignerRef, value: string) => {
    if (ref.kind === 'supervisor') {
      updateField('signatures', { ...(data.signatures || {}), supervisor: value })
      return
    }
    const responderSignatures = [...(data.signatures?.responders || [])]
    responderSignatures[ref.index] = value
    updateField('signatures', { ...(data.signatures || {}), responders: responderSignatures })
  }

  const activeSignerIndex = Math.min(signerIndex, signers.length - 1)
  const activeSigner = signers[activeSignerIndex]
  const goPrevSigner = () => setSignerIndex(Math.max(0, activeSignerIndex - 1))
  const goNextSigner = () => setSignerIndex(Math.min(signers.length - 1, activeSignerIndex + 1))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {currentReportId && loadedStatus === 'changes_requested' && !isAdmin
              ? t('pcr.titleEditResubmit')
              : currentReportId &&
                  (loadedStatus === 'submitted' || loadedStatus === 'approved') &&
                  isAdmin
                ? t('pcr.titleEditSubmittedAdmin')
                : currentDraftId
                  ? t('pcr.titleEditDraft')
                  : t('pcr.titleNew')}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isLoadingDraft
              ? t('common.loading')
              : currentReportId && loadedStatus === 'changes_requested' && !isAdmin
                ? t('pcr.subtitleChangesRequested')
                : currentReportId &&
                    (loadedStatus === 'submitted' || loadedStatus === 'approved') &&
                    isAdmin
                  ? t('pcr.subtitleEditingSubmittedAdmin')
                  : currentDraftId
                    ? t('pcr.subtitleEditingDraft')
                    : t('pcr.subtitleNew')}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Test button for development - fills and saves in one step; once
              testing is done this becomes a plain save button up here. */}
          <Button
            type="button"
            variant="outline"
            onClick={fillSampleData}
            loading={isSavingDraft}
            disabled={isSavingDraft}
            leftIcon={<Save className="w-4 h-4" />}
          >
            {isSavingDraft ? t('common.saving') : t('pcr.fillSampleData')}
          </Button>

          {!isDirty && isValid && (
            <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">{t('pcr.allChangesSaved')}</span>
            </div>
          )}
        </div>
      </div>

      {adminComments && (
        <Alert type="warning" title={t('pcr.changesRequestedByAdmin')} message={adminComments} />
      )}

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {isLoadingDraft && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="text-gray-900 dark:text-gray-100">{t('pcr.loadingDraft')}</span>
              </div>
            </div>
          </div>
        )}
        {/* Basic Information */}
        <FormSection
          title={t('pcr.basicInfo.title')}
          number={sectionNumber('basicInformation')}
          subtitle={t('pcr.basicInfo.subtitle')}
          required
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DatePicker
              label={t('pcr.basicInfo.date')}
              value={data.date ?? ''} // don’t show fallback directly here
              onChange={(v: any) => {
                const next = typeof v === 'string' ? v : (v?.target?.value ?? '')
                updateField('date', next)
              }}
              error={errors.date}
              required
            />

            <Input
              label={t('pcr.basicInfo.reportNumber')}
              value={data.reportNumber || ''}
              onChange={e => updateField('reportNumber', e.target.value)}
              error={errors.reportNumber}
              placeholder={t('pcr.basicInfo.reportNumberPlaceholder')}
              required
            />

            <Input
              label={t('pcr.basicInfo.callNumber')}
              value={data.callNumber || ''}
              onChange={e => updateField('callNumber', e.target.value)}
              error={errors.callNumber}
              placeholder={t('pcr.basicInfo.callNumberPlaceholder')}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label={t('pcr.basicInfo.location')}
              value={data.location || ''}
              onChange={e => updateField('location', e.target.value)}
              error={errors.location}
              placeholder={t('pcr.basicInfo.locationPlaceholder')}
              required
            />

            <Input
              label={t('pcr.basicInfo.supervisor')}
              value={data.supervisor || ''}
              onChange={e => updateField('supervisor', e.target.value)}
              error={errors.supervisor}
              placeholder={t('pcr.basicInfo.supervisorPlaceholder')}
              required
              rightIcon={
                currentUser && (
                  <Tooltip content={t('pcr.basicInfo.useMyName')}>
                    <button
                      type="button"
                      onClick={() =>
                        updateField('supervisor', `${currentUser.firstName} ${currentUser.lastName}`)
                      }
                      className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-primary-900/30 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                    >
                      <UserCheck className="w-4 h-4" />
                    </button>
                  </Tooltip>
                )
              }
            />

            <SearchableSelect
              label={t('pcr.basicInfo.primaryPsm')}
              value={data.primaryPSM || ''}
              onChange={value => updateField('primaryPSM', value)}
              options={psmOptions}
              placeholder={t('pcr.searchOrType')}
            />
          </div>

          <div className="space-y-3">
            <label className="form-label"></label>
            {responderList.map((name, index) => (
              <SearchableSelect
                key={index}
                label={t('pcr.basicInfo.responder', { index: index + 1 })}
                value={name}
                onChange={value => updateResponderAt(index, value)}
                options={responderOptions}
                placeholder={t('pcr.searchOrType')}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => removeResponderAt(index)}
                    className="p-1 rounded text-gray-400 hover:text-burgundy-600 hover:bg-burgundy-50 dark:hover:text-burgundy-400 dark:hover:bg-burgundy-900/20 focus:outline-none focus:ring-1 focus:ring-burgundy-500 transition-colors"
                    aria-label={t('pcr.basicInfo.removeResponder', { index: index + 1 })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                }
              />
            ))}
            {responderList.length < MAX_RESPONDERS && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addResponder}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                {t('pcr.basicInfo.addResponder')}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <TimePicker
              label={t('pcr.basicInfo.timeNotified')}
              value={data.timeNotified || ''}
              onChange={e => updateField('timeNotified', e.target.value)}
              error={errors.timeNotified}
              required
            />

            <TimePicker
              label={t('pcr.basicInfo.onScene')}
              value={data.onScene || ''}
              onChange={e => updateField('onScene', e.target.value)}
              error={errors.onScene}
              required
            />

            <TimePicker
              label={t('pcr.basicInfo.transportArrived')}
              value={data.transportArrived || ''}
              onChange={e => updateField('transportArrived', e.target.value)}
            />

            <TimePicker
              label={t('pcr.basicInfo.clearedScene')}
              value={data.clearedScene || ''}
              onChange={e => updateField('clearedScene', e.target.value)}
              error={errors.clearedScene}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <SearchableSelect
                label={t('pcr.basicInfo.paramedicsCalledBy')}
                value={data.paramedicsCalledBy || ''}
                onChange={value => updateField('paramedicsCalledBy', value)}
                options={PARAMEDICS_CALLED_BY_OPTIONS}
                placeholder={t('pcr.searchOrType')}
              />
              <p className="form-help">
                {t('pcr.basicInfo.paramedicsCalledByHelp')}
              </p>
            </div>

            <div>
              <SearchableSelect
                label={t('pcr.basicInfo.firstAgencyOnScene')}
                value={data.firstAgencyOnScene || ''}
                onChange={value => updateField('firstAgencyOnScene', value)}
                options={FIRST_AGENCY_ON_SCENE_OPTIONS}
                error={errors.firstAgencyOnScene}
                placeholder={t('pcr.searchOrType')}
                required
              />
              <p className="form-help">
                {t('pcr.basicInfo.firstAgencyOnSceneHelp')}
              </p>
            </div>
          </div>
        </FormSection>

        {/* Patient Information */}
        <FormSection
          title={t('pcr.patientInfo.title')}
          number={sectionNumber('patientInformation')}
          subtitle={t('pcr.patientInfo.subtitle')}
          required
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label={t('pcr.patientInfo.patientName')}
              value={data.patientName || ''}
              onChange={e => updateField('patientName', e.target.value)}
              error={errors.patientName}
              placeholder={t('pcr.patientInfo.patientNamePlaceholder')}
              required
            />

            <DatePicker
              label={t('pcr.patientInfo.dob')}
              value={data.dob || ''}
              onChange={e => handleDOBChange(e.target.value)}
            />

            <Input
              label={t('pcr.patientInfo.age')}
              type="number"
              min="0"
              max="150"
              value={data.age || ''}
              onChange={e => handleAgeChange(e.target.value)}
              error={errors.age}
              placeholder={t('pcr.patientInfo.agePlaceholder')}
              helpText={t('pcr.patientInfo.ageHelp')}
              required
            />
          </div>

          {errors.ageOrDob && (
            <Alert type="error" message={errors.ageOrDob} className="mb-4" />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RadioGroup
              name="sex"
              label={t('pcr.patientInfo.sex')}
              options={[
                { value: 'Male', label: t('pcr.patientInfo.sexMale') },
                { value: 'Female', label: t('pcr.patientInfo.sexFemale') },
                { value: 'Different from gender', label: t('pcr.patientInfo.sexDifferent') },
                { value: 'Does not want to disclose', label: t('pcr.patientInfo.sexUndisclosed') },
                { value: 'Other', label: t('pcr.patientInfo.sexOther') },
              ]}
              value={data.sex}
              onChange={value => updateField('sex', value)}
            />

            {data.sex === 'Other' && (
              <Input
                label={t('pcr.patientInfo.otherSexSpecify')}
                value={data.otherSex || ''}
                onChange={e => updateField('otherSex', e.target.value)}
                placeholder={t('pcr.patientInfo.pleaseSpecify')}
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RadioGroup
              name="status"
              label={t('pcr.patientInfo.status')}
              options={[
                { value: 'Student', label: t('pcr.patientInfo.statusStudent') },
                { value: 'Employee', label: t('pcr.patientInfo.statusEmployee') },
                { value: 'Visitor/Other', label: t('pcr.patientInfo.statusVisitorOther') },
              ]}
              value={data.status}
              onChange={value => updateField('status', value)}
            />

            {data.status === 'Visitor/Other' && (
              <Input
                label={t('pcr.patientInfo.visitorOtherSpecify')}
                value={data.visitorText || ''}
                onChange={e => updateField('visitorText', e.target.value)}
                placeholder={t('pcr.patientInfo.pleaseSpecify')}
                requireUnknown
              />
            )}

            {(data.status === 'Student' || data.status === 'Employee') && (
              <Input
                label={t('pcr.patientInfo.studentEmployeeNumber')}
                value={data.studentEmployeeNumber || ''}
                onChange={e => updateField('studentEmployeeNumber', e.target.value)}
                placeholder={t('pcr.patientInfo.idNumber')}
                requireUnknown
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RadioGroup
              name="workplaceInjury"
              label={t('pcr.patientInfo.workplaceInjury')}
              options={[
                { value: 'Yes', label: t('common.yes') },
                { value: 'No', label: t('common.no') },
              ]}
              orientation="horizontal"
              value={data.workplaceInjury}
              onChange={value => updateField('workplaceInjury', value)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label={t('pcr.patientInfo.emergencyContactName')}
              value={data.emergencyContactName || ''}
              onChange={e => updateField('emergencyContactName', e.target.value)}
              placeholder={t('pcr.patientInfo.emergencyContactNamePlaceholder')}
              requireUnknown
            />

            <Input
              label={t('pcr.patientInfo.emergencyContactPhone')}
              type="tel"
              value={data.emergencyContactPhone || ''}
              onChange={e => updateField('emergencyContactPhone', e.target.value)}
              placeholder="XXX-XXX-XXXX"
              requireUnknown
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RadioGroup
              name="contacted"
              label={t('pcr.patientInfo.contacted')}
              options={[
                { value: 'Yes', label: t('common.yes') },
                { value: 'No', label: t('common.no') },
              ]}
              orientation="horizontal"
              value={data.contacted}
              onChange={value => updateField('contacted', value)}
            />

            {data.contacted === 'Yes' && (
              <Input
                label={t('pcr.patientInfo.contactedBy')}
                value={data.contactedBy || ''}
                onChange={e => updateField('contactedBy', e.target.value)}
                placeholder={t('pcr.patientInfo.contactedByPlaceholder')}
                requireUnknown
              />
            )}
          </div>
        </FormSection>

        {/* Medical History */}
        <FormSection
          title={t('pcr.medicalHistory.title')}
          number={sectionNumber('patientMedicalHistory')}
          subtitle={t('pcr.medicalHistory.subtitle')}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label={t('pcr.medicalHistory.chiefComplaint')}
              value={data.chiefComplaint || ''}
              onChange={e => updateField('chiefComplaint', e.target.value)}
              placeholder={t('pcr.medicalHistory.chiefComplaintPlaceholder')}
              rows={3}
              requireUnknown
            />

            <Textarea
              label={t('pcr.medicalHistory.signsSymptoms')}
              value={data.signsSymptoms || ''}
              onChange={e => updateField('signsSymptoms', e.target.value)}
              placeholder={t('pcr.medicalHistory.signsSymptomsPlaceholder')}
              rows={3}
              requireUnknown
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label={t('pcr.medicalHistory.allergies')}
              value={data.allergies || ''}
              onChange={e => updateField('allergies', e.target.value)}
              placeholder={t('pcr.medicalHistory.allergiesPlaceholder')}
              rows={2}
              requireUnknown
            />

            <Textarea
              label={t('pcr.medicalHistory.medications')}
              value={data.medications || ''}
              onChange={e => updateField('medications', e.target.value)}
              placeholder={t('pcr.medicalHistory.medicationsPlaceholder')}
              rows={2}
              requireUnknown
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label={t('pcr.medicalHistory.medicalHistory')}
              value={data.medicalHistory || ''}
              onChange={e => updateField('medicalHistory', e.target.value)}
              placeholder={t('pcr.medicalHistory.medicalHistoryPlaceholder')}
              rows={2}
              requireUnknown
            />

            <Textarea
              label={t('pcr.medicalHistory.lastMeal')}
              value={data.lastMeal || ''}
              onChange={e => updateField('lastMeal', e.target.value)}
              placeholder={t('pcr.medicalHistory.lastMealPlaceholder')}
              rows={2}
              requireUnknown
            />
          </div>

          <Textarea
            label={t('pcr.medicalHistory.bodySurvey')}
            value={data.bodySurvey || ''}
            onChange={e => updateField('bodySurvey', e.target.value)}
            placeholder={t('pcr.medicalHistory.bodySurveyPlaceholder')}
            rows={3}
            requireUnknown
          />
        </FormSection>

        {/* Treatment Performed */}
        <FormSection
          title={t('pcr.treatment.title')}
          number={sectionNumber('treatmentPerformed')}
          subtitle={t('pcr.treatment.subtitle')}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <CheckboxGroup
                name="airwayManagement"
                label={t('pcr.treatment.airwayManagement')}
                options={[
                  { value: 'Suctioning', label: t('pcr.treatment.suctioning') },
                  { value: 'Positioning', label: t('pcr.treatment.positioning') },
                  { value: 'OPA', label: t('pcr.treatment.opaOption') },
                  { value: 'BVM', label: t('pcr.treatment.bvmOption') },
                  { value: 'Pocket Mask', label: t('pcr.treatment.pocketMask') },
                ]}
                value={Array.isArray(data.airwayManagement) ? data.airwayManagement : []}
                onChange={value => updateField('airwayManagement', value)}
              />

              <CheckboxGroup
                name="hemorrhageControl"
                label={t('pcr.treatment.hemorrhageControl')}
                options={[
                  { value: 'Direct Pressure', label: t('pcr.treatment.directPressure') },
                  { value: 'Dressing', label: t('pcr.treatment.dressing') },
                  { value: 'Tourniquet', label: t('pcr.treatment.tourniquet') },
                ]}
                value={Array.isArray(data.hemorrhageControl) ? data.hemorrhageControl : []}
                onChange={value => {
                  updateField('hemorrhageControl', value)
                  if (!value.includes('Tourniquet')) {
                    updateField('timeApplied', '')
                    updateField('numberOfTurns', '')
                  }
                }}
              />

              <CheckboxGroup
                name="immobilization"
                label={t('pcr.treatment.immobilization')}
                options={[
                  { value: 'C-Collar', label: t('pcr.treatment.cCollar') },
                  { value: 'Splints', label: t('pcr.treatment.splints') },
                  { value: 'C-spine Manually Held', label: t('pcr.treatment.cSpineManuallyHeld') },
                ]}
                value={Array.isArray(data.immobilization) ? data.immobilization : []}
                onChange={value => updateField('immobilization', value)}
              />

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="cprAedPerformed"
                    checked={!!data.cprAedPerformed}
                    onChange={e => {
                      const checked = e.target.checked
                      updateField('cprAedPerformed', checked)
                      if (!checked) {
                        updateField('cprPerformed', false)
                        updateField('aedPerformed', false)
                        updateField('timeStarted', '')
                        updateField('numberOfCycles', '')
                        updateField('numberOfShocks', '')
                        updateField('shockNotAdvised', '')
                      }
                    }}
                  />
                  <label
                    htmlFor="cprAedPerformed"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
                  >
                    {t('pcr.treatment.cprAed')}
                  </label>
                </div>

                {data.cprAedPerformed && (
                  <div className="ml-7 space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="cprPerformed"
                        checked={!!data.cprPerformed}
                        onChange={e => {
                          const checked = e.target.checked
                          updateField('cprPerformed', checked)
                          if (!checked) {
                            updateField('timeStarted', '')
                            updateField('numberOfCycles', '')
                          }
                        }}
                      />
                      <label
                        htmlFor="cprPerformed"
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        {t('pcr.treatment.cpr')}
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="aedPerformed"
                        checked={!!data.aedPerformed}
                        onChange={e => {
                          const checked = e.target.checked
                          updateField('aedPerformed', checked)
                          if (!checked) {
                            updateField('numberOfShocks', '')
                            updateField('shockNotAdvised', '')
                          }
                        }}
                      />
                      <label
                        htmlFor="aedPerformed"
                        className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                      >
                        {t('pcr.treatment.aed')}
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {data.cprPerformed && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{t('pcr.treatment.cpr')}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <TimePicker
                      label={t('pcr.treatment.timeStarted')}
                      value={data.timeStarted || ''}
                      onChange={e => updateField('timeStarted', e.target.value)}
                    />
                    <Input
                      label={t('pcr.treatment.numberOfCycles')}
                      type="number"
                      value={data.numberOfCycles || ''}
                      onChange={e => updateField('numberOfCycles', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {data.aedPerformed && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{t('pcr.treatment.aed')}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label={t('pcr.treatment.shocksNumber')}
                      type="number"
                      value={data.numberOfShocks || ''}
                      onChange={e => updateField('numberOfShocks', e.target.value)}
                      placeholder="0"
                    />
                    <Input
                      label={t('pcr.treatment.shockNotAdvisedNumber')}
                      type="number"
                      value={data.shockNotAdvised || ''}
                      onChange={e => updateField('shockNotAdvised', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}

              {hasTourniquet && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">{t('pcr.treatment.tourniquet')}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <TimePicker
                      label={t('pcr.treatment.timeApplied')}
                      value={data.timeApplied || ''}
                      onChange={e => updateField('timeApplied', e.target.value)}
                    />
                    <Input
                      label={t('pcr.treatment.numberOfTurns')}
                      type="number"
                      value={data.numberOfTurns || ''}
                      onChange={e => updateField('numberOfTurns', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <Input
            label={t('pcr.treatment.positionOfPatient')}
            value={data.positionOfPatient || ''}
            onChange={e => updateField('positionOfPatient', e.target.value)}
            error={errors.positionOfPatient}
            placeholder={t('pcr.treatment.positionOfPatientPlaceholder')}
            required
          />
        </FormSection>

        {/* OPQRST Assessment */}
        <FormSection title={t('pcr.opqrst.title')} number={sectionNumber('opqrstAssessment')} subtitle={t('pcr.opqrst.subtitle')}>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {opqrstEntries.length === 0
                ? t('pcr.opqrst.noneAdded')
                : t('pcr.opqrst.sectionsAdded', { count: opqrstEntries.length })}
            </p>
            {opqrstEntries.length < 4 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOpqrstEntry}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                {t('pcr.opqrst.add')}
              </Button>
            )}
          </div>

          {opqrstEntries.map((entry, index) => {
            const color = MARKER_COLORS[index]?.hex || MARKER_COLORS[0].hex
            return (
              <Card key={entry.id}>
                <Card.Header>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex items-center justify-center w-7 h-7 rounded-full border-2 text-sm font-bold"
                        style={{ borderColor: color, color }}
                      >
                        {index + 1}
                      </span>
                      <h4 className="font-medium text-gray-700 dark:text-gray-300">
                        {t('pcr.opqrst.entryTitle', { index: index + 1 })}
                      </h4>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeOpqrstEntry(entry.id)}
                      className="text-emergency-500 hover:text-emergency-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </Card.Header>
                <Card.Body>
                  <Input
                    label={t('pcr.opqrst.area')}
                    value={entry.area || ''}
                    onChange={e => updateOpqrstEntry(entry.id, 'area', e.target.value)}
                    placeholder={t('pcr.opqrst.areaPlaceholder')}
                    className="mb-4"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Input
                      label={t('pcr.opqrst.onset')}
                      value={entry.onset || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'onset', e.target.value)}
                      placeholder={t('pcr.opqrst.onsetPlaceholder')}
                    />

                    <Input
                      label={t('pcr.opqrst.provocation')}
                      value={entry.provocation || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'provocation', e.target.value)}
                      placeholder={t('pcr.opqrst.provocationPlaceholder')}
                    />

                    <Input
                      label={t('pcr.opqrst.quality')}
                      value={entry.quality || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'quality', e.target.value)}
                      placeholder={t('pcr.opqrst.qualityPlaceholder')}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    <Input
                      label={t('pcr.opqrst.radiation')}
                      value={entry.radiation || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'radiation', e.target.value)}
                      placeholder={t('pcr.opqrst.radiationPlaceholder')}
                    />

                    <Input
                      label={t('pcr.opqrst.scale')}
                      type="number"
                      min="1"
                      max="10"
                      value={entry.scale || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'scale', e.target.value)}
                      placeholder={t('pcr.opqrst.scalePlaceholder')}
                    />

                    <Input
                      label={t('pcr.opqrst.time')}
                      value={entry.time || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'time', e.target.value)}
                      placeholder={t('pcr.opqrst.timePlaceholder')}
                    />
                  </div>
                </Card.Body>
              </Card>
            )
          })}

          {/* Injury Location - a subsection of OPQRST Assessment */}
          {opqrstEntries.length > 0 && (
            <FormSection title={t('pcr.opqrst.injuryLocation')} subtitle="">
              <InjuryLocationMap
                value={data.injuryMarkers}
                onChange={value => updateField('injuryMarkers', value)}
                opqrstCount={opqrstEntries.length}
              />
            </FormSection>
          )}
        </FormSection>

        {/* Vital Signs Table 1 */}
        <FormSection title={t('pcr.vitalSigns.title')} number={sectionNumber('vitalSigns')} subtitle={t('pcr.vitalSigns.subtitle')}>
          <VitalSignsTable data={data.vitalSigns || []} onChange={handleVitalSignsChange} />
        </FormSection>

        {/* Oxygen Protocol */}
        <FormSection title={t('pcr.oxygenProtocol.title')} number={sectionNumber('oxygenProtocol')} subtitle={t('pcr.oxygenProtocol.subtitle')}>
          <OxygenProtocolForm
            data={data.oxygenProtocol || {}}
            onChange={oxygenProtocolData => updateField('oxygenProtocol', oxygenProtocolData)}
            errors={errors}
          />
        </FormSection>

        {/* Additional Information */}
        <FormSection
          title={t('pcr.additionalInfo.title')}
          number={sectionNumber('additionalInformation')}
          subtitle={t('pcr.additionalInfo.subtitle')}
          required
        >
          <div className="space-y-4">
            <Textarea
              label={t('pcr.additionalInfo.callDescription')}
              value={data.comments || ''}
              onChange={e => updateField('comments', e.target.value)}
              error={errors.comments}
              placeholder={t('pcr.additionalInfo.callDescriptionPlaceholder')}
              helpText={t('pcr.additionalInfo.callDescriptionHelp')}
              rows={4}
              required
            />

            <Textarea
              label={t('pcr.additionalInfo.transferOfCare')}
              value={data.transferComments || ''}
              onChange={e => updateField('transferComments', e.target.value)}
              error={errors.transferComments}
              placeholder={t('pcr.additionalInfo.transferOfCarePlaceholder')}
              helpText={t('pcr.additionalInfo.transferOfCareHelp')}
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <RadioGroup
                name="patientCareTransferred"
                label={t('pcr.additionalInfo.patientCareTransferred')}
                options={[
                  { value: 'Paramedics', label: t('pcr.additionalInfo.paramedics') },
                  { value: 'Police', label: t('pcr.additionalInfo.police') },
                  { value: 'Self', label: t('pcr.additionalInfo.self') },
                  { value: 'Family/Friend', label: t('pcr.additionalInfo.familyFriend') },
                  { value: 'Clinic', label: t('pcr.additionalInfo.clinic') },
                ]}
                value={data.patientCareTransferred}
                onChange={value => updateField('patientCareTransferred', value)}
                error={errors.patientCareTransferred}
                required
              />

              {data.patientCareTransferred === 'Paramedics' && (
                <>
                  <Input
                    label={t('pcr.additionalInfo.unitNumber')}
                    value={data.unitNumber || ''}
                    onChange={e => updateField('unitNumber', e.target.value)}
                    placeholder={t('pcr.additionalInfo.unitNumberPlaceholder')}
                    requireUnknown
                  />
                  <Input
                    label={t('pcr.additionalInfo.hospitalDestination')}
                    value={data.hospitalDestination || ''}
                    onChange={e => updateField('hospitalDestination', e.target.value)}
                    placeholder={t('pcr.additionalInfo.hospitalDestinationPlaceholder')}
                    requireUnknown
                  />
                </>
              )}

              {data.patientCareTransferred === 'Police' && (
                <Input
                  label={t('pcr.additionalInfo.badgeNumber')}
                  value={data.badgeNumber || ''}
                  onChange={e => updateField('badgeNumber', e.target.value)}
                  placeholder={t('pcr.additionalInfo.badgeNumberPlaceholder')}
                  requireUnknown
                />
              )}

              {data.patientCareTransferred === 'Clinic' && (
                <Input
                  label={t('pcr.additionalInfo.clinicName')}
                  value={data.clinicName || ''}
                  onChange={e => updateField('clinicName', e.target.value)}
                  placeholder={t('pcr.additionalInfo.clinicNamePlaceholder')}
                  requireUnknown
                />
              )}
            </div>

            <TimePicker
              label={t('pcr.additionalInfo.timeCareTransferred')}
              value={data.timeCareTransferred || ''}
              onChange={e => updateField('timeCareTransferred', e.target.value)}
              error={errors.timeCareTransferred}
              required
            />
          </div>
        </FormSection>

        <FormSection
          title={t('pcr.attachments.title')}
          number={sectionNumber('additionalAttachments')}
          subtitle={t('pcr.attachments.subtitle')}
        >
          <label
            className={cn(
              'block rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
              signOffPdfError
                ? 'border-red-300 dark:border-red-800'
                : isDraggingSignOff
                  ? 'border-primary-400 bg-primary-50/60 dark:border-primary-600 dark:bg-primary-900/20'
                  : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500',
            )}
            onDragOver={e => {
              e.preventDefault()
              setIsDraggingSignOff(true)
            }}
            onDragLeave={() => setIsDraggingSignOff(false)}
            onDrop={e => {
              e.preventDefault()
              setIsDraggingSignOff(false)
              const file = e.dataTransfer.files?.[0]
              validateAndSetSignOff(file ?? null)
            }}
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={e => validateAndSetSignOff(e.target.files?.[0] ?? null)}
            />

            <span className="icon-chip icon-chip-primary w-10 h-10 mx-auto">
              <Upload className="w-5 h-5" />
            </span>

            <p className="mt-3 text-sm font-medium text-gray-900 dark:text-gray-100">
              {t('pcr.attachments.dragDrop')}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {t('pcr.attachments.hint', { maxMb: MAX_SIGN_OFF_MB })}
            </p>

            {signOffPdf && (
              <div
                className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-left"
                onClick={e => e.preventDefault()}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      {signOffPdf.name}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {formatFileSize(signOffPdf.size)}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => validateAndSetSignOff(null)}
                  aria-label={t('pcr.attachments.remove')}
                  className="shrink-0 p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {signOffPdfError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{signOffPdfError}</p>
            )}
          </label>
        </FormSection>

        {/* Add Signatures */}
        <FormSection
          title={t('pcr.signatures.title')}
          number={sectionNumber('addSignatures')}
          subtitle={t('pcr.signatures.subtitle')}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goPrevSigner}
              disabled={activeSignerIndex === 0}
              aria-label={t('pcr.signatures.previousSigner')}
              className="p-2 rounded-full text-primary-600 hover:bg-primary-50 hover:text-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/30 dark:hover:text-primary-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="max-w-xs mx-auto">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 text-center mb-2">
                  {activeSigner.label}
                  {activeSigner.name ? ` — ${activeSigner.name}` : ''}
                </p>
                <SignaturePad
                  key={activeSigner.reactKey}
                  value={getSignatureValue(activeSigner.ref)}
                  onChange={value => handleSignatureChange(activeSigner.ref, value)}
                />
                <span className="block text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
                  {activeSignerIndex + 1}/{signers.length}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={goNextSigner}
              disabled={activeSignerIndex === signers.length - 1}
              aria-label={t('pcr.signatures.nextSigner')}
              className="p-2 rounded-full text-primary-600 hover:bg-primary-50 hover:text-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/30 dark:hover:text-primary-300 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors shrink-0"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </FormSection>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-gray-200 dark:border-gray-700">
          <div className="flex space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              leftIcon={<RotateCcw className="w-4 h-4" />}
            >
              {t('pcr.actions.resetForm')}
            </Button>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              loading={isSavingDraft}
              disabled={isSavingDraft}
              leftIcon={<Save className="w-4 h-4" />}
            >
              {isSavingDraft ? t('common.saving') : t('common.save')}
            </Button>

            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
              leftIcon={<Send className="w-4 h-4" />}
              className="border-2 border-primary-700"
            >
              {isSubmitting ? t('pcr.actions.submitting') : t('pcr.actions.submit')}
            </Button>
          </div>
        </div>
      </form>

      {/* Unsaved Changes Modal */}
      <Modal
        isOpen={showUnsavedChangesModal}
        onClose={() => setShowUnsavedChangesModal(false)}
        title={t('pcr.modals.unsavedChangesTitle')}
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-900 dark:text-gray-100">
                {t('pcr.modals.unsavedChangesBody')}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                {t('pcr.modals.unsavedChangesConfirm')}
              </p>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button variant="outline" onClick={() => setShowUnsavedChangesModal(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={confirmReset}>
              {t('pcr.actions.resetForm')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Closing the app, or navigating away in-app, while this draft has unsaved changes */}
      <Modal
        isOpen={showCloseSaveModal}
        onClose={() => resolveCloseSaveModal(false)}
        title={closeReason === 'app-close' ? t('pcr.modals.closeTitle') : t('pcr.modals.leaveTitle')}
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-900 dark:text-gray-100">
                {closeReason === 'app-close'
                  ? t('pcr.modals.closeBodyAppClose')
                  : t('pcr.modals.closeBodyNavigate')}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                {t('pcr.modals.closeBodyPrompt')}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Button variant="danger" onClick={() => resolveCloseSaveModal(true)} disabled={isSavingDraft}>
              {closeReason === 'app-close' ? t('pcr.modals.discardAndClose') : t('pcr.modals.discardAndLeave')}
            </Button>
            <Button onClick={handleSaveDraftAndClose} loading={isSavingDraft} disabled={isSavingDraft}>
              {closeReason === 'app-close' ? t('pcr.modals.saveDraftAndClose') : t('pcr.modals.saveDraftAndLeave')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default PCRPage

