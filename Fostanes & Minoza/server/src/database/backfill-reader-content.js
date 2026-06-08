import 'dotenv/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';
import { existsSync, readFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '..', '..', '.env') });

import pg from 'pg';
const dbUrl = process.env.DATABASE_URL || '';
const useSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech');
const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
});

// Note: dynamic import so the migration script doesn't need to load pdfjs unless we run it.
const { extractReaderContent } = await import('../modules/module/reader.service.js');

const CACHE_DIR = join(__dirname, '..', 'uploads', 'modules');

/**
 * One-shot backfill: extract reader_content for every module that doesn't have it.
 *
 * Usage:
 *   node src/database/backfill-reader-content.js
 *
 * For each module where reader_content IS NULL:
 *   1. Try to read PDF bytes from local cache (server/src/uploads/modules/<id>.pdf).
 *   2. Fallback to file_data column in DB.
 *   3. Run extractReaderContent and UPDATE the row.
 *   4. Continue on failure — never abort the whole backfill.
 */
async function backfill() {
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const { rows } = await pool.query(
      `SELECT id, file_name FROM modules WHERE reader_content IS NULL ORDER BY created_at ASC`
    );
    console.log(`[Backfill] ${rows.length} module(s) need reader_content`);

    for (const row of rows) {
      scanned++;
      const id = row.id;
      try {
        const buffer = await loadPdfBuffer(id);
        if (!buffer) {
          console.warn(`[Backfill] ${id}: no PDF bytes available, skipping`);
          skipped++;
          continue;
        }

        const t0 = Date.now();
        const rc = await extractReaderContent(buffer);
        const ms = Date.now() - t0;

        if (!rc || rc.error || !Array.isArray(rc.pages) || rc.pages.length === 0) {
          console.warn(`[Backfill] ${id}: extraction produced no pages (${rc?.error || 'empty'}) in ${ms}ms`);
          skipped++;
          continue;
        }

        await pool.query(
          `UPDATE modules
              SET reader_content = $2,
                  reader_content_extracted_at = NOW()
            WHERE id = $1`,
          [id, rc]
        );
        updated++;
        console.log(`[Backfill] ${id}: ${rc.pages.length} pages, ${ms}ms (${updated}/${rows.length})`);
      } catch (err) {
        failed++;
        console.error(`[Backfill] ${id}: failed —`, err.message);
      }
    }

    console.log(`[Backfill] Done. scanned=${scanned} updated=${updated} skipped=${skipped} failed=${failed}`);
  } catch (e) {
    console.error('[Backfill] Fatal:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

async function loadPdfBuffer(moduleId) {
  // 1. Disk cache
  const cachePath = join(CACHE_DIR, `${moduleId}.pdf`);
  if (existsSync(cachePath)) {
    try { return readFileSync(cachePath); } catch {}
  }
  // 2. DB blob
  const r = await pool.query(`SELECT file_data FROM modules WHERE id = $1`, [moduleId]);
  const data = r.rows[0]?.file_data;
  if (data && data.length) return Buffer.isBuffer(data) ? data : Buffer.from(data);
  return null;
}

backfill();
