import { Router, Response } from 'express';
import db from '../database';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { logActivity } from '../middleware/logger';

const router = Router();

function generateId(): string {
  return 'psm_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// GET /api/psm-members - List all PSM members (any authenticated user, for the PCR form dropdown)
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const psmMembers = db.prepare('SELECT id, name FROM psm_members ORDER BY name COLLATE NOCASE').all();
    res.json({ success: true, data: psmMembers });
  } catch (error) {
    console.error('Get PSM members error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/psm-members - Add a PSM member (admin only)
router.post('/', authenticateToken, requireRole(['admin']), logActivity('create_psm_member', 'psm_member'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const trimmedName = name.trim();
    const existing = db.prepare('SELECT id FROM psm_members WHERE name = ?').get(trimmedName);
    if (existing) {
      return res.status(400).json({ success: false, message: 'A PSM member with that name already exists' });
    }

    const id = generateId();
    db.prepare('INSERT INTO psm_members (id, name) VALUES (?, ?)').run(id, trimmedName);

    res.status(201).json({ success: true, data: { id, name: trimmedName } });
  } catch (error) {
    console.error('Create PSM member error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/psm-members/:id - Rename a PSM member (admin only)
router.put('/:id', authenticateToken, requireRole(['admin']), logActivity('update_psm_member', 'psm_member'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const existing = db.prepare('SELECT id FROM psm_members WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'PSM member not found' });
    }

    const trimmedName = name.trim();
    const duplicate = db.prepare('SELECT id FROM psm_members WHERE name = ? AND id != ?').get(trimmedName, id);
    if (duplicate) {
      return res.status(400).json({ success: false, message: 'A PSM member with that name already exists' });
    }

    db.prepare('UPDATE psm_members SET name = ? WHERE id = ?').run(trimmedName, id);

    res.json({ success: true, data: { id, name: trimmedName } });
  } catch (error) {
    console.error('Update PSM member error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/psm-members/:id - Remove a PSM member (admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), logActivity('delete_psm_member', 'psm_member'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM psm_members WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'PSM member not found' });
    }

    res.json({ success: true, message: 'PSM member deleted' });
  } catch (error) {
    console.error('Delete PSM member error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
