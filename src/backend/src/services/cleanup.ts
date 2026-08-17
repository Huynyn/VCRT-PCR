import db from '../database'
import { archivePcrReportsSql } from './pcrArchive'

export class CleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null

  // Configurable retention periods
  private readonly PCR_RETENTION_DAYS = 730
  private readonly LOG_RETENTION_DAYS = 7
  // Completed/cancelled PCRs are only kept around for a week (after that,
  // completed ones are folded into pcr_call_archive first; cancelled ones
  // are just dropped so they never count toward stats)
  private readonly FINALIZED_RETENTION_DAYS = 7

  start(): void {
    // Guard against a second start() without an intervening stop() (e.g. the
    // embedded server restarting within the same process) leaking the
    // previous setInterval handle - it would never get cleared, and cleanup
    // would run duplicated/overlapping every hour from then on.
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    console.log('📅 Starting cleanup service...')

    // Run cleanup immediately on start
    this.runCleanup()

    // Schedule cleanup to run every hour
    this.cleanupInterval = setInterval(() => {
      this.runCleanup()
    }, 60 * 60 * 1000) // 1 hour
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      console.log('📅 Cleanup service stopped')
    }
  }

  private runCleanup(): void {
    try {
      console.log('🧹 Running cleanup...')

      // Delete PCR reports older than configured retention
      const pcrResult = this.cleanupPCRReports()

      // Delete completed/cancelled PCR reports a week after they were finalized
      const finalizedResult = this.cleanupFinalizedReports()

      // Delete activity logs older than configured retention
      const logsResult = this.cleanupActivityLogs()

      if (pcrResult.changes > 0 || finalizedResult.changes > 0 || logsResult.changes > 0) {
        console.log(`🗑️  Deleted ${pcrResult.changes} PCR report(s) older than ${this.PCR_RETENTION_DAYS} days`)
        console.log(`🗑️  Deleted ${finalizedResult.changes} completed/cancelled PCR report(s) older than ${this.FINALIZED_RETENTION_DAYS} days`)
        console.log(`🗑️  Deleted ${logsResult.changes} activity log(s) older than ${this.LOG_RETENTION_DAYS} days`)

        // Log the cleanup activity
        this.logCleanupActivity(pcrResult.changes + finalizedResult.changes, logsResult.changes)
      } else {
        console.log('✅ No records to clean up')
      }

    } catch (error) {
      console.error('❌ Error during cleanup:', error)
    }
  }

  private cleanupPCRReports(): { changes: number } {
    db.prepare(archivePcrReportsSql(`datetime(created_at) < datetime('now', '-${this.PCR_RETENTION_DAYS} days')`)).run()

    const deleteQuery = `
      DELETE FROM pcr_reports
      WHERE status IN ('submitted','draft','approved')
      AND datetime(created_at) < datetime('now', '-${this.PCR_RETENTION_DAYS} days')
    `
    return db.prepare(deleteQuery).run()
  }

  private cleanupFinalizedReports(): { changes: number } {
    const ageCondition = `status IN ('completed', 'cancelled') AND datetime(updated_at) < datetime('now', '-${this.FINALIZED_RETENTION_DAYS} days')`

    // Archive completed rows so their stats survive deletion. archivePcrReportsSql only
    // ever matches 'submitted'/'approved'/'completed' statuses, so cancelled rows are
    // naturally skipped here and simply disappear from stats once deleted below.
    db.prepare(archivePcrReportsSql(ageCondition)).run()

    const deleteQuery = `DELETE FROM pcr_reports WHERE ${ageCondition}`
    return db.prepare(deleteQuery).run()
  }

  private cleanupActivityLogs(): { changes: number } {
    const deleteQuery = `
      DELETE FROM activity_logs
      WHERE datetime(created_at) < datetime('now', '-${this.LOG_RETENTION_DAYS} days')
    `
    return db.prepare(deleteQuery).run()
  }

  private logCleanupActivity(deletedPCRCount: number, deletedLogsCount: number): void {
    try {
      // Create a system activity log entry
      const logId = 'log_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5)

      db.prepare(`
        INSERT INTO activity_logs (id, user_id, action, resource_type, details, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        logId,
        'system', // Use 'system' as user_id for automated tasks
        'cleanup_pcr_reports',
        'pcr_report',
        JSON.stringify({
          deletedPCRCount,
          deletedLogsCount,
          pcrRetention: `${this.PCR_RETENTION_DAYS}_day_retention`,
          logRetention: `${this.LOG_RETENTION_DAYS}_day_retention`
        })
      )
    } catch (error) {
      console.error('Failed to log cleanup activity:', error)
    }
  }

  // Manual cleanup method for testing or admin use
  manualCleanup(): { deletedPCRCount: number; deletedLogsCount: number } {
    try {
      console.log('🧹 Running manual cleanup...')

      // Delete PCR reports older than configured retention. Status list
      // matches cleanupPCRReports() above (the scheduled job) - including
      // 'draft' - so a preview/manual run reports the same thing the
      // automatic hourly job would actually do, instead of only showing
      // submitted/approved and silently leaving old drafts out of the count.
      const ageCondition = `datetime(created_at) < datetime('now', '-${this.PCR_RETENTION_DAYS} days')`
      db.prepare(archivePcrReportsSql(ageCondition)).run()

      const pcrDeleteQuery = `
        DELETE FROM pcr_reports
        WHERE status IN ('submitted','draft','approved')
        AND ${ageCondition}
      `
      const pcrResult = db.prepare(pcrDeleteQuery).run()

      // Delete activity logs older than configured retention
      const logsDeleteQuery = `
        DELETE FROM activity_logs
        WHERE datetime(created_at) < datetime('now', '-${this.LOG_RETENTION_DAYS} days')
      `
      const logsResult = db.prepare(logsDeleteQuery).run()

      if (pcrResult.changes > 0 || logsResult.changes > 0) {
        console.log(`🗑️  Manually deleted ${pcrResult.changes} PCR report(s) older than ${this.PCR_RETENTION_DAYS} days`)
        console.log(`🗑️  Manually deleted ${logsResult.changes} activity log(s) older than ${this.LOG_RETENTION_DAYS} days`)
        this.logCleanupActivity(pcrResult.changes, logsResult.changes)
      }

      return {
        deletedPCRCount: pcrResult.changes,
        deletedLogsCount: logsResult.changes
      }

    } catch (error) {
      console.error('❌ Error during manual cleanup:', error)
      throw error
    }
  }

  // Get count of reports and logs that would be deleted (for preview)
  getCleanupPreview(): {
    pcrCount: number;
    oldestPCRDate: string | null;
    logsCount: number;
    oldestLogDate: string | null;
  } {
    try {
      const pcrQuery = `
        SELECT COUNT(*) as count, MIN(created_at) as oldestDate
        FROM pcr_reports
        WHERE status IN ('submitted','draft','approved')
        AND datetime(created_at) < datetime('now', '-${this.PCR_RETENTION_DAYS} days')
      `
      const pcrResult = db.prepare(pcrQuery).get() as { count: number, oldestDate: string | null }

      const logsQuery = `
        SELECT COUNT(*) as count, MIN(created_at) as oldestDate
        FROM activity_logs
        WHERE datetime(created_at) < datetime('now', '-${this.LOG_RETENTION_DAYS} days')
      `
      const logsResult = db.prepare(logsQuery).get() as { count: number, oldestDate: string | null }

      return {
        pcrCount: pcrResult.count,
        oldestPCRDate: pcrResult.oldestDate,
        logsCount: logsResult.count,
        oldestLogDate: logsResult.oldestDate
      }

    } catch (error) {
      console.error('❌ Error getting cleanup preview:', error)
      throw error
    }
  }
}

// Export singleton instance
export const cleanupService = new CleanupService()
