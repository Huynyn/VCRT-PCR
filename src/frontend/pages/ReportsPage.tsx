import { useState, useEffect } from 'react'
import { Loading, Alert, Modal, Button } from '@/components/ui'
import { Textarea } from '@/components/forms'
import { pdfService } from '@/services/pdf.service'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { parseServerDate } from '@/utils'

interface PCRReport {
  id: string
  status: string
  admin_comments?: string | null
  created_at: string
  updated_at: string
  report_number?: string | null
  form_data?: any
  creator_first_name?: string | null
  creator_last_name?: string | null
  creator_username?: string | null
}

const ReportsPage = () => {
  const { token, isAuthenticated, user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const [reports, setReports] = useState<PCRReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Guards against duplicate/stacked preview modals when a user clicks
  // "Preview PDF"/"View PDF" more than once while a preview is loading.
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null)
  // Admin "request changes" modal: which report it's for, and the comment being typed
  const [requestChangesReportId, setRequestChangesReportId] = useState<string | null>(null)
  const [requestChangesComment, setRequestChangesComment] = useState('')
  const [submittingRequestChanges, setSubmittingRequestChanges] = useState(false)
  // Read-only modal showing the admin's comments to whoever opens it
  const [viewCommentsReport, setViewCommentsReport] = useState<PCRReport | null>(null)
  // Admin "Edit" chooser modal (submitted -> Edit or Request; changes_requested ->
  // Edit or update the existing comments) - which report it's for
  const [editChoiceReport, setEditChoiceReport] = useState<PCRReport | null>(null)
  // Admin "complete" and "cancel" confirmation modals: which report they're for
  const [completeReportId, setCompleteReportId] = useState<string | null>(null)
  const [submittingComplete, setSubmittingComplete] = useState(false)
  const [cancelReportId, setCancelReportId] = useState<string | null>(null)
  const [submittingCancel, setSubmittingCancel] = useState(false)

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    try {
      setLoading(true)

      if (!isAuthenticated || !token) {
        setError('Please log in to view reports')
        setLoading(false)
        return
      }

      const data = await apiRequest('/pcr')
      setReports(data.data || [])
    } catch (err) {
      setError('Failed to load PCR reports')
      console.error('Error fetching reports:', err)
    } finally {
      setLoading(false)
    }
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

  const handleViewReport = async (reportId: string) => {
    if (previewLoadingId) return // already loading a preview - ignore repeat clicks

    try {
      setPreviewLoadingId(reportId)

      if (!token) {
        setError('Authentication required')
        return
      }

      const data = await apiRequest(`/pcr/${reportId}`)
      const reportData = data.data

      // Convert sign-off attachment from base64 to File if present
      let appendPdf: File | undefined
      if (reportData.sign_off_attachment && reportData.sign_off_filename) {
        appendPdf = base64ToFile(reportData.sign_off_attachment, reportData.sign_off_filename)
      }

      // Show PDF preview using the existing PDF service (only admins can download)
      await pdfService.showDownloadPreview(
        reportData.form_data,
        { appendPdf },
        { allowDownload: isAdmin },
      )
    } catch (err) {
      setError('Failed to load report details')
      console.error('Error loading report:', err)
    } finally {
      setPreviewLoadingId(null)
    }
  }

  const handleEditDraft = (reportId: string) => {
    // Navigate to PCR form with draft ID as URL parameter
    const params = new URLSearchParams({ draftId: reportId })
    window.location.hash = `/pcr/new?${params.toString()}`
  }

  const handleEditReport = (reportId: string) => {
    // Navigate to PCR form with report ID as URL parameter (for admin editing submitted reports)
    const params = new URLSearchParams({ reportId: reportId })
    window.location.hash = `/pcr/new?${params.toString()}`
  }

  const handleApproveReport = async (reportId: string) => {
    try {
      if (!token) {
        setError('Authentication required')
        return
      }

      await apiRequest(`/pcr/${reportId}/approve`, { method: 'PUT' })

      // Optimistic UI: update status in local state
      setReports(prev =>
        prev.map(r => (r.id === reportId ? { ...r, status: 'approved' } : r))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve report')
      console.error('Error approving report:', err)
    }
  }

  const handleOpenComplete = (reportId: string) => {
    setCompleteReportId(reportId)
  }

  const handleConfirmComplete = async () => {
    if (!completeReportId) return

    setSubmittingComplete(true)
    try {
      if (!token) {
        setError('Authentication required')
        return
      }

      await apiRequest(`/pcr/${completeReportId}/complete`, { method: 'PUT' })

      setReports(prev =>
        prev.map(r => (r.id === completeReportId ? { ...r, status: 'completed' } : r)),
      )
      setCompleteReportId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete report')
      console.error('Error completing report:', err)
    } finally {
      setSubmittingComplete(false)
    }
  }

  const handleOpenCancel = (reportId: string) => {
    setCancelReportId(reportId)
  }

  const handleConfirmCancel = async () => {
    if (!cancelReportId) return

    setSubmittingCancel(true)
    try {
      if (!token) {
        setError('Authentication required')
        return
      }

      await apiRequest(`/pcr/${cancelReportId}/cancel`, { method: 'PUT' })

      setReports(prev =>
        prev.map(r => (r.id === cancelReportId ? { ...r, status: 'cancelled' } : r)),
      )
      setCancelReportId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel report')
      console.error('Error cancelling report:', err)
    } finally {
      setSubmittingCancel(false)
    }
  }

  const handleOpenRequestChanges = (reportId: string, initialComment: string = '') => {
    setRequestChangesReportId(reportId)
    setRequestChangesComment(initialComment)
  }

  const handleSubmitRequestChanges = async () => {
    if (!requestChangesReportId || !requestChangesComment.trim()) return

    setSubmittingRequestChanges(true)
    try {
      if (!token) {
        setError('Authentication required')
        return
      }

      await apiRequest(`/pcr/${requestChangesReportId}/request-changes`, {
        method: 'PUT',
        body: JSON.stringify({ comments: requestChangesComment.trim() }),
      })

      setReports(prev =>
        prev.map(r =>
          r.id === requestChangesReportId
            ? { ...r, status: 'changes_requested', admin_comments: requestChangesComment.trim() }
            : r,
        ),
      )
      setRequestChangesReportId(null)
      setRequestChangesComment('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request changes')
      console.error('Error requesting changes:', err)
    } finally {
      setSubmittingRequestChanges(false)
    }
  }

  const handleDeleteReport = async (reportId: string, status: string) => {
    const what = status === 'draft' ? 'this draft' : 'this submission'
    const ok = window.confirm(`Delete ${what}? This cannot be undone.`)
    if (!ok) return

    try {
      if (!token) {
        setError('Authentication required')
        return
      }

      await apiRequest(`/pcr/${reportId}`, { method: 'DELETE' })

      // Optimistic UI: remove from state
      setReports(prev => prev.filter(r => r.id !== reportId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete report')
      console.error('Error deleting report:', err)
    }
  }

  const formatDate = (dateString: string) => {
    return parseServerDate(dateString).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFallbackId = (dateString: string) => {
    const date = parseServerDate(dateString)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}${month}${day}_${hours}${minutes}`
  }

  const displayReportId = (report: PCRReport) => {
    const rn = (report.report_number ?? 'No Report ID').trim()
    return rn
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">PCR Reports</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            View completed PCR submissions
          </p>
        </div>
        <Loading />
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">PCR Reports</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          View PCR submissions and drafts
        </p>
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="card">
        <div className="card-body">
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-gray-500 dark:text-gray-400">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    vectorEffect="non-scaling-stroke"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                  No PCR reports
                </h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Create or submit a PCR form to see reports and drafts here.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-700 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Report ID
                    </th>
                    {isAdmin && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Created By
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Last Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {reports.map(report => (
                    <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {displayReportId(report)}
                      </td>

                      {isAdmin && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                          {report.creator_first_name && report.creator_last_name
                            ? `${report.creator_first_name} ${report.creator_last_name}`
                            : report.creator_username
                              ? `@${report.creator_username}`
                              : '—'}
                        </td>
                      )}

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            report.status === 'approved'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200'
                              : report.status === 'submitted'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
                                : report.status === 'changes_requested'
                                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200'
                                  : report.status === 'draft'
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
                                    : report.status === 'completed'
                                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200'
                                      : report.status === 'cancelled'
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
                                        : 'bg-gray-100 text-gray-800 dark:bg-gray-600 dark:text-gray-200'
                          }`}
                        >
                          {report.status === 'changes_requested' ? 'changes requested' : report.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(report.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {formatDate(report.updated_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          {report.status === 'draft' ? (
                            <>
                              <button
                                onClick={() => handleViewReport(report.id)}
                                disabled={previewLoadingId === report.id}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 font-medium disabled:opacity-50 disabled:cursor-wait"
                              >
                                {previewLoadingId === report.id ? 'Loading...' : 'Preview PDF'}
                              </button>
                              <button
                                onClick={() => handleEditDraft(report.id)}
                                className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
                              >
                                Edit
                              </button>
                            </>
                          ) : report.status === 'completed' || report.status === 'cancelled' ? (
                            <button
                              onClick={() => handleViewReport(report.id)}
                              disabled={previewLoadingId === report.id}
                              className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 font-medium disabled:opacity-50 disabled:cursor-wait"
                            >
                              {previewLoadingId === report.id ? 'Loading...' : 'View PDF'}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleViewReport(report.id)}
                                disabled={previewLoadingId === report.id}
                                className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 font-medium disabled:opacity-50 disabled:cursor-wait"
                              >
                                {previewLoadingId === report.id ? 'Loading...' : 'View PDF'}
                              </button>
                              {!isAdmin && report.status === 'changes_requested' && (
                                <button
                                  onClick={() => handleEditReport(report.id)}
                                  className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
                                >
                                  Edit & Resubmit
                                </button>
                              )}
                              {isAdmin && report.status === 'approved' && (
                                <button
                                  onClick={() => handleEditReport(report.id)}
                                  className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
                                >
                                  Edit
                                </button>
                              )}
                              {/* Edit on submitted/changes_requested opens a chooser: edit it
                                  directly, or send/update comments back to the submitter */}
                              {isAdmin && (report.status === 'submitted' || report.status === 'changes_requested') && (
                                <button
                                  onClick={() => setEditChoiceReport(report)}
                                  className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300 font-medium"
                                >
                                  Edit
                                </button>
                              )}
                              {isAdmin && report.status === 'submitted' && (
                                <>
                                  <button
                                    onClick={() => handleApproveReport(report.id)}
                                    className="text-emerald-600 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleOpenCancel(report.id)}
                                    className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium"
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                              {isAdmin && report.status === 'approved' && (
                                <button
                                  onClick={() => handleOpenComplete(report.id)}
                                  className="text-purple-500 hover:text-purple-700 dark:text-purple-300 dark:hover:text-purple-200 font-medium"
                                >
                                  Complete
                                </button>
                              )}
                            </>
                          )}

                          {/* View comments: only meaningful once the admin has sent a
                              report back with feedback */}
                          {report.status === 'changes_requested' && report.admin_comments && (
                            <button
                              onClick={() => setViewCommentsReport(report)}
                              className="text-orange-600 hover:text-orange-900 dark:text-orange-400 dark:hover:text-orange-300 font-medium"
                            >
                              View Comments
                            </button>
                          )}

                          {/* Delete: the only status a PCR can be deleted from is draft,
                              by its owner - not even admins can delete beyond that. */}
                          {report.status === 'draft' && (
                            <button
                              onClick={() => handleDeleteReport(report.id, report.status)}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Admin: Edit chooser modal - edit directly, or send/update comments instead */}
      <Modal
        isOpen={editChoiceReport !== null}
        onClose={() => setEditChoiceReport(null)}
        title="Edit"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {editChoiceReport?.status === 'submitted'
              ? 'Edit this report yourself, or send it back with comments instead.'
              : 'Edit this report yourself, or update the comments sent back to the submitter.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const r = editChoiceReport
                setEditChoiceReport(null)
                if (r) handleOpenRequestChanges(r.id, r.status === 'changes_requested' ? r.admin_comments || '' : '')
              }}
            >
              {editChoiceReport?.status === 'submitted' ? 'Request' : 'Comments'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const r = editChoiceReport
                setEditChoiceReport(null)
                if (r) handleEditReport(r.id)
              }}
            >
              Edit
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin: Request Changes modal (also used to update existing comments) */}
      <Modal
        isOpen={requestChangesReportId !== null}
        onClose={() => (submittingRequestChanges ? undefined : setRequestChangesReportId(null))}
        title={
          reports.find(r => r.id === requestChangesReportId)?.status === 'changes_requested'
            ? 'Update Comments'
            : 'Request Changes'
        }
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Describe what needs to change. The report will be sent back to the submitter, who can
            edit and resubmit it.
          </p>
          <Textarea
            label="Comments"
            value={requestChangesComment}
            onChange={e => setRequestChangesComment(e.target.value)}
            placeholder="e.g. Missing vitals at 14:32, please confirm the transport destination..."
            required
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRequestChangesReportId(null)}
              disabled={submittingRequestChanges}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmitRequestChanges}
              disabled={submittingRequestChanges || !requestChangesComment.trim()}
            >
              {submittingRequestChanges ? 'Saving...' : 'Send Back'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* View admin comments modal */}
      <Modal
        isOpen={viewCommentsReport !== null}
        onClose={() => setViewCommentsReport(null)}
        title="Requested Changes"
        size="md"
      >
        <div className="space-y-4">
          <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
            {viewCommentsReport?.admin_comments}
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setViewCommentsReport(null)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin: Complete confirmation modal */}
      <Modal
        isOpen={completeReportId !== null}
        onClose={() => (submittingComplete ? undefined : setCompleteReportId(null))}
        title="Complete PCR"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-900 dark:text-gray-100">
            Make sure this PCR was downloaded and uploaded onto Microsoft Teams before completing
            it.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Once completed, this report will only be viewable as a PDF and will be permanently
            deleted after 1 week.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCompleteReportId(null)}
              disabled={submittingComplete}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmComplete} disabled={submittingComplete}>
              {submittingComplete ? 'Completing...' : 'Complete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin: Cancel confirmation modal */}
      <Modal
        isOpen={cancelReportId !== null}
        onClose={() => (submittingCancel ? undefined : setCancelReportId(null))}
        title="Cancel PCR"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-900 dark:text-gray-100">
            Are you sure this PCR is not needed? Cancelling it will lock it to view-only, and it
            will be permanently deleted after 1 week.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelReportId(null)}
              disabled={submittingCancel}
            >
              Back
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmCancel}
              disabled={submittingCancel}
            >
              {submittingCancel ? 'Cancelling...' : 'Cancel PCR'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default ReportsPage

