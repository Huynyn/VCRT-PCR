import { Router, Response } from 'express';
import db from '../database';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { logActivity } from '../middleware/logger';

const router = Router();

function generateId(): string {
  return 'pcreq_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// POST /api/profile-requests - a user asks an admin to change their name/password
router.post('/', authenticateToken, logActivity('request_profile_change', 'user'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message } = req.body;
    if (!message || !String(message).trim()) {
      return res.status(400).json({ success: false, message: 'Please describe what you would like changed' });
    }

    // Only one open request at a time per user, so the admin queue doesn't
    // fill up with duplicates from someone re-clicking the button.
    const existing = db
      .prepare(`SELECT id FROM profile_change_requests WHERE user_id = ? AND status = 'pending'`)
      .get(req.user!.id);
    if (existing) {
      return res.status(409).json({ success: false, message: 'You already have a pending request awaiting admin review' });
    }

    const id = generateId();
    db.prepare(`
      INSERT INTO profile_change_requests (id, user_id, message)
      VALUES (?, ?, ?)
    `).run(id, req.user!.id, String(message).trim());

    res.status(201).json({
      success: true,
      data: { id, message: String(message).trim(), status: 'pending' },
      message: 'Request sent to an administrator',
    });
  } catch (error) {
    console.error('Create profile change request error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/profile-requests/mine - the current user's own pending request, if any
router.get('/mine', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const row = db
      .prepare(`
        SELECT id, message, status, created_at FROM profile_change_requests
        WHERE user_id = ? AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1
      `)
      .get(req.user!.id);

    res.json({ success: true, data: row || null });
  } catch (error) {
    console.error('Get my profile change request error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/profile-requests - admin: list pending requests (for the notification bell)
router.get('/', authenticateToken, requireRole(['admin']), (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = db
      .prepare(`
        SELECT
          profile_change_requests.id,
          profile_change_requests.message,
          profile_change_requests.status,
          profile_change_requests.created_at,
          users.id AS user_id,
          users.first_name,
          users.last_name,
          users.username
        FROM profile_change_requests
        LEFT JOIN users ON profile_change_requests.user_id = users.id
        WHERE profile_change_requests.status = 'pending'
        ORDER BY profile_change_requests.created_at DESC
      `)
      .all();

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Get profile change requests error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/profile-requests/:id/resolve - admin: dismiss once handled (e.g. via User Management)
router.put(
  '/:id/resolve',
  authenticateToken,
  requireRole(['admin']),
  logActivity('resolve_profile_change_request', 'user'),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = db
        .prepare(`
          UPDATE profile_change_requests
          SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, resolved_by = ?
          WHERE id = ? AND status = 'pending'
        `)
        .run(req.user!.id, id);

      if (result.changes === 0) {
        return res.status(404).json({ success: false, message: 'Request not found or already resolved' });
      }

      res.json({ success: true, message: 'Request marked resolved' });
    } catch (error) {
      console.error('Resolve profile change request error:', error);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

export default router;
