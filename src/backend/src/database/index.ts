import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { getEncryptionKey, encryptBuffer, decryptBuffer, isEncrypted } from './encryption';
import { DEFAULT_ADMIN_PASSWORD, DEFAULT_USER_PASSWORD } from '../utils/password';

// Electron environment detection
const isElectron = process.env.IS_ELECTRON === 'true';

// Database path: Use env var if in Electron, otherwise use current working directory
const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'app_runtime.dat');

// Embedded schema - avoids file read issues in packaged Electron apps
const SCHEMA_SQL = `
-- PCR Application Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT CHECK (role IN ('admin', 'user')) DEFAULT 'user',
    is_active BOOLEAN DEFAULT true,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TEXT
);

-- PCR Reports/Drafts table (single table for both drafts and completed reports)
CREATE TABLE IF NOT EXISTS pcr_reports (
    id TEXT PRIMARY KEY,
    form_data TEXT NOT NULL,
    sign_off_attachment TEXT,
    sign_off_filename TEXT,
    sign_off_attachments TEXT,
    status TEXT CHECK (status IN ('draft', 'completed', 'submitted', 'approved', 'changes_requested', 'cancelled')) DEFAULT 'draft',
    admin_comments TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Generic key-value store for small admin-configured app settings
-- (e.g. the supply-usage Microsoft Form URL used to generate a QR code).
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin-managed list of responder names, used to populate the searchable
-- responder dropdown on the PCR form (a responder can still be typed in
-- freeform if they're not on this list).
CREATE TABLE IF NOT EXISTS responders (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Admin-managed list of Primary Protection Services Member (PSM) names, used
-- to populate the searchable "Primary PSM" dropdown on the PCR form (a name
-- can still be typed in freeform if they're not on this list).
CREATE TABLE IF NOT EXISTS psm_members (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- De-identified snapshot of finalized PCR reports, written just before a
-- submitted/approved report is deleted (manually or by retention cleanup),
-- so call-stats history survives deletion. No patient name or free-text
-- comments are ever stored here.
CREATE TABLE IF NOT EXISTS pcr_call_archive (
    id TEXT PRIMARY KEY,
    date TEXT,
    status TEXT,
    supervisor TEXT,
    responder1 TEXT,
    responder2 TEXT,
    responder3 TEXT,
    responders TEXT,
    report_number TEXT,
    chief_complaint TEXT,
    time_notified TEXT,
    on_scene TEXT,
    cleared_scene TEXT,
    patient_care_transferred TEXT,
    oxygen_given TEXT,
    created_by TEXT NOT NULL,
    created_at DATETIME,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    details TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Requests from a non-admin user asking an admin to change their name or
-- password (regular users can't change either themselves - see
-- routes/profileRequests.ts). Surfaced to admins via the notification bell
-- on the Profile page until an admin resolves them.
CREATE TABLE IF NOT EXISTS profile_change_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT CHECK (status IN ('pending', 'resolved')) DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    resolved_by TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_by ON pcr_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_pcr_reports_status ON pcr_reports(status);
CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_at ON pcr_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_profile_change_requests_status ON profile_change_requests(status);
`;

// Statement wrapper to mimic better-sqlite3 API
class StatementWrapper {
  private db: SqlJsDatabase;
  private sql: string;

  constructor(db: SqlJsDatabase, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  get(...params: any[]): any {
    try {
      const stmt = this.db.prepare(this.sql);
      stmt.bind(params.length === 1 && Array.isArray(params[0]) ? params[0] : params);

      if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const row: any = {};
        columns.forEach((col: string, i: number) => {
          row[col] = values[i];
        });
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    } catch (error) {
      console.error('SQL get error:', error, 'SQL:', this.sql);
      throw error;
    }
  }

  all(...params: any[]): any[] {
    try {
      const stmt = this.db.prepare(this.sql);
      stmt.bind(params.length === 1 && Array.isArray(params[0]) ? params[0] : params);

      const results: any[] = [];
      const columns = stmt.getColumnNames();

      while (stmt.step()) {
        const values = stmt.get();
        const row: any = {};
        columns.forEach((col: string, i: number) => {
          row[col] = values[i];
        });
        results.push(row);
      }
      stmt.free();
      return results;
    } catch (error) {
      console.error('SQL all error:', error, 'SQL:', this.sql);
      throw error;
    }
  }

  run(...params: any[]): { changes: number; lastInsertRowid: number } {
    try {
      const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      this.db.run(this.sql, flatParams);

      // Get changes and last insert rowid
      const changesResult = this.db.exec('SELECT changes() as changes, last_insert_rowid() as lastId');
      const changes = changesResult[0]?.values[0]?.[0] as number || 0;
      const lastInsertRowid = changesResult[0]?.values[0]?.[1] as number || 0;

      return { changes, lastInsertRowid };
    } catch (error) {
      console.error('SQL run error:', error, 'SQL:', this.sql, 'Params:', params);
      throw error;
    }
  }
}

// Database wrapper to mimic better-sqlite3 API
class DatabaseWrapper {
  private db: SqlJsDatabase;
  private dbPath: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(db: SqlJsDatabase, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  prepare(sql: string): StatementWrapper {
    return new StatementWrapper(this.db, sql);
  }

  exec(sql: string): void {
    this.db.exec(sql);
    this.scheduleSave();
  }

  pragma(statement: string): any {
    const result = this.db.exec(`PRAGMA ${statement}`);
    this.scheduleSave();
    return result;
  }

  close(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveToFile();
    this.db.close();
  }

  // Save database to file (debounced)
  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveToFile();
    }, 1000); // Save after 1 second of inactivity
  }

  saveToFile(): void {
    try {
      const data = this.db.export();
      const key = getEncryptionKey(this.dbPath);
      const encrypted = encryptBuffer(Buffer.from(data), key);

      // Write-then-rename instead of overwriting pcr_database.db directly: a
      // rename that replaces an existing file is atomic on both Windows and
      // POSIX, so a crash or power loss mid-save can never leave the only
      // copy of the database partially written/corrupted - it's always
      // either the complete old file or the complete new file, never
      // something truncated in between.
      const tempPath = `${this.dbPath}.tmp`;
      const fd = fs.openSync(tempPath, 'w');
      try {
        fs.writeSync(fd, encrypted);
        fs.fsyncSync(fd); // flush to physical disk, not just the OS cache, before the rename
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tempPath, this.dbPath);
      lastSaveError = null;
    } catch (error) {
      // Besides logging, this is tracked so /api/health can report it - a
      // failed save (disk full, file locked, permissions) would otherwise be
      // invisible: every API call keeps returning 200 from the in-memory DB
      // while the on-disk copy silently stops updating, until a crash or
      // power loss loses everything written since the last successful save.
      const message = error instanceof Error ? error.message : String(error);
      lastSaveError = { message, at: new Date().toISOString() };
      console.error('Error saving database:', error);
    }
  }

  // Expose the raw db for the wrapper's run method to trigger saves
  getRawDb(): SqlJsDatabase {
    return this.db;
  }

  triggerSave(): void {
    this.scheduleSave();
  }
}

// Extend StatementWrapper to trigger saves after mutations
const originalRun = StatementWrapper.prototype.run;
StatementWrapper.prototype.run = function(...params: any[]) {
  const result = originalRun.apply(this, params);
  // @ts-ignore - accessing private for save trigger
  if (dbWrapper) {
    dbWrapper.triggerSave();
  }
  return result;
};

let dbWrapper: DatabaseWrapper | null = null;

// Tracks the most recent saveToFile() failure, if any, so it can be surfaced
// via /api/health instead of only ever reaching a console log.
let lastSaveError: { message: string; at: string } | null = null;

export function getDatabaseHealth(): { healthy: boolean; lastSaveError: { message: string; at: string } | null } {
  return { healthy: lastSaveError === null, lastSaveError };
}

export class DatabaseManager {
  private database: DatabaseWrapper | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Initialize sql.js
      const SQL = await initSqlJs();

      // Load existing database or create new one
      let db: SqlJsDatabase;
      if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        const key = getEncryptionKey(DB_PATH);
        const wasEncrypted = isEncrypted(fileBuffer);
        const decrypted = decryptBuffer(fileBuffer, key);
        db = new SQL.Database(decrypted);
        console.log(
          wasEncrypted
            ? 'Loaded existing encrypted database from:'
            : 'Loaded existing unencrypted database from (will be encrypted on next save):',
          DB_PATH
        );
      } else {
        db = new SQL.Database();
        console.log('Created new database');
      }

      this.database = new DatabaseWrapper(db, DB_PATH);
      dbWrapper = this.database;

      // Set pragmas
      this.database.pragma('journal_mode = WAL');
      this.database.pragma('synchronous = NORMAL');
      this.database.pragma('foreign_keys = ON');

      // Initialize schema
      this.initializeSchema();
      this.runMigrations();

      // Create default users if none exist
      await this.createDefaultUsers();

      // Save initial state
      this.database.saveToFile();
    } catch (error) {
      console.error('Database initialization error:', error);
      throw error;
    }
  }

  private initializeSchema(): void {
    if (!this.database) return;
    this.database.exec(SCHEMA_SQL);
  }

  private runMigrations(): void {
    if (!this.database) return;

    // Migration: Add sign-off attachment columns if they don't exist
    try {
      const tableInfo = this.database.prepare('PRAGMA table_info(pcr_reports)').all() as Array<{ name: string }>;
      const columnNames = tableInfo.map(col => col.name);

      if (!columnNames.includes('sign_off_attachment')) {
        this.database.exec('ALTER TABLE pcr_reports ADD COLUMN sign_off_attachment TEXT');
        console.log('Migration: Added sign_off_attachment column to pcr_reports');
      }

      if (!columnNames.includes('sign_off_filename')) {
        this.database.exec('ALTER TABLE pcr_reports ADD COLUMN sign_off_filename TEXT');
        console.log('Migration: Added sign_off_filename column to pcr_reports');
      }

      if (!columnNames.includes('admin_comments')) {
        this.database.exec('ALTER TABLE pcr_reports ADD COLUMN admin_comments TEXT');
        console.log('Migration: Added admin_comments column to pcr_reports');
      }

      // Migration: Add responders column (JSON array) to pcr_call_archive,
      // replacing the fixed responder1/2/3 columns now that a PCR can list
      // any number of responders. The old columns are left in place so
      // already-archived rows stay readable (see archivePcrReportsSql and
      // the stats queries in routes/pcr.ts, which fall back to them).
      const archiveTableInfo = this.database.prepare('PRAGMA table_info(pcr_call_archive)').all() as Array<{ name: string }>;
      const archiveColumnNames = archiveTableInfo.map(col => col.name);

      if (!archiveColumnNames.includes('responders')) {
        this.database.exec('ALTER TABLE pcr_call_archive ADD COLUMN responders TEXT');
        console.log('Migration: Added responders column to pcr_call_archive');
      }

      // Migration: Add login lockout tracking columns to users
      const userTableInfo = this.database.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
      const userColumnNames = userTableInfo.map(col => col.name);

      if (!userColumnNames.includes('failed_login_attempts')) {
        this.database.exec('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER DEFAULT 0');
        console.log('Migration: Added failed_login_attempts column to users');
      }

      if (!userColumnNames.includes('locked_until')) {
        this.database.exec('ALTER TABLE users ADD COLUMN locked_until TEXT');
        console.log('Migration: Added locked_until column to users');
      }

      // Migration: Add 'approved' to status CHECK constraint.
      // Gated on the constraint text itself so this only runs once ever,
      // instead of rebuilding the table on every single startup, and wrapped
      // in a transaction so a crash mid-migration (e.g. power loss on a
      // field laptop) rolls back cleanly instead of leaving pcr_reports
      // half-migrated or missing rows.
      try {
        const tableRow = this.database
          .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pcr_reports'")
          .get() as { sql: string } | undefined;
        const alreadyMigrated = !!tableRow?.sql && tableRow.sql.includes("'approved'");

        if (!alreadyMigrated) {
          this.database.exec('BEGIN TRANSACTION');
          try {
            this.database.exec('DROP TABLE IF EXISTS pcr_reports_new');
            this.database.exec(`
              CREATE TABLE pcr_reports_new (
                id TEXT PRIMARY KEY,
                form_data TEXT NOT NULL,
                sign_off_attachment TEXT,
                sign_off_filename TEXT,
                status TEXT CHECK (status IN ('draft', 'completed', 'submitted', 'approved')) DEFAULT 'draft',
                created_by TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
              )
            `);
            this.database.exec(`
              INSERT INTO pcr_reports_new SELECT id, form_data, sign_off_attachment, sign_off_filename, status, created_by, created_at, updated_at FROM pcr_reports
            `);
            this.database.exec('DROP TABLE pcr_reports');
            this.database.exec('ALTER TABLE pcr_reports_new RENAME TO pcr_reports');
            // Recreate indexes
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_by ON pcr_reports(created_by)');
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_status ON pcr_reports(status)');
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_at ON pcr_reports(created_at)');
            this.database.exec('COMMIT');
            console.log('Migration: Updated pcr_reports status constraint to include approved');
          } catch (migrationError) {
            this.database.exec('ROLLBACK');
            console.error('Migration error (status constraint):', migrationError);
          }
        }
      } catch (migrationError) {
        console.error('Migration error (status constraint):', migrationError);
      }

      // Migration: Add 'changes_requested' to status CHECK constraint, and
      // make sure admin_comments (added as a plain column above) survives
      // the table rebuild. Same gate-on-constraint-text/transaction pattern
      // as the 'approved' migration above, so it also only ever runs once.
      try {
        const tableRow = this.database
          .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pcr_reports'")
          .get() as { sql: string } | undefined;
        const alreadyMigrated = !!tableRow?.sql && tableRow.sql.includes("'changes_requested'");

        if (!alreadyMigrated) {
          this.database.exec('BEGIN TRANSACTION');
          try {
            this.database.exec('DROP TABLE IF EXISTS pcr_reports_new');
            this.database.exec(`
              CREATE TABLE pcr_reports_new (
                id TEXT PRIMARY KEY,
                form_data TEXT NOT NULL,
                sign_off_attachment TEXT,
                sign_off_filename TEXT,
                status TEXT CHECK (status IN ('draft', 'completed', 'submitted', 'approved', 'changes_requested')) DEFAULT 'draft',
                admin_comments TEXT,
                created_by TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
              )
            `);
            this.database.exec(`
              INSERT INTO pcr_reports_new SELECT id, form_data, sign_off_attachment, sign_off_filename, status, admin_comments, created_by, created_at, updated_at FROM pcr_reports
            `);
            this.database.exec('DROP TABLE pcr_reports');
            this.database.exec('ALTER TABLE pcr_reports_new RENAME TO pcr_reports');
            // Recreate indexes
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_by ON pcr_reports(created_by)');
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_status ON pcr_reports(status)');
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_at ON pcr_reports(created_at)');
            this.database.exec('COMMIT');
            console.log('Migration: Updated pcr_reports status constraint to include changes_requested');
          } catch (migrationError) {
            this.database.exec('ROLLBACK');
            console.error('Migration error (changes_requested constraint):', migrationError);
          }
        }
      } catch (migrationError) {
        console.error('Migration error (changes_requested constraint):', migrationError);
      }

      // Migration: Add 'cancelled' to status CHECK constraint. Same
      // gate-on-constraint-text/transaction pattern as the migrations above.
      try {
        const tableRow = this.database
          .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'pcr_reports'")
          .get() as { sql: string } | undefined;
        const alreadyMigrated = !!tableRow?.sql && tableRow.sql.includes("'cancelled'");

        if (!alreadyMigrated) {
          this.database.exec('BEGIN TRANSACTION');
          try {
            this.database.exec('DROP TABLE IF EXISTS pcr_reports_new');
            this.database.exec(`
              CREATE TABLE pcr_reports_new (
                id TEXT PRIMARY KEY,
                form_data TEXT NOT NULL,
                sign_off_attachment TEXT,
                sign_off_filename TEXT,
                status TEXT CHECK (status IN ('draft', 'completed', 'submitted', 'approved', 'changes_requested', 'cancelled')) DEFAULT 'draft',
                admin_comments TEXT,
                created_by TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
              )
            `);
            this.database.exec(`
              INSERT INTO pcr_reports_new SELECT id, form_data, sign_off_attachment, sign_off_filename, status, admin_comments, created_by, created_at, updated_at FROM pcr_reports
            `);
            this.database.exec('DROP TABLE pcr_reports');
            this.database.exec('ALTER TABLE pcr_reports_new RENAME TO pcr_reports');
            // Recreate indexes
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_by ON pcr_reports(created_by)');
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_status ON pcr_reports(status)');
            this.database.exec('CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_at ON pcr_reports(created_at)');
            this.database.exec('COMMIT');
            console.log('Migration: Updated pcr_reports status constraint to include cancelled');
          } catch (migrationError) {
            this.database.exec('ROLLBACK');
            console.error('Migration error (cancelled constraint):', migrationError);
          }
        }
      } catch (migrationError) {
        console.error('Migration error (cancelled constraint):', migrationError);
      }

      // Migration: Add sign_off_attachments (JSON array of {filename, data},
      // in display/merge order) - replaces the single sign_off_attachment
      // column so a report can carry more than one attachment. The old
      // column is left in place so already-saved single attachments stay
      // readable (see routes/pcr.ts, which falls back to it). Runs after the
      // table-recreate migrations above so it can never be dropped by one of
      // their column lists on a database that hadn't run them yet.
      const currentColumnNames = (this.database.prepare('PRAGMA table_info(pcr_reports)').all() as Array<{ name: string }>)
        .map(col => col.name);
      if (!currentColumnNames.includes('sign_off_attachments')) {
        this.database.exec('ALTER TABLE pcr_reports ADD COLUMN sign_off_attachments TEXT');
        console.log('Migration: Added sign_off_attachments column to pcr_reports');
      }
    } catch (error) {
      // Rethrown (unlike the inner per-migration try/catches above, which
      // intentionally stay isolated) so a failure here fails startup loudly
      // instead of leaving the app running against a partially-migrated
      // schema, where every route touching a column/constraint a skipped
      // migration would have added just 500s with no clue why.
      console.error('Migration error:', error);
      throw error;
    }
  }

  private async createDefaultUsers(): Promise<void> {
    if (!this.database) return;

    try {
      // Check if any users exist
      const existingUsers = this.database.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };

      if (existingUsers.count === 0) {
        console.log('No users found, creating default accounts...');

        const generateId = () => 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

        // Create admin user
        const adminHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
        this.database.prepare(`
          INSERT INTO users (id, username, password_hash, first_name, last_name, role, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(generateId(), 'admin', adminHash, 'System', 'Administrator', 'admin', 1);
        console.log(`Created admin user (admin/${DEFAULT_ADMIN_PASSWORD})`);

        // Create regular user
        const userHash = await bcrypt.hash(DEFAULT_USER_PASSWORD, 10);
        this.database.prepare(`
          INSERT INTO users (id, username, password_hash, first_name, last_name, role, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(generateId(), 'user', userHash, 'Regular', 'User', 'user', 1);
        console.log(`Created regular user (user/${DEFAULT_USER_PASSWORD})`);

        // Save immediately
        this.database.saveToFile();
      }
    } catch (error) {
      console.error('Error creating default users:', error);
    }
  }

  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  getDb(): DatabaseWrapper {
    if (!this.database) {
      throw new Error('Database not initialized. Call waitForInit() first.');
    }
    return this.database;
  }

  close(): void {
    if (this.database) {
      this.database.close();
      // Cleared so a second close() call (e.g. the SIGINT handler's explicit
      // closeDatabase() followed by the process 'exit' handler's safety-net
      // closeDatabase()) is a no-op instead of closing the same underlying
      // sql.js database twice.
      this.database = null;
    }
  }
}

// Create manager instance
const dbManager = new DatabaseManager();

// For synchronous access (after init), create a proxy that waits for init
const dbProxy = new Proxy({} as DatabaseWrapper, {
  get(target, prop) {
    const db = dbManager.getDb();
    const value = (db as any)[prop];
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  }
});

// Export functions
export function getDatabase(): DatabaseWrapper {
  return dbManager.getDb();
}

export async function initDatabase(): Promise<void> {
  await dbManager.waitForInit();
}

// Flushes any pending debounced save and closes the database. Must be called
// on every shutdown path (SIGINT/SIGTERM, Electron app quit) - saveToFile()
// is debounced by up to 1 second, so exiting without this can silently drop
// the most recent write(s) even on a clean shutdown, not just a crash.
export function closeDatabase(): void {
  dbManager.close();
}

// For backwards compatibility
export default dbProxy;
