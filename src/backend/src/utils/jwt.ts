import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Single source of truth for the JWT signing secret.
 *
 * Resolution order (mirrors getEncryptionKey in database/encryption.ts):
 *   1. JWT_SECRET env var, if set - e.g. via .env for a standalone/web
 *      deployment that manages secrets centrally.
 *   2. A secret auto-generated on first run and persisted as a sibling file
 *      next to the database, so a packaged Electron install - which never
 *      ships a .env file - still gets a real, unique-per-install secret
 *      instead of silently falling back to a value baked into the source,
 *      which anyone reading this (open) codebase could use to forge a valid
 *      token for any user, including an admin, on every install that never
 *      set JWT_SECRET explicitly.
 */
function resolveJwtSecret(): string {
  const envSecret = process.env.JWT_SECRET?.trim();
  if (envSecret) return envSecret;

  const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'app_runtime.dat');
  const secretPath = path.join(path.dirname(dbPath), '.runtime_jwt');

  if (fs.existsSync(secretPath)) {
    const stored = fs.readFileSync(secretPath, 'utf8').trim();
    if (stored) return stored;
  }

  const generated = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, generated, { mode: 0o600 });
  console.log(`Generated a new JWT signing secret at ${secretPath}`);
  return generated;
}

export const JWT_SECRET: string = resolveJwtSecret();
