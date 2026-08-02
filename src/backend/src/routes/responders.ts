import { Router, Response } from 'express';
import db from '../database';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { logActivity } from '../middleware/logger';

const router = Router();

function generateId(): string {
  return 'resp_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// GET /api/responders - List all responders (any authenticated user, for the PCR form dropdown)
router.get('/', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const responders = db.prepare('SELECT id, name FROM responders ORDER BY name COLLATE NOCASE').all();
    res.json({ success: true, data: responders });
  } catch (error) {
    console.error('Get responders error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/responders - Add a responder (admin only)
router.post('/', authenticateToken, requireRole(['admin']), logActivity('create_responder', 'responder'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const trimmedName = name.trim();
    const existing = db.prepare('SELECT id FROM responders WHERE name = ?').get(trimmedName);
    if (existing) {
      return res.status(400).json({ success: false, message: 'A responder with that name already exists' });
    }

    const id = generateId();
    db.prepare('INSERT INTO responders (id, name) VALUES (?, ?)').run(id, trimmedName);

    res.status(201).json({ success: true, data: { id, name: trimmedName } });
  } catch (error) {
    console.error('Create responder error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/responders/:id - Rename a responder (admin only)
router.put('/:id', authenticateToken, requireRole(['admin']), logActivity('update_responder', 'responder'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }

    const existing = db.prepare('SELECT id FROM responders WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Responder not found' });
    }

    const trimmedName = name.trim();
    const duplicate = db.prepare('SELECT id FROM responders WHERE name = ? AND id != ?').get(trimmedName, id);
    if (duplicate) {
      return res.status(400).json({ success: false, message: 'A responder with that name already exists' });
    }

    db.prepare('UPDATE responders SET name = ? WHERE id = ?').run(trimmedName, id);

    res.json({ success: true, data: { id, name: trimmedName } });
  } catch (error) {
    console.error('Update responder error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// DELETE /api/responders/:id - Remove a responder (admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), logActivity('delete_responder', 'responder'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = db.prepare('DELETE FROM responders WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, message: 'Responder not found' });
    }

    res.json({ success: true, message: 'Responder deleted' });
  } catch (error) {
    console.error('Delete responder error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
