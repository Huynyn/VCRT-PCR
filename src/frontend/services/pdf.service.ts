/**
 * PDF generation and printing service for PCR reports
 */
import jsPDF from 'jspdf'
import type { PCRFormData, VitalSign } from '@/types'
import { OxygenProtocol } from '../types'
import { PDFDocument } from 'pdf-lib'
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
  appendPdf?: File[]
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

  // Answer/value text is drawn a bit lighter than the (black, bold) label
  // it follows, so the two are easy to tell apart at a glance.
  const ANSWER_COLOR: [number, number, number] = [80, 80, 80]

  // Draws a bold field label in black - so it's visually obvious which part
  // is the header vs. the (lighter-colored) answer that follows it - and
  // returns its rendered width, so the caller knows where the value should
  // start. Labels are expected to already include their own trailing ": "
  // (colon + space), so this is the single source of truth for label/value
  // spacing.
  function drawLabel(pdf: jsPDF, label: string, x: number, y: number, align: 'left' | 'center' = 'left'): number {
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    pdf.text(label, x, y, align === 'center' ? { align: 'center' } : undefined)
    return pdf.getTextWidth(label)
  }

  // Wraps a bl()-built "English | French" label. Naive word-wrapping treats
  // the whole string as one run of words, so it can break mid-way through
  // the French half (or even mid-word) once the label doesn't fit on one
  // line. Instead, if the label as a whole doesn't fit, split it at its "
  // | " separator and give the French half its own line(s) entirely -
  // wrapping further only if that half alone still doesn't fit.
  function wrapBilingualLabel(pdf: jsPDF, label: string, maxWidth: number): string[] {
    if (!label) return ['']
    if (pdf.getTextWidth(label) <= maxWidth) return [label]

    const sepIdx = label.indexOf(' | ')
    if (sepIdx === -1) {
      return pdf.splitTextToSize(label, maxWidth)
    }

    // Keep the "|" separator attached to the end of the English line rather
    // than dropping it, so the break still reads as "English | \n French".
    const en = label.slice(0, sepIdx) + ' |'
    const fr = label.slice(sepIdx + 3)
    const enLines: string[] = pdf.getTextWidth(en) <= maxWidth ? [en] : pdf.splitTextToSize(en, maxWidth)
    const frLines: string[] = pdf.getTextWidth(fr) <= maxWidth ? [fr] : pdf.splitTextToSize(fr, maxWidth)
    return [...enLines, ...frLines]
  }

  // Shared layout constants for renderFieldsRow's label+box field entries -
  // also used by measureFieldsRowHeight() so a caller can pre-check whether
  // a section banner + its first row will fit before drawing either.
  const FIELD_BOX_GAP = 3      // horizontal gap between adjacent boxes in a row
  const FIELD_BOX_PAD_X = 2    // horizontal padding for the answer text inside the box
  // Extra breathing room reserved only on the right side of the box, on top
  // of FIELD_BOX_PAD_X, so wrapped/long answer text never crowds right up
  // against the box's right edge.
  const FIELD_BOX_PAD_X_RIGHT = 1.5
  const FIELD_BOX_PAD_Y = 1.7  // vertical padding above/below the answer text inside the box
  const FIELD_LABEL_GAP = 1.6  // gap between the label and the top of its box
  const FIELD_ROW_SPACING = 3.5 // gap after a fields row, before the next one

  interface MeasuredField { labelLines: string[]; valueLines: string[]; boxW: number; slotW: number }

  // Pure measurement pass shared by renderFieldsRow (to decide its own page
  // break) and by callers that need to know a row's height up front (e.g.
  // to keep a section banner from being stranded above a row that gets
  // pushed to the next page).
  //
  // valueLineGap adds extra breathing room BETWEEN wrapped lines of answer
  // text (on top of the normal line height) - used for the longer free-text
  // paragraphs (Call Description, Transfer Comments) where tight line
  // spacing reads as cramped. It has no effect on single-line answers.
  function measureFieldsRow(
    pdf: jsPDF,
    fields: { label: string; value: string | number }[],
    spans: number[],
    contentWidth: number,
    valueLineGap = 0
  ): { totalBlockH: number; labelH: number; effectiveLabelGap: number; boxH: number; measured: MeasuredField[]; labelLinesMax: number } {
    const colUnit = contentWidth / 4
    const fontSize = pdf.getFontSize() || 8
    const lineH = pdf.getLineHeightFactor() * (fontSize * 0.3528)
    const hasAnyLabel = fields.some(f => (f.label ?? '') !== '')

    const measured: MeasuredField[] = fields.map((field, i) => {
      const span = spans[i] || 1
      const slotW = colUnit * span
      const boxW = Math.max(10, slotW - FIELD_BOX_GAP)

      pdf.setFont('helvetica', 'bold')
      const label = field.label ?? ''
      const labelLines: string[] = wrapBilingualLabel(pdf, label, boxW)

      // Answer text is rendered all-caps, matching how it reads on the
      // paper form this replaces.
      const raw = String(field.value ?? '').toUpperCase()
      pdf.setFont('helvetica', 'normal')
      const valueLinesRaw: string[] = pdf.splitTextToSize(raw, Math.max(4, boxW - FIELD_BOX_PAD_X * 2 - FIELD_BOX_PAD_X_RIGHT))

      return { labelLines, valueLines: valueLinesRaw.length ? valueLinesRaw : [''], boxW, slotW }
    })

    const labelLinesMax = Math.max(1, ...measured.map(m => m.labelLines.length))
    const valueLinesMax = Math.max(1, ...measured.map(m => m.valueLines.length))
    const labelH = hasAnyLabel ? labelLinesMax * lineH : 0
    const effectiveLabelGap = hasAnyLabel ? FIELD_LABEL_GAP : 0
    const boxH = valueLinesMax * lineH + Math.max(0, valueLinesMax - 1) * valueLineGap + FIELD_BOX_PAD_Y * 2
    const totalBlockH = labelH + effectiveLabelGap + boxH

    return { totalBlockH, labelH, effectiveLabelGap, boxH, measured, labelLinesMax }
  }

  // A convenience wrapper for the common single-field, full-width case
  // (e.g. a section banner immediately followed by one free-text field).
  function measureFieldsRowHeight(
    pdf: jsPDF,
    fields: { label: string; value: string | number }[],
    spans: number[],
    contentWidth: number,
    valueLineGap = 0
  ): number {
    return measureFieldsRow(pdf, fields, spans, contentWidth, valueLineGap).totalBlockH
  }

  // Renders a row of "field entries": each field is a bold label with a
  // light-blue answer box (same fill as the vital-signs/flow-rate table
  // headers) underneath it, sized by the field's column span out of 4 units.
  // Every box in the row shares the same height (tallest field's wrapped
  // line count wins) so the row reads as a clean, aligned strip. The whole
  // label+box unit for the row moves to a fresh page together rather than
  // splitting a box - or separating a label from its box - across a page
  // break.
  function renderFieldsRow(
    pdf: jsPDF,
    fields: { label: string; value: string | number }[],
    spans: number[],
    y: number,
    options: Required<PDFOptions>,
    contentWidth: number,
    newPage: NewPageFn,
    valueLineGap = 0
  ): number {
    const fontSize = pdf.getFontSize() || 8
    const lineH = pdf.getLineHeightFactor() * (fontSize * 0.3528)
    const valueStep = lineH + valueLineGap
    const ascent = fontSize * 0.3528 * 0.8
    const hasAnyLabel = fields.some(f => (f.label ?? '') !== '')


    let { totalBlockH, labelH, effectiveLabelGap, boxH, measured, labelLinesMax } = measureFieldsRow(pdf, fields, spans, contentWidth, valueLineGap)

    const pageHeight = pdf.internal.pageSize.getHeight()
    const bottom = options.margins.bottom

    // A row this tall would still run past the bottom margin even starting
    // from the top of a brand-new page - only possible for one field's
    // wrapped text being unusually long (e.g. a very long pasted Call
    // Description). The page-break below only ever moves the whole row to a
    // fresh page; it doesn't re-check whether the row still fits once
    // there. Clamp the offending field(s) to what actually fits on a single
    // page instead of silently drawing past the margin uncorrected.
    const maxPageContentH = pageHeight - options.margins.top - bottom - PAGE_GUARD
    if (totalBlockH > maxPageContentH) {
      const maxBoxH = Math.max(lineH, maxPageContentH - labelH - effectiveLabelGap)
      const maxLines = Math.max(1, Math.floor((maxBoxH - FIELD_BOX_PAD_Y * 2 + valueLineGap) / (lineH + valueLineGap)))
      measured = measured.map(m => {
        if (m.valueLines.length <= maxLines) return m
        const kept = m.valueLines.slice(0, Math.max(1, maxLines - 1))
        kept.push('[TEXT TRUNCATED - TOO LONG TO FIT]')
        return { ...m, valueLines: kept }
      })
      const valueLinesMax = Math.max(1, ...measured.map(m => m.valueLines.length))
      boxH = valueLinesMax * lineH + Math.max(0, valueLinesMax - 1) * valueLineGap + FIELD_BOX_PAD_Y * 2
      totalBlockH = labelH + effectiveLabelGap + boxH
    }

    if (y + totalBlockH > pageHeight - bottom - PAGE_GUARD) {
      y = newPage()
    }

    const boxY = y + labelH + effectiveLabelGap

    let xCursor = options.margins.left
    measured.forEach((m) => {
      if (hasAnyLabel) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(fontSize)
        pdf.setTextColor(0, 0, 0)
        // Labels shorter than the row's tallest label are bottom-aligned
        // (pushed down to sit flush with the box, rather than flush with
        // the top of the label area) so every box in the row still starts
        // right after its own label instead of leaving a gap above it.
        const lineDeficit = labelLinesMax - m.labelLines.length
        m.labelLines.forEach((ln: string, idx: number) => {
          pdf.text(ln, xCursor, y + ascent + (idx + lineDeficit) * lineH)
        })
      }

      pdf.setFillColor(...VCRT_BLUE_LIGHT)
      pdf.setDrawColor(195, 195, 200)
      pdf.setLineWidth(0.2)
      pdf.rect(xCursor, boxY, m.boxW, boxH, 'FD')

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(fontSize)
      pdf.setTextColor(0, 0, 0)
      const textX = xCursor + FIELD_BOX_PAD_X
      const firstBaseline = boxY + FIELD_BOX_PAD_Y + ascent
      m.valueLines.forEach((ln: string, idx: number) => {
        pdf.text(ln, textX, firstBaseline + idx * valueStep)
      })

      xCursor += m.slotW
    })

    pdf.setTextColor(0, 0, 0)
    return y + totalBlockH + FIELD_ROW_SPACING
  }

// Bilingual label - "English | French Quebecois". The PDF always shows both,
// regardless of the app's current UI language. Skips the " | fr" half when
// the two are identical (e.g. "Date" / "Date"), rather than showing a
// pointless duplicate.
function bl(en: string, fr: string): string {
  return en === fr ? en : `${en} | ${fr}`
}

// VCRT brand navy (#1F2A51), sampled from the VCRT/EBIC logo - same value
// used for the navy accents on docs/PCR Sign-Off Sheet.pdf and the app's
// tailwind `primary-800`/`navy-800` tokens.
const VCRT_BLUE: [number, number, number] = [31, 42, 81]

// VCRT burgundy (#95232a / tailwind burgundy-600) - used for the OPQRST
// marker numbers here and on the injury diagram itself (InjuryLocationMap.tsx),
// which are all this one color now rather than one per OPQRST number.
const VCRT_RED: [number, number, number] = [149, 35, 42]

// Same light blue-grey box fill used on docs/PCR Sign-Off Sheet.pdf.
const VCRT_BLUE_LIGHT: [number, number, number] = [232, 232, 237]

// Section banner (used at the top of every major section). Bilingual
// headers run much longer than the original English-only ones, so this
// shrinks the font as needed to keep the text from overflowing the box
// instead of using a single fixed size everywhere.
function drawSectionBanner(
  pdf: jsPDF,
  text: string,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
): void {
  pdf.setFillColor(...VCRT_BLUE)
  pdf.rect(boxX, boxY, boxWidth, boxHeight, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')

  const maxTextWidth = boxWidth - 4
  let fontSize = 9
  pdf.setFontSize(fontSize)
  while (fontSize > 6 && pdf.getTextWidth(text) > maxTextWidth) {
    fontSize -= 0.5
    pdf.setFontSize(fontSize)
  }

  pdf.text(text, boxX + 2, boxY + boxHeight - 3)
  pdf.setTextColor(0, 0, 0)
}

interface ChecklistItem {
  label: string
  helper?: string
}

// One checklist row: an empty tick box, a bold label, and an optional
// lighter inline note (e.g. "if known"). Used only by the static supervisor
// call checklist, not the main report.
function drawChecklistItem(
  pdf: jsPDF,
  item: ChecklistItem,
  x: number,
  y: number,
  options: Required<PDFOptions>,
  newPage: NewPageFn,
): number {
  const boxSize = 3.6
  const lineH = pdf.getLineHeightFactor() * (pdf.getFontSize() * 0.3528)
  const pageHeight = pdf.internal.pageSize.getHeight()
  const bottom = options.margins.bottom

  if (y + lineH > pageHeight - bottom) {
    y = newPage()
  }

  pdf.setDrawColor(0)
  pdf.setLineWidth(0.3)
  pdf.rect(x, y - boxSize + 0.9, boxSize, boxSize)

  const textX = x + boxSize + 2.5
  pdf.setFont('helvetica', 'bold')
  pdf.setTextColor(0, 0, 0)
  pdf.text(item.label, textX, y)

  if (item.helper) {
    const labelW = pdf.getTextWidth(item.label + '  ')
    pdf.setFont('helvetica', 'italic')
    pdf.setTextColor(...ANSWER_COLOR)
    pdf.text(`(${item.helper})`, textX + labelW, y)
    pdf.setTextColor(0, 0, 0)
  }

  return y + lineH + 3
}

// Bold, uppercased, underlined sub-heading (lighter than a full section
// banner) - groups checklist items within a section, e.g. "Information from
// Patient" inside "While on Scene".
function drawChecklistSubheader(pdf: jsPDF, text: string, x: number, y: number): number {
  const upper = text.toUpperCase()
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9.5)
  pdf.setTextColor(90, 90, 90)
  pdf.text(upper, x, y)
  pdf.setDrawColor(200)
  pdf.setLineWidth(0.2)
  pdf.line(x, y + 1, x + pdf.getTextWidth(upper), y + 1)
  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(8.5)
  pdf.setFont('helvetica', 'normal')
  return y + 6
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

  // These preview/confirm modals are built with raw DOM (appendChild on
  // document.body) instead of React, so an idle-session logout - which just
  // unmounts the React tree - wouldn't otherwise touch them. A PDF full of
  // patient data left on screen after the app has logged the user out is a
  // real privacy problem, so every close-path below registers/deregisters
  // itself here and AuthContext's logout() calls closeActiveModals().
  private activeModalCloseFns = new Set<() => void>()

  closeActiveModals(): void {
    for (const close of [...this.activeModalCloseFns]) close()
  }

  // These modals are appended straight to document.body rather than mounted
  // where the reusable <Modal> component's own overflow-lock would apply, so
  // without this the page behind them stays scrollable - showing up as a
  // stray scrollbar around the whole app while the popup is open. Reference
  // counted because the confirm-download modal can open the preview modal on
  // top of itself; the lock should only lift once every raw-DOM modal is closed.
  private modalLockCount = 0

  private lockBodyScroll(): void {
    if (this.modalLockCount === 0) document.body.style.overflow = 'hidden'
    this.modalLockCount++
  }

  private unlockBodyScroll(): void {
    this.modalLockCount = Math.max(0, this.modalLockCount - 1)
    if (this.modalLockCount === 0) document.body.style.overflow = ''
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

      // Append optional sign-off attachments, in the order the user arranged
      // them (STRICT: fail loudly if one can't be appended)
      const appendices = opts.appendPdf
      if (appendices && appendices.length > 0) {
        for (const appendix of appendices) {
          console.log('[PDF] Appending sign-off PDF:', appendix.name, appendix.type, appendix.size)
          pdfBlob = await this.appendPdfToBlob(pdfBlob, appendix)
        }
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
   * Static, English-only reference document (not tied to any report data):
   * a tick-box checklist of everything a supervisor needs to collect during
   * a call, grouped by when/from whom it's gathered. Meant to be printed or
   * kept on hand, not filled out digitally.
   */
  async generateSupervisorChecklist(options: PDFOptions = {}): Promise<PDFGenerationResult> {
    const opts = { ...this.defaultOptions, ...options }
    const pdf = new jsPDF({
      orientation: opts.orientation,
      unit: 'mm',
      format: opts.format,
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const contentWidth = pageWidth - opts.margins.left - opts.margins.right
    const x0 = opts.margins.left

    const addChecklistPageHeader = (): number => {
      pdf.addPage()
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9)
      pdf.setTextColor(0, 0, 0)
      pdf.text('Supervisor Call Checklist (continued)', x0, opts.margins.top)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8.5)
      return opts.margins.top + 8
    }
    const newPage: NewPageFn = addChecklistPageHeader

    let y = opts.margins.top

    // Header
    const logoSize = 10
    // Compression matters here: jsPDF embeds PNGs with an alpha channel as
    // raw uncompressed bitmap data unless told otherwise, which for this
    // logo (1364x1362 RGBA) balloons the file to ~7MB for a one-page doc.
    pdf.addImage('./images/vcrt_logo.png', 'PNG', x0, y, logoSize, logoSize, undefined, 'SLOW')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(15)
    pdf.setTextColor(0, 0, 0)
    pdf.text('Supervisor Call Checklist', x0 + logoSize + 4, y + 6)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(...ANSWER_COLOR)
    pdf.text('Information to collect before, during, and after a call', x0 + logoSize + 4, y + 12)
    pdf.setTextColor(0, 0, 0)
    y += logoSize + 6

    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(x0, y, pageWidth - opts.margins.right, y)
    y += 7

    pdf.setFontSize(8.5)

    const section = (title: string) => {
      const boxHeight = 7
      y = ensureSpaceFor(pdf, opts, y, boxHeight + 6, newPage)
      drawSectionBanner(pdf, title, x0, y, contentWidth, boxHeight)
      y += boxHeight + 5
      pdf.setFontSize(8.5)
      pdf.setFont('helvetica', 'normal')
    }
    const subheader = (title: string) => {
      y = ensureSpaceFor(pdf, opts, y, 10, newPage)
      y = drawChecklistSubheader(pdf, title, x0, y)
    }
    const item = (label: string, helper?: string) => {
      y = drawChecklistItem(pdf, { label, helper }, x0 + 2, y, opts, newPage)
    }

    section('SECTION 1: BEFORE ARRIVING ON SCENE')
    item('Time Notified')
    item('Call Number')
    item('Location', 'update if different once on scene')
    item('Chief Complaint')
    item('Time On Scene')

    y += 2
    section('SECTION 2: WHILE ON SCENE')

    subheader('Information from Patient')
    item('Full Name')
    item('Date of Birth')
    item('Student/Employee Number', 'or other ID')
    item('Emergency Contact Name & Number')
    item('SAMPLE Questions')
    item('OPQRST Questions', 'for every pain/injury location')

    y += 2
    subheader('Information from Responders')
    item('RBS & Findings')
    item('Vitals', 'values and time, minimum 2 sets')
    item('Treatment or Supplies Given', 'with time')
    item('O2', 'time started/ended/changed, flow rate (+ changes), reason to start and end')
    item('CPR', 'number of cycles, time started')

    y += 2
    subheader('Information from Protection Services')
    item('Report Number')
    item('Information Before VCRT Arrival')

    y += 2
    subheader('Information from Paramedics')
    item('Unit Number')
    item('Hospital Destination', 'if known')
    item('Time Transport Arrived')
    item('Time Care Transferred')

    y += 2
    section('SECTION 3: AT THE END OF CALL')
    item('Patient Signature', 'if care not transferred to paramedics')
    item('Time Cleared Scene')

    const pdfBlob = pdf.output('blob')
    const url = URL.createObjectURL(pdfBlob)

    return {
      blob: pdfBlob,
      url,
      filename: 'VCRT_Supervisor_Call_Checklist.pdf',
      size: pdfBlob.size,
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
    // z-[1200] matches the shared Modal component - above the Sidebar's own
    // z-[1100], so the sidebar sits behind (and dims under) this popup's
    // backdrop instead of showing through it.
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1200]'
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
    this.lockBodyScroll()

    const downloadBtn = modal.querySelector('#download-btn')
    const closeBtn = modal.querySelector('#close-btn')

    downloadBtn?.addEventListener('click', () => this.downloadPDF(result))

    const closeModal = () => {
      document.body.removeChild(modal)
      this.unlockBodyScroll()
      if (ownsResult) URL.revokeObjectURL(result.url)
      document.removeEventListener('keydown', handleEsc)
      this.activeModalCloseFns.delete(closeModal)
    }
    this.activeModalCloseFns.add(closeModal)
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
    // z-[1200] matches the shared Modal component - above the Sidebar's own
    // z-[1100], so the sidebar sits behind (and dims under) this popup's
    // backdrop instead of showing through it.
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[1200]'
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
    this.lockBodyScroll()

    // Force-closing (e.g. an idle-session logout) just tears the modal down
    // - it doesn't call onConfirm, since that would fire a real submit/cancel
    // side effect the user never actually chose.
    const closeModal = () => {
      document.body.removeChild(modal)
      this.unlockBodyScroll()
      if (result) URL.revokeObjectURL(result.url)
      this.activeModalCloseFns.delete(closeModal)
    }
    this.activeModalCloseFns.add(closeModal)

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
      closeModal()
    })

    cancelBtn?.addEventListener('click', () => {
      onConfirm(false, '')
      closeModal()
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

  pdf.setFontSize(10)
  pdf.setFont('helvetica', 'bold')
  pdf.text(bl('Patient Care Report', 'Rapport de soins préhospitaliers'), x + logoSize + 3, y)

  pdf.setFontSize(7)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`${bl('Generated', 'Généré le')}: ${generatedAt}`, pageWidth - options.margins.right, yPosition, { align: 'right' })

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
    const boxHeight = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6, newPage)
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    drawSectionBanner(
      pdf,
      bl('RESPONSE & PATIENT INFORMATION', "RENSEIGNEMENTS SUR L'INTERVENTION & LE PATIENT"),
      boxX, yPosition, boxWidth, boxHeight,
    )
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    // Date / Report # / Call # / Location - all short, one row of 4
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Date', 'Date')}: `, value: data.date || '' },
        { label: `${bl('Report Number', 'N° de rapport')}: `, value: data.reportNumber || '' },
        { label: `${bl('Call Number', "N° d'appel")}: `, value: data.callNumber || '' },
        { label: `${bl('Location', 'Lieu')}: `, value: data.location || '' },
      ],
      [1, 1, 1, 1],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Supervisor / Primary PSM
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Supervisor', 'Superviseur')}: `, value: data.supervisor || '' },
        { label: `${bl('Primary PSM', 'MSP principal')}: `, value: data.primaryPSM || '' },
      ],
      [2, 2],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Responders (own row - can run long)
    const responders = (data.responders || []).filter(r => r.trim() !== '').join(', ')
    yPosition = renderFieldsRow(
      pdf,
      [{ label: `${bl('Responders', "Répondant(e)s")}: `, value: responders }],
      [4],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Time Notified / On Scene / Transport Arrived / Cleared Scene - all
    // short times, one row of 4
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Time Notified', 'Heure de notification')}: `, value: data.timeNotified || '' },
        { label: `${bl('On Scene', 'Arrivée sur les lieux')}: `, value: data.onScene || '' },
        { label: `${bl('Transport Arrived', 'Arrivée du transport')}: `, value: data.transportArrived || 'N/A' },
        { label: `${bl('Cleared Scene', 'Départ des lieux')}: `, value: data.clearedScene || '' },
      ],
      [1, 1, 1, 1],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Paramedics Called by / First Agency on Scene
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Paramedics Called by', 'Paramédics appelés par')}: `, value: data.paramedicsCalledBy || 'N/A' },
        { label: `${bl('First Agency on Scene', 'Premier service sur les lieux')}: `, value: data.firstAgencyOnScene || '' },
      ],
      [2, 2],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // The row above already ends with FIELD_ROW_SPACING of gap baked in -
    // top it up so the gap before the line matches the gap after it.
    yPosition += 6 - FIELD_ROW_SPACING
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(
      options.margins.left,
      yPosition,
      pdf.internal.pageSize.getWidth() - options.margins.right,
      yPosition
    )

    return yPosition + 6

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

    // Patient Name / DOB - own row, kept prominent
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Patient Name', 'Nom du patient')}: `, value: data.patientName || '' },
        { label: `${bl('Date of Birth', 'Date de naissance')}: `, value: data.dob || 'Not Recorded' },
      ],
      [2, 2],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Age / Sex / Status / Student/Employee # - all short, one row of 4
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Age', 'Âge')}: `, value: data.age ? data.age.toString() : 'Not Recorded' },
        { label: `${bl('Sex', 'Sexe')}: `, value: data.sex || '' },
        { label: `${bl('Status', 'Statut')}: `, value: data.status || '' },
        { label: `${bl('Student/Employee #', "N° d'étudiant/employé")}: `, value: data.studentEmployeeNumber || ' Not Recorded' },
      ],
      [1, 1, 1, 1],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // The row above already ends with FIELD_ROW_SPACING of gap baked in -
    // top it up so the gap before the line matches the gap after it.
    yPosition += 6 - FIELD_ROW_SPACING
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(
      options.margins.left,
      yPosition,
      pdf.internal.pageSize.getWidth() - options.margins.right,
      yPosition
    )
    yPosition += 6

    // Emergency Contact Name (own row - runs long)
    yPosition = renderFieldsRow(
      pdf,
      [{ label: `${bl('Emergency Contact Name (Relationship)', "Nom du contact d'urgence (et lien)")}: `, value: data.emergencyContactName || '' }],
      [4],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Contacted? / Contact Phone / Contacted by / Workplace Injury? - all
    // short, one row of 4
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Contacted?', 'Contacté?')}: `, value: data.contacted || '' },
        { label: `${bl('Contact Phone', 'Téléphone du contact')}: `, value: data.emergencyContactPhone || '' },
        { label: `${bl('Contacted by', 'Contacté par')}: `, value: data.contactedBy || '' },
        { label: `${bl('Workplace Injury?', 'Blessure au travail?')}: `, value: data.workplaceInjury || '' },
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
    const boxHeight = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6, newPage)
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    drawSectionBanner(
      pdf,
      bl('PATIENT MEDICAL HISTORY & RESPONSE REASON', "ANTÉCÉDENTS MÉDICAUX DU PATIENT & MOTIF D'INTERVENTION"),
      boxX, yPosition, boxWidth, boxHeight,
    )
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    yPosition = renderFieldsRow(
      pdf,
      [{ label: `${bl('Chief Complaint', 'Motif principal')}: `, value: data.chiefComplaint || '' }],
      [4], yPosition, options, contentWidth, newPage
    )
    yPosition = renderFieldsRow(
      pdf,
      [{ label: `${bl('Signs & Symptoms', 'Signes et symptômes')}: `, value: data.signsSymptoms || '' }],
      [4], yPosition, options, contentWidth, newPage
    )
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Allergies', 'Allergies')}: `, value: data.allergies || '' },
        { label: `${bl('Medications', 'Médicaments')}: `, value: data.medications || '' },
      ],
      [2, 2], yPosition, options, contentWidth, newPage
    )
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Pertinent Medical History', 'Antécédents médicaux pertinents')}: `, value: data.medicalHistory || '' },
        { label: `${bl('Last Oral Intake', 'Dernière prise alimentaire')}: `, value: data.lastMeal || '' },
      ],
      [2, 2], yPosition, options, contentWidth, newPage
    )

    // The row above already ends with FIELD_ROW_SPACING of gap baked in -
    // top it up so the gap before the line matches the gap after it.
    yPosition += 6 - FIELD_ROW_SPACING
    pdf.setDrawColor(0)
    pdf.setLineWidth(0.4)
    pdf.line(
      options.margins.left,
      yPosition,
      pdf.internal.pageSize.getWidth() - options.margins.right,
      yPosition
    )
    yPosition += 6

    yPosition = renderFieldsRow(
      pdf,
      [{ label: `${bl('Rapid Body Survey Findings', "Constats de l'examen corporel rapide")}: `, value: data.bodySurvey || '' }],
      [4], yPosition, options, contentWidth, newPage
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
    const boxHeight = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6, newPage)
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    drawSectionBanner(
      pdf,
      bl('TREATMENT PERFORMED & PHYSICAL FINDINGS', 'TRAITEMENT EFFECTUÉ & CONSTATS PHYSIQUES'),
      boxX, yPosition, boxWidth, boxHeight,
    )
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    const airwayManagement = Array.isArray(data.airwayManagement) && data.airwayManagement.length > 0
    ? data.airwayManagement.join(', ')
    : ''
    const hemorrhageControl = Array.isArray(data.hemorrhageControl) && data.hemorrhageControl.length > 0
    ? data.hemorrhageControl.join(', ')
    : ''
    const hasTourniquet =
      Array.isArray(data.hemorrhageControl) &&
      data.hemorrhageControl.includes('Tourniquet');

    // Airway Management / Hemorrhage Control share a row
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Airway Management', 'Gestion des voies respiratoires')}: `, value: airwayManagement || ' N/A' },
        { label: `${bl('Hemorrhage Control', "Contrôle de l'hémorragie")}: `, value: hemorrhageControl || ' N/A' },
      ],
      [2, 2],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // Tourniquet - only shown when one was actually used, instead of a
    // blank/N/A row every time
    if (hasTourniquet) {
      yPosition = renderFieldsRow(
        pdf,
        [
          { label: `${bl('Tourniquet Time', "Heure d'application (garrot)")}: `, value: data.timeApplied || '' },
          { label: `${bl('Turns', 'Tours')}: `, value: String(data.numberOfTurns ?? '') },
        ],
        [2, 2],
        yPosition,
        options,
        contentWidth,
        newPage
      )
    }

    const immobilization = Array.isArray(data.immobilization) && data.immobilization.length > 0
    ? data.immobilization.join(', ')
    : ''
    yPosition = renderFieldsRow(
      pdf,
      [{ label: `${bl('Immobilization', 'Immobilisation')}: `, value: immobilization || ' N/A' }],
      [4],
      yPosition,
      options,
      contentWidth,
      newPage
    )

    // CPR / AED - each half only shown when actually performed, instead of
    // a blank/N/A row every time. Whichever combination is present shares
    // one row (2-up if only one was performed, 4-up if both were).
    const cprFields = data.cprPerformed
      ? [
          { label: `${bl('CPR Time Started', 'Heure de début RCP')}: `, value: data.timeStarted || '' },
          { label: `${bl('CPR Number of Cycles', 'Nombre de cycles RCP')}: `, value: data.numberOfCycles || '' },
        ]
      : []
    const aedFields = data.aedPerformed
      ? [
          { label: `${bl('AED Number of Shocks', 'Nombre de chocs DEA')}: `, value: data.numberOfShocks || '' },
          { label: `${bl('Shock Not Advised', 'Choc non recommandé')}: `, value: data.shockNotAdvised || '' },
        ]
      : []
    const cprAedFields = [...cprFields, ...aedFields]
    if (cprAedFields.length > 0) {
      yPosition = renderFieldsRow(
        pdf,
        cprAedFields,
        cprAedFields.length === 4 ? [1, 1, 1, 1] : [2, 2],
        yPosition,
        options,
        contentWidth,
        newPage
      )
    }

    yPosition = renderFieldsRow(
      pdf,
      [{ label: `${bl('Patient Position', 'Position du patient')}: `, value: data.positionOfPatient || '' }],
      [4],
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
      // The row above already ends with FIELD_ROW_SPACING of gap baked in -
      // top it up so the gap before the line matches the gap after it.
      yPosition += 6 - FIELD_ROW_SPACING
      pdf.setDrawColor(0)
      pdf.setLineWidth(0.4)
      pdf.line(
        options.margins.left,
        yPosition,
        pdf.internal.pageSize.getWidth() - options.margins.right,
        yPosition
      )
      yPosition += 6

      // Extract the rendered body-diagram snapshot, if any, and measure it
      // BEFORE deciding on a page break - so the heading and its diagram/
      // OPQRST content below it page-break together as one unit instead of
      // the heading getting stranded on the previous page while the
      // content it introduces jumps to the next one.
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

      // Gap between the heading and the diagram/OPQRST content below it -
      // keeps the diagram's top edge clear of the heading text instead of
      // starting flush with it.
      const headingGap = 6
      const headingFontSize = pdf.getFontSize() || 8
      const headingLineH = pdf.getLineHeightFactor() * (headingFontSize * 0.3528)
      const blockNeed = headingLineH + headingGap + Math.max(imageDataUrl ? imgHeight : 0, 40)
      yPosition = ensureSpaceFor(pdf, options, yPosition, blockNeed, newPage)

      drawLabel(pdf, `${bl('Pain Assessment & Injury Location', "Évaluation de la douleur & Emplacement de la blessure")}: `, options.margins.left, yPosition)
      yPosition += headingGap

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
        pdf.text(bl('No OPQRST sections recorded.', 'Aucune section OPQRST enregistrée.'), options.margins.left, yText)
        pdf.setFont('helvetica', 'normal')
        yText += 5
      }

      opqrstEntries.forEach((entry, index) => {
        yText = ensureSpaceFor(pdf, options, yText, 8, newPage)

        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(...VCRT_RED)
        pdf.text(`OPQRST #${index + 1}`, options.margins.left, yText)
        pdf.setTextColor(0, 0, 0)
        yText += 5

        yText = renderFieldsRow(
          pdf, [{ label: `${bl('Area', 'Zone')}: `, value: entry.area || '' }], [4], yText, options, leftColWidth, newPage
        )
        yText = renderFieldsRow(
          pdf, [{ label: `${bl('Onset', 'Apparition')}: `, value: entry.onset || '' }], [4], yText, options, leftColWidth, newPage
        )
        yText = renderFieldsRow(
          pdf, [{ label: `${bl('Provocation', 'Provocation')}: `, value: entry.provocation || '' }], [4], yText, options, leftColWidth, newPage
        )
        yText = renderFieldsRow(
          pdf, [{ label: `${bl('Quality', 'Qualité')}: `, value: entry.quality || '' }], [4], yText, options, leftColWidth, newPage
        )
        yText = renderFieldsRow(
          pdf, [{ label: `${bl('Radiation', 'Irradiation')}: `, value: entry.radiation || '' }], [4], yText, options, leftColWidth, newPage
        )
        yText = renderFieldsRow(
          pdf,
          [
            { label: `${bl('Scale', 'Échelle')}: `, value: entry.scale || '' },
            { label: `${bl('Time', 'Heure')}: `, value: entry.time || '' },
          ],
          [2, 2], yText, options, leftColWidth, newPage
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

    // Columns that are standard clinical acronyms/abbreviations (HR, RR,
    // SpO2, B/P, LOC,GCS) stay English-only; the plain-language ones
    // (Time, Skin, Pupils) get a second, French line.
    const headerPairs: [string, string][] = [
      ['Time', 'Heure'],
      ['HR', 'HR'],
      ['RR', 'RR'],
      ['SpO2', 'SpO2'],
      ['B/P', 'B/P'],
      ['LOC,GCS', 'LOC,GCS'],
      ['Skin', 'Peau'],
      ['Pupils', 'Pupilles'],
    ]
    const nCols = headerPairs.length
    const colW = contentWidth / nCols
    const cellPadX = 1.5
    const lineH = pdf.getLineHeightFactor() * (8 * 0.3528)
    const headerRowH = Math.max(6, lineH * 2 + 2)

    const drawSectionHeader = () => {
      const boxX = x0
      const boxW = contentWidth
      drawSectionBanner(pdf, bl('VITAL SIGNS', 'SIGNES VITAUX'), boxX, yPosition, boxW, headerBarH)
      yPosition += headerBarH + 4
    }

    // Header cells (column titles) stay plain, like every other field label
    // in the report; the light-blue fill now marks the DATA cells instead,
    // matching the "label above, answer in a light-blue box" convention
    // used everywhere else.
    const drawTableHeader = () => {
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(0, 0, 0)
      for (let i = 0; i < nCols; i++) {
        const cellX = x0 + i * colW
        const [en, fr] = headerPairs[i]
        if (en === fr) {
          pdf.text(en, cellX + colW / 2, yPosition + headerRowH / 2 + lineH / 3, { align: 'center' })
        } else {
          pdf.text(en, cellX + colW / 2, yPosition + headerRowH / 2 - 0.5, { align: 'center' })
          pdf.text(fr, cellX + colW / 2, yPosition + headerRowH / 2 + lineH, { align: 'center' })
        }
      }
      pdf.setDrawColor(195, 195, 200)
      pdf.setLineWidth(0.2)
      pdf.rect(x0, yPosition, contentWidth, headerRowH)
      for (let i = 1; i < nCols; i++) {
        const vx = x0 + i * colW
        pdf.line(vx, yPosition, vx, yPosition + headerRowH)
      }
      yPosition += headerRowH
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(0, 0, 0)
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
    const minDataRowH = lineH + 2
    const initialNeeded = headerBarH + 4 + headerRowH + (vitalSigns.length > 0 ? minDataRowH : 0)
    yPosition = ensureSpaceFor(pdf, options, yPosition, initialNeeded, newPage)

    drawSectionHeader()
    drawTableHeader()

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(0, 0, 0)

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
      ].map(v => String(v).toUpperCase())

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

      // Data cells get the light-blue answer fill (matching the boxed field
      // style); the column-divider lines share the same light-grey border
      // used everywhere else.
      pdf.setFillColor(...VCRT_BLUE_LIGHT)
      pdf.setDrawColor(195, 195, 200)
      pdf.setLineWidth(0.2)
      pdf.rect(x0, yPosition, contentWidth, rowH, 'FD')
      for (let i = 1; i < nCols; i++) {
        const vx = x0 + i * colW
        pdf.line(vx, yPosition, vx, yPosition + rowH)
      }

      pdf.setTextColor(0, 0, 0)
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
    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    drawSectionBanner(pdf, bl('OXYGEN PROTOCOL', "PROTOCOLE D'OXYGÈNE"), boxX, yPosition, boxWidth, boxHeight)
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    // 1) Oxygen Saturation Assessment
    const hasSaturationAny =
      !!oxygenProtocol?.saturation_range || oxygenProtocol?.spo2 !== undefined || !!oxygenProtocol?.spo2_acceptable
    if (hasSaturationAny) {
      // Saturation Target Range / Initial SpO2 % / Initial SpO2 Acceptable
      yPosition = renderFieldsRow(
        pdf,
        [
          { label: `${bl('Saturation Target Range', 'Plage cible de saturation')}: `, value: oxygenProtocol?.saturation_range || '' },
          { label: `${bl('Initial SpO2 %', 'SpO2 initiale %')}: `, value: oxygenProtocol?.spo2 || '' },
          { label: `${bl('Initial SpO2 Acceptable', 'SpO2 initiale acceptable')}: `, value: oxygenProtocol?.spo2_acceptable || '' },
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
      // Oxygen Therapy Given? / Who Started Therapy
      yPosition = renderFieldsRow(
        pdf,
        [
          { label: `${bl('Oxygen Therapy Given?', 'Oxygénothérapie administrée?')}: `, value: oxygenProtocol.oxygen_given || '' },
          { label: `${bl('Who Started Therapy', 'Qui a débuté le traitement')}: `, value: String(oxygenProtocol.whoStartedTherapy ?? ' N/A') },
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
          [{ label: `${bl('Reason for O2 Therapy', "Raison de l'oxygénothérapie")}: `, value: reason }],
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
            { label: `${bl('Time Therapy Started', 'Heure de début du traitement')}: `, value: oxygenProtocol?.timeTherapyStarted || '' },
            { label: `${bl('Time Therapy Ended', 'Heure de fin du traitement')}: `, value: oxygenProtocol?.timeTherapyEnded || '' },
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
            { label: `${bl('Delivery Device', "Dispositif d'administration")}: `, value: oxygenProtocol?.deliveryDevice || '' },
            { label: `${bl('Initial Flow Rate (L/min)', 'Débit initial (L/min)')}: `, value: oxygenProtocol?.flowRate || '' },
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
    const labels = [bl('Time of Change', 'Heure du changement'), bl('Flow Rate (L/min)', 'Débit (L/min)')]
    const nRows = labels.length
    const rowHeight = 6
    const labelColWidth = Math.min(55, contentWidth * 0.4)
    const nDataCols = Math.max(1, alterations.length)
    const denom = Math.max(8, nDataCols)
    const dataColWidth = (contentWidth - labelColWidth) / denom
    const tableHeight = nRows * rowHeight

    // need: spacing before header (4) + header line (4) + table + trailing spacer (6)
    const needed = 4 + 4 + tableHeight + 6
    yPosition = ensureSpaceFor(pdf, options, yPosition, needed, newPage)

    // small sub-header
    yPosition += 4
    drawLabel(pdf, `${bl('Flow Rate Alterations', 'Modifications du débit')}: `, options.margins.left, yPosition)
    pdf.setFont('helvetica', 'normal')
    yPosition += 4

    const x0 = options.margins.left
    const tableWidth = labelColWidth + nDataCols * dataColWidth
    const dataAreaWidth = nDataCols * dataColWidth

    // Data cells get the light-blue answer fill; the label column stays
    // plain (bold text only) - matching the "label above/beside, answer in
    // a light-blue box" convention used everywhere else in the report.
    pdf.setFillColor(...VCRT_BLUE_LIGHT)
    pdf.rect(x0 + labelColWidth, yPosition, dataAreaWidth, tableHeight, 'F')

    // outer border (actual used width)
    pdf.setDrawColor(195, 195, 200)
    pdf.setLineWidth(0.2)
    pdf.rect(x0, yPosition, tableWidth, tableHeight)

    // vertical separator after labels column
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

    // row labels - shrink font as needed so the bilingual label fits the
    // narrow label column on one line
    pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(0, 0, 0)
    let labelFontSize = 8
    pdf.setFontSize(labelFontSize)
    const maxLabelWidth = labelColWidth - 2
    while (labelFontSize > 5 && labels.some(l => pdf.getTextWidth(l) > maxLabelWidth)) {
      labelFontSize -= 0.5
      pdf.setFontSize(labelFontSize)
    }
    labels.forEach((label, r) => {
      pdf.text(label, x0 + (labelColWidth / 2), yPosition + r * rowHeight + 4, { align: 'center' })
    })

    // data cells
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(0, 0, 0)
    for (let c = 0; c < nDataCols; c++) {
      const a = alterations[c] || {}
      const colValues = [a?.time ?? '', a?.flowRate != null ? String(a.flowRate) : '']
      colValues.forEach((cell, r) => {
        const cellX = x0 + labelColWidth + c * dataColWidth
        const cellY = yPosition + r * rowHeight
        pdf.text(String(cell).toUpperCase(), cellX + (dataColWidth / 2), cellY + 4, { align: 'center' })
      })
    }

    yPosition += tableHeight + 6
  }

      // 4) End of Therapy
      const hasEnd = !!oxygenProtocol?.reasonForEndingTherapy || !!oxygenProtocol?.whoStartedTherapy
      if (hasEnd) {
        // Reason
        if (oxygenProtocol?.reasonForEndingTherapy) {
          yPosition = renderFieldsRow(
            pdf,
            [{ label: `${bl('Reason for Ending Therapy', "Raison de l'arrêt du traitement")}: `, value: oxygenProtocol.reasonForEndingTherapy || '' }],
            [4], yPosition, options, contentWidth, newPage
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

    // Free-text paragraphs (this section and Transfer Comments below) get
    // extra breathing room between wrapped lines - the default tight line
    // height that works fine for one-line answers reads as cramped over
    // several lines of prose.
    const PARAGRAPH_LINE_GAP = 1.4

    // Measure the full banner + answer-box height up front so the whole
    // call description section moves to a fresh page as a unit instead of
    // the banner rendering at the bottom of one page with its box (or the
    // paragraph inside it) stranded on the next.
    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')
    const commentsText = (data.comments || '').trim()
    const commentsField = [{ label: '', value: commentsText }]
    const commentsBoxHeight = measureFieldsRowHeight(pdf, commentsField, [4], contentWidth, PARAGRAPH_LINE_GAP)
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight + 6 + commentsBoxHeight, newPage)

    const boxX = options.margins.left
    const boxWidth = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    drawSectionBanner(pdf, bl('CALL DESCRIPTION', "DESCRIPTION DE L'APPEL"), boxX, yPosition, boxWidth, boxHeight)
    yPosition += boxHeight + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    yPosition = renderFieldsRow(pdf, commentsField, [4], yPosition, options, contentWidth, newPage, PARAGRAPH_LINE_GAP)

    const boxHeight2 = 8
    yPosition = ensureSpaceFor(pdf, options, yPosition, boxHeight2 + 6, newPage)
    const boxX2 = options.margins.left
    const boxWidth2 = pdf.internal.pageSize.getWidth() - options.margins.left - options.margins.right
    drawSectionBanner(pdf, bl('PATIENT TRANSFER DETAILS', 'DÉTAILS DU TRANSFERT DU PATIENT'), boxX2, yPosition, boxWidth2, boxHeight2)
    yPosition += boxHeight2 + 6

    pdf.setFontSize(8)
    pdf.setFont('helvetica', 'normal')

    // Patient Care Transferred To / Time Care Transferred - both short,
    // always shown, so they share a row.
    yPosition = renderFieldsRow(
      pdf,
      [
        { label: `${bl('Patient Care Transferred To', 'Soins du patient transférés à')}: `, value: data.patientCareTransferred || '' },
        { label: `${bl('Time Care Transferred', 'Heure du transfert des soins')}: `, value: data.timeCareTransferred || '' },
      ],
      [2, 2], yPosition, options, contentWidth, newPage
    )

    // Destination-specific field(s) - Paramedics pairs Unit # with Hospital
    // Destination on one row; Police/Clinic have only a single field.
    if (data.patientCareTransferred === 'Paramedics') {
      yPosition = renderFieldsRow(
        pdf,
        [
          { label: `${bl('Unit #', "N° d'unité")}: `, value: data.unitNumber || '' },
          { label: `${bl('Hospital Destination', 'Hôpital de destination')}: `, value: data.hospitalDestination || '' },
        ],
        [2, 2], yPosition, options, contentWidth, newPage
      )
    } else if (data.patientCareTransferred === 'Police' && data.badgeNumber) {
      yPosition = renderFieldsRow(
        pdf,
        [{ label: `${bl('Badge #', "N° d'insigne")}: `, value: data.badgeNumber }],
        [4], yPosition, options, contentWidth, newPage
      )
    } else if (data.patientCareTransferred === 'Clinic' && data.clinicName) {
      yPosition = renderFieldsRow(
        pdf,
        [{ label: `${bl('Clinic', 'Clinique')}: `, value: data.clinicName }],
        [4], yPosition, options, contentWidth, newPage
      )
    }

    const transferCommentsField = [{ label: `${bl('Comments', 'Commentaires')}: `, value: (data.transferComments || '').trim() }]
    yPosition = renderFieldsRow(pdf, transferCommentsField, [4], yPosition, options, contentWidth, newPage, PARAGRAPH_LINE_GAP)

    return yPosition + 4
  }

  /**
   * The SignaturePad saves whatever was actually on screen - current theme's
   * ink color, transparent background - so it redraws faithfully if the
   * widget remounts. The PDF has no theme, so normalize independently here:
   * recolor every drawn pixel to a fixed dark ink (keeping each pixel's
   * original alpha for smooth anti-aliased edges). The background stays
   * transparent - the signature is drawn on top of the light-blue answer
   * box, so an opaque fill here would paint over the box and leave only its
   * border ring visible instead of a solid blue box with the ink on top.
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
        label: bl(`Responder ${i + 1}`, `Répondant(e) ${i + 1}`),
        name: (name || '').trim(),
        image: data.signatures?.responders?.[i],
      }))
      .filter(col => col.name !== '')

    // Row 1 is always Supervisor + 3 responder slots, blank-filled if a slot
    // wasn't used. A 4th responder (beyond the normal 1 sup + 3 resp case)
    // overflows onto row 2 instead of adding a 5th column to row 1.
    const row1: SigCol[] = [
      { label: bl('Supervisor', 'Superviseur'), name: data.supervisor || '', image: data.signatures?.supervisor },
    ]
    for (let i = 0; i < 3; i++) {
      row1.push(namedResponders[i] || { label: bl(`Responder ${i + 1}`, `Répondant(e) ${i + 1}`), name: '', image: undefined })
    }
    const row2: SigCol[] = namedResponders.length > 3 ? [namedResponders[3]] : []
    const hasSecondRow = row2.length > 0

    // Shrink the per-row height when a second row is needed so the combined
    // strip doesn't blow up the footer - still tall enough for a label and
    // the signature box underneath.
    const rowHeight = hasSecondRow ? 26 : 34
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
      const boxY = rowTopY + 10
      const boxBottomMargin = hasSecondRow ? 3 : 4
      const boxH = rowHeight - 10 - boxBottomMargin

      rowCols.forEach((col, i) => {
        const colX0 = x0 + i * colW
        const colCenterX = colX0 + colW / 2

        // Blank/unused slot - leave the column empty.
        if (!col.name) return

        // Title (role) on its own line, bold and black; the person's name
        // on the line below it, in a lighter color, so it's clear which is
        // which.
        pdf.setFontSize(7.5)
        drawLabel(pdf, col.label, colCenterX, labelY, 'center')

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(7)
        pdf.setTextColor(...ANSWER_COLOR)
        const nameLines = pdf.splitTextToSize(col.name, colW - 6)
        pdf.text(nameLines, colCenterX, labelY + 3, { align: 'center' })
        pdf.setTextColor(0, 0, 0)

        // Same light-blue answer box used for every other field in the
        // report - the signature image (if any) is drawn inside it.
        const boxX = colX0 + 5
        const boxW = colW - 10
        pdf.setFillColor(...VCRT_BLUE_LIGHT)
        pdf.setDrawColor(195, 195, 200)
        pdf.setLineWidth(0.2)
        pdf.rect(boxX, boxY, boxW, boxH, 'FD')

        const normalizedImage = normalizedImages[i]
        if (normalizedImage) {
          try {
            const imgPad = 1.5
            pdf.addImage(
              normalizedImage, 'PNG',
              boxX + imgPad, boxY + imgPad, boxW - imgPad * 2, boxH - imgPad * 2,
              undefined, 'FAST'
            )
          } catch {
            // Corrupt/unsupported signature image data - leave the box empty
          }
        }
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