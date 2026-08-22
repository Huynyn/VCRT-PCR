import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database';
import { authenticateToken, AuthenticatedRequest, blockTempLogin } from '../middleware/auth';
import { logActivity } from '../middleware/logger';
import { validatePasswordStrength } from '../utils/password';
import { JWT_SECRET } from '../utils/jwt';

const router = Router();

const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

// Fixed placeholder hash used to give the "username not found" path a
// bcrypt cost similar to the real comparison below - otherwise a nonexistent
// username returns near-instantly while a real one takes ~50-100ms longer,
// and that timing gap alone lets an attacker enumerate valid usernames
// despite both cases returning the same "Invalid credentials" message.
const TIMING_DEFENSE_HASH = bcrypt.hashSync('pcr-timing-defense-placeholder', 10);

function lockoutMessage(lockedUntil: string): string {
  const remainingMs = new Date(lockedUntil).getTime() - Date.now();
  const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
  return `Too many failed attempts. Try again in ${remainingMin} minute${remainingMin === 1 ? '' : 's'}, or ask an admin to reset your password.`;
}

// Generate simple ID
function generateId(): string {
  return 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Generate simple ID for activity logs
function generateLogId(): string {
  return 'log_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }

    // Get user from database
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username) as any;

    if (!user) {
      await bcrypt.compare(password, TIMING_DEFENSE_HASH);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Locked out from too many recent failed attempts?
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return res.status(429).json({ success: false, message: lockoutMessage(user.locked_until) });
    }

    // Verify password - either the account's real one, or (if the account
    // owner has turned it on) its secondary "temporary login" password, for
    // a delegate standing in to fix up an existing PCR.
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    let viaTempLogin = false;
    if (!isValidPassword && user.temp_login_enabled && user.temp_login_password_hash) {
      viaTempLogin = await bcrypt.compare(password, user.temp_login_password_hash);
    }

    if (!isValidPassword && !viaTempLogin) {
      // Incremented by SQL from the live stored value, not a count read into
      // a JS variable before the `await` above - the await yields the event
      // loop, so concurrent failed attempts reading the same stale count
      // and writing back count+1 could otherwise cancel each other out and
      // let the lockout be bypassed by guessing in parallel batches.
      db.prepare('UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?').run(user.id);
      const { failed_login_attempts: attempts } = db
        .prepare('SELECT failed_login_attempts FROM users WHERE id = ?')
        .get(user.id) as { failed_login_attempts: number };

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
        db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = ? WHERE id = ?').run(lockedUntil, user.id);
        return res.status(429).json({ success: false, message: lockoutMessage(lockedUntil) });
      }

      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Update last login, and clear any lockout state from earlier failed attempts
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, failed_login_attempts = 0, locked_until = NULL WHERE id = ?').run(user.id);

    // Log successful login activity
    try {
      db.prepare(`
        INSERT INTO activity_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        generateLogId(),
        user.id,
        viaTempLogin ? 'login_via_temp_login' : 'login',
        null,
        null,
        JSON.stringify({
          method: req.method,
          url: req.url,
          statusCode: 200
        }),
        req.ip,
        req.headers['user-agent'] || null
      );
    } catch (logError) {
      console.error('Failed to log login activity:', logError);
    }

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, viaTempLogin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user data (without password)
    const userData = {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
      lastLogin: user.last_login,
      viaTempLogin
    };

    res.json({
      success: true,
      data: {
        user: userData,
        token,
        expiresIn: 24 * 60 * 60 // 24 hours in seconds
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticateToken, logActivity('logout'), (req: AuthenticatedRequest, res: Response) => {
  // In a real app, you might invalidate the token in a blacklist
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/profile
router.get('/profile', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    // Get fresh user data
    const user = db.prepare('SELECT id, username, first_name, last_name, role, is_active, created_at, last_login FROM users WHERE id = ?').get(req.user.id) as any;

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
      lastLogin: user.last_login,
      // Session-scoped, not a DB column - carried over from the token
      // rather than re-derived from the `user` row above (see authenticateToken).
      viaTempLogin: req.user.viaTempLogin ?? false
    };

    res.json({
      success: true,
      data: userData
    });

  } catch (error) {
    console.error('Profile error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// POST /api/auth/register (admin only)
router.post('/register', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Only admin can create users
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { username, password, firstName, lastName, role = 'user' } = req.body;

    if (!username || !password || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    // Check if user already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as any;

    if (existingUser) {
      return res.status(409).json({ success: false, message: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const userId = generateId();
    db.prepare(`
      INSERT INTO users (id, username, password_hash, first_name, last_name, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username, passwordHash, firstName, lastName, role);

    res.json({
      success: true,
      data: {
        id: userId,
        username,
        firstName,
        lastName,
        role
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// GET /api/auth/temp-login - current account's own temporary-login setting.
// 'user'-role only (matches who submits PCRs in the first place; admins
// don't), and blocked for a delegate session itself so a delegate can't
// inspect or change it from inside the account they were let into.
router.get('/temp-login', authenticateToken, blockTempLogin, (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Not available for this account type' });
    }

    const row = db.prepare('SELECT temp_login_enabled, temp_login_password_hash FROM users WHERE id = ?').get(req.user!.id) as any;

    res.json({
      success: true,
      data: {
        enabled: !!row?.temp_login_enabled,
        hasPassword: !!row?.temp_login_password_hash
      }
    });
  } catch (error) {
    console.error('Get temp-login setting error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// PUT /api/auth/temp-login - turn the account's temporary login on/off, and
// optionally (re)set its password. Enabling for the first time requires a
// password in the same request, since there's nothing to log in with
// otherwise.
router.put('/temp-login', authenticateToken, blockTempLogin, logActivity('update_temp_login_setting', 'user'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user!.role !== 'user') {
      return res.status(403).json({ success: false, message: 'Not available for this account type' });
    }

    const { enabled, password } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: '"enabled" must be true or false' });
    }

    const current = db.prepare('SELECT temp_login_password_hash FROM users WHERE id = ?').get(req.user!.id) as any;

    if (password) {
      const passwordError = validatePasswordStrength(password);
      if (passwordError) {
        return res.status(400).json({ success: false, message: passwordError });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET temp_login_enabled = ?, temp_login_password_hash = ? WHERE id = ?')
        .run(enabled ? 1 : 0, passwordHash, req.user!.id);
    } else {
      if (enabled && !current?.temp_login_password_hash) {
        return res.status(400).json({ success: false, message: 'Set a password to turn on temporary login' });
      }
      db.prepare('UPDATE users SET temp_login_enabled = ? WHERE id = ?').run(enabled ? 1 : 0, req.user!.id);
    }

    res.json({ success: true, data: { enabled } });
  } catch (error) {
    console.error('Update temp-login setting error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

export default router;