import { Router } from 'express'
import { authenticateToken, requireRole, AuthenticatedRequest } from '../middleware/auth'
import { logActivity } from '../middleware/logger'
import db from '../database'
import { ActivityLog, PaginatedResponse } from '../../../shared/types'

const router = Router()

// DELETE /api/logs/cleanup - Manually delete activity logs older than 1 week (admin only)
router.delete('/cleanup', authenticateToken, requireRole(['admin']), logActivity('cleanup_activity_logs', 'activity_logs'), (req: AuthenticatedRequest, res) => {
  try {
    const result = db.prepare(`
      DELETE FROM activity_logs
      WHERE datetime(created_at) < datetime('now', '-7 days')
    `).run()

    res.json({ success: true, data: { deletedCount: result.changes } })
  } catch (error) {
    console.error('Error cleaning up activity logs:', error)
    res.status(500).json({ success: false, message: 'Failed to clean up activity logs' })
  }
})

router.get('/', authenticateToken, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      sortBy = 'created_at',
      sortOrder = 'desc',
      action,
      user_id,
      username, // ✅ OPTION 2: add username filter
      dateFrom,
      dateTo,
    } = req.query

    const pageNum = Math.max(parseInt(page as string, 10) || 1, 1)
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200)
    const offset = (pageNum - 1) * limitNum

    const whereConditions: string[] = []
    const queryParams: any[] = []

    if (action) {
      whereConditions.push('al.action = ?')
      queryParams.push(action)
    }

    if (user_id) {
      whereConditions.push('al.user_id = ?')
      queryParams.push(user_id)
    }

    if (username) {
      whereConditions.push('u.username = ?')
      queryParams.push(username)
    }

    if (dateFrom) {
      whereConditions.push('al.created_at >= ?')
      queryParams.push(dateFrom)
    }

    if (dateTo) {
      whereConditions.push('al.created_at <= ?')
      queryParams.push(dateTo)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const sortMap: Record<string, string> = {
      created_at: 'al.created_at',
      action: 'al.action',
      username: 'u.username',
    }
    const sortExpr = sortMap[String(sortBy)] ?? 'al.created_at'
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC'

    // Get total count (same WHERE, same JOIN)
    const countQuery = `
      SELECT COUNT(*) as total
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
    `
    const countResult = db.prepare(countQuery).get(...queryParams) as { total: number }
    const totalCount = countResult.total

    // Get paginated logs with user info
    const logsQuery = `
      SELECT
        al.id,
        al.user_id,
        u.username,
        u.first_name,
        u.last_name,
        al.action,
        al.resource_type,
        al.resource_id,
        al.details,
        al.ip_address,
        al.user_agent,
        al.created_at
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDirection}
      LIMIT ? OFFSET ?
    `

    const logsParams = [...queryParams, limitNum, offset]
    const logs = db.prepare(logsQuery).all(...logsParams) as ActivityLog[]

    const response: PaginatedResponse<ActivityLog> = {
      items: logs,
      totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
    }

    res.json(response)
  } catch (error) {
    console.error('Error fetching activity logs:', error)
    res.status(500).json({ error: 'Failed to fetch activity logs' })
  }
})

// Get activity log statistics
router.get('/stats', authenticateToken, requireRole(['admin']), (req: AuthenticatedRequest, res) => {
  try {
    const { dateFrom, dateTo } = req.query

    const whereConditions: string[] = []
    const queryParams: any[] = []

    if (dateFrom) {
      whereConditions.push('created_at >= ?')
      queryParams.push(dateFrom)
    }

    if (dateTo) {
      whereConditions.push('created_at <= ?')
      queryParams.push(dateTo)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const actionStatsQuery = `
      SELECT action, COUNT(*) as count
      FROM activity_logs
      ${whereClause}
      GROUP BY action
      ORDER BY count DESC
    `
    const actionStats = db.prepare(actionStatsQuery).all(...queryParams)

    const userStatsQuery = `
      SELECT
        al.user_id,
        u.username,
        u.first_name,
        u.last_name,
        COUNT(*) as activity_count
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereClause}
      GROUP BY al.user_id, u.username, u.first_name, u.last_name
      ORDER BY activity_count DESC
      LIMIT 10
    `
    const userStats = db.prepare(userStatsQuery).all(...queryParams)

    const recentActivityQuery = `
      SELECT
        DATE(created_at) as date,
        COUNT(*) as count
      FROM activity_logs
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 7
    `
    const recentActivity = db.prepare(recentActivityQuery).all(...queryParams)

    res.json({
      actionStats,
      userStats,
      recentActivity,
    })
  } catch (error) {
    console.error('Error fetching activity log stats:', error)
    res.status(500).json({ error: 'Failed to fetch activity log statistics' })
  }
})

export default router