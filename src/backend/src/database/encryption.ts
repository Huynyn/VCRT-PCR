import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Encrypts the sql.js database file at rest (AES-256-GCM), transparent to the
 * rest of the app: the database is decrypted into memory once on load and
 * re-encrypted on every save, so all SQL access still happens against a
 * plain in-memory SQLite database.
 *
 * Key resolution order:
 *   1. ENCRYPTION_KEY env var — 64 hex chars (32 raw bytes) or any passphrase
 *      (hashed with SHA-256 to derive a 32-byte key). Set this for
 *      deployments that manage secrets centrally.
 *   2. A key auto-generated on first run and stored as a sibling file next to
 *      the database (".encryption.key", 0600 permissions where supported).
 *
 * Threat model: this protects the database file if it's copied off the
 * machine, included in an unencrypted backup, or read from a decommissioned
 * disk. It does NOT protect against someone with full access to the running
 * application's data directory, since the auto-generated key lives next to
 * the database there — for that level of protection, set ENCRYPTION_KEY from
 * an external secret store instead of relying on the local key file.
 */

const MAGIC = Buffer.from('PCRE1'); // marks a file as encrypted by this module (+ format version)
const IV_LENGTH = 12; // AES-GCM standard nonce size
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

let cachedKey: Buffer | null = null;

export function getEncryptionKey(dbPath: string): Buffer {
  if (cachedKey) return cachedKey;

  const envKey = process.env.ENCRYPTION_KEY?.trim();
  if (envKey) {
    cachedKey = /^[0-9a-fA-F]{64}$/.test(envKey)
      ? Buffer.from(envKey, 'hex')
      : crypto.createHash('sha256').update(envKey).digest();
    return cachedKey;
  }

  const keyPath = path.join(path.dirname(dbPath), '.encryption.key');

  if (fs.existsSync(keyPath)) {
    const key = fs.readFileSync(keyPath);
    if (key.length !== 32) {
      throw new Error(`Invalid encryption key length in ${keyPath}; expected 32 bytes, got ${key.length}`);
    }
    cachedKey = key;
    return cachedKey;
  }

  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, generated, { mode: 0o600 });
  console.log(`Generated new database encryption key at ${keyPath}`);
  console.log('Back this file up separately from the database file — losing it makes the database unrecoverable.');
  cachedKey = generated;
  return cachedKey;
}

export function isEncrypted(data: Buffer): boolean {
  return data.length >= MAGIC.length && data.subarray(0, MAGIC.length).equals(MAGIC);
}

export function encryptBuffer(plain: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, authTag, ciphertext]);
}

export function decryptBuffer(data: Buffer, key: Buffer): Buffer {
  if (!isEncrypted(data)) {
    // Legacy plaintext database predating encryption support. Returned as-is;
    // the next saveToFile() call will encrypt it going forward.
    return data;
  }

  const iv = data.subarray(MAGIC.length, MAGIC.length + IV_LENGTH);
  const authTag = data.subarray(MAGIC.length + IV_LENGTH, MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error(
      'Failed to decrypt database file: ENCRYPTION_KEY is missing/incorrect, or the file is corrupted.'
    );
  }
}
