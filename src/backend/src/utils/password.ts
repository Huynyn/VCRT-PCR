// Defaults for fresh installs only, used by both places a brand-new database
// gets its initial admin/user accounts: database/index.ts's own
// createDefaultUsers() (fires automatically the first time the app starts
// against an empty database) and scripts/create-users.ts (the standalone
// `npm run create-accounts` script). Kept here, in one place, so the two
// can't drift out of sync with each other or with validatePasswordStrength()
// below - which is exactly what happened before (the old defaults,
// 'vcrt-ebic2026!' and 'user', didn't meet this module's own policy).
export const DEFAULT_ADMIN_PASSWORD = 'Vcrt-Ebic2026!';
export const DEFAULT_USER_PASSWORD = 'Vcrt-User2026!';

/**
 * Shared password strength rule, enforced everywhere a password is set:
 * registration, admin-created users, and password changes/resets.
 */
export function validatePasswordStrength(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include a number';
  }
  return null;
}
