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

// Dynamic import so the module is only loaded when this script runs.
const { renderModuleImages } = await import('../modules/module/reader-images.service.js');

const CACHE_DIR = join(__dirname, '..', 'uploads', 'modules');

// CLI flags
const FORCE = process.argv.includes('--force') || process.argv.includes('-f');

/**
 * One-shot backfill: render real images for every module that has reader_content
 * but no image src URLs yet (or whose images are missing on the local volume).
 *
 * Idempotency: a module is treated as "done" only if BOTH conditions hold —
 *   1. Every image block in its reader_content has a `src` URL
 *   2. The PNG file referenced by that src exists on disk
 * If the JSON has src but the file is missing (e.g. fresh Railway volume,
 * disk wipe, or backfill ran on a different host), we re-render. This makes
 * the backfill safe across environments and disk resets.
 *
 * Pass `--force` to re-render every module unconditionally.
 *
 * Usage:
 *   node src/database/backfill-reader-images.js          # idempotent
 *   node src/database/backfill-reader-images.js --force  # always rerun
 */
async function backfill() {
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  if (FORCE) console.log('[BackfillImages] --force flag set: re-rendering every module');

  try {
    const { rows } = await pool.query(
      `SELECT id, file_name, reader_content
         FROM modules
        WHERE reader_content IS NOT NULL
        ORDER BY created_at ASC`
    );
    console.log(`[BackfillImages] ${rows.length} module(s) have reader_content`);

    for (const row of rows) {
      scanned++;
      const id = row.id;
      const rc = row.reader_content;
      try {
        if (!rc || !Array.isArray(rc.pages) || rc.pages.length === 0) {
          console.warn(`[BackfillImages] ${id}: empty reader_content, skipping`);
          skipped++;
          continue;
        }

        // Skip modules that have no image blocks at all — there's nothing to render.
        const hasAnyImage = rc.pages.some((p) =>
          Array.isArray(p?.blocks) && p.blocks.some((b) => b && b.type === 'image')
        );
        if (!hasAnyImage) {
          console.log(`[BackfillImages] ${id}: no image blocks, skipping`);
          skipped++;
          continue;
        }

        // Idempotency check (with disk verification):
        //   - Every image block has a src URL
        //   - AND every referenced PNG actually exists on the local volume
        // If either fails, we re-render.
        if (!FORCE) {
          const allHaveSrc = rc.pages.every((p) =>
            !Array.isArray(p?.blocks) ||
            p.blocks.every((b) => !b || b.type !== 'image' || typeof b.src === 'string')
          );

          let allFilesPresent = false;
          if (allHaveSrc) {
            allFilesPresent = true;
            outer: for (const p of rc.pages) {
              if (!Array.isArray(p?.blocks)) continue;
              for (const b of p.blocks) {
                if (!b || b.type !== 'image' || typeof b.src !== 'string') continue;
                // src looks like /api/v1/modules/<id>/reader-image/<filename>
                const m = b.src.match(/\/reader-image\/([\w-]+)$/);
                if (!m) { allFilesPresent = false; break outer; }
                const filename = m[1].endsWith('.png') ? m[1] : `${m[1]}.png`;
                const filePath = join(CACHE_DIR, id, 'images', filename);
                if (!existsSync(filePath)) {
                  allFilesPresent = false;
                  break outer;
                }
              }
            }
          }

          if (allHaveSrc && allFilesPresent) {
            console.log(`[BackfillImages] ${id}: srcs + files present, skipping`);
            skipped++;
            continue;
          }
          if (allHaveSrc && !allFilesPresent) {
            console.log(`[BackfillImages] ${id}: srcs in DB but files missing on disk, re-rendering`);
          }
        }

        const buffer = await loadPdfBuffer(id);
        if (!buffer) {
          console.warn(`[BackfillImages] ${id}: no PDF bytes available, skipping`);
          skipped++;
          continue;
        }

        const t0 = Date.now();
        const updatedRc = await renderModuleImages({
          pdfBuffer: buffer,
          moduleId: id,
          readerContent: rc,
        });
        const ms = Date.now() - t0;

        if (!updatedRc) {
          console.warn(`[BackfillImages] ${id}: renderer returned nothing in ${ms}ms`);
          skipped++;
          continue;
        }

        await pool.query(
          `UPDATE modules
              SET reader_content = $2,
                  reader_content_extracted_at = NOW()
            WHERE id = $1`,
          [id, updatedRc]
        );
        updated++;
        console.log(`[BackfillImages] ${id}: updated in ${ms}ms (${updated}/${rows.length})`);
      } catch (err) {
        failed++;
        console.error(`[BackfillImages] ${id}: failed —`, err.message);
      }
    }

    console.log(`[BackfillImages] Done. scanned=${scanned} updated=${updated} skipped=${skipped} failed=${failed}`);
  } catch (e) {
    console.error('[BackfillImages] Fatal:', e.message);
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
