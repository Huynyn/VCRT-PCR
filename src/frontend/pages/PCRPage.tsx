import React, { useState, useEffect } from 'react'
import { Send, RotateCcw, AlertTriangle, Clock, CheckCircle, Save, UserCheck, Plus, Trash2 } from 'lucide-react'
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
import { VitalSignsTable, InjuryLocationMap, OxygenProtocolForm, SearchableSelect } from '@/components/composite'
import { useForm } from '../context/FormContext'
import { useNotification } from '../context/NotificationContext'
import { useAuth } from '../context/AuthContext'
import { cn, getCurrentTime, formatDate, generateId, MARKER_COLORS } from '../utils'
import { pdfService } from '../services/pdf.service'
import { apiRequest } from '../utils/api'
import type { PCRFormData, VitalSign, OPQRSTEntry } from '../types'

const PCRPage: React.FC = () => {
  const {
    data,
    updateField,
    errors,
    isDirty,
    isValid,
    reset,
    validateField,
    validateAll,
    loadData,
  } = useForm()
  const { showNotification } = useNotification()
  const { token, isAuthenticated, user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingDraft, setIsLoadingDraft] = useState(false)
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null)
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)
  const [loadedStatus, setLoadedStatus] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [signOffPdf, setSignOffPdf] = useState<File | null>(null)
  const [signOffPdfError, setSignOffPdfError] = useState<string>('')
  const [responderOptions, setResponderOptions] = useState<string[]>([])

  useEffect(() => {
    if (!isAuthenticated) return
    apiRequest('/responders')
      .then(res => setResponderOptions((res.data || []).map((r: { name: string }) => r.name)))
      .catch(() => {
        // Silently fail - responders just won't be suggested, free text still works
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
            loadData(draftData.form_data)
            setLoadedStatus('draft')
            // Restore sign-off attachment if present
            if (draftData.sign_off_attachment && draftData.sign_off_filename) {
              const file = base64ToFile(draftData.sign_off_attachment, draftData.sign_off_filename)
              setSignOffPdf(file)
            }
            showNotification('Draft loaded successfully', 'success')
          } else {
            showNotification('This report is not a draft and cannot be edited', 'error')
          }
        } catch (error) {
          if (ignore) return
          console.error('Failed to load draft:', error)
          showNotification('Failed to load draft', 'error')
        } finally {
          if (!ignore) setIsLoadingDraft(false)
        }
      } else if (reportId && isAuthenticated && token && isAdmin) {
        // Admin editing a submitted report
        setIsLoadingDraft(true)
        setCurrentReportId(reportId)

        try {
          const data = await apiRequest(`/pcr/${reportId}`)
          if (ignore) return
          const reportData = data.data

          loadData(reportData.form_data)
          setLoadedStatus(reportData.status)
          // Restore sign-off attachment if present
          if (reportData.sign_off_attachment && reportData.sign_off_filename) {
            const file = base64ToFile(reportData.sign_off_attachment, reportData.sign_off_filename)
            setSignOffPdf(file)
          }
          showNotification('Report loaded for editing', 'success')
        } catch (error) {
          if (ignore) return
          console.error('Failed to load report:', error)
          showNotification('Failed to load report', 'error')
        } finally {
          if (!ignore) setIsLoadingDraft(false)
        }
      }

      if (!ignore && !data.date) {
        const todayISO = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
        updateField('date', todayISO)
      }
    }

    loadFromUrl()

    return () => {
      ignore = true
    }
  }, [isAuthenticated, token, isAdmin, loadData, showNotification])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Validate all form fields
      const formErrors = validateAll()
      if (Object.keys(formErrors).length > 0) {
        const errorMessages = Object.values(formErrors).slice(0, 5)
        const remaining = Object.keys(formErrors).length - 5
        const message =
          remaining > 0
            ? `${errorMessages.join(', ')} and ${remaining} more`
            : errorMessages.join(', ')
        showNotification(`Please complete required fields: ${message}`, 'error')

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
          `Please complete required fields: ${validation.errors.join(', ')}`,
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
                ? 'Report updated successfully'
                : currentDraftId
                  ? 'Draft updated and submitted successfully'
                  : 'PCR form submitted successfully'
              showNotification(successMessage, 'success')
              reset()
              setSignOffPdf(null)
              // Clear state and URL to start fresh
              setCurrentReportId(null)
              setCurrentDraftId(null)
              setLoadedStatus(null)
              window.location.hash = '#/pcr/new'
            } catch (submitError) {
              console.error('Submission failed:', submitError)
              showNotification('Failed to submit PCR form to server', 'error')
            }
          } else {
            // User cancelled - don't submit to backend
            showNotification('Form submission cancelled', 'info')
          }
          setIsSubmitting(false)
        },
        { allowDownload: isAdmin },
      )
    } catch (error) {
      console.error('PDF generation failed:', error)
      showNotification(
        signOffPdf
          ? 'Failed to generate PDF (could not append the sign-off PDF). Try a different PDF or remove it.'
          : 'Failed to generate PDF report',
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
      showNotification('Form reset successfully', 'success')
    }
  }

  const confirmReset = () => {
    reset()
    setSignOffPdf(null)
    setSignOffPdfError('')
    setShowUnsavedChangesModal(false)
    showNotification('Form reset successfully', 'success')
  }

  const handleSaveDraft = async () => {
    if (!isAuthenticated || !token) {
      showNotification('Please log in to save drafts', 'error')
      return
    }

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
          form_data: data,
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

      showNotification('Draft saved successfully', 'success')
    } catch (error) {
      console.error('Save draft failed:', error)
      showNotification('Failed to save draft', 'error')
    } finally {
      setIsSavingDraft(false)
    }
  }

  const handleVitalSignsChange = (vitalSigns: VitalSign[]) => {
    updateField('vitalSigns', vitalSigns)
  }

  const opqrstEntries: OPQRSTEntry[] = data.opqrstEntries || []

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

  // Test function to fill sample data
  const fillSampleData = () => {
    const sampleData: Partial<PCRFormData> = {
      // --- Basic Information (required) ---
      date: formatDate(new Date()),
      location: 'Morisset 6th floor',
      callNumber: '002',
      reportNumber: '2026-001',
      supervisor: 'Hailey Bieber',
      primaryPSM: 'Kim Kardashian',
      responder1: 'Frodo Baggins',
      responder2: 'Cersei Lannister',
      responder3: 'Tony Stark',
      timeNotified: '14:30',
      workplaceInjury: 'No',
      onScene: '14:35',
      clearedScene: '15:15',
      firstAgencyOnScene: 'Protection Services',

      // Optional-but-nice
      transportArrived: '15:10',
      paramedicsCalledBy: 'Responder 1',

      // --- Patient Information ---
      patientName: 'Harry Potter',
      age: '25',
      sex: 'Male',
      status: 'Student',

      // requireUnknown fields in this section
      studentEmployeeNumber: '300718038',
      emergencyContactName: 'Lily Potter (Mother)',
      emergencyContactPhone: '(613) 671-3781',
      contacted: 'Yes',
      contactedBy: 'Harry Potter',

      // --- Treatment / Findings ---
      positionOfPatient: 'Seated',
      airwayManagement: ['Positioning'],
      hemorrhageControl: ['Direct Pressure'],
      immobilization: [],

      // CPR/AED (optional)
      timeStarted: '',
      numberOfCycles: '',
      numberOfShocks: '',
      shockNotAdvised: '',

      // --- OPQRST (optional) ---
      opqrstEntries: [
        {
          id: generateId(),
          area: 'Right knee',
          onset: 'Acute',
          provocation: 'Movement worsens',
          quality: 'Sharp',
          radiation: 'None',
          scale: '4',
          time: '14:20',
        },
      ],

      // --- Medical History (all these textareas were set with requireUnknown) ---
      chiefComplaint: 'Injured knee',
      signsSymptoms: 'Panic attack symptoms, bleeding right knee',
      allergies: 'Bee stings',
      medications: 'DNO',
      medicalHistory: 'Nothing to note',
      lastMeal: 'Happy Meal, 2 hours ago, sat well',
      bodySurvey: 'No other findings',

      // --- Oxygen Protocol (optional) ---
      oxygenProtocol: {
        saturation_range: '94–98%',
        spo2: '96',
        spo2_acceptable: 'Yes',
      } as any,

      // --- Additional Information (required group) ---
      comments: 'VCRT Responders (NAMES) were called at yada yada',
      transferComments: 'Patient care transferred to paramedics yada yada yada.',
      patientCareTransferred: 'Paramedics',
      hospitalDestination: 'MontFort Hospital',
      unitNumber: 'A-123',
      timeCareTransferred: '15:12',
    }

    Object.entries(sampleData).forEach(([key, value]) => {
      updateField(key as keyof PCRFormData, value as any)
    })
    showNotification('Sample data filled for testing', 'info')
  }

  // Drop-box for sign-off
  const validateAndSetSignOff = (file: File | null) => {
    setSignOffPdfError('')
    if (!file) {
      setSignOffPdf(null)
      return
    }

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const maxMb = 15
    const maxBytes = maxMb * 1024 * 1024

    if (!isPdf) {
      setSignOffPdf(null)
      setSignOffPdfError('Please upload a PDF file.')
      return
    }

    if (file.size > maxBytes) {
      setSignOffPdf(null)
      setSignOffPdfError(`PDF is too large (max ${maxMb} MB).`)
      return
    }

    setSignOffPdf(file)
  }

  const hasTourniquet =
    Array.isArray(data.hemorrhageControl) && data.hemorrhageControl.includes('Tourniquet')

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {currentReportId &&
            (loadedStatus === 'submitted' || loadedStatus === 'approved') &&
            isAdmin
              ? 'Edit Submitted Patient Care Report (Admin)'
              : currentDraftId
                ? 'Edit Patient Care Report Draft'
                : 'Patient Care Report'}
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {isLoadingDraft
              ? 'Loading...'
              : currentReportId &&
                  (loadedStatus === 'submitted' || loadedStatus === 'approved') &&
                  isAdmin
                ? 'Editing submitted report as admin - changes will update the existing report'
                : currentDraftId
                  ? 'Editing existing draft - complete and submit when ready'
                  : 'Complete fields to submit the report'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Test button for development */}
          <Button type="button" variant="outline" size="sm" onClick={fillSampleData}>
            Fill Sample Data
          </Button>

          {!isDirty && isValid && (
            <div className="flex items-center space-x-1 text-green-600 dark:text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">All changes saved</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {isLoadingDraft && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="text-gray-900 dark:text-gray-100">Loading draft...</span>
              </div>
            </div>
          </div>
        )}
        {/* Basic Information */}
        <FormSection
          title="Basic Information"
          subtitle="Essential call details and response information"
          required
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <DatePicker
              label="Date"
              value={data.date ?? ''} // don’t show fallback directly here
              onChange={(v: any) => {
                const next = typeof v === 'string' ? v : (v?.target?.value ?? '')
                updateField('date', next)
              }}
              error={errors.date}
              required
            />

            <Input
              label="Location"
              value={data.location || ''}
              onChange={e => updateField('location', e.target.value)}
              error={errors.location}
              placeholder="Incident location"
              required
            />

            <Input
              label="Call Number"
              value={data.callNumber || ''}
              onChange={e => updateField('callNumber', e.target.value)}
              error={errors.callNumber}
              placeholder="Call #"
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label="Report Number"
              value={data.reportNumber || ''}
              onChange={e => updateField('reportNumber', e.target.value)}
              error={errors.reportNumber}
              placeholder="Report #"
              required
            />

            <Input
              label="Supervisor"
              value={data.supervisor || ''}
              onChange={e => updateField('supervisor', e.target.value)}
              error={errors.supervisor}
              placeholder="Supervisor name"
              required
              rightIcon={
                currentUser && (
                  <Tooltip content="Use my name">
                    <button
                      type="button"
                      onClick={() =>
                        updateField('supervisor', `${currentUser.firstName} ${currentUser.lastName}`)
                      }
                      className="p-1 rounded text-gray-400 hover:text-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <UserCheck className="w-4 h-4" />
                    </button>
                  </Tooltip>
                )
              }
            />

            <Input
              label="Primary PSM"
              value={data.primaryPSM || ''}
              onChange={e => updateField('primaryPSM', e.target.value)}
              placeholder="Primary PSM name"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SearchableSelect
              label="Responder 1"
              value={data.responder1 || ''}
              onChange={value => updateField('responder1', value)}
              options={responderOptions}
              placeholder="Search responders..."
            />

            <SearchableSelect
              label="Responder 2"
              value={data.responder2 || ''}
              onChange={value => updateField('responder2', value)}
              options={responderOptions}
              placeholder="Search responders..."
            />

            <SearchableSelect
              label="Responder 3"
              value={data.responder3 || ''}
              onChange={value => updateField('responder3', value)}
              options={responderOptions}
              placeholder="Search responders..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <TimePicker
              label="Time Notified"
              value={data.timeNotified || ''}
              onChange={e => updateField('timeNotified', e.target.value)}
              error={errors.timeNotified}
              required
            />

            <TimePicker
              label="On Scene"
              value={data.onScene || ''}
              onChange={e => updateField('onScene', e.target.value)}
              error={errors.onScene}
              required
            />

            <TimePicker
              label="Transport Arrived"
              value={data.transportArrived || ''}
              onChange={e => updateField('transportArrived', e.target.value)}
            />

            <TimePicker
              label="Cleared Scene"
              value={data.clearedScene || ''}
              onChange={e => updateField('clearedScene', e.target.value)}
              error={errors.clearedScene}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Paramedics Called by"
              value={data.paramedicsCalledBy || ''}
              onChange={e => updateField('paramedicsCalledBy', e.target.value)}
              placeholder="Who called paramedics"
            />

            <Input
              label="First Agency on Scene"
              value={data.firstAgencyOnScene || ''}
              onChange={e => updateField('firstAgencyOnScene', e.target.value)}
              error={errors.firstAgencyOnScene}
              placeholder="First responding agency"
              required
            />
          </div>
        </FormSection>

        {/* Patient Information */}
        <FormSection
          title="Patient Information"
          subtitle="Patient information and contact details (DNO or UTO if not obtained)"
          required
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Input
              label="Patient Name"
              value={data.patientName || ''}
              onChange={e => updateField('patientName', e.target.value)}
              error={errors.patientName}
              placeholder="Full name"
              required
            />

            <DatePicker
              label="Date of Birth"
              value={data.dob || ''}
              onChange={e => handleDOBChange(e.target.value)}
            />

            <Input
              label="Age"
              type="number"
              min="0"
              max="150"
              value={data.age || ''}
              onChange={e => handleAgeChange(e.target.value)}
              error={errors.age}
              placeholder="Age in years"
              required
            />
          </div>

          {errors.ageOrDob && (
            <Alert type="error" message={errors.ageOrDob} className="mb-4" />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RadioGroup
              name="sex"
              label="Sex"
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Different from gender', label: 'Different from gender' },
                { value: 'Does not want to disclose', label: 'Does not want to disclose' },
                { value: 'Other', label: 'Other' },
              ]}
              value={data.sex}
              onChange={value => updateField('sex', value)}
            />

            {data.sex === 'Other' && (
              <Input
                label="Other Sex (specify)"
                value={data.otherSex || ''}
                onChange={e => updateField('otherSex', e.target.value)}
                placeholder="Please specify"
              />
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RadioGroup
              name="status"
              label="Status"
              options={[
                { value: 'Student', label: 'Student' },
                { value: 'Employee', label: 'Employee' },
                { value: 'Visitor/Other', label: 'Visitor/Other' },
              ]}
              value={data.status}
              onChange={value => updateField('status', value)}
            />

            {data.status === 'Visitor/Other' && (
              <Input
                label="Visitor/Other (specify)"
                value={data.visitorText || ''}
                onChange={e => updateField('visitorText', e.target.value)}
                placeholder="Please specify"
                requireUnknown
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RadioGroup
              name="workplaceInjury"
              label="Workplace Injury?"
              options={[
                { value: 'Yes', label: 'Yes' },
                { value: 'No', label: 'No' },
              ]}
              orientation="horizontal"
              value={data.workplaceInjury}
              onChange={value => updateField('workplaceInjury', value)}
            />

            <Input
              label="Student/Employee Number"
              value={data.studentEmployeeNumber || ''}
              onChange={e => updateField('studentEmployeeNumber', e.target.value)}
              placeholder="ID number"
              requireUnknown
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Emergency Contact Name (and Relationship)"
              value={data.emergencyContactName || ''}
              onChange={e => updateField('emergencyContactName', e.target.value)}
              placeholder="Contact person name and relationship"
              requireUnknown
            />

            <Input
              label="Emergency Contact Phone"
              type="tel"
              value={data.emergencyContactPhone || ''}
              onChange={e => updateField('emergencyContactPhone', e.target.value)}
              placeholder="(XXX) XXX-XXXX"
              requireUnknown
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RadioGroup
              name="contacted"
              label="Contacted?"
              options={[
                { value: 'Yes', label: 'Yes' },
                { value: 'No', label: 'No' },
              ]}
              orientation="horizontal"
              value={data.contacted}
              onChange={value => updateField('contacted', value)}
            />

            {data.contacted === 'Yes' && (
              <Input
                label="Contacted by"
                value={data.contactedBy || ''}
                onChange={e => updateField('contactedBy', e.target.value)}
                placeholder="Who called?"
                requireUnknown
              />
            )}
          </div>
        </FormSection>

        {/* Medical History */}
        <FormSection
          title="Patient Medical History"
          subtitle="Medical background and assessment findings (DNO or UTO if not obtained)"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label="Chief Complaint"
              value={data.chiefComplaint || ''}
              onChange={e => updateField('chiefComplaint', e.target.value)}
              placeholder="Primary reason for call as reported by dispatch"
              rows={3}
              requireUnknown
            />

            <Textarea
              label="Signs and Symptoms"
              value={data.signsSymptoms || ''}
              onChange={e => updateField('signsSymptoms', e.target.value)}
              placeholder="Observable signs and reported symptoms..."
              rows={3}
              requireUnknown
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label="Allergies"
              value={data.allergies || ''}
              onChange={e => updateField('allergies', e.target.value)}
              placeholder="Known allergies (food, medicine...), sensitivities, and reactions..."
              rows={2}
              requireUnknown
            />

            <Textarea
              label="Medications"
              value={data.medications || ''}
              onChange={e => updateField('medications', e.target.value)}
              placeholder="Current medications (name, dose, reason, taken as prescribed)..."
              rows={2}
              requireUnknown
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Textarea
              label="Pertinent Medical History"
              value={data.medicalHistory || ''}
              onChange={e => updateField('medicalHistory', e.target.value)}
              placeholder="Relevant medical history and conditions..."
              rows={2}
              requireUnknown
            />

            <Textarea
              label="Last Oral Intake"
              value={data.lastMeal || ''}
              onChange={e => updateField('lastMeal', e.target.value)}
              placeholder="When and what was last consumed (food, drink...), and whether it sat well..."
              rows={2}
              requireUnknown
            />
          </div>

          <Textarea
            label="Rapid Body Survey Findings"
            value={data.bodySurvey || ''}
            onChange={e => updateField('bodySurvey', e.target.value)}
            placeholder="Physical examination findings..."
            rows={3}
            requireUnknown
          />
        </FormSection>

        {/* Treatment Performed */}
        <FormSection
          title="Treatment Performed"
          subtitle="Lifesaving interventions and care provided to the patient"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <CheckboxGroup
                name="airwayManagement"
                label="Airway Management"
                options={[
                  { value: 'Suctioning', label: 'Suctioning' },
                  { value: 'Positioning', label: 'Positioning' },
                  { value: 'OPA', label: 'OPA' },
                  { value: 'BVM', label: 'BVM' },
                  { value: 'Pocket Mask', label: 'Pocket Mask' },
                ]}
                value={Array.isArray(data.airwayManagement) ? data.airwayManagement : []}
                onChange={value => updateField('airwayManagement', value)}
              />

              <CheckboxGroup
                name="hemorrhageControl"
                label="Hemorrhage Control"
                options={[
                  { value: 'Direct Pressure', label: 'Direct Pressure' },
                  { value: 'Dressing', label: 'Dressing' },
                  { value: 'Tourniquet', label: 'Tourniquet' },
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
                label="Immobilization"
                options={[
                  { value: 'C-Collar', label: 'C-Collar' },
                  { value: 'Splints', label: 'Splints' },
                  { value: 'C-spine Manually Held', label: 'C-spine Manually Held' },
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
                    CPR/AED
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
                        CPR
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
                        AED
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {data.cprPerformed && (
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">CPR</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <TimePicker
                      label="Time Started"
                      value={data.timeStarted || ''}
                      onChange={e => updateField('timeStarted', e.target.value)}
                    />
                    <Input
                      label="Number of Cycles"
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
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">AED</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Shocks (#)"
                      type="number"
                      value={data.numberOfShocks || ''}
                      onChange={e => updateField('numberOfShocks', e.target.value)}
                      placeholder="0"
                    />
                    <Input
                      label="Shock Not Advised (#)"
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
                  <h4 className="font-medium text-gray-900 dark:text-gray-100">Tourniquet</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <TimePicker
                      label="Time Applied"
                      value={data.timeApplied || ''}
                      onChange={e => updateField('timeApplied', e.target.value)}
                    />
                    <Input
                      label="Number of Turns"
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
            label="Position of Patient"
            value={data.positionOfPatient || ''}
            onChange={e => updateField('positionOfPatient', e.target.value)}
            error={errors.positionOfPatient}
            placeholder="e.g. Seated, Supine, Prone, Semi-Prone..."
            required
          />
        </FormSection>

        {/* OPQRST Assessment */}
        <FormSection title="OPQRST Assessment" subtitle="Add a section for each reported pain/injury location; its number/color are shown on the body diagram below (DNO or UTO if not obtained)">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {opqrstEntries.length === 0
                ? 'No OPQRST sections added yet.'
                : `${opqrstEntries.length} of 4 section${opqrstEntries.length === 1 ? '' : 's'} added.`}
            </p>
            {opqrstEntries.length < 4 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOpqrstEntry}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                Add OPQRST Section
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
                        OPQRST #{index + 1}
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
                    label="Area / Location"
                    value={entry.area || ''}
                    onChange={e => updateOpqrstEntry(entry.id, 'area', e.target.value)}
                    placeholder="e.g. Left knee, Chest, Lower back"
                    className="mb-4"
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Input
                      label="Onset"
                      value={entry.onset || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'onset', e.target.value)}
                      placeholder="Acute/chronic"
                    />

                    <Input
                      label="Provocation"
                      value={entry.provocation || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'provocation', e.target.value)}
                      placeholder="What makes it better/worse?"
                    />

                    <Input
                      label="Quality"
                      value={entry.quality || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'quality', e.target.value)}
                      placeholder="How does it feel?"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    <Input
                      label="Radiation"
                      value={entry.radiation || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'radiation', e.target.value)}
                      placeholder="Where does it radiate?"
                    />

                    <Input
                      label="Scale (1-10)"
                      type="number"
                      min="1"
                      max="10"
                      value={entry.scale || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'scale', e.target.value)}
                      placeholder="Pain scale"
                    />

                    <Input
                      label="Time"
                      value={entry.time || ''}
                      onChange={e => updateOpqrstEntry(entry.id, 'time', e.target.value)}
                      placeholder="What time did it occur?"
                    />
                  </div>
                </Card.Body>
              </Card>
            )
          })}
        </FormSection>

        {/* Injury Location */}
        {opqrstEntries.length > 0 && (
          <FormSection title="Injury Location" subtitle="Mark injury locations on the front/back body diagram - matching numbers/colors link back to the OPQRST sections above">
            <InjuryLocationMap
              value={data.injuryMarkers}
              onChange={value => updateField('injuryMarkers', value)}
              opqrstCount={opqrstEntries.length}
            />
          </FormSection>
        )}

        {/* Vital Signs Table 1 */}
        <FormSection title="Vital Signs" subtitle="Patient vital signs measurements (DNO or UTO if not obtained)">
          <VitalSignsTable data={data.vitalSigns || []} onChange={handleVitalSignsChange} />
        </FormSection>

        {/* Oxygen Protocol */}
        <FormSection title="Oxygen Protocol" subtitle="Oxygen therapy administration details">
          <OxygenProtocolForm
            data={data.oxygenProtocol || {}}
            onChange={oxygenProtocolData => updateField('oxygenProtocol', oxygenProtocolData)}
            errors={errors}
          />
        </FormSection>

        {/* Additional Information */}
        <FormSection
          title="Additional Information"
          subtitle="Call details and patient transfer information"
          required
        >
          <div className="space-y-4">
            <Textarea
              label="Call Description"
              value={data.comments || ''}
              onChange={e => updateField('comments', e.target.value)}
              error={errors.comments}
              placeholder="Detailed description of the call..."
              rows={4}
              required
            />

            <Textarea
              label="Transfer of Care"
              value={data.transferComments || ''}
              onChange={e => updateField('transferComments', e.target.value)}
              error={errors.transferComments}
              placeholder="Details about patient transfer..."
              rows={3}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <RadioGroup
                name="patientCareTransferred"
                label="Patient Care Transferred"
                options={[
                  { value: 'Paramedics', label: 'Paramedics' },
                  { value: 'Police', label: 'Police' },
                  { value: 'Self', label: 'Self' },
                  { value: 'Family/Friend', label: 'Family/Friend' },
                  { value: 'Clinic', label: 'Clinic' },
                ]}
                value={data.patientCareTransferred}
                onChange={value => updateField('patientCareTransferred', value)}
                error={errors.patientCareTransferred}
                required
              />

              {data.patientCareTransferred === 'Paramedics' && (
                <>
                  <Input
                    label="Unit Number"
                    value={data.unitNumber || ''}
                    onChange={e => updateField('unitNumber', e.target.value)}
                    placeholder="Paramedic unit number"
                    requireUnknown
                  />
                  <Input
                    label="Hospital Destination"
                    value={data.hospitalDestination || ''}
                    onChange={e => updateField('hospitalDestination', e.target.value)}
                    placeholder="e.g., The Ottawa Hospital - Civic"
                    requireUnknown
                  />
                </>
              )}

              {data.patientCareTransferred === 'Police' && (
                <Input
                  label="Badge Number"
                  value={data.badgeNumber || ''}
                  onChange={e => updateField('badgeNumber', e.target.value)}
                  placeholder="Police badge number"
                  requireUnknown
                />
              )}

              {data.patientCareTransferred === 'Clinic' && (
                <Input
                  label="Clinic Name"
                  value={data.clinicName || ''}
                  onChange={e => updateField('clinicName', e.target.value)}
                  placeholder="Clinic name"
                  requireUnknown
                />
              )}
            </div>

            <TimePicker
              label="Time Care Transferred"
              value={data.timeCareTransferred || ''}
              onChange={e => updateField('timeCareTransferred', e.target.value)}
              error={errors.timeCareTransferred}
              required
            />
          </div>
        </FormSection>

        <FormSection
          title="Additional Attachments"
          subtitle="Upload patient sign-off or other information (as a PDF) to append to the report"
        >
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-4 transition',
              'hover:bg-gray-50 dark:hover:bg-gray-800/40',
              signOffPdfError ? 'border-red-300' : 'border-gray-300',
            )}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              validateAndSetSignOff(file ?? null)
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Drag & drop a PDF here, or browse.
                </div>
              </div>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={e => validateAndSetSignOff(e.target.files?.[0] ?? null)}
                />
                <span className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  Browse
                </span>
              </label>
            </div>

            {signOffPdf && (
              <div className="mt-3 flex items-center justify-between rounded bg-gray-100 dark:bg-gray-800 px-3 py-2">
                <div className="text-sm text-gray-900 dark:text-gray-100 truncate">
                  {signOffPdf.name}
                </div>
                <button
                  type="button"
                  onClick={() => validateAndSetSignOff(null)}
                  className="text-sm text-red-600 hover:text-red-800 font-medium"
                >
                  Remove
                </button>
              </div>
            )}

            {signOffPdfError && <div className="mt-2 text-sm text-red-600">{signOffPdfError}</div>}
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
              Reset Form
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
              {isSavingDraft ? 'Saving...' : 'Save Draft'}
            </Button>

            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
              leftIcon={<Send className="w-4 h-4" />}
            >
              {isSubmitting ? 'Submitting...' : 'Submit PCR'}
            </Button>
          </div>
        </div>
      </form>

      {/* Unsaved Changes Modal */}
      <Modal
        isOpen={showUnsavedChangesModal}
        onClose={() => setShowUnsavedChangesModal(false)}
        title="Unsaved Changes"
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-gray-900 dark:text-gray-100">
                You have unsaved changes that will be lost if you reset the form.
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">
                Are you sure you want to continue?
              </p>
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button variant="outline" onClick={() => setShowUnsavedChangesModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmReset}>
              Reset Form
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default PCRPage

