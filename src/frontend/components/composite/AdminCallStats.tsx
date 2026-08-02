import React, { useEffect, useState } from 'react'
import { AlertTriangle, Download } from 'lucide-react'
import { Button } from '@/components/ui'
import { DatePicker } from '@/components/forms'
import { apiRequest } from '@/utils/api'
import { generateApprovedCallsExcel, ApprovedRangeRow } from '@/services/excel.service'

const AdminCallStats: React.FC = () => {
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/pcr/stats/pending-approval-count')
      .then(res => setPendingCount(res.data?.count ?? 0))
      .catch(() => {
        // Silently fail - banner is non-critical
      })
  }, [])

  const handleGenerate = async () => {
    setError('')

    if (!startDate || !endDate) {
      setError('Select a start and end date')
      return
    }
    if (startDate > endDate) {
      setError('Start date must be on or before the end date')
      return
    }

    try {
      setGenerating(true)
      const res = await apiRequest(`/pcr/stats/approved-range?start=${startDate}&end=${endDate}`)
      const rows: ApprovedRangeRow[] = res.data || []
      if (rows.length === 0) {
        setError('No approved PCRs found in that date range')
        return
      }
      generateApprovedCallsExcel(rows, startDate, endDate)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-6">
      {pendingCount !== null && pendingCount > 0 && (
        <a
          href="#/reports"
          className="flex items-center gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:hover:bg-amber-900/30 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
            {pendingCount} PCR{pendingCount === 1 ? '' : 's'} awaiting approval
          </span>
        </a>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Call Data Export</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Download an Excel report of approved PCRs for a date range
          </p>
        </div>
        <div className="card-body">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</p>
          )}
          <div className="flex flex-wrap items-end gap-4">
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
            <div className="space-y-1">
              <p aria-hidden="true" className="form-label select-none">&nbsp;</p>
              <Button
                onClick={handleGenerate}
                loading={generating}
                disabled={generating}
                leftIcon={<Download className="w-4 h-4" />}
                className="w-full h-[42px]"
              >
                Generate Report
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminCallStats
