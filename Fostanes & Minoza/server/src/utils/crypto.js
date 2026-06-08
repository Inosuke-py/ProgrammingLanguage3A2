import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';

/**
 * AES-256-GCM symmetric encryption for at-rest secrets.
 *
 * Used to encrypt user-provided third-party API keys before storing them
 * in the database. The key itself comes from process.env.LEXARA_ENCRYPTION_KEY
 * (or falls back to a stable derivation of JWT_SECRET in development so
 * local dev doesn't require yet another env var).
 *
 * GCM mode provides both confidentiality and authenticity — the auth tag
 * verifies the ciphertext hasn't been tampered with on decrypt.
 *
 * Storage format (JSON):
 *   {
 *     "ciphertext": "<base64>",
 *     "iv":         "<base64>",  // 12 bytes, fresh per encrypt
 *     "tag":        "<base64>",  // 16 bytes auth tag from GCM
 *   }
 *
 * The plaintext key is never logged, never returned in API responses,
 * and never written to disk in unencrypted form.
 */

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;       // recommended for GCM
const KEY_BYTES = 32;      // AES-256

/**
 * Resolve the master encryption key from environment, lazily so tests
 * can swap it. Returns a 32-byte Buffer.
 */
function getMasterKey() {
  const fromEnv = process.env.LEXARA_ENCRYPTION_KEY;

  if (fromEnv) {
    // Allow either base64 (preferred, exactly 44 chars) or hex (64 chars)
    // or raw 32-byte UTF-8. Normalize to a 32-byte Buffer.
    if (/^[A-Za-z0-9+/=]+$/.test(fromEnv) && fromEnv.length === 44) {
      return Buffer.from(fromEnv, 'base64');
    }
    if (/^[a-fA-F0-9]+$/.test(fromEnv) && fromEnv.length === 64) {
      return Buffer.from(fromEnv, 'hex');
    }
    // Hash whatever string was provided down to 32 bytes — safe fallback.
    return createHash('sha256').update(fromEnv).digest();
  }

  // Dev fallback: derive a stable key from JWT_SECRET so local dev doesn't
  // require a separate env var. Production MUST set LEXARA_ENCRYPTION_KEY.
  const fallback = process.env.JWT_SECRET;
  if (!fallback) {
    throw new Error(
      'Cannot resolve master encryption key — set LEXARA_ENCRYPTION_KEY ' +
      'or JWT_SECRET in the environment.'
    );
  }
  return createHash('sha256')
    .update('lexara-encryption-fallback::' + fallback)
    .digest();
}

/**
 * Encrypt a plaintext string. Returns the storage envelope.
 * @param {string} plaintext
 * @returns {{ ciphertext: string, iv: string, tag: string }}
 */
export function encryptSecret(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptSecret: plaintext must be a non-empty string');
  }
  const key = getMasterKey();
  if (key.length !== KEY_BYTES) {
    throw new Error('encryptSecret: master key must be 32 bytes');
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt a storage envelope back to plaintext.
 * Throws if the envelope is malformed or the auth tag fails verification.
 * @param {{ ciphertext: string, iv: string, tag: string }} envelope
 * @returns {string}
 */
export function decryptSecret(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('decryptSecret: envelope is missing or invalid');
  }
  const { ciphertext, iv, tag } = envelope;
  if (!ciphertext || !iv || !tag) {
    throw new Error('decryptSecret: envelope is missing required fields');
  }

  const key = getMasterKey();
  const decipher = createDecipheriv(ALG, key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Helper — return the last 4 characters of a key for display purposes.
 * Useful when showing the user a hint of which key they have stored
 * without revealing it.
 */
export function lastFour(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) return '';
  return plaintext.slice(-4);
}
