import { Router, Response } from 'express';
import db from '../database';
import { authenticateToken, AuthenticatedRequest, requireRole, blockTempLogin } from '../middleware/auth';
import { logActivity } from '../middleware/logger';
import { cleanupService } from '../services/cleanup';

const router = Router();

// Statuses settable through the generic create/update endpoints below. Every
// other transition (approved, completed, cancelled, changes_requested) has
// its own dedicated admin-only endpoint further down this file, which also
// carries side effects (clearing admin_comments, etc.) that this generic
// path doesn't perform - so it must never accept those values directly, or
// a caller could jump a report straight to "approved"/"completed" without
// ever going through admin review.
const CREATABLE_STATUSES = new Set(['draft', 'submitted']);

// Generate simple ID
function generateId(): string {
  return 'pcr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// A report row's sign_off_attachments column is stored as a JSON string;
// parse it back into an array for API responses. Falls back to the legacy
// single sign_off_attachment/sign_off_filename columns for reports saved
// before multi-attachment support existed.
function parseAttachments(row: { sign_off_attachments?: string | null; sign_off_attachment?: string | null; sign_off_filename?: string | null }): Array<{ filename: string; data: string }> {
  if (row.sign_off_attachments) {
    try {
      const parsed = JSON.parse(row.sign_off_attachments);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to legacy fields below
    }
  }

  if (row.sign_off_attachment && row.sign_off_filename) {
    return [{ filename: row.sign_off_filename, data: row.sign_off_attachment }];
  }

  return [];
}

// GET /api/pcr/:id - Get specific PCR report (must be before GET / to avoid route conflicts)
router.get('/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // First fetch the report without filtering by created_by
    const report = db.prepare(`
      SELECT * FROM pcr_reports
      WHERE id = ?
    `).get(id) as any;

    if (!report) {
      return res.status(404).json({ success: false, message: 'PCR report not found' });
    }

    const isOwner = report.created_by === req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Allow: admin can view any report, owners can view their own
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Once a report is approved (or completed, which only follows approved), the owner
    // loses visibility into it (admin retains access)
    if (!isAdmin && (report.status === 'approved' || report.status === 'completed')) {
      return res.status(403).json({ success: false, message: 'Approved reports are no longer accessible' });
    }

    // Parse form_data JSON
    const reportData = {
      ...report,
      form_data: JSON.parse(report.form_data),
      sign_off_attachments: parseAttachments(report)
    };

    res.json({
      success: true,
      data: reportData
    });

  } catch (error) {
    console.error('Get PCR report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/pcr - Get all PCR reports for current user (admins see all)
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    const isAdmin = req.user!.role === 'admin';

    let query = `
      SELECT
        pcr_reports.id,
        pcr_reports.status,
        pcr_reports.admin_comments,
        pcr_reports.created_at,
        pcr_reports.updated_at,
        pcr_reports.created_by,
        pcr_reports.last_edited_via_temp_login,
        NULLIF(TRIM(json_extract(form_data, '$.reportNumber')), '') AS report_number,
        NULLIF(TRIM(json_extract(form_data, '$.patientName')), '') AS patient_name,
        users.first_name AS creator_first_name,
        users.last_name AS creator_last_name,
        users.username AS creator_username
      FROM pcr_reports
      LEFT JOIN users ON pcr_reports.created_by = users.id
      `;
    const params: any[] = [];

    // Admins see all submitted/approved/changes-requested/completed/cancelled + their own
    // drafts; regular users see only their own, and lose visibility into their own reports
    // once approved (and, by extension, once a completed report moves past approved).
    if (isAdmin) {
      query += ` WHERE (pcr_reports.status IN ('submitted', 'approved', 'changes_requested', 'completed', 'cancelled') OR pcr_reports.created_by = ?)`;
      params.push(req.user!.id);
    } else {
      query += ` WHERE pcr_reports.created_by = ? AND pcr_reports.status NOT IN ('approved', 'completed')`;
      params.push(req.user!.id);
    }

    if (status) {
      query += ' AND pcr_reports.status = ?';
      params.push(status);
    }

    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200);
    const offsetNum = Math.max(parseInt(offset as string, 10) || 0, 0);

    query += ' ORDER BY pcr_reports.updated_at DESC LIMIT ? OFFSET ?';
    params.push(limitNum, offsetNum);

    const reports = db.prepare(query).all(...params);

    res.json({
      success: true,
      data: reports
    });

  } catch (error) {
    console.error('Get PCR reports error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/pcr - Create new PCR report. blockTempLogin: a delegate signed
// in with a temporary login may fix up an existing report but never starts
// a new one.
router.post('/', authenticateToken, blockTempLogin, logActivity('create_pcr', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { form_data, status = 'draft', sign_off_attachments } = req.body;

    if (!form_data || typeof form_data !== 'object' || Array.isArray(form_data)) {
      return res.status(400).json({ success: false, message: 'Form data required' });
    }

    if (!CREATABLE_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const reportId = generateId();

    db.prepare(`
      INSERT INTO pcr_reports (id, form_data, sign_off_attachments, status, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      reportId,
      JSON.stringify(form_data),
      sign_off_attachments && sign_off_attachments.length > 0 ? JSON.stringify(sign_off_attachments) : null,
      status,
      req.user!.id
    );

    const newReport = db.prepare('SELECT * FROM pcr_reports WHERE id = ?').get(reportId) as any;

    res.status(201).json({
      success: true,
      data: {
        ...newReport,
        form_data: JSON.parse(newReport.form_data),
        sign_off_attachments: parseAttachments(newReport)
      }
    });

  } catch (error) {
    console.error('Create PCR report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/pcr/:id - Update PCR report
router.put('/:id', authenticateToken, logActivity('update_pcr', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { form_data, status, sign_off_attachments } = req.body;

    // Fetch report without filtering by created_by
    const existingReport = db.prepare(`
      SELECT id, status, created_by FROM pcr_reports
      WHERE id = ?
    `).get(id) as any;

    if (!existingReport) {
      return res.status(404).json({ success: false, message: 'PCR report not found' });
    }

    const isOwner = existingReport.created_by === req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Allow: admin OR owner can update
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Completed/cancelled reports are locked for everyone, including admins - they're
    // view-only (PDF) until the retention cleanup job removes them a week later
    if (existingReport.status === 'completed' || existingReport.status === 'cancelled') {
      return res.status(403).json({ success: false, message: 'This report is locked and cannot be edited' });
    }

    // Regular users can only edit drafts and reports the admin sent back for changes -
    // submitted/approved reports are locked for non-admins
    if (!isAdmin && existingReport.status !== 'draft' && existingReport.status !== 'changes_requested') {
      return res.status(403).json({ success: false, message: 'This report cannot be edited' });
    }

    if (form_data !== undefined && (typeof form_data !== 'object' || form_data === null || Array.isArray(form_data))) {
      return res.status(400).json({ success: false, message: 'Form data must be an object' });
    }

    if (status !== undefined && !CREATABLE_STATUSES.has(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    // Update report
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    if (form_data) {
      updateFields.push('form_data = ?');
      updateValues.push(JSON.stringify(form_data));
    }

    if (status) {
      updateFields.push('status = ?');
      updateValues.push(status);

      // Resubmitting (or an admin re-saving as submitted) clears any prior
      // change-request feedback - it's no longer pending action.
      if (status === 'submitted') {
        updateFields.push('admin_comments = NULL');
      }
    }

    // Handle sign-off attachments - allow setting to an empty array to remove
    // them all. Also clears the legacy single-attachment columns so a report
    // that started with an old-style attachment doesn't keep showing it
    // alongside the new list once it's been edited.
    if (sign_off_attachments !== undefined) {
      updateFields.push('sign_off_attachments = ?');
      updateValues.push(sign_off_attachments && sign_off_attachments.length > 0 ? JSON.stringify(sign_off_attachments) : null);
      updateFields.push('sign_off_attachment = NULL', 'sign_off_filename = NULL');
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    // Always reflects the session that made *this* edit - a normal edit by
    // the owner/admin after a delegate's fix clears it back to 0, same as
    // it would flip to 1 if a delegate edits next.
    updateFields.push('last_edited_via_temp_login = ?');
    updateValues.push(req.user!.viaTempLogin ? 1 : 0);
    updateValues.push(id);

    db.prepare(`
      UPDATE pcr_reports
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `).run(...updateValues);

    // Get updated report
    const updatedReport = db.prepare('SELECT * FROM pcr_reports WHERE id = ?').get(id) as any;

    res.json({
      success: true,
      data: {
        ...updatedReport,
        form_data: JSON.parse(updatedReport.form_data),
        sign_off_attachments: parseAttachments(updatedReport)
      }
    });

  } catch (error) {
    console.error('Update PCR report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/pcr/:id/approve - Approve a submitted (or changes-requested) PCR report (admin only)
router.put('/:id/approve', authenticateToken, logActivity('approve_pcr', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Admin only
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const report = db.prepare('SELECT id, status FROM pcr_reports WHERE id = ?').get(id) as any;

    if (!report) {
      return res.status(404).json({ success: false, message: 'PCR report not found' });
    }

    if (report.status !== 'submitted' && report.status !== 'changes_requested') {
      return res.status(400).json({ success: false, message: 'Only submitted or changes-requested reports can be approved' });
    }

    // Approving directly from changes_requested (skipping resubmission) means
    // that feedback is no longer pending action - clear it, same as a resubmit does.
    db.prepare(`
      UPDATE pcr_reports SET status = 'approved', admin_comments = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    const updatedReport = db.prepare('SELECT * FROM pcr_reports WHERE id = ?').get(id) as any;

    res.json({
      success: true,
      data: {
        ...updatedReport,
        form_data: JSON.parse(updatedReport.form_data),
        sign_off_attachments: parseAttachments(updatedReport)
      }
    });

  } catch (error) {
    console.error('Approve PCR report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/pcr/:id/complete - Mark an approved PCR report as completed (admin only).
// Completion means the admin has downloaded the PDF and uploaded it to Microsoft
// Teams; completed reports keep read-only access (View PDF only) until the retention
// cleanup job removes them a week later.
router.put('/:id/complete', authenticateToken, logActivity('complete_pcr', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Admin only
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const report = db.prepare('SELECT id, status FROM pcr_reports WHERE id = ?').get(id) as any;

    if (!report) {
      return res.status(404).json({ success: false, message: 'PCR report not found' });
    }

    if (report.status !== 'approved') {
      return res.status(400).json({ success: false, message: 'Only approved reports can be completed' });
    }

    db.prepare(`
      UPDATE pcr_reports SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    const updatedReport = db.prepare('SELECT * FROM pcr_reports WHERE id = ?').get(id) as any;

    res.json({
      success: true,
      data: {
        ...updatedReport,
        form_data: JSON.parse(updatedReport.form_data),
        sign_off_attachments: parseAttachments(updatedReport)
      }
    });

  } catch (error) {
    console.error('Complete PCR report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/pcr/:id/cancel - Cancel a submitted PCR report that's no longer needed
// (admin only). Cancelled reports keep read-only access (View PDF only) until the
// retention cleanup job removes them a week later, and are never counted in stats.
router.put('/:id/cancel', authenticateToken, logActivity('cancel_pcr', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Admin only
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const report = db.prepare('SELECT id, status FROM pcr_reports WHERE id = ?').get(id) as any;

    if (!report) {
      return res.status(404).json({ success: false, message: 'PCR report not found' });
    }

    if (report.status !== 'submitted') {
      return res.status(400).json({ success: false, message: 'Only submitted reports can be cancelled' });
    }

    db.prepare(`
      UPDATE pcr_reports SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);

    const updatedReport = db.prepare('SELECT * FROM pcr_reports WHERE id = ?').get(id) as any;

    res.json({
      success: true,
      data: {
        ...updatedReport,
        form_data: JSON.parse(updatedReport.form_data),
        sign_off_attachments: parseAttachments(updatedReport)
      }
    });

  } catch (error) {
    console.error('Cancel PCR report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/pcr/:id/request-changes - Send a submitted PCR report back to its owner
// with feedback instead of approving it (admin only), or update the comments on a
// report that's already changes_requested. The owner can then edit and resubmit the
// report; resubmitting clears admin_comments (see PUT /:id above).
router.put('/:id/request-changes', authenticateToken, logActivity('request_changes_pcr', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { comments } = req.body;

    // Admin only
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    if (typeof comments !== 'string' || !comments.trim()) {
      return res.status(400).json({ success: false, message: 'Comments are required when requesting changes' });
    }

    const report = db.prepare('SELECT id, status FROM pcr_reports WHERE id = ?').get(id) as any;

    if (!report) {
      return res.status(404).json({ success: false, message: 'PCR report not found' });
    }

    // Allow both the initial request (from submitted) and updating the comments
    // while the report is still sitting in changes_requested, waiting on the submitter.
    if (report.status !== 'submitted' && report.status !== 'changes_requested') {
      return res.status(400).json({ success: false, message: 'Only submitted or pending-changes reports can have changes requested' });
    }

    db.prepare(`
      UPDATE pcr_reports SET status = 'changes_requested', admin_comments = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(comments.trim(), id);

    const updatedReport = db.prepare('SELECT * FROM pcr_reports WHERE id = ?').get(id) as any;

    res.json({
      success: true,
      data: {
        ...updatedReport,
        form_data: JSON.parse(updatedReport.form_data),
        sign_off_attachments: parseAttachments(updatedReport)
      }
    });

  } catch (error) {
    console.error('Request changes PCR report error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/pcr/:id - Delete PCR report (drafts and submissions)
router.delete('/:id', authenticateToken, logActivity('delete_pcr', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Load report (don't filter by created_by here so admins can act too)
    const report = db.prepare(`
      SELECT id, status, created_by
      FROM pcr_reports
      WHERE id = ?
    `).get(id) as any;

    if (!report) {
      return res.status(404).json({ success: false, message: 'PCR report not found' });
    }

    const isOwner = report.created_by === req.user!.id;
    const isAdmin = req.user!.role === 'admin';

    // Allow: owner or admin
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    // Manual deletion is only ever allowed while a report is still a draft - once
    // submitted, a report can only leave the system via Complete/Cancel followed by
    // the retention cleanup job a week later (not even admins can delete it directly).
    if (report.status !== 'draft') {
      return res.status(403).json({ success: false, message: 'Only draft reports can be deleted' });
    }

    // If there are child rows, delete them first or ensure FK ON DELETE CASCADE
    db.prepare('DELETE FROM pcr_reports WHERE id = ?').run(id);

    return res.json({ success: true, message: 'PCR report deleted' });
  } catch (error) {
    console.error('Delete PCR report error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/submissions - Submit PCR (for compatibility with frontend).
// blockTempLogin: this always creates a brand-new report, same as POST /.
router.post('/submit', authenticateToken, blockTempLogin, logActivity('submit_pcr', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: formData, sign_off_attachments } = req.body;

    if (!formData) {
      return res.status(400).json({ success: false, message: 'Form data required' });
    }

    const reportId = generateId();

    // Create as submitted report with optional sign-off attachments
    db.prepare(`
      INSERT INTO pcr_reports (id, form_data, sign_off_attachments, status, created_by)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      reportId,
      JSON.stringify(formData),
      sign_off_attachments && sign_off_attachments.length > 0 ? JSON.stringify(sign_off_attachments) : null,
      'submitted',
      req.user!.id
    );

    res.status(201).json({
      success: true,
      data: {
        id: reportId,
        message: 'PCR submitted successfully'
      }
    });

  } catch (error) {
    console.error('Submit PCR error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Admin endpoints for cleanup management
// GET /api/pcr/cleanup/preview - Preview what will be cleaned up
router.get('/cleanup/preview', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const preview = cleanupService.getCleanupPreview();

    res.json({
      success: true,
      data: {
        reportsToDelete: preview.pcrCount,
        oldestReportDate: preview.oldestPCRDate,
        logsToDelete: preview.logsCount,
        oldestLogDate: preview.oldestLogDate,
        pcrRetentionPeriod: '730 days',
        logRetentionPeriod: '7 days'
      }
    });

  } catch (error) {
    console.error('Get cleanup preview error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/pcr/cleanup/run - Manually trigger cleanup
router.post('/cleanup/run', authenticateToken, logActivity('manual_cleanup', 'pcr_report'), (req: AuthenticatedRequest, res: Response) => {
  try {
    // Check if user is admin
    if (req.user!.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const result = cleanupService.manualCleanup();

    res.json({
      success: true,
      data: {
        deletedPCRCount: result.deletedPCRCount,
        deletedLogsCount: result.deletedLogsCount,
        message: `Successfully deleted ${result.deletedPCRCount} PCR report(s) older than 730 days and ${result.deletedLogsCount} log(s) older than 7 days`
      }
    });

  } catch (error) {
    console.error('Manual cleanup error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/pcr/stats/mine - Current user's own finalized calls (for calendar/season stats)
router.get('/stats/mine', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const rows = db.prepare(`
      SELECT id,
        json_extract(form_data, '$.date') AS date,
        json_extract(form_data, '$.supervisor') AS supervisor,
        COALESCE(
          json_extract(form_data, '$.responders'),
          json_array(
            json_extract(form_data, '$.responder1'),
            json_extract(form_data, '$.responder2'),
            json_extract(form_data, '$.responder3')
          )
        ) AS responders
      FROM pcr_reports
      WHERE created_by = ? AND status IN ('submitted', 'approved', 'completed')
      UNION ALL
      SELECT id, date, supervisor,
        COALESCE(responders, json_array(responder1, responder2, responder3))
      FROM pcr_call_archive
      WHERE created_by = ?
      ORDER BY date
    `).all(userId, userId);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get my PCR stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/pcr/stats/next-call-number?date=YYYY-MM-DD - Next sequential call
// number for a given call date, based on every draft/submitted PCR (across
// all users) already using that date - so it starts back at 001 once the
// date rolls over past midnight.
router.get('/stats/next-call-number', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, message: 'date query parameter is required' });
    }

    const result = db.prepare(`
      SELECT MAX(CAST(json_extract(form_data, '$.callNumber') AS INTEGER)) AS maxCallNumber
      FROM pcr_reports
      WHERE status IN ('draft', 'submitted')
        AND json_extract(form_data, '$.date') = ?
    `).get(date) as { maxCallNumber: number | null };

    const next = (result.maxCallNumber || 0) + 1;
    const callNumber = String(next).padStart(3, '0');

    res.json({ success: true, data: { callNumber } });
  } catch (error) {
    console.error('Get next call number error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/pcr/stats/pending-approval-count - Count of PCRs awaiting approval (admin only)
router.get('/stats/pending-approval-count', authenticateToken, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = db.prepare(`
      SELECT COUNT(*) AS count FROM pcr_reports WHERE status = 'submitted'
    `).get() as { count: number };

    res.json({ success: true, data: { count: result.count } });
  } catch (error) {
    console.error('Get pending approval count error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/pcr/stats/submitted-range - De-identified submitted-but-not-yet-approved call data for a date range (admin only)
router.get('/stats/submitted-range', authenticateToken, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start, end } = req.query;
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;

    if (typeof start !== 'string' || typeof end !== 'string' || !dateRe.test(start) || !dateRe.test(end)) {
      return res.status(400).json({ success: false, message: 'start and end query params (YYYY-MM-DD) are required' });
    }

    const rows = db.prepare(`
      SELECT id,
        json_extract(form_data, '$.date') AS date,
        json_extract(form_data, '$.reportNumber') AS report_number,
        json_extract(form_data, '$.chiefComplaint') AS chief_complaint,
        json_extract(form_data, '$.timeNotified') AS time_notified,
        json_extract(form_data, '$.onScene') AS on_scene,
        json_extract(form_data, '$.clearedScene') AS cleared_scene,
        json_extract(form_data, '$.patientCareTransferred') AS patient_care_transferred,
        json_extract(form_data, '$.oxygenProtocol.oxygen_given') AS oxygen_given,
        json_extract(form_data, '$.supervisor') AS supervisor,
        COALESCE(
          json_extract(form_data, '$.responders'),
          json_array(
            json_extract(form_data, '$.responder1'),
            json_extract(form_data, '$.responder2'),
            json_extract(form_data, '$.responder3')
          )
        ) AS responders
      FROM pcr_reports
      WHERE status = 'submitted' AND json_extract(form_data, '$.date') BETWEEN ? AND ?
      UNION ALL
      SELECT id, date, report_number, chief_complaint, time_notified, on_scene, cleared_scene,
        patient_care_transferred, oxygen_given, supervisor,
        COALESCE(responders, json_array(responder1, responder2, responder3))
      FROM pcr_call_archive
      WHERE status = 'submitted' AND date BETWEEN ? AND ?
      ORDER BY date
    `).all(start, end, start, end);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get submitted-range PCR stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/pcr/stats/potential-duplicates - Flags other draft/submitted PCRs
// that share at least 2 of {reportNumber, callNumber, patientName, date} with
// the one currently being filled in, so two responders (or the same one
// twice) don't end up logging the same call as separate reports. Scans
// across all users, not just the caller's own - the whole point is to catch
// a colleague who already started the same call on this shared laptop.
router.get('/stats/potential-duplicates', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reportNumber, callNumber, patientName, date, excludeId } = req.query;

    const norm = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');

    const candidate = {
      reportNumber: norm(reportNumber),
      callNumber: norm(callNumber),
      patientName: norm(patientName),
      date: norm(date),
    };

    // Nothing meaningful to compare against yet
    if (!candidate.reportNumber && !candidate.callNumber && !candidate.patientName && !candidate.date) {
      return res.json({ success: true, data: [] });
    }

    let query = `
      SELECT
        pcr_reports.id,
        pcr_reports.status,
        pcr_reports.updated_at,
        json_extract(form_data, '$.reportNumber') AS report_number,
        json_extract(form_data, '$.callNumber') AS call_number,
        json_extract(form_data, '$.patientName') AS patient_name,
        json_extract(form_data, '$.date') AS date,
        users.first_name AS creator_first_name,
        users.last_name AS creator_last_name
      FROM pcr_reports
      LEFT JOIN users ON pcr_reports.created_by = users.id
      WHERE pcr_reports.status IN ('draft', 'submitted')
    `;
    const params: any[] = [];

    if (typeof excludeId === 'string' && excludeId) {
      query += ' AND pcr_reports.id != ?';
      params.push(excludeId);
    }

    const rows = db.prepare(query).all(...params) as Array<{
      id: string;
      status: string;
      updated_at: string;
      report_number: string | null;
      call_number: string | null;
      patient_name: string | null;
      date: string | null;
      creator_first_name: string | null;
      creator_last_name: string | null;
    }>;

    const matches = rows
      .map(row => {
        const matchedFields: string[] = [];
        if (candidate.reportNumber && candidate.reportNumber === norm(row.report_number)) matchedFields.push('reportNumber');
        if (candidate.callNumber && candidate.callNumber === norm(row.call_number)) matchedFields.push('callNumber');
        if (candidate.patientName && candidate.patientName === norm(row.patient_name)) matchedFields.push('patientName');
        if (candidate.date && candidate.date === norm(row.date)) matchedFields.push('date');
        return { row, matchedFields };
      })
      // At least 2 fields must match. Date-matching pairs are sorted first
      // below rather than required outright, since a report logged just
      // after midnight for a call from the day before is still worth flagging.
      .filter(({ matchedFields }) => matchedFields.length >= 2)
      .sort((a, b) => {
        const aHasDate = a.matchedFields.includes('date') ? 1 : 0;
        const bHasDate = b.matchedFields.includes('date') ? 1 : 0;
        if (aHasDate !== bHasDate) return bHasDate - aHasDate;
        if (a.matchedFields.length !== b.matchedFields.length) return b.matchedFields.length - a.matchedFields.length;
        return new Date(b.row.updated_at).getTime() - new Date(a.row.updated_at).getTime();
      })
      .slice(0, 5)
      // patientName is used above to decide *whether* something matches, but
      // is never included in the response below - patient names are PHI, and
      // a match can legitimately fire on the other 3 fields alone, in which
      // case the other report's patient could be someone else entirely. The
      // nudge only needs to say a match exists and roughly why, not who.
      .map(({ row, matchedFields }) => ({
        id: row.id,
        status: row.status,
        matchedFields,
        reportNumber: row.report_number,
        callNumber: row.call_number,
        date: row.date,
        updatedAt: row.updated_at,
        creatorFirstName: row.creator_first_name,
        creatorLastName: row.creator_last_name,
      }));

    res.json({ success: true, data: matches });
  } catch (error) {
    console.error('Get potential duplicates error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;