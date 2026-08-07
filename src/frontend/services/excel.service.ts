import ExcelJS from 'exceljs'

export interface ApprovedRangeRow {
  id: string
  date: string | null
  report_number: string | null
  chief_complaint: string | null
  time_notified: string | null
  on_scene: string | null
  cleared_scene: string | null
  patient_care_transferred: string | null
  oxygen_given: string | null
  supervisor: string | null
  /** JSON-encoded array of responder names, as returned by the backend. */
  responders: string | null
}

function parseResponders(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((name): name is string => !!name && typeof name === 'string') : []
  } catch {
    return []
  }
}

// Matches the navy sampled from the VCRT/EBIC logo (tailwind.config.js navy-800)
const HEADER_FILL = 'FF1F2A51'
const ZEBRA_FILL = 'FFF3F4F6'
const BORDER_COLOR = 'FFD1D5DB'

const THIN_BORDER = {
  top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
}

function parseMinutesOfDay(time: string | null | undefined): number | null {
  if (!time) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!match) return null
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  if (hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

function diffMinutes(startTime: string | null, endTime: string | null): number | null {
  const start = parseMinutesOfDay(startTime)
  const end = parseMinutesOfDay(endTime)
  if (start === null || end === null) return null
  let diff = end - start
  if (diff < 0) diff += 24 * 60
  return diff
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = THIN_BORDER
  })
  row.height = 20
}

function styleBodyRows(sheet: ExcelJS.Worksheet, startRow: number): void {
  for (let i = startRow; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)
    const isEven = (i - startRow) % 2 === 1
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = THIN_BORDER
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } }
      }
    })
  }
}

export function generateApprovedCallsExcel(
  rows: ApprovedRangeRow[],
  startDate: string,
  endDate: string
): void {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'VCRT PCR Application'
  workbook.created = new Date()

  const callsSheet = workbook.addWorksheet('Calls', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  callsSheet.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Report #', key: 'reportNumber', width: 12 },
    { header: 'Chief Complaint', key: 'chiefComplaint', width: 24 },
    { header: 'Time Notified', key: 'timeNotified', width: 13 },
    { header: 'On Scene', key: 'onScene', width: 11 },
    { header: 'Time to Scene (min)', key: 'timeToScene', width: 17 },
    { header: 'Cleared Scene', key: 'clearedScene', width: 13 },
    { header: 'Time of Call (min)', key: 'timeOfCall', width: 16 },
    { header: 'Transfer to EMS', key: 'transferToEms', width: 15 },
    { header: 'Oxygen Given', key: 'oxygenGiven', width: 13 },
    { header: 'Supervisor', key: 'supervisor', width: 20 },
    { header: 'Responders', key: 'responders', width: 32 },
  ]

  rows.forEach(r => {
    callsSheet.addRow({
      date: r.date || '',
      reportNumber: r.report_number || '',
      chiefComplaint: r.chief_complaint || '',
      timeNotified: r.time_notified || '',
      onScene: r.on_scene || '',
      timeToScene: diffMinutes(r.time_notified, r.on_scene) ?? '',
      clearedScene: r.cleared_scene || '',
      timeOfCall: diffMinutes(r.on_scene, r.cleared_scene) ?? '',
      transferToEms: r.patient_care_transferred === 'Paramedics' ? 'Yes' : 'No',
      oxygenGiven: r.oxygen_given === 'yes' ? 'Yes' : 'No',
      supervisor: r.supervisor || '',
      responders: parseResponders(r.responders).join(', '),
    })
  })

  styleHeaderRow(callsSheet.getRow(1))
  styleBodyRows(callsSheet, 2)
  callsSheet.autoFilter = { from: 'A1', to: { row: 1, column: callsSheet.columns.length } }

  // Summary sheet
  const timeToSceneValues = rows
    .map(r => diffMinutes(r.time_notified, r.on_scene))
    .filter((v): v is number => v !== null)
  const timeOfCallValues = rows
    .map(r => diffMinutes(r.on_scene, r.cleared_scene))
    .filter((v): v is number => v !== null)
  const transferYesCount = rows.filter(r => r.patient_care_transferred === 'Paramedics').length
  const oxygenYesCount = rows.filter(r => r.oxygen_given === 'yes').length

  const summarySheet = workbook.addWorksheet('Summary')
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 32 },
    { header: 'Value', key: 'value', width: 20 },
  ]

  const avgTimeToScene = average(timeToSceneValues)
  const avgTimeOfCall = average(timeOfCallValues)
  const transferFraction = rows.length ? transferYesCount / rows.length : 0
  const oxygenFraction = rows.length ? oxygenYesCount / rows.length : 0

  summarySheet.addRow({ metric: 'Date Range', value: `${startDate} to ${endDate}` })
  summarySheet.addRow({ metric: 'Total Number of Calls', value: rows.length })
  summarySheet.addRow({ metric: 'Average Time to Scene (min)', value: avgTimeToScene ?? 'N/A' })
  summarySheet.addRow({ metric: 'Average Time of Call (min)', value: avgTimeOfCall ?? 'N/A' })

  const transferRow = summarySheet.addRow({ metric: 'Transfer to EMS', value: transferFraction })
  transferRow.getCell('value').numFmt = '0.0%'

  const oxygenRow = summarySheet.addRow({ metric: 'Oxygen Therapy Given', value: oxygenFraction })
  oxygenRow.getCell('value').numFmt = '0.0%'

  styleHeaderRow(summarySheet.getRow(1))
  styleBodyRows(summarySheet, 2)
  summarySheet.getColumn('metric').font = { bold: true }

  workbook.xlsx.writeBuffer().then(buffer => {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pcr-call-report_${startDate}_to_${endDate}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  })
}
