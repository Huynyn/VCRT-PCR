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
    last_login DATETIME
);

-- PCR Reports/Drafts table (single table for both drafts and completed reports)
CREATE TABLE IF NOT EXISTS pcr_reports (
    id TEXT PRIMARY KEY,
    form_data TEXT NOT NULL, -- JSON blob of all form data (PCRFormData)
    sign_off_attachment TEXT, -- Base64 encoded PDF of patient signature (optional)
    sign_off_filename TEXT, -- Original filename of the sign-off attachment
    status TEXT CHECK (status IN ('draft', 'completed', 'submitted', 'approved', 'changes_requested')) DEFAULT 'draft',
    admin_comments TEXT, -- Admin feedback when status = 'changes_requested', shown to the owner for edit + resubmit
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
    user_id TEXT NOT NULL, -- Can be 'system' for automated tasks
    action TEXT NOT NULL, -- 'login', 'logout', 'create_pcr', 'update_pcr', 'submit_pcr', 'cleanup_pcr_reports', etc.
    resource_type TEXT, -- 'pcr_report', 'user', etc.
    resource_id TEXT, -- ID of the resource being acted upon
    details TEXT, -- JSON blob with additional details
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    -- Note: Removed FOREIGN KEY constraint to allow 'system' as user_id
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_by ON pcr_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_pcr_reports_status ON pcr_reports(status);
CREATE INDEX IF NOT EXISTS idx_pcr_reports_created_at ON pcr_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);

-- Migration: Add sign-off attachment columns to existing pcr_reports table
-- These will silently fail if columns already exist (SQLite behavior)
-- Note: Run these manually if schema was created before this update
