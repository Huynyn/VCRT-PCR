import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Eye, Edit, Trash2, Ban, ThumbsUp, Archive, MoreVertical, type LucideIcon } from 'lucide-react'
import { Loading, Alert, Modal, Button } from '@/components/ui'
import { Textarea } from '@/components/forms'
import { pdfService } from '@/services/pdf.service'
import { useAuth } from '@/context/AuthContext'
import { apiRequest } from '@/utils/api'
import { parseServerDate, cn } from '@/utils'

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

// A row's actions are collapsed into a single "..." menu, listing only the
// actions actually available for the report's current status (nothing
// rendered disabled - unavailable actions are just left out of the array).
interface ActionSlot {
  label: string
  icon: LucideIcon
  onClick: () => void
  /** Only ever true for the transient "View/Preview PDF is loading" state. */
  disabled?: boolean
}

interface RowActionsMenuProps {
  actions: ActionSlot[]
}

const RowActionsMenu: React.FC<RowActionsMenuProps> = ({ actions }) => {
  const [open, setOpen] = useState(false)
  // Rendered in a portal at a `fixed` position computed from the trigger
  // button, rather than `absolute` inside the table's scroll container -
  // otherwise the menu's own box would count toward that container's
  // scrollable content, occasionally growing a scrollbar / shifting the
  // table the instant it opened.
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) {
      setOpen(true)
      return
    }

    // Estimate the menu's height from its item count (each row ~36px, plus
    // the list's own vertical padding) so we can flip it above the button
    // when there isn't enough room below - measuring the real element would
    // need an extra render pass, and this only has to be roughly right.
    const estimatedHeight = actions.length * 36 + 8
    const spaceBelow = window.innerHeight - rect.bottom
    const openUpward = spaceBelow < estimatedHeight && rect.top > spaceBelow

    setMenuPos({
      top: openUpward ? undefined : rect.bottom + 4,
      bottom: openUpward ? window.innerHeight - rect.top + 4 : undefined,
      right: window.innerWidth - rect.right,
    })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return

    const close = () => setOpen(false)
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    // Capture phase: 'scroll' doesn't bubble, so this is the only way to
    // hear about scrolling inside the table's own overflow-x-auto wrapper.
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  if (actions.length === 0) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="Actions"
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 p-2 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right }}
          className="z-50 w-56 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          <ul className="py-1">
            {actions.map((action, idx) => (
              <li key={idx}>
                <button
                  type="button"
                  disabled={action.disabled}
                  onClick={
                    action.disabled
                      ? undefined
                      : () => {
                          setOpen(false)
                          action.onClick()
                        }
                  }
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors',
                    action.disabled
                      ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/60 cursor-pointer',
                  )}
                >
                  <action.icon className="w-4 h-4 shrink-0" />
                  {action.label}
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
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
  // Admin "Edit" chooser modal (submitted -> Edit or Request; changes_requested ->
  // Edit or update the existing comments) - which report it's for
  const [editChoiceReport, setEditChoiceReport] = useState<PCRReport | null>(null)
  // Admin "approve", "complete" and "cancel" confirmation modals: which report they're for
  const [approveReportId, setApproveReportId] = useState<string | null>(null)
  const [submittingApprove, setSubmittingApprove] = useState(false)
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

  const handleOpenApprove = (reportId: string) => {
    setApproveReportId(reportId)
  }

  const handleConfirmApprove = async () => {
    if (!approveReportId) return

    setSubmittingApprove(true)
    try {
      if (!token) {
        setError('Authentication required')
        return
      }

      await apiRequest(`/pcr/${approveReportId}/approve`, { method: 'PUT' })

      // Optimistic UI: update status in local state
      setReports(prev =>
        prev.map(r => (r.id === approveReportId ? { ...r, status: 'approved' } : r))
      )
      setApproveReportId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve report')
      console.error('Error approving report:', err)
    } finally {
      setSubmittingApprove(false)
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

  // Builds the list of actions available for a row's current status - only
  // ever the ones actually usable right now (nothing shown-but-disabled),
  // so the menu is exactly as long as it needs to be.
  const getActionSlots = (report: PCRReport): ActionSlot[] => {
    const isPreview = report.status === 'draft' || report.status === 'changes_requested'
    const viewSlot: ActionSlot = {
      label: previewLoadingId === report.id ? 'Loading...' : isPreview ? 'Preview PDF' : 'View PDF',
      icon: Eye,
      onClick: () => handleViewReport(report.id),
      disabled: previewLoadingId === report.id,
    }

    if (!isAdmin) {
      switch (report.status) {
        case 'draft':
          return [
            viewSlot,
            { label: 'Edit & Submit', icon: Edit, onClick: () => handleEditDraft(report.id) },
            { label: 'Delete', icon: Trash2, onClick: () => handleDeleteReport(report.id, report.status) },
          ]
        case 'changes_requested':
          return [
            viewSlot,
            { label: 'Edit & Resubmit', icon: Edit, onClick: () => handleEditReport(report.id) },
          ]
        default:
          // submitted, cancelled: locked down to view-only
          return [viewSlot]
      }
    }

    switch (report.status) {
      case 'draft':
        return [
          viewSlot,
          { label: 'Edit & Submit', icon: Edit, onClick: () => handleEditDraft(report.id) },
          { label: 'Delete', icon: Trash2, onClick: () => handleDeleteReport(report.id, report.status) },
        ]
      case 'submitted':
        return [
          viewSlot,
          { label: 'Edit / Request Changes', icon: Edit, onClick: () => setEditChoiceReport(report) },
          { label: 'Approve', icon: ThumbsUp, onClick: () => handleOpenApprove(report.id) },
          { label: 'Cancel', icon: Ban, onClick: () => handleOpenCancel(report.id) },
        ]
      case 'approved':
        return [
          viewSlot,
          { label: 'Edit & Resubmit', icon: Edit, onClick: () => handleEditReport(report.id) },
          { label: 'Complete', icon: Archive, onClick: () => handleOpenComplete(report.id) },
        ]
      case 'changes_requested':
        return [
          viewSlot,
          { label: 'Edit / View Comments', icon: Edit, onClick: () => setEditChoiceReport(report) },
          { label: 'Approve', icon: ThumbsUp, onClick: () => handleOpenApprove(report.id) },
        ]
      default:
        // completed, cancelled: fully locked, view-only
        return [viewSlot]
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
            <>
              <div className="overflow-x-auto shadow ring-1 ring-black ring-opacity-5 dark:ring-gray-700 md:rounded-xl">
              <table className="min-w-full divide-y divide-gray-300 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                      Report ID
                    </th>
                    {isAdmin && (
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Created By
                      </th>
                    )}
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Last Updated
                    </th>
                    <th className="w-0 pl-2 pr-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <span className="sr-only">Actions</span>
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
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full border ${
                            report.status === 'approved'
                              ? 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700/60'
                              : report.status === 'submitted'
                                ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-700/60'
                                : report.status === 'changes_requested'
                                  ? 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700/60'
                                  : report.status === 'draft'
                                    ? 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-200 dark:border-yellow-700/60'
                                    : report.status === 'completed'
                                      ? 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-700/60'
                                      : report.status === 'cancelled'
                                        ? 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700/60'
                                        : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500/60'
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
                      <td className="w-0 pl-2 pr-4 py-4 whitespace-nowrap text-sm font-medium text-right">
                        <RowActionsMenu actions={getActionSlots(report)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
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

      {/* Admin: Approve confirmation modal */}
      <Modal
        isOpen={approveReportId !== null}
        onClose={() => (submittingApprove ? undefined : setApproveReportId(null))}
        title="Approve PCR"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-900 dark:text-gray-100">
            Are you sure you want to approve this PCR? The submitter will no longer be able to
            make changes to it.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setApproveReportId(null)}
              disabled={submittingApprove}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmApprove} disabled={submittingApprove}>
              {submittingApprove ? 'Approving...' : 'Approve'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin: Complete confirmation modal */}
      <Modal
        isOpen={completeReportId !== null}
        onClose={() => (submittingComplete ? undefined : setCompleteReportId(null))}
        title="Complete PCR"
        size="sm"
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

