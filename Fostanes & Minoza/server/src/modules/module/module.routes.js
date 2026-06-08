import { Router } from 'express';
import multer from 'multer';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { authenticate, optionalAuth } from '../../middleware/auth.js';
import {
  createModule, listModules, listPublicModules,
  getModuleById, getModuleFile, updateModule, deleteModule,
  getModuleReaderContent, setModuleReaderContent,
} from './module.service.js';
import { extractReaderContent } from './reader.service.js';
import { renderModuleImages } from './reader-images.service.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '..', '..', 'uploads', 'modules');

// Ensure cache dir exists
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype === 'application/pdf');
  },
});

/** POST /modules — upload a new module */
router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, errors: [{ code: 'NO_FILE', message: 'Please upload a PDF file.' }] });
    }
    const title = req.body.title || req.file.originalname.replace(/\.pdf$/i, '');

    // Extract reader-mode content BEFORE the DB insert. Defensive: never throws —
    // returns an object with `error` set on failure so the upload still succeeds.
    let readerContent = null;
    try {
      const t0 = Date.now();
      const rc = await extractReaderContent(req.file.buffer);
      const ms = Date.now() - t0;
      if (rc && !rc.error && Array.isArray(rc.pages) && rc.pages.length > 0) {
        readerContent = rc;
        console.log(`[Reader] Extracted ${rc.pages.length} page(s) in ${ms}ms`);
      } else {
        console.warn(`[Reader] No reader content for upload (${rc?.error || 'empty'}), proceeding without it`);
      }
    } catch (extractErr) {
      // Truly defensive: if the service somehow throws despite its own try/catch,
      // we still want the upload to go through.
      console.error('[Reader] Unexpected extraction error:', extractErr.message);
    }

    const mod = await createModule(req.user.id, title, req.file.originalname, req.file.buffer, readerContent);

    // Cache to local filesystem immediately
    const cachePath = join(CACHE_DIR, `${mod.id}.pdf`);
    writeFileSync(cachePath, req.file.buffer);
    console.log(`[Cache] Saved module ${mod.id} to disk (${req.file.buffer.length} bytes)`);

    // Phase 3: render real image bytes to disk and patch reader_content with src URLs.
    // Wrapped defensively — failures here must NEVER break the upload. Worst case the
    // client falls back to placeholder boxes for image blocks.
    if (readerContent && Array.isArray(readerContent.pages) && readerContent.pages.length > 0) {
      try {
        const tImg = Date.now();
        const updated = await renderModuleImages({
          pdfBuffer: req.file.buffer,
          moduleId: mod.id,
          readerContent,
        });
        const imgMs = Date.now() - tImg;
        if (updated && updated !== readerContent) {
          await setModuleReaderContent(mod.id, updated);
          console.log(`[ReaderImages] module ${mod.id}: patched reader_content with image srcs in ${imgMs}ms`);
        } else {
          console.log(`[ReaderImages] module ${mod.id}: no image changes (${imgMs}ms)`);
        }
      } catch (imgErr) {
        console.error(`[ReaderImages] module ${mod.id}: rendering failed —`, imgErr.message);
      }
    }

    res.status(201).json({ success: true, data: { module: mod } });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, errors: [{ code: 'FILE_TOO_LARGE', message: 'File must be under 20MB.' }] });
    }
    next(err);
  }
});

/** GET /modules — list user's modules */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const modules = await listModules(req.user.id);
    res.json({ success: true, data: { modules } });
  } catch (err) { next(err); }
});

/** GET /modules/public — list public modules (paginated) */
router.get('/public', async (req, res, next) => {
  try {
    const { limit, offset } = req.query;
    const result = await listPublicModules({ limit, offset });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

/** GET /modules/:id — get module metadata */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const mod = await getModuleById(req.params.id);
    if (!mod) return res.status(404).json({ success: false, errors: [{ message: 'Module not found' }] });
    if (!mod.is_public && mod.user_id !== req.user?.id) {
      return res.status(403).json({ success: false, errors: [{ message: 'Access denied' }] });
    }
    res.json({ success: true, data: { module: mod } });
  } catch (err) { next(err); }
});

/** GET /modules/:id/file — serve the PDF (cached) */
router.get('/:id/file', optionalAuth, async (req, res, next) => {
  try {
    const moduleId = req.params.id;

    // Check access
    const mod = await getModuleById(moduleId);
    if (!mod) return res.status(404).json({ success: false, errors: [{ message: 'Module not found' }] });
    if (!mod.is_public && mod.user_id !== req.user?.id) {
      return res.status(403).json({ success: false, errors: [{ message: 'Access denied' }] });
    }

    const cachePath = join(CACHE_DIR, `${moduleId}.pdf`);

    // Cache-Control:
    //   public modules → public,max-age=86400 (CDN-cacheable, OK to share)
    //   private modules → private,max-age=86400 (browser-only, no shared cache)
    // Guarding against shared HTTP proxies caching an authenticated PDF.
    const cacheDirective = mod.is_public ? 'public, max-age=86400' : 'private, max-age=86400';

    // 1. Try local cache first (instant)
    if (existsSync(cachePath)) {
      console.log(`[Cache] HIT — serving ${moduleId} from disk`);
      const buffer = readFileSync(cachePath);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="module.pdf"',
        'Content-Length': buffer.length,
        'Cache-Control': cacheDirective,
      });
      return res.send(buffer);
    }

    // 2. Cache miss — fetch from DB, cache to disk
    console.log(`[Cache] MISS — fetching ${moduleId} from DB...`);
    const fileData = await getModuleFile(moduleId);
    if (!fileData || !fileData.file_data) {
      return res.status(404).json({ success: false, errors: [{ message: 'File not found' }] });
    }

    // Save to cache for next time
    writeFileSync(cachePath, fileData.file_data);
    console.log(`[Cache] Saved ${moduleId} to disk (${fileData.file_data.length} bytes)`);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${fileData.file_name || 'module.pdf'}"`,
      'Content-Length': fileData.file_data.length,
      'Cache-Control': cacheDirective,
    });
    res.send(fileData.file_data);
  } catch (err) { next(err); }
});

/** GET /modules/:id/reader — flowing-text reader content (Phase 1, no image bytes) */
router.get('/:id/reader', optionalAuth, async (req, res, next) => {
  try {
    const row = await getModuleReaderContent(req.params.id);
    if (!row) return res.status(404).json({ success: false, errors: [{ message: 'Module not found' }] });
    if (!row.is_public && row.user_id !== req.user?.id) {
      return res.status(403).json({ success: false, errors: [{ message: 'Access denied' }] });
    }
    const hasReader = !!row.reader_content;
    res.json({
      success: true,
      data: {
        has_reader: hasReader,
        reader_content: row.reader_content || null,
        extracted_at: row.reader_content_extracted_at || null,
      },
    });
  } catch (err) { next(err); }
});

/** GET /modules/:id/reader-image/:filename — serve a per-page or per-image PNG (Phase 3) */
router.get('/:id/reader-image/:filename', optionalAuth, async (req, res, next) => {
  try {
    const moduleId = req.params.id;
    const raw = String(req.params.filename || '');
    // Accept "p3-i0" or "p3-i0.png", and also whole-page "p3" / "p3.png".
    const stripped = raw.replace(/\.png$/i, '');
    if (!/^p\d{1,4}(?:-i\d{1,4})?$/.test(stripped)) {
      return res.status(400).json({ success: false, errors: [{ message: 'Invalid filename' }] });
    }

    // Auth — same model as /file: owner or public.
    const mod = await getModuleById(moduleId);
    if (!mod) return res.status(404).json({ success: false, errors: [{ message: 'Module not found' }] });
    if (!mod.is_public && mod.user_id !== req.user?.id) {
      return res.status(403).json({ success: false, errors: [{ message: 'Access denied' }] });
    }

    const filePath = join(CACHE_DIR, String(moduleId), 'images', `${stripped}.png`);

    // If the file is missing, lazily regenerate. This makes reader-mode images
    // self-healing across Railway disk wipes / new volume mounts. We render
    // ALL images for the module in one pass (one PDF load) and cache them
    // permanently to disk so subsequent requests hit the fast path.
    if (!existsSync(filePath)) {
      const regenerated = await regenerateModuleImages(moduleId).catch((err) => {
        console.warn(`[ReaderImage] regen failed for ${moduleId}:`, err?.message);
        return false;
      });
      if (!regenerated || !existsSync(filePath)) {
        return res.status(404).json({ success: false, errors: [{ message: 'Image not found' }] });
      }
    }

    const buffer = readFileSync(filePath);
    res.set({
      'Content-Type': 'image/png',
      'Content-Length': buffer.length,
      // Match the parent module's privacy. Private module → private cache.
      'Cache-Control': mod.is_public ? 'public, max-age=86400' : 'private, max-age=86400',
    });
    return res.send(buffer);
  } catch (err) { next(err); }
});

/**
 * Lazy regeneration helper: if a module's image files are missing on disk
 * (e.g. fresh Railway volume after a deploy), re-render them once from the
 * cached PDF or DB blob. Cheap because the PDF is local-cached too; if not,
 * we fall back to the DB. Coalesces concurrent calls for the same module.
 */
const regenInflight = new Map();
async function regenerateModuleImages(moduleId) {
  if (regenInflight.has(moduleId)) return regenInflight.get(moduleId);
  const promise = (async () => {
    // Load reader_content
    const row = await getModuleReaderContent(moduleId);
    if (!row || !row.reader_content) return false;
    const rc = row.reader_content;
    if (!Array.isArray(rc.pages) || !rc.pages.some((p) =>
      Array.isArray(p?.blocks) && p.blocks.some((b) => b && b.type === 'image')
    )) {
      return false;
    }

    // Load PDF buffer — disk cache first, DB fallback.
    let pdfBuffer = null;
    const pdfCachePath = join(CACHE_DIR, `${moduleId}.pdf`);
    if (existsSync(pdfCachePath)) {
      try { pdfBuffer = readFileSync(pdfCachePath); } catch {}
    }
    if (!pdfBuffer) {
      const fileRow = await getModuleFile(moduleId);
      if (fileRow && fileRow.file_data) {
        pdfBuffer = Buffer.isBuffer(fileRow.file_data) ? fileRow.file_data : Buffer.from(fileRow.file_data);
        // Backfill the disk cache while we're here.
        try {
          if (!existsSync(pdfCachePath)) writeFileSync(pdfCachePath, pdfBuffer);
        } catch {}
      }
    }
    if (!pdfBuffer) return false;

    console.log(`[ReaderImage] lazy regen for ${moduleId}: rendering all images`);
    const updatedRc = await renderModuleImages({
      pdfBuffer,
      moduleId,
      readerContent: rc,
    });

    if (updatedRc && updatedRc !== rc) {
      // Persist the updated readerContent (no-op if shape is unchanged).
      try { await setModuleReaderContent(moduleId, updatedRc); } catch {}
    }
    return true;
  })();
  regenInflight.set(moduleId, promise);
  try {
    return await promise;
  } finally {
    regenInflight.delete(moduleId);
  }
}


router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const updated = await updateModule(req.params.id, req.user.id, {
      title: req.body.title,
      isPublic: req.body.isPublic,
      pageCount: req.body.pageCount,
    });
    if (!updated) return res.status(404).json({ success: false, errors: [{ message: 'Module not found or not owned' }] });
    res.json({ success: true, data: { module: updated } });
  } catch (err) { next(err); }
});

/** DELETE /modules/:id */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const moduleId = req.params.id;

    // Validate UUID before any filesystem operation. Without this,
    // an authenticated user could pass `../../../some/file` and the
    // unlinkSync below would resolve outside the cache directory.
    // The DB delete that follows would error on a non-UUID id, but
    // by then the unlink is already done. Bound the suffix to .pdf
    // limits the damage but doesn't eliminate it — validate up front.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(moduleId)) {
      return res.status(400).json({
        success: false,
        errors: [{ code: 'INVALID_ID', message: 'Module id must be a valid UUID.' }],
      });
    }

    // Remove cached file
    const cachePath = join(CACHE_DIR, `${moduleId}.pdf`);
    if (existsSync(cachePath)) {
      const { unlinkSync } = await import('fs');
      unlinkSync(cachePath);
    }
    const deleted = await deleteModule(moduleId, req.user.id);
    if (!deleted) return res.status(404).json({ success: false, errors: [{ message: 'Module not found' }] });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
