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
 * Reader Mode (Phase 1) — schema additions on `modules` table.
 *
 * Adds:
 *   - reader_content (JSONB)              — normalized flowing-text representation of the PDF
 *   - reader_content_extracted_at (TIMESTAMPTZ) — when extraction last completed
 *
 * No index is added; the column is only fetched by module id (PK) so no extra index is needed.
 */
async function migrate() {
  try {
    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE modules
          ADD COLUMN reader_content JSONB;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    console.log('OK: modules.reader_content column ensured');

    await pool.query(`
      DO $$ BEGIN
        ALTER TABLE modules
          ADD COLUMN reader_content_extracted_at TIMESTAMPTZ;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$;
    `);
    console.log('OK: modules.reader_content_extracted_at column ensured');

    // Sanity-check that both columns now exist
    const { rows } = await pool.query(`
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_name = 'modules'
         AND column_name IN ('reader_content', 'reader_content_extracted_at')
       ORDER BY column_name;
    `);
    console.log('Verified columns:', rows);
  } catch (e) {
    console.error('Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
