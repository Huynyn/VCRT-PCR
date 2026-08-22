import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../database';
import { JWT_SECRET } from '../utils/jwt';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    // True when this session was established with the account's secondary
    // "temporary login" password rather than its real one - a delegate
    // standing in for the account owner. Carried in the JWT itself (see
    // routes/auth.ts), not derived from the DB, since it's a property of
    // this particular session, not the account.
    viaTempLogin?: boolean;
  };
}

export const authenticateToken = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Verify user still exists and is active
    const user = db.prepare('SELECT id, username, role, is_active, temp_login_enabled FROM users WHERE id = ?').get(decoded.userId) as any;

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive user' });
    }

    // A temp-login session's validity is re-checked against the account's
    // *current* setting on every request (not just re-derived once at login)
    // so turning the toggle off immediately cuts off an already-issued
    // delegate token instead of waiting out its 24h expiry.
    if (decoded.viaTempLogin && !user.temp_login_enabled) {
      return res.status(401).json({ success: false, message: 'Temporary login has been turned off' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      viaTempLogin: !!decoded.viaTempLogin,
    };

    next();
  } catch (error) {
    // 401 (not authenticated), not 403 (authenticated but forbidden) - this
    // is what an expired or otherwise invalid token is. Keeping it distinct
    // from the 403s that requireRole()/ownership checks return elsewhere in
    // the app lets the frontend safely treat 401 alone as "session is no
    // longer valid, redirect to login" without also catching ordinary
    // permission-denied responses.
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }

    next();
  };
};

// Blocks a temp-login delegate session from routes it shouldn't reach (e.g.
// creating a new PCR, or managing the temp-login setting itself) - a
// delegate may only edit an existing report, not everything the account
// owner can normally do.
export const blockTempLogin = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  if (req.user.viaTempLogin) {
    return res.status(403).json({ success: false, message: 'Not available with a temporary login' });
  }

  next();
};