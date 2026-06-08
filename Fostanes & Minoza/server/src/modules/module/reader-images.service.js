/**
 * Reader Mode image rendering service (Phase 3).
 *
 * Renders real images from a PDF buffer to disk so the client reader view can
 * show actual figures instead of empty placeholder boxes.
 *
 * Public contract:
 *   renderModuleImages({ pdfBuffer, moduleId, readerContent }) =>
 *     a (possibly mutated) readerContent in which each image block has gained
 *     a `src` property pointing at /api/v1/modules/<id>/reader-image/<filename>.
 *
 * Side effects:
 *   PNGs are written to: server/src/uploads/modules/<moduleId>/images/<file>.png
 *
 * Defensive contract:
 *   - NEVER throws. On any global failure returns the original readerContent unchanged.
 *   - Per-page failures are isolated; one bad page does not abort the rest.
 *   - Per-page render is bounded by an 8s hard timeout. Pages that exceed it are skipped.
 *
 * Strategy:
 *   We render each page that has at least one image block at scale 2× to a node canvas.
 *   We then attempt to compute each image's bounding box on the rendered canvas by
 *   replaying the operator list with a CTM stack. If that succeeds we crop a sub-PNG
 *   per image. If anything goes wrong (missing CTM, NaN, oversize crop) we fall back
 *   to writing the whole-page PNG once and pointing every image block on that page
 *   at it. The client uses `object-fit: contain` and aspect ratio to display gracefully.
 */

import { createRequire } from 'module';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createCanvas, Path2D, DOMMatrix, ImageData } from '@napi-rs/canvas';

// pdfjs-dist v5 calls `new Path2D()` and `getCurrentTransform()` (which returns a
// DOMMatrix) directly during page rendering. The values these constructors produce
// MUST come from @napi-rs/canvas — the canvas's native binding only accepts its own
// implementations. Node 24 ships with a partial Path2D polyfill that previous
// `typeof === 'undefined'` guards skipped, leaving the wrong implementation in
// play and producing "Value is none of these types String, Path" errors at render
// time. We unconditionally install the napi-canvas versions so pdfjs always
// constructs values the canvas can consume.
globalThis.Path2D = Path2D;
globalThis.DOMMatrix = DOMMatrix;
globalThis.ImageData = ImageData;

const require = createRequire(import.meta.url);
// eslint-disable-next-line import/no-unresolved
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_ROOT = join(__dirname, '..', '..', 'uploads', 'modules');

const RENDER_SCALE = 2;
const PAGE_TIMEOUT_MS = 8000;
const MAX_CROP_PIXELS = 4096; // sanity guard per dimension

/**
 * Minimal canvas factory for pdfjs-dist running in Node.
 * pdfjs v5 in Node mode does not auto-detect a canvas implementation.
 */
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(Math.max(1, width | 0), Math.max(1, height | 0));
    const context = canvas.getContext('2d');
    return { canvas, context };
  }
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = Math.max(1, width | 0);
    canvasAndContext.canvas.height = Math.max(1, height | 0);
  }
  destroy(canvasAndContext) {
    if (!canvasAndContext) return;
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * Public entry point.
 * @param {{ pdfBuffer: Buffer, moduleId: string|number, readerContent: object }} args
 * @returns {Promise<object>} updated readerContent (or the original on global failure)
 */
export async function renderModuleImages({ pdfBuffer, moduleId, readerContent }) {
  if (!readerContent || !Array.isArray(readerContent.pages) || readerContent.pages.length === 0) {
    return readerContent;
  }
  if (!pdfBuffer || !pdfBuffer.length) return readerContent;
  if (!moduleId) return readerContent;

  // Determine which pages have image blocks. If none, nothing to do.
  const pagesNeedingImages = new Set();
  for (const p of readerContent.pages) {
    if (!p || !Array.isArray(p.blocks)) continue;
    for (const b of p.blocks) {
      if (b && b.type === 'image') {
        pagesNeedingImages.add(p.pageNumber);
        break;
      }
    }
  }
  if (pagesNeedingImages.size === 0) return readerContent;

  // Output dirs.
  const outDir = join(UPLOADS_ROOT, String(moduleId), 'images');
  try {
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  } catch (err) {
    console.warn(`[ReaderImages] Could not create output dir ${outDir}:`, err.message);
    return readerContent;
  }

  let doc;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      disableFontFace: true,
      useSystemFonts: false,
      isEvalSupported: false,
      verbosity: 0,
    });
    doc = await loadingTask.promise;
  } catch (err) {
    console.error(`[ReaderImages] getDocument failed for module ${moduleId}:`, err.message);
    return readerContent;
  }

  // Map: pageNumber -> { strategy: 'crop'|'whole', imagesByIndex?: { [index]: filename }, wholePageFile?: string }
  const pageOutcomes = new Map();

  try {
    for (const pageNumber of pagesNeedingImages) {
      const t0 = Date.now();
      try {
        const outcome = await Promise.race([
          renderPageImages(doc, pageNumber, outDir),
          new Promise((resolve) =>
            setTimeout(() => resolve({ strategy: 'timeout' }), PAGE_TIMEOUT_MS)
          ),
        ]);
        const ms = Date.now() - t0;
        if (outcome && outcome.strategy === 'timeout') {
          console.warn(`[ReaderImages] page ${pageNumber}: timed out after ${PAGE_TIMEOUT_MS}ms, skipping`);
        } else if (outcome) {
          pageOutcomes.set(pageNumber, outcome);
          console.log(`[ReaderImages] page ${pageNumber}: ${outcome.strategy} in ${ms}ms`);
        }
      } catch (err) {
        console.warn(`[ReaderImages] page ${pageNumber} failed:`, err.message);
      }
    }
  } finally {
    try { await doc.destroy(); } catch {}
  }

  // Merge outcomes into readerContent.
  const updated = patchReaderContent(readerContent, moduleId, pageOutcomes);
  return updated;
}

// ------------------------------------------------------------------
// Per-page rendering
// ------------------------------------------------------------------

/**
 * Render a single page and write image PNGs to disk.
 * Returns one of:
 *   { strategy: 'crop',  imagesByIndex: { [index]: filename } }   — cropped per image
 *   { strategy: 'whole', wholePageFile: filename }                — whole page PNG
 *   null                                                          — nothing written
 */
async function renderPageImages(doc, pageNumber, outDir) {
  let page;
  try {
    page = await doc.getPage(pageNumber);
  } catch (err) {
    console.warn(`[ReaderImages] getPage(${pageNumber}) failed:`, err.message);
    return null;
  }

  let canvasFactory = new NodeCanvasFactory();
  let canvasAndContext = null;

  try {
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const W = Math.max(1, Math.ceil(viewport.width));
    const H = Math.max(1, Math.ceil(viewport.height));
    canvasAndContext = canvasFactory.create(W, H);

    await page.render({
      canvasContext: canvasAndContext.context,
      viewport,
      canvasFactory,
    }).promise;

    // Try to compute per-image bounding boxes.
    let boxes = [];
    try {
      boxes = await computeImageBoxes(page, viewport);
    } catch (err) {
      console.warn(`[ReaderImages] CTM walk failed on page ${pageNumber}:`, err.message);
      boxes = [];
    }

    // Crop strategy if every image got a usable box.
    if (boxes.length > 0 && boxes.every((b) => b && b.usable)) {
      const imagesByIndex = {};
      for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const filename = `p${pageNumber}-i${i}`;
        const ok = cropAndWrite(canvasAndContext.canvas, box, W, H, join(outDir, `${filename}.png`));
        if (ok) {
          imagesByIndex[i] = filename;
        }
      }
      if (Object.keys(imagesByIndex).length === boxes.length) {
        return { strategy: 'crop', imagesByIndex };
      }
      // Partial success — fall through to whole-page below.
    }

    // Fallback: write the entire page as a single PNG.
    const wholeFilename = `p${pageNumber}`;
    const buf = canvasAndContext.canvas.toBuffer('image/png');
    writeFileSync(join(outDir, `${wholeFilename}.png`), buf);
    return { strategy: 'whole', wholePageFile: wholeFilename };
  } catch (err) {
    console.warn(`[ReaderImages] render page ${pageNumber} failed:`, err.message);
    if (process.env.READER_IMAGES_DEBUG) console.warn(err.stack);
    return null;
  } finally {
    try {
      if (canvasAndContext) canvasFactory.destroy(canvasAndContext);
    } catch {}
    try { page.cleanup(); } catch {}
  }
}

/**
 * Crop a rectangle out of a source canvas and write a PNG.
 * Returns true on success, false on any error.
 */
function cropAndWrite(srcCanvas, box, srcW, srcH, outPath) {
  try {
    const x = clamp(Math.floor(box.x), 0, srcW);
    const y = clamp(Math.floor(box.y), 0, srcH);
    const w = clamp(Math.ceil(box.w), 1, Math.min(MAX_CROP_PIXELS, srcW - x));
    const h = clamp(Math.ceil(box.h), 1, Math.min(MAX_CROP_PIXELS, srcH - y));
    if (w < 4 || h < 4) return false; // rejected as too small / clipped to nothing
    const sub = createCanvas(w, h);
    const sctx = sub.getContext('2d');
    sctx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);
    const buf = sub.toBuffer('image/png');
    writeFileSync(outPath, buf);
    return true;
  } catch (err) {
    console.warn('[ReaderImages] crop failed:', err.message);
    return false;
  }
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

// ------------------------------------------------------------------
// Operator-list walk: compute per-image bounding boxes in canvas pixels.
// ------------------------------------------------------------------

/**
 * Walk a page's operator list, maintaining a CTM stack. For every
 * paintImageXObject / paintInlineImageXObject we record the rectangle
 * (in PDF user-space) implied by the current CTM, then convert to
 * canvas-pixel space using the viewport transform.
 *
 * Returns an array (one entry per image, in document order) of:
 *   { usable: boolean, x, y, w, h }
 */
async function computeImageBoxes(page, viewport) {
  const ops = await page.getOperatorList();
  const OPS = pdfjsLib.OPS || {};
  const SAVE = OPS.save;
  const RESTORE = OPS.restore;
  const TRANSFORM = OPS.transform;
  const CONSTRUCT_PATH = OPS.constructPath; // not used but useful to know
  const PAINT_IMAGE = OPS.paintImageXObject;
  const PAINT_INLINE = OPS.paintInlineImageXObject;
  const PAINT_IMAGE_MASK = OPS.paintImageMaskXObject;
  void CONSTRUCT_PATH;

  if (PAINT_IMAGE === undefined && PAINT_INLINE === undefined) return [];

  const stack = [];
  let ctm = identity();
  const out = [];

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];

    if (fn === SAVE) {
      stack.push([...ctm]);
    } else if (fn === RESTORE) {
      const popped = stack.pop();
      if (popped) ctm = popped;
    } else if (fn === TRANSFORM) {
      // args is [a, b, c, d, e, f] — concat onto current CTM.
      if (Array.isArray(args) && args.length >= 6) {
        ctm = multiply(ctm, args);
      }
    } else if (fn === PAINT_IMAGE || fn === PAINT_INLINE || fn === PAINT_IMAGE_MASK) {
      // The image is drawn into the unit square [0,0]-[1,1] in its own
      // coordinate system, with the current CTM mapping that square to
      // user-space. For typical PDFs the unit square's CTM-mapped corners
      // give a tight bounding box.
      const corners = [
        applyMatrix(ctm, 0, 0),
        applyMatrix(ctm, 1, 0),
        applyMatrix(ctm, 0, 1),
        applyMatrix(ctm, 1, 1),
      ];
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const userMinX = Math.min(...xs);
      const userMaxX = Math.max(...xs);
      const userMinY = Math.min(...ys);
      const userMaxY = Math.max(...ys);

      // Convert PDF user-space rectangle to canvas pixel-space via the viewport.
      // viewport.convertToViewportPoint(x, y) => [x', y'] in canvas pixels,
      // with y already flipped to top-origin.
      const [px0, py0] = viewport.convertToViewportPoint(userMinX, userMinY);
      const [px1, py1] = viewport.convertToViewportPoint(userMaxX, userMaxY);
      const cx = Math.min(px0, px1);
      const cy = Math.min(py0, py1);
      const cw = Math.abs(px1 - px0);
      const ch = Math.abs(py1 - py0);

      const usable =
        Number.isFinite(cx) && Number.isFinite(cy) &&
        Number.isFinite(cw) && Number.isFinite(ch) &&
        cw >= 4 && ch >= 4 &&
        cw <= MAX_CROP_PIXELS && ch <= MAX_CROP_PIXELS;

      out.push({ usable, x: cx, y: cy, w: cw, h: ch });
    }
  }
  return out;
}

function identity() {
  return [1, 0, 0, 1, 0, 0];
}
function multiply(m, n) {
  // Standard 2D affine matrix multiplication (column-vector convention as used by PDF).
  const a = m[0] * n[0] + m[2] * n[1];
  const b = m[1] * n[0] + m[3] * n[1];
  const c = m[0] * n[2] + m[2] * n[3];
  const d = m[1] * n[2] + m[3] * n[3];
  const e = m[0] * n[4] + m[2] * n[5] + m[4];
  const f = m[1] * n[4] + m[3] * n[5] + m[5];
  return [a, b, c, d, e, f];
}
function applyMatrix(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// ------------------------------------------------------------------
// Patch readerContent with src URLs.
// ------------------------------------------------------------------

function patchReaderContent(readerContent, moduleId, pageOutcomes) {
  if (pageOutcomes.size === 0) return readerContent;

  const baseUrl = `/api/v1/modules/${moduleId}/reader-image/`;
  // Shallow-clone outer; deep-clone pages we touch.
  const out = { ...readerContent, pages: readerContent.pages.map((p) => p) };

  for (let i = 0; i < out.pages.length; i++) {
    const page = out.pages[i];
    if (!page || !Array.isArray(page.blocks)) continue;
    const outcome = pageOutcomes.get(page.pageNumber);
    if (!outcome) continue;

    let imageOrdinal = 0;
    const newBlocks = page.blocks.map((b) => {
      if (!b || b.type !== 'image') return b;
      const ord = imageOrdinal++;
      let filename = null;
      if (outcome.strategy === 'crop') {
        filename = outcome.imagesByIndex[ord] || null;
      } else if (outcome.strategy === 'whole') {
        filename = outcome.wholePageFile || null;
      }
      if (!filename) return b;
      return { ...b, src: baseUrl + filename };
    });

    out.pages[i] = { ...page, blocks: newBlocks };
  }
  return out;
}
