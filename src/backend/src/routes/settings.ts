import { Router, Response } from 'express';
import db from '../database';
import { authenticateToken, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { logActivity } from '../middleware/logger';

const router = Router();

// Whitelisted settings keys. Each is a single value (string, or a
// JSON-stringified array for list-shaped settings) stored in the generic
// `settings` key-value table.
const ALLOWED_KEYS = new Set([
  'supply_form_url',
  'sample_pcr_text',
  'debrief_questions',
  'medical_glossary',
]);

const MAX_TEXT_LENGTH = 20000;

function validateValue(key: string, value: unknown): string | null {
  if (value === '' || value == null) return null; // clearing a setting is always allowed

  if (typeof value !== 'string') {
    return 'value must be a string';
  }
  if (value.length > MAX_TEXT_LENGTH) {
    return `value is too long (max ${MAX_TEXT_LENGTH} characters)`;
  }

  if (key === 'supply_form_url') {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return 'Please enter a valid http(s) URL';
      }
    } catch {
      return 'Please enter a valid http(s) URL';
    }
  }

  if (key === 'debrief_questions' || key === 'medical_glossary') {
    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error('not an array');
    } catch {
      return 'value must be a JSON array';
    }
  }

  return null;
}

// GET /api/settings/:key - Read a whitelisted setting (any authenticated user)
router.get('/:key', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) {
      return res.status(404).json({ success: false, message: 'Unknown setting' });
    }

    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;

    res.json({ success: true, data: { value: row?.value ?? null } });
  } catch (error) {
    console.error('Get setting error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/settings/:key - Update a whitelisted setting (admin only)
router.put('/:key', authenticateToken, requireRole(['admin']), logActivity('update_setting', 'settings'), (req: AuthenticatedRequest, res: Response) => {
  try {
    const { key } = req.params;
    if (!ALLOWED_KEYS.has(key)) {
      return res.status(404).json({ success: false, message: 'Unknown setting' });
    }

    const { value } = req.body;
    const validationError = validateValue(key, value);
    if (validationError) {
      return res.status(400).json({ success: false, message: validationError });
    }

    const stored = value === '' || value == null ? null : String(value);

    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, stored);

    res.json({ success: true, data: { value: stored } });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;
