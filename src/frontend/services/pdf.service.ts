/**
 * PDF generation and printing service for PCR reports
 */
import jsPDF from 'jspdf'
import type { PCRFormData, VitalSign } from '@/types'
import { OxygenProtocol } from '../types'
import { PDFDocument } from 'pdf-lib'
import { MARKER_COLORS } from '@/utils'
import i18n from '../i18n'

interface PDFOptions {
  includeImages?: boolean
  orientation?: 'portrait' | 'landscape'
  format?: 'a4' | 'letter' | 'legal'
  fontSize?: number
  margins?: {
    top: number
    right: number
    bottom: number
    left: number
  }
  appendPdf?: File
}

interface PDFGenerationResult {
  blob: Blob
  url: string
  filename: string
  size: number
}

type NewPageFn = () => number

  // Helper: ensures enough space on page
  const PAGE_GUARD = 6;
  function ensureSpaceFor(
    pdf: jsPDF,
    options: Required<PDFOptions>,
    y: number,
    needed: number,
    newPage: NewPageFn
  ) {
    const pageH = pdf.internal.pageSize.getHeight()
    const bottom = options.margins.bottom + PAGE_GUARD
    if (y + needed > pageH - bottom) {
      return newPage()
    }
    return y
  }

  // Helper: render a row of fields with column spans
  function renderFieldsRow(
    pdf: jsPDF,
    fields: { label: string; value: string | number }[],
    spans: number[],
    y: number,
    options: Required<PDFOptions>,
    contentWidth: number,
    newPage: NewPageFn
  ): number {
    const colUnit = contentWidth / 4

    const lineH = pdf.getLineHeightFactor() * (pdf.getFontSize() * 0.3528)
    let neededLinesMax = 1

    const measured = fields.map((field, i) => {
      const span = spans[i] || 1
      const maxWidth = colUnit * span

      pdf.setFont('helvetica', 'bold')
      const label = field.label ?? ''
      const labelW = pdf.getTextWidth(label + ' ')
      const valueMaxW = Math.max(4, maxWidth - labelW)

      const raw = String(field.value ?? '')
      pdf.setFont('helvetica', 'normal')
      const lines = pdf.splitTextToSize(raw, valueMaxW)
      neededLinesMax = Math.max(neededLinesMax, Math.max(1, lines.length))

      return { label, labelW, lines, maxWidth }
    })

    const pageH = pdf.internal.pageSize.getHeight()
    const bottom = options.margins.bottom
    const neededHeight = neededLinesMax * lineH

    if (y + neededHeight > pageH - bottom) {
      y = newPage()
    }

    let xCursor = options.margins.left
    measured.forEach((m) => {
      pdf.setFont('helvetica', 'bold')
      pdf.text(m.label, xCursor, y)

      pdf.setFont('helvetica', 'normal')
      const xVal = xCursor + m.labelW
      m.lines.forEach((ln, idx) => {
        pdf.text(ln, xVal, y + idx * lineH)
      })

      xCursor += m.maxWidth
    })

    return y + neededHeight + 1
  }

// Add this helper near renderFieldsRow
function renderMultilineBlock(
  pdf: jsPDF,
  label: string,
  value: string,
  y: number,
  options: Required<PDFOptions>,
  contentWidth: number,
  newPage: NewPageFn
): number {
  const pageHeight = pdf.internal.pageSize.getHeight()
  const left = options.margins.left
  const bottom = options.margins.bottom
  const lineHeight = pdf.getLineHeightFactor() * (pdf.getFontSize() * 0.3528)

  // Ensure there's space for at least one line
  if (y + lineHeight > pageHeight - bottom) {
    y = newPage()
  }

  // Draw label (bold)
  pdf.setFont('helvetica', 'bold')
  pdf.text(label, left, y)

  // Wrap value to remaining width
  const labelWidth = pdf.getTextWidth(label + ' ')
  const valueMaxWidth = Math.max(10, contentWidth - labelWidth)
  const lines = pdf.splitTextToSize(value || '', valueMaxWidth)

  // Draw value (normal)
  pdf.setFont('helvetica', 'normal')
  const xVal = left + labelWidth

  if (lines.length === 0) {
    return y + lineHeight + 2
  }

  for (let i = 0; i < lines.length; i++) {
    if (y + lineHeight > pageHeight - bottom) {
      y = newPage()

      // optional but nice: re-print label when it spills onto a new page
      pdf.setFont('helvetica', 'bold')
      pdf.text(label, left, y)
      pdf.setFont('helvetica', 'normal')
    }

    pdf.text(lines[i], xVal, y)
    y += lineHeight
  }

  return y + 1
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const num = parseInt(clean, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

export class PDFService {
  private defaultOptions: Required<PDFOptions> = {
    includeImages: true,
    orientation: 'portrait',
    format: 'letter',
    fontSize: 8, // Smaller font for single page
    margins: {
      top: 10,
      right: 10,
      bottom: 10,
      left: 10,
    },
  }



  private downloadPDF(result: PDFGenerationResult): void {
    const a = document.createElement('a')
    a.href = result.url
    a.download = result.filename || 'PCR.pdf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  /**
   * Generate comprehensive PDF report
   */
  async generatePDFReport(
    data: PCRFormData,
    options: PDFOptions = {}
  ): Promise<PDFGenerationResult> {
    const opts = { ...this.defaultOptions, ...options }
    const pdf = new jsPDF({
      orientation: opts.orientation,
      unit: 'mm',
      format: opts.format,
    })

    let yPosition = opts.margins.top
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const contentWidth = pageWidth - opts.margins.left - opts.margins.right

    // Set font
    pdf.setFontSize(opts.fontSize)
    const generatedAt = new Date().toLocaleString()
    const newPage: NewPageFn = () => this.addPageWithHeader(pdf, opts, generatedAt)

    try {
      // Header
      yPosition = this.addHeader(pdf, opts, yPosition, generatedAt)

      // Basic Information
      yPosition = this.addBasicInformation(pdf, data, opts, yPosition, contentWidth, newPage)

      // Patient Information
      yPosition = this.addPatientInformation(pdf, data, opts, yPosition, contentWidth, newPage)

      // Medical History
      yPosition = this.addMedicalHistory(pdf, data, opts, yPosition, contentWidth, newPage)

      // Assessment
      yPosition = this.addAssessment(pdf, data, opts, yPosition, contentWidth, newPage)

      // Injury Location / OPQRST (only if at least one OPQRST section was added, matching the form)
      if (opts.includeImages && data.opqrstEntries && data.opqrstEntries.length > 0) {
        yPosition = await this.addInjuryLocation(pdf, data.injuryMarkers || '', opts, yPosition, contentWidth, data, newPage)
      }

      // Vital Signs
      if (data.vitalSigns?.length) {
        yPosition = this.addVitalSigns(pdf, data.vitalSigns, opts, yPosition, contentWidth, newPage)
      }

      // Oxygen Protocol
      if (data.oxygenProtocol) {
        yPosition = this.addOxygenProtocol(pdf, data.oxygenProtocol, opts, yPosition, contentWidth, newPage)
      }

      // Transport Information
      yPosition = this.addTransportInformation(pdf, data, opts, yPosition, contentWidth, newPage)

      // Signatures and Footer
      yPosition = await this.addSignaturesAndFooter(pdf, data, opts, yPosition, newPage)

      // NEW: append sign-off PDF
      // Generate blob
      let pdfBlob = pdf.output('blob')

      // Append optional sign-off PDF (STRICT: fail loudly if it can't be appended)
      const appendix = opts.appendPdf
      if (appendix) {
        console.log('[PDF] Appending sign-off PDF:', appendix.name, appendix.type, appendix.size)
        pdfBlob = await this.appendPdfToBlob(pdfBlob, appendix)
      }


      const url = URL.createObjectURL(pdfBlob)
      const filename = this.generateFilename(data)

      return {
        blob: pdfBlob,
        url,
        filename,
        size: pdfBlob.size,
      }

    } catch (error) {
      console.error('PDF generation failed:', error)
      throw new Error('Failed to generate PDF report')
    }
  }

  /**
   * Show download preview modal
   */
  async showDownloadPreview(
    data: PCRFormData,
    options: PDFOptions = {},
    ui: { allowDownload?: boolean } = {},
    cachedResult?: PDFGenerationResult
  ): Promise<void> {
    const { allowDownload = false } = ui
    // A cachedResult's blob URL is owned by the caller (e.g. the submit
    // confirmation modal still needs it for its own Download/Confirm/Cancel
    // handlers) - only revoke the URL on close if we generated it ourselves.
    const ownsResult = !cachedResult
    const result = cachedResult ?? (await this.generatePDFReport(data, options))

    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 h-[90vh] flex flex-col">
        <div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">${allowDownload ? i18n.t('pdfConfirm.downloadPreviewTitle') : i18n.t('pdfConfirm.submissionPreviewTitle')}</h3>
          <div class="flex space-x-2">
            ${allowDownload ? `
              <button id="download-btn" class="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700">
                ${i18n.t('pdfConfirm.download')}
              </button>
            ` : ''}
            <button id="close-btn" class="px-2 py-2 text-gray-500 hover:text-gray-700 dark:text-gray-400">
              ✕
            </button>
          </div>
        </div>
        <div class="flex-1 min-h-0 p-4 overflow-hidden">
          <iframe
            src="${result.url}#toolbar=0&navpanes=0&scrollbar=0"
            class="w-full h-full border rounded flex-1"
            title="${i18n.t('pdfConfirm.pdfPreviewTitle')}"
          ></iframe>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    const downloadBtn = modal.querySelector('#download-btn')
    const closeBtn = modal.querySelector('#close-btn')

    downloadBtn?.addEventListener('click', () => this.downloadPDF(result))

    const closeModal = () => {
      document.body.removeChild(modal)
      if (ownsResult) URL.revokeObjectURL(result.url)
      document.removeEventListener('keydown', handleEsc)
    }
    closeBtn?.addEventListener('click', closeModal)
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    document.addEventListener('keydown', handleEsc)
  }

  /**
   * Create "Confirm Downloaded" workflow
   */
    async confirmDownloadedWorkflow(
      data: PCRFormData,
      options: PDFOptions = {},
      onConfirm: (confirmed: boolean, timestamp: string) => void,
      ui?: { allowDownload?: boolean }
    ): Promise<void> {
      const allowDownload = ui?.allowDownload ?? true
    let result: PDFGenerationResult | null = null
    // Cache the in-flight promise (not just the resolved result) so rapid
    // repeat clicks on Preview/Download while generation is still running
    // share a single generatePDFReport() call instead of racing separate,
    // wasteful ones (each of which would produce its own blob URL and, for
    // Preview, its own stacked modal).
    let resultPromise: Promise<PDFGenerationResult> | null = null

    const ensureResult = () => {
      if (!resultPromise) {
        resultPromise = this.generatePDFReport(data, options).then(r => {
          result = r
          return r
        })
      }
      return resultPromise
    }

    const modal = document.createElement('div')
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50'
    modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            ${allowDownload ? i18n.t('pdfConfirm.downloadConfirmationTitle') : i18n.t('pdfConfirm.submissionConfirmationTitle')}
          </h3>

          <div class="mb-6">
            <div class="flex items-center space-x-2 mb-4">
              <button
                id="preview-download-btn"
                class="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
              >
                ${i18n.t('pdfConfirm.preview')}
              </button>

              ${
                allowDownload
                  ? `
                    <button
                      id="direct-download-btn"
                      class="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
                    >
                      ${i18n.t('pdfConfirm.download')}
                    </button>
                  `
                  : ''
              }
            </div>

            <p class="text-sm text-gray-600 dark:text-gray-400">
              ${
                allowDownload
                  ? i18n.t('pdfConfirm.downloadBody')
                  : i18n.t('pdfConfirm.previewBody')
              }
            </p>
          </div>

          <div class="flex space-x-3">
            <button
              id="confirm-downloaded-btn"
              class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              disabled
            >
              ${i18n.t('pdfConfirm.submit')}
            </button>
            <button
              id="cancel-btn"
              class="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              ${i18n.t('common.cancel')}
            </button>
          </div>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    const previewBtn = modal.querySelector('#preview-download-btn') as HTMLButtonElement | null
    const directBtn = modal.querySelector('#direct-download-btn') as HTMLButtonElement | null
    const confirmBtn = modal.querySelector('#confirm-downloaded-btn') as HTMLButtonElement
    const cancelBtn = modal.querySelector('#cancel-btn')

    previewBtn?.addEventListener('click', async () => {
      if (previewBtn.disabled) return
      previewBtn.disabled = true
      const previousLabel = previewBtn.textContent
      previewBtn.textContent = i18n.t('pdfConfirm.loading')
      try {
        const r = await ensureResult()
        await this.showDownloadPreview(data, options, { allowDownload }, r)
        confirmBtn.disabled = false
      } finally {
        previewBtn.disabled = false
        previewBtn.textContent = previousLabel
      }
    })


    directBtn?.addEventListener('click', async () => {
      if (directBtn.disabled) return
      directBtn.disabled = true
      const previousLabel = directBtn.textContent
      directBtn.textContent = i18n.t('pdfConfirm.loading')
      try {
        const r = await ensureResult()
        this.downloadPDF(r)
        confirmBtn.disabled = false
      } finally {
        directBtn.disabled = false
        directBtn.textContent = previousLabel
      }
    })


    confirmBtn?.addEventListener('click', () => {
      const timestamp = new Date().toISOString()
      onConfirm(true, timestamp)
      document.body.removeChild(modal)
      if (result) URL.revokeObjectURL(result.url)
    })

    cancelBtn?.addEventListener('click', () => {
      onConfirm(false, '')
      document.body.removeChild(modal)
      if (result) URL.revokeObjectURL(result.url)
    })
  }

  private async appendPdfToBlob(baseBlob: Blob, appendix: File): Promise<Blob> {
    const baseBytes = new Uint8Array(await baseBlob.arrayBuffer())
    const appendixBytes = new Uint8Array(await appendix.arrayBuffer())

    const baseDoc = await PDFDocument.load(baseBytes)
    const appendixDoc = await PDFDocument.load(appendixBytes)

    const pages = await baseDoc.copyPages(appendixDoc, appendixDoc.getPageIndices())
    pages.forEach((p) => baseDoc.addPage(p))

    const mergedBytes = await baseDoc.save()
    return new Blob([mergedBytes], { type: 'application/pdf' })
  }

// Add header to PDF
private addHeader(
  pdf: jsPDF,
  options: Required<PDFOptions>,
  yPosition: number,
  generatedAt: string
): number {
  const pageWidth = pdf.internal.pageSize.getWidth()

  const logoPath = './images/vcrt_logo.png'
  const logoSize = 8
  const x = options.margins.left
  const y = yPosition

  pdf.addImage(logoPath, 'PNG', x, y - logoSize + 3, logoSize, logoSize)

  pdf.setFontSize(12)
  pdf.setFont('helvetica', 'bold')
  pdf.text('Patient Care Report', x + logoSize + 3, y)

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Generated: ${generatedAt}`, pageWidth - options.margins.right, yPosition, { align: 'right' })

  return yPosition + 8
}

private addPageWithHeader(
  pdf: jsPDF,
  options: Required<PDFOptions>,
  generatedAt: string
): number {
  pdf.addPage()

  // Put header at the top and return y AFTER header
  const yAfterHeader = this.addHeader(pdf, options, options.margins.top, generatedAt)

  // Restore default body text state
  pdf.setFontSize(options.fontSize)
  pdf.setFont('helvetica', 'normal')
  pdf.setTextColor(0, 0, 0)

  return yAfterHeader
}

  /**
   * Add basic information section
   */
  private addBasicInformation(
    pdf: jsPDF,
    data: PCRFormData,
    options: Required<PDFOptions>,
    yPosition: number,
    contentWidth: number,
    newPage: NewPageFn
  ): number {
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    const boxHeight = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6, newPage)
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    const boxY = yPosition
    pdf.setFillColor(100, 100, 100)
    pdf.rect(boxX, boxY, boxWidth, boxHeight, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.text('RESPONSE AND PATIENT INFORMATION', boxX + 2, boxY + boxHeight - 3)
    pdf.setTextColor(0, 0, 0)
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    
    
    // First set of basic info
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'Date:', value: data.date || '' },
        { label: 'Report #:', value: data.reportNumber || '' },
        { label: 'Call #:', value: data.callNumber || '' },
        { label: 'Location:', value: data.location || '' },
      ],
      [1, 1, 1, 1], 
      yPosition,
      options,
      contentWidth,
      newPage
    )
    
    // Second set of basic info
    const responders = (data.responders || []).filter(r => r.trim() !== '').join(', ')
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'Supervisor:', value: data.supervisor || '' },
        { label: 'Primary PSM:', value: data.primaryPSM || '' },
        { label: 'Responders:', value: responders },
      ],
      [1, 1, 2], 
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Third set of basic info
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'Time Notified:', value: data.timeNotified || '' },
        { label: 'On Scene:', value: data.onScene || '' },
        { label: 'Transport Arrived:', value: data.transportArrived || 'N/A' },
        { label: 'Cleared:', value: data.clearedScene || '' },
      ],
      [1, 1, 1, 1], 
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Fourth set of basic info
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'Paramedics Called by:', value: data.paramedicsCalledBy || 'N/A' },
        { label: 'First Agency on Scene:', value: data.firstAgencyOnScene || '' },
      ],
      [2, 2], 
      yPosition,
      options,
      contentWidth,
      newPage
    )

    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(
      options.margins.left,
      yPosition,
      pdf.internal.pageSize.getWidth() - options.margins.right,
      yPosition
    )

    return yPosition + 4

  }

  /**
   * Add patient information section
   */
  private addPatientInformation(
    pdf: jsPDF,
    data: PCRFormData,
    options: Required<PDFOptions>,
    yPosition: number,
    contentWidth: number,
    newPage: NewPageFn
  ): number {
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    yPosition += 2
    
    // First set of patient info
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'Patient Name:', value: data.patientName || '' },
        { label: 'DOB:', value: data.dob || 'Not Recorded' },
        { label: 'Age:', value: data.age ? data.age.toString() : 'Not Recorded' },
        { label: 'Sex:', value: data.sex || '' },
      ],
      [1, 1, 1, 1], 
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Second set of patient info
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'Status:', value: data.status || '' },
        { label: 'Student/Employee #:', value: data.studentEmployeeNumber || ' Not Recorded' },
        { label: 'Emergency Contact Name (Relationship):', value: data.emergencyContactName || '' },
      ],
      [1, 1, 2], 
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Third set of patient info
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'Contacted?:', value: data.contacted || '' },
        { label: 'Contact Phone:', value: data.emergencyContactPhone || '' },
        { label: 'Contacted by:', value: data.contactedBy || '' },
        { label: 'Workplace Injury?:', value: data.workplaceInjury || '' },
        
      ],
      [1, 1, 1, 1], 
      yPosition,
      options,
      contentWidth,
      newPage
    )

    return yPosition

  }

  /**
   * Add medical history section
   */
  private addMedicalHistory(
    pdf: jsPDF,
    data: PCRFormData,
    options: Required<PDFOptions>,
    yPosition: number,
    contentWidth: number,
    newPage: NewPageFn
  ): number {
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    const boxHeight = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6, newPage)
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    const boxY = yPosition
    pdf.setFillColor(100, 100, 100)
    pdf.rect(boxX, boxY, boxWidth, boxHeight, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.text('PATIENT MEDICAL HISTORY / REASON FOR RESPONSE', boxX + 2, boxY + boxHeight - 3)
    pdf.setTextColor(0, 0, 0)
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    yPosition = renderMultilineBlock(
      pdf, `Chief Complaint:`, data.chiefComplaint || '', yPosition, options, contentWidth, newPage
    )
    yPosition = renderMultilineBlock(
      pdf, `Signs & Symptoms:`, data.signsSymptoms|| '', yPosition, options, contentWidth, newPage
    )
    yPosition = renderMultilineBlock(
      pdf, `Allergies:`, data.allergies || '', yPosition, options, contentWidth, newPage
    )
    yPosition = renderMultilineBlock(
      pdf, `Medications:`, data.medications || '', yPosition, options, contentWidth, newPage
    )
    yPosition = renderMultilineBlock(
      pdf, `Pertinent Medical History:`, data.medicalHistory || '', yPosition, options, contentWidth, newPage
    )
    yPosition = renderMultilineBlock(
      pdf, `Last Oral Intake:`, data.lastMeal || '', yPosition, options, contentWidth, newPage
    )
    
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(
      options.margins.left,
      yPosition,
      pdf.internal.pageSize.getWidth() - options.margins.right,
      yPosition
    )
    yPosition += 6

    yPosition = renderMultilineBlock(
      pdf, `Rapid Body Survey Findings:`, data.bodySurvey || '', yPosition, options, contentWidth, newPage
    )

    return yPosition
  }

  /**
   * Add assessment section
   */
  private addAssessment(
    pdf: jsPDF,
    data: PCRFormData,
    options: Required<PDFOptions>,
    yPosition: number,
    contentWidth: number,
    newPage: NewPageFn
  ): number {
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    const boxHeight = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6, newPage)
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    const boxY = yPosition
    pdf.setFillColor(100, 100, 100)
    pdf.rect(boxX, boxY, boxWidth, boxHeight, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.text('TREATMENT PERFORMED / PHYSICAL FINDINGS', boxX + 2, boxY + boxHeight - 3)
    pdf.setTextColor(0, 0, 0)
    yPosition += boxHeight + 6
    
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    
    const airwayManagement = Array.isArray(data.airwayManagement) && data.airwayManagement.length > 0
    ? data.airwayManagement.join(', ')
    : ''
    yPosition = renderFieldsRow( pdf, [{ label: 'Airway Management:', value: airwayManagement || ' N/A' }], [4], yPosition, options, contentWidth, newPage)
    
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'CPR Time Started:', value: data.timeStarted || ' N/A' },
        { label: 'CPR Number of Cycles:', value: data.numberOfCycles || ' N/A' },
      ],
      [2, 2], 
      yPosition,
      options,
      contentWidth, 
      newPage
    )

    yPosition = renderFieldsRow(
      pdf,
      [
        { label: 'AED Number of Shocks:', value: data.numberOfShocks || ' N/A' },
        { label: 'Shock Not Advised:', value: data.shockNotAdvised || ' N/A' },
      ],
      [2, 2], 
      yPosition,
      options,
      contentWidth, 
      newPage
    )

    const hemorrhageControl = Array.isArray(data.hemorrhageControl) && data.hemorrhageControl.length > 0
    ? data.hemorrhageControl.join(', ')
    : ''
    const hasTourniquet =
      Array.isArray(data.hemorrhageControl) &&
      data.hemorrhageControl.includes('Tourniquet');
    yPosition = renderFieldsRow( 
      pdf, 
      [
        { label: 'Hemorrhage Control:', value: hemorrhageControl || ' N/A' },
        { label: 'Tourniquet Time:', value: hasTourniquet ? (data.timeApplied || '') : ' N/A' },
        { label: 'Turns:', value: hasTourniquet ? (String(data.numberOfTurns ?? '')) : ' N/A' },
      ],
      [2, 1, 1], 
      yPosition, 
      options, 
      contentWidth, 
      newPage 
    )

    const immobilization = Array.isArray(data.immobilization) && data.immobilization.length > 0
    ? data.immobilization.join(', ')
    : ''
    yPosition = renderFieldsRow( 
      pdf, 
      [
        { label: 'Immobilization:', value: immobilization || ' N/A' },
        { label: 'Patient Position:', value: data.positionOfPatient || '' },
      ], 
      [2, 2], 
      yPosition, 
      options, 
      contentWidth,
      newPage
    )

    return yPosition
  }

  /**
   * Load an image data URL just to read its natural pixel dimensions, so the
   * injury diagram snapshot (whose aspect ratio isn't fixed) isn't stretched.
   */
  private getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = reject
      img.src = dataUrl
    })
  }

  /**
   * Add the injury location diagram (front/back body with markers) together
   * with the OPQRST assessment section(s) that share their numbering/color.
   */
  private async addInjuryLocation(
    pdf: jsPDF,
    markersData: string,
    options: Required<PDFOptions>,
    yPosition: number,
    contentWidth: number,
    data: PCRFormData,
    newPage: NewPageFn
  ): Promise<number> {
    try {
      pdf.setDrawColor(0)
      pdf.setLineWidth(0.4)
      pdf.line(
        options.margins.left,
        yPosition,
        pdf.internal.pageSize.getWidth() - options.margins.right,
        yPosition
      )
      yPosition += 6

      pdf.setFont('helvetica', 'bold')
      pdf.text('Pain Assessment / Injury Location:', options.margins.left, yPosition)

      // Extract the rendered body-diagram snapshot, if any
      let imageDataUrl = ''
      try {
        const parsed = JSON.parse(markersData)
        if (parsed?.imageData) imageDataUrl = parsed.imageData
      } catch {
        // No markers recorded - imageDataUrl stays empty and is skipped below
      }

      // Two-column layout (left: text, right: image)
      const columnGap = 8
      const leftColWidth = (contentWidth - columnGap) / 2
      const imgWidth = (contentWidth - columnGap) / 2

      let imgHeight = imgWidth * 0.94
      if (imageDataUrl) {
        try {
          const dims = await this.getImageDimensions(imageDataUrl)
          if (dims.width && dims.height) {
            imgHeight = imgWidth * (dims.height / dims.width)
          }
        } catch {
          // Keep the default aspect ratio if the snapshot can't be measured
        }
      }

      const blockNeed = Math.max(imageDataUrl ? imgHeight : 0, 40)
      yPosition = ensureSpaceFor(pdf, options, yPosition, blockNeed, newPage)
      const startY = yPosition
      const startPage = pdf.getNumberOfPages()

      // --- Draw the body diagram snapshot on the RIGHT half ---
      const rightX = options.margins.left + leftColWidth + columnGap
      if (imageDataUrl) {
        pdf.addImage(imageDataUrl, 'PNG', rightX, startY, imgWidth, imgHeight)
      }

      // --- Render each OPQRST section on the LEFT half, numbered/colored to match its marker ---
      const opqrstEntries = data.opqrstEntries || []
      let yText = startY + 6

      if (opqrstEntries.length === 0) {
        pdf.setFont('helvetica', 'italic')
        pdf.setFontSize(8)
        pdf.text('No OPQRST sections recorded.', options.margins.left, yText)
        pdf.setFont('helvetica', 'normal')
        yText += 5
      }

      opqrstEntries.forEach((entry, index) => {
        const marker = MARKER_COLORS[index] || MARKER_COLORS[0]
        yText = ensureSpaceFor(pdf, options, yText, 8, newPage)

        const [r, g, b] = hexToRgb(marker.hex)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(r, g, b)
        pdf.text(`OPQRST #${index + 1} (${marker.name})`, options.margins.left, yText)
        pdf.setTextColor(0, 0, 0)
        yText += 5

        yText = renderMultilineBlock(
          pdf, 'Area:', entry.area || '', yText, options, leftColWidth, newPage
        )
        yText = renderMultilineBlock(
          pdf, 'Onset:', entry.onset || '', yText, options, leftColWidth, newPage
        )
        yText = renderMultilineBlock(
          pdf, 'Provocation:', entry.provocation || '', yText, options, leftColWidth, newPage
        )
        yText = renderMultilineBlock(
          pdf, 'Quality:', entry.quality || '', yText, options, leftColWidth, newPage
        )
        yText = renderMultilineBlock(
          pdf, 'Radiation:', entry.radiation || '', yText, options, leftColWidth, newPage
        )
        yText = renderFieldsRow(
          pdf, [{ label: 'Scale:', value: entry.scale || '' }], [4], yText, options, leftColWidth, newPage
        )
        yText = renderFieldsRow(
          pdf, [{ label: 'Time:', value: entry.time || '' }], [4], yText, options, leftColWidth, newPage
        )
        yText += 3
      })

      // If the OPQRST text pushed us onto a later page than the image/startY
      // were measured on, startY is a stale coordinate from the previous
      // page - fall back to the current cursor instead of computing a
      // bogus offset from it (which corrupted the Y handed to whatever
      // section renders next, e.g. Vital Signs).
      if (pdf.getNumberOfPages() !== startPage) {
        return yText + 5
      }

      // Advance Y by the taller of image vs text, plus a small spacer
      const textHeight = yText - startY
      return startY + Math.max(imageDataUrl ? imgHeight : 0, textHeight) + 5
    } catch (error) {
      console.error('Failed to add injury location:', error)
      return yPosition
    }
  }

  /**
   * Add O2 Protocol
   */
  private addVitalSigns(
    pdf: jsPDF,
    vitalSigns: VitalSign[],
    options: Required<PDFOptions>,
    yPosition: number,
    contentWidth: number,
    newPage: NewPageFn
  ): number {
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    const headerBarH = 8
    const x0 = options.margins.left
    const pageH = pdf.internal.pageSize.getHeight()
    const bottom = options.margins.bottom

    const headers = ['Time', 'HR', 'RR', 'SpO2', 'B/P', 'LOC,GCS', 'Skin', 'Pupils']
    const nCols = headers.length
    const colW = contentWidth / nCols
    const cellPadX = 1.5
    const lineH = pdf.getLineHeightFactor() * (pdf.getFontSize() * 0.3528)

    const drawSectionHeader = () => {
      const boxX = x0
      const boxW = contentWidth
      const boxY = yPosition
      pdf.setFillColor(100, 100, 100)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.rect(boxX, boxY, boxW, headerBarH, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.text('VITAL SIGNS', boxX + 2, boxY + headerBarH - 3)
      pdf.setTextColor(0, 0, 0)
      yPosition += headerBarH + 4  
    }

    const drawTableHeader = () => {
      pdf.setFillColor(220, 220, 220)
      const rowH = Math.max(6, lineH + 2)
      pdf.rect(x0, yPosition, contentWidth, rowH, 'F')
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      for (let i = 0; i < nCols; i++) {
        const cellX = x0 + i * colW
        pdf.text(headers[i], cellX + colW / 2, yPosition + rowH - 2, { align: 'center' })
      }
      pdf.setDrawColor(0)
      pdf.rect(x0, yPosition, contentWidth, rowH)
      for (let i = 1; i < nCols; i++) {
        const vx = x0 + i * colW
        pdf.line(vx, yPosition, vx, yPosition + rowH)
      }
      yPosition += rowH
      pdf.setFont('helvetica', 'normal')
    }

    const ensureRoom = (need: number) => {
      if (yPosition + need > pageH - bottom) {
        yPosition = newPage()
        drawSectionHeader()
        drawTableHeader()
      }
    }

    // Reserve room for the section header + column header + at least one
    // data row up front, so the table never starts at the very bottom of a
    // page only to immediately overflow and redraw its own header again.
    const tableHeaderRowH = Math.max(6, lineH + 2)
    const minDataRowH = lineH + 2
    const initialNeeded = headerBarH + 4 + tableHeaderRowH + (vitalSigns.length > 0 ? minDataRowH : 0)
    yPosition = ensureSpaceFor(pdf, options, yPosition, initialNeeded, newPage)

    drawSectionHeader()
    drawTableHeader()

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)

    for (const v of vitalSigns) {
      const rowVals = [
        v.time ?? '',
        v.pulse ?? '',
        v.resp ?? '',
        v.spo2 ?? '',
        v.bp ?? '',
        v.loc ?? '',
        v.skin ?? '',
        v.pupils ?? '',
      ].map(String)

      const cellLines: string[][] = []
      let rowLinesMax = 1
      for (let i = 0; i < nCols; i++) {
        const maxW = colW - 2 * cellPadX
        const lines = pdf.splitTextToSize(rowVals[i], Math.max(4, maxW))
        cellLines.push(lines)
        rowLinesMax = Math.max(rowLinesMax, Math.max(1, lines.length))
      }

      const rowH = rowLinesMax * lineH + 2
      ensureRoom(rowH)

      pdf.rect(x0, yPosition, contentWidth, rowH)
      for (let i = 1; i < nCols; i++) {
        const vx = x0 + i * colW
        pdf.line(vx, yPosition, vx, yPosition + rowH)
      }

      for (let i = 0; i < nCols; i++) {
        const cellCX = x0 + i * colW + colW / 2   
        const startY = yPosition + lineH         
        const lines = cellLines[i]
        for (let k = 0; k < lines.length; k++) {
          pdf.text(lines[k], cellCX, startY + k * lineH, { align: 'center' })
        }
      }

      yPosition += rowH
    }

    return yPosition + 4
  }

  /**
   * Add O2 Protocol
   */
  private addOxygenProtocol(
    pdf: jsPDF,
    oxygenProtocol: OxygenProtocol,
    options: Required<PDFOptions>,
    yPosition: number,
    contentWidth: number,
    newPage: NewPageFn
  ): number {
    const boxHeight = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6, newPage)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    const boxY = yPosition
    pdf.setFillColor(100, 100, 100)
    pdf.rect(boxX, boxY, boxWidth, boxHeight, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.text('OXYGEN PROTOCOL', boxX + 2, boxY + boxHeight - 3)
    pdf.setTextColor(0, 0, 0)
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    // 1) Oxygen Saturation Assessment
    const hasSaturationAny =
      !!oxygenProtocol?.saturation_range || oxygenProtocol?.spo2 !== undefined || !!oxygenProtocol?.spo2_acceptable
    if (hasSaturationAny) {
      yPosition = renderFieldsRow(
        pdf,
        [
          { label: 'Saturation Target Range: ', value: oxygenProtocol?.saturation_range || '' },
          { label: 'Initial SpO2 %:', value: oxygenProtocol?.spo2 || '' },
          { label: 'Initial SpO2 Acceptable:', value: oxygenProtocol?.spo2_acceptable || '' },
        ],
        [2, 1, 1],
        yPosition,
        options,
        contentWidth,
        newPage
      )
    }

    // 2) Oxygen Therapy Decision
    if (oxygenProtocol?.oxygen_given) {
      yPosition = renderFieldsRow(
        pdf,
        [
          { label: 'Oxygen Therapy Given?: ', value: oxygenProtocol.oxygen_given || '' },
          { label: 'Who Started Therapy: ', value: String(oxygenProtocol.whoStartedTherapy ?? ' N/A') },
        ],
        [2, 2],
        yPosition,
        options,
        contentWidth,
        newPage
      )

      // Reason (string or array)
      const reason = Array.isArray(oxygenProtocol?.reasonForO2Therapy)
        ? oxygenProtocol.reasonForO2Therapy.filter(Boolean).join(', ')
        : (oxygenProtocol?.reasonForO2Therapy ?? '')
      if (oxygenProtocol.oxygen_given === 'yes' && reason) {
        yPosition = renderFieldsRow(
          pdf,
          [{ label: 'Reason for O2 Therapy: ', value: reason }],
          [4],
          yPosition,
          options,
          contentWidth,
          newPage
        )
      }

      // Times
      const hasTimes = !!oxygenProtocol?.timeTherapyStarted || !!oxygenProtocol?.timeTherapyEnded
      if (oxygenProtocol.oxygen_given === 'yes' && hasTimes) {
        yPosition = renderFieldsRow(
          pdf,
          [
            { label: 'Time Therapy Started: ', value: oxygenProtocol?.timeTherapyStarted || '' },
            { label: 'Time Therapy Ended: ', value: oxygenProtocol?.timeTherapyEnded || '' },
          ],
          [2, 2],
          yPosition,
          options,
          contentWidth,
          newPage
        )
      }

      // Initial flow + device
      const hasInitFlowDevice = oxygenProtocol?.flowRate != null || !!oxygenProtocol?.deliveryDevice
      if (oxygenProtocol.oxygen_given === 'yes' && hasInitFlowDevice) {
        yPosition = renderFieldsRow(
          pdf,
          [
            { label: 'Delivery Device:', value: oxygenProtocol?.deliveryDevice || '' },
            { label: 'Initial Flow Rate (L/min):', value: oxygenProtocol?.flowRate || '' },
          ],
          [2, 2],
          yPosition,
          options,
          contentWidth,
          newPage
        )
      }

    // 3) Flow Rate Alterations table (transposed)
		const alterations = (oxygenProtocol?.flowRateAlterations || []).filter(
			(a) => (a?.time && a.time.trim() !== '') || (a?.flowRate && String(a.flowRate).trim() !== '')
		)

  if (oxygenProtocol.oxygen_given === 'yes' && alterations.length > 0) {
    // table metrics (we need these BEFORE drawing to know required height)
    const labels = ['Time of Change', 'Flow Rate (L/min)']
    const nRows = labels.length
    const rowHeight = 6
    const labelColWidth = Math.min(30, contentWidth * 0.25)
    const nDataCols = Math.max(1, alterations.length)
    const denom = Math.max(8, nDataCols)
    const dataColWidth = (contentWidth - labelColWidth) / denom
    const tableHeight = nRows * rowHeight

    // need: spacing before header (4) + header line (4) + table + trailing spacer (6)
    const needed = 4 + 4 + tableHeight + 6
    yPosition = ensureSpaceFor(pdf, options, yPosition, needed, newPage)

    // small sub-header
    yPosition += 4
    pdf.setFont('helvetica', 'bold')
    pdf.text('Flow Rate Alterations:', options.margins.left, yPosition)
    pdf.setFont('helvetica', 'normal')
    yPosition += 4

    const x0 = options.margins.left
    const tableWidth = labelColWidth + nDataCols * dataColWidth

    // left header column background
    pdf.setFillColor(220, 220, 220)
    pdf.rect(x0, yPosition, labelColWidth, tableHeight, 'F')

    // outer border (actual used width)
    pdf.setDrawColor(0)
    pdf.rect(x0, yPosition, tableWidth, tableHeight)

    // black vertical separator after labels column
    const sepX = x0 + labelColWidth
    pdf.line(sepX, yPosition, sepX, yPosition + tableHeight)

    // vertical lines between data columns
    for (let c = 1; c < nDataCols; c++) {
      const vx = x0 + labelColWidth + c * dataColWidth
      pdf.line(vx, yPosition, vx, yPosition + tableHeight)
    }

    // horizontal lines between rows
    for (let r = 1; r < nRows; r++) {
      const hy = yPosition + r * rowHeight
      pdf.line(x0, hy, x0 + tableWidth, hy)
    }

    // row labels
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'bold')
    labels.forEach((label, r) => {
      pdf.text(label, x0 + (labelColWidth / 2), yPosition + r * rowHeight + 4, { align: 'center' })
    })

    // data cells
    pdf.setFont('helvetica', 'normal')
    for (let c = 0; c < nDataCols; c++) {
      const a = alterations[c] || {}
      const colValues = [a?.time ?? '', a?.flowRate != null ? String(a.flowRate) : '']
      colValues.forEach((cell, r) => {
        const cellX = x0 + labelColWidth + c * dataColWidth
        const cellY = yPosition + r * rowHeight
        pdf.text(String(cell), cellX + (dataColWidth / 2), cellY + 4, { align: 'center' })
      })
    }

    yPosition += tableHeight + 6
  }

      // 4) End of Therapy
      const hasEnd = !!oxygenProtocol?.reasonForEndingTherapy || !!oxygenProtocol?.whoStartedTherapy
      if (hasEnd) {
        // Reason
        if (oxygenProtocol?.reasonForEndingTherapy) {
          yPosition = renderMultilineBlock(
            pdf,
            `Reason for Ending Therapy:`, oxygenProtocol.reasonForEndingTherapy || '',
            yPosition,
            options,
            contentWidth,
            newPage
          )
        }
      }
    }

    return yPosition
  }


  /**
   * Add comments and transport information
   */
  private addTransportInformation(
    pdf: jsPDF,
    data: PCRFormData,
    options: Required<PDFOptions>,
    yPosition: number,
    contentWidth: number,
    newPage: NewPageFn
  ): number {
    const boxHeight = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6, newPage)
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    const boxY = yPosition
    pdf.setFillColor(100, 100, 100)
    pdf.rect(boxX, boxY, boxWidth, boxHeight, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.text('CALL DESCRIPTION', boxX + 2, boxY + boxHeight - 3)
    pdf.setTextColor(0, 0, 0)
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    yPosition = renderMultilineBlock(
      pdf,
      '',
      (data.comments || '').trim(),
      yPosition,
      options,
      contentWidth,
      newPage
    );
    
    const boxHeight2 = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight2 + 6, newPage)
    const boxX2 = options.margins.left
    const boxWidth2 = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    const boxY2 = yPosition
    pdf.setFontSize(9)
    pdf.setFont('helvetica', 'bold')
    pdf.setFillColor(100, 100, 100)
    pdf.rect(boxX2, boxY2, boxWidth2, boxHeight2, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.text('PATIENT TRANSFER DETAILS', boxX2 + 2, boxY2 + boxHeight2 - 3)
    pdf.setTextColor(0, 0, 0)
    yPosition += boxHeight2 + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    const transferFields: { label: string; value: string }[] = [
      { label: 'Patient Care Transferred To: ', value: data.patientCareTransferred || '' },
    ]

    let spans: number[] = [2, 2]

    // Conditionally add the extra field based on who received care
    if (data.patientCareTransferred === 'Paramedics' && data.unitNumber) {
      transferFields.push({ label: 'Unit #:', value: data.unitNumber })
      transferFields.push({ label: 'Time Care Transferred: ', value: data.timeCareTransferred || '' })
      spans = [2, 1, 1]
    } else if (data.patientCareTransferred === 'Police' && data.badgeNumber) {
      transferFields.push({ label: 'Badge #:', value: data.badgeNumber })
      transferFields.push({ label: 'Time Care Transferred: ', value: data.timeCareTransferred || '' })
      spans = [2, 1, 1]
    } else if (data.patientCareTransferred === 'Clinic' && data.clinicName) {
      transferFields.push({ label: 'Clinic:', value: data.clinicName })
      transferFields.push({ label: 'Time Care Transferred: ', value: data.timeCareTransferred || '' })
      spans = [2, 1, 1]
    } else {
      transferFields.push({ label: 'Time Care Transferred: ', value: data.timeCareTransferred || '' })
      spans = [3, 1]
    }

    yPosition = renderFieldsRow(
      pdf,
      transferFields,
      spans,
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // If paramedics, render Hospital Destination on its own row under it
    if (data.patientCareTransferred === 'Paramedics') {
      yPosition = renderFieldsRow(
        pdf,
        [{ label: 'Hospital Destination:', value: data.hospitalDestination || '' }],
        [4],
        yPosition,
        options,
        contentWidth,
        newPage
      )
    }

    pdf.setFont('helvetica', 'bold')
		pdf.text('Comments: ', options.margins.left, yPosition)
		pdf.setFont('helvetica', 'normal')
		yPosition += 4

    yPosition = renderMultilineBlock(
      pdf,
      '',
      (data.transferComments || '').trim(),
      yPosition,
      options,
      contentWidth,
      newPage
    );

    return yPosition + 4
  }

  /**
   * The SignaturePad saves whatever was actually on screen - current theme's
   * ink color, transparent background - so it redraws faithfully if the
   * widget remounts. The PDF has no theme, so normalize independently here:
   * recolor every drawn pixel to a fixed dark ink (keeping each pixel's
   * original alpha for smooth anti-aliased edges) and fill the transparent
   * gaps with solid white.
   */
  private normalizeSignatureImage(dataUrl: string): Promise<string> {
    return new Promise(resolve => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        ctx.drawImage(img, 0, 0)
        ctx.globalCompositeOperation = 'source-in'
        ctx.fillStyle = '#111827'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.globalCompositeOperation = 'destination-over'
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/png'))
      }
      img.onerror = () => resolve(dataUrl)
      img.src = dataUrl
    })
  }

  /**
   * E-signature strip pinned to the very bottom of the page: a fixed 4-slot
   * grid (Supervisor, Responder 1-3) that never reflows based on how many
   * responders were actually on the call - unused slots are just left
   * blank. The one overflow case is a 4th responder (the form allows up to
   * four): rather than squeeze a 5th column into the row, it spills onto a
   * second, shorter row of its own.
   */
  private async addSignaturesAndFooter(
    pdf: jsPDF,
    data: PCRFormData,
    options: Required<PDFOptions>,
    yPosition: number,
    newPage: NewPageFn
  ): Promise<number> {
    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()

    const bottom = options.margins.bottom
    const x0 = options.margins.left
    const x1 = pageW - options.margins.right
    const contentW = x1 - x0

    type SigCol = { label: string; name: string; image?: string }

    const namedResponders: SigCol[] = (data.responders || [])
      .map((name, i) => ({
        label: `Responder ${i + 1}`,
        name: (name || '').trim(),
        image: data.signatures?.responders?.[i],
      }))
      .filter(col => col.name !== '')

    // Row 1 is always Supervisor + 3 responder slots, blank-filled if a slot
    // wasn't used. A 4th responder (beyond the normal 1 sup + 3 resp case)
    // overflows onto row 2 instead of adding a 5th column to row 1.
    const row1: SigCol[] = [
      { label: 'Supervisor', name: data.supervisor || '', image: data.signatures?.supervisor },
    ]
    for (let i = 0; i < 3; i++) {
      row1.push(namedResponders[i] || { label: `Responder ${i + 1}`, name: '', image: undefined })
    }
    const row2: SigCol[] = namedResponders.length > 3 ? [namedResponders[3]] : []
    const hasSecondRow = row2.length > 0

    // Shrink the per-row height when a second row is needed so the combined
    // strip doesn't blow up the footer - still tall enough for a label, the
    // signature image, and a signature line/caption underneath.
    const rowHeight = hasSecondRow ? 26 : 34
    const imageH = hasSecondRow ? 11 : 15
    const stripHeight = hasSecondRow ? rowHeight * 2 : rowHeight
    const stripTopY = pageH - bottom - stripHeight

    // if we collide with content, push to a new page
    if (yPosition > stripTopY - 4) {
      yPosition = newPage()
    }

    // separator line above strip
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(x0, stripTopY, x1, stripTopY)

    const colW = contentW / 4

    const drawRow = async (rowCols: SigCol[], rowTopY: number) => {
      const normalizedImages = await Promise.all(
        rowCols.map(col => (col.image ? this.normalizeSignatureImage(col.image) : Promise.resolve(undefined)))
      )

      const labelY = rowTopY + 5
      const imageY = rowTopY + 10
      const lineY = imageY + imageH + 2
      const captionY = lineY + 4

      rowCols.forEach((col, i) => {
        const colX0 = x0 + i * colW
        const colCenterX = colX0 + colW / 2

        // divider between columns (skip before the first one)
        if (i > 0) {
          pdf.setDrawColor(220)
          pdf.setLineWidth(0.2)
          pdf.line(colX0, rowTopY + 2, colX0, lineY)
        }

        // Blank/unused slot - leave the column empty.
        if (!col.name) return

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(7.5)
        pdf.setTextColor(0)
        const nameLabel = `${col.label}: ${col.name}`
        pdf.text(pdf.splitTextToSize(nameLabel, colW - 6), colCenterX, labelY, { align: 'center' })

        const normalizedImage = normalizedImages[i]
        if (normalizedImage) {
          try {
            const imgW = colW - 10
            pdf.addImage(normalizedImage, 'PNG', colX0 + 5, imageY, imgW, imageH, undefined, 'FAST')
          } catch {
            // Corrupt/unsupported signature image data - leave the line blank below
          }
        }

        pdf.setDrawColor(150)
        pdf.setLineWidth(0.2)
        pdf.line(colX0 + 5, lineY, colX0 + colW - 5, lineY)

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(6.5)
        pdf.setTextColor(120)
        pdf.text('Signature', colCenterX, captionY, { align: 'center' })
        pdf.setTextColor(0)
      })
    }

    await drawRow(row1, stripTopY)

    if (hasSecondRow) {
      const row2TopY = stripTopY + rowHeight
      pdf.setDrawColor(220)
      pdf.setLineWidth(0.2)
      pdf.line(x0, row2TopY, x1, row2TopY)
      await drawRow(row2, row2TopY)
    }

    return pageH - bottom
  }

  /**
   * Generate filename for PDF
   */
  private generateFilename(data: PCRFormData): string {
    const date = data.date ? new Date(data.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
    const identifier = data.reportNumber ? data.reportNumber.replace(/[^a-zA-Z0-9-]/g, '_') : date

    return `VCRT_PCR_${identifier}.pdf`
  }

  /**
   * Validate data before PDF generation
   */
  validateDataForPDF(data: PCRFormData): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.date) errors.push(i18n.t('pcr.validation.dateRequired'))
    if (!data.patientName) errors.push(i18n.t('pcr.validation.patientNameRequired'))
    if (!data.callNumber) errors.push(i18n.t('pcr.validation.callNumberRequired'))
    if (!data.reportNumber) errors.push(i18n.t('pcr.validation.reportNumberRequired'))
    
    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Get PDF generation statistics
   */
  getStats(): {
    generatedPDFs: number
    totalSize: number
    averageGenerationTime: number
  } {
    // This would be implemented with actual tracking
    return {
      generatedPDFs: 0,
      totalSize: 0,
      averageGenerationTime: 0,
    }
  }
}



export const pdfService = new PDFService()