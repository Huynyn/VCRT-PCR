import { Request, Response, NextFunction } from 'express';
import db from '../database';
import { AuthenticatedRequest } from './auth';

export const logActivity = (action: string, resourceType?: string) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalSend = res.send;

    res.send = function(data) {
      // Log activity after successful response
      if (res.statusCode < 400 && req.user) {
        try {
          // For creates, the ID is server-generated and only exists in the
          // response body (routes here all return { success, data: { id } })
          // - req.params/req.body never carry it, so every "create" log
          // entry ended up with resource_id: null without this fallback.
          const resourceId = req.params.id || req.body?.id || extractResponseId(data) || null;

          db.prepare(`
            INSERT INTO activity_logs (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            generateId(),
            req.user.id,
            action,
            resourceType || null,
            resourceId,
            JSON.stringify({
              method: req.method,
              url: req.url,
              statusCode: res.statusCode
            }),
            req.ip,
            req.headers['user-agent'] || null
          );
        } catch (error) {
          console.error('Failed to log activity:', error);
        }
      }

      return originalSend.call(this, data);
    };

    next();
  };
};

// Simple ID generator
function generateId(): string {
  return 'log_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Best-effort extraction of `data.id` from a JSON response body (the shape
// every route in this app responds with: { success, data: { id, ... } }).
function extractResponseId(body: unknown): string | null {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    const id = (parsed as any)?.data?.id;
    return typeof id === 'string' ? id : null;
  } catch {
    return null;
  }
}