import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '..', '..', '.env') });

import pg from 'pg';
const dbUrl = process.env.DATABASE_URL || '';
const useSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech');
const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

/**
 * Add per-user encrypted AI provider keys.
 *
 * Stored shape:
 *   ai_provider_keys = {
 *     "mistral": { ciphertext, iv, tag, last4, model? },
 *     "gemini":  { ciphertext, iv, tag, last4, model? }
 *   }
 *
 * Plaintext API keys NEVER touch this table — only AES-256-GCM ciphertexts.
 */
async function migrate() {
  try {
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE users
          ADD COLUMN ai_provider_keys JSONB NOT NULL DEFAULT '{}'::jsonb;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    console.log('OK: users.ai_provider_keys column ensured');
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
