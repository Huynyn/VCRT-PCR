import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../database';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { logActivity } from '../middleware/logger';
import { validatePasswordStrength } from '../utils/password';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'pcr-dev-secret-key';

const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

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
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Locked out from too many recent failed attempts?
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      return res.status(429).json({ success: false, message: lockoutMessage(user.locked_until) });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      const attempts = (user.failed_login_attempts || 0) + 1;

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        const lockedUntil = new Date(Date.now() + LOCKOUT_MS).toISOString();
        db.prepare('UPDATE users SET failed_login_attempts = 0, locked_until = ? WHERE id = ?').run(lockedUntil, user.id);
        return res.status(429).json({ success: false, message: lockoutMessage(lockedUntil) });
      }

      db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, user.id);
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
        'login',
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
      { userId: user.id, username: user.username, role: user.role },
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
      lastLogin: user.last_login
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
      lastLogin: user.last_login
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

export default router;