/**
 * Reader Mode extraction service (Phase 1).
 *
 * Converts a PDF buffer into a normalized "flowing text" structure suitable
 * for a Wattpad-style reader view on the client.
 *
 * Output contract:
 *   {
 *     version: 1,
 *     totalPages: number,
 *     extractedAt: ISO string,
 *     pages: [{
 *       pageNumber: number,
 *       blocks: [
 *         { type: 'heading', level: 1|2|3, text: string },
 *         { type: 'paragraph', text: string },
 *         { type: 'list', ordered: boolean, items: string[] },
 *         { type: 'image', page: number, index: number, width: number, height: number },
 *       ]
 *     }],
 *     error?: string,   // present only if extraction failed gracefully
 *   }
 *
 * Defensive contract:
 *   - Never throws. On any error returns { version: 1, pages: [], totalPages: 0, error: 'extraction-failed' }.
 *   - Image bytes are NOT serialized in v1; only width/height/index references so the client
 *     can lay out a placeholder. A future endpoint will serve image bytes lazily.
 *   - Output is capped at ~5 MB serialized JSON. Excess pages are dropped and `truncated: true` is set.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Use the same pdfjs-dist that pdf-parse already pulls in — no new dependency.
// eslint-disable-next-line import/no-unresolved
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

const VERSION = 1;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024; // 5 MB
const Y_TOLERANCE = 2;                    // treat lines within 2 units of y as same line
const PARAGRAPH_GAP_FACTOR = 1.5;         // gap > 1.5x avg line height = paragraph break
const HEADING_FACTOR = 1.2;               // font size > 1.2x median = heading

// Bullet & numbered-list detection
const BULLET_CHARS = ['•', '●', '▪', '◦', '‣', '·'];
const BULLET_RE = /^\s*([•●▪◦‣·\-*])\s+(.*)$/;
const NUMBERED_RE = /^\s*(?:\d{1,3}|[a-zA-Z]|[ivxIVX]{1,4})[.)]\s+(.+)$/;

/**
 * Public entry point.
 * @param {Buffer} pdfBuffer
 * @returns {Promise<object>} normalized reader content (never throws)
 */
export async function extractReaderContent(pdfBuffer) {
  const extractedAt = new Date().toISOString();
  if (!pdfBuffer || !pdfBuffer.length) {
    return { version: VERSION, totalPages: 0, extractedAt, pages: [], error: 'empty-buffer' };
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
    console.error('[Reader] getDocument failed:', err.message);
    return { version: VERSION, totalPages: 0, extractedAt, pages: [], error: 'extraction-failed' };
  }

  try {
    const totalPages = doc.numPages;

    // Pass 1: collect raw items + font sizes per page so we can compute a document-wide median.
    const rawPages = [];
    const allFontSizes = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await doc.getPage(pageNum);
        const tc = await page.getTextContent();
        const items = (tc.items || []).filter((it) => typeof it.str === 'string');

        for (const it of items) {
          const fs = approxFontSize(it);
          if (fs > 0 && it.str.trim().length > 0) allFontSizes.push(fs);
        }

        // Image references via operator list — width/height only.
        const images = await collectImageRefs(page, pageNum).catch(() => []);

        rawPages.push({ pageNum, items, images });
        // Release page resources eagerly
        page.cleanup();
      } catch (pageErr) {
        console.warn(`[Reader] Skipping page ${pageNum}:`, pageErr.message);
        rawPages.push({ pageNum, items: [], images: [] });
      }
    }

    const medianFontSize = median(allFontSizes) || 12;
    const headingThreshold = medianFontSize * HEADING_FACTOR;

    // Pass 2: build normalized blocks per page.
    const pages = [];
    let truncated = false;
    let runningBytes = 0;

    for (const rp of rawPages) {
      const blocks = buildBlocks(rp.items, medianFontSize, headingThreshold);

      // Insert image placeholder blocks at end of page (we don't know the exact reading position
      // relative to text without deeper layout analysis — phase 1 keeps it simple).
      for (const img of rp.images) blocks.push(img);

      // If a page produced zero blocks (e.g., scanned-image PDF), emit an empty paragraph
      // so downstream code always has at least one block.
      if (blocks.length === 0) blocks.push({ type: 'paragraph', text: '' });

      const pageObj = { pageNumber: rp.pageNum, blocks };

      // Size cap: estimate bytes via JSON.stringify of this page.
      const pageBytes = Buffer.byteLength(JSON.stringify(pageObj), 'utf8');
      if (runningBytes + pageBytes > MAX_OUTPUT_BYTES) {
        truncated = true;
        break;
      }
      runningBytes += pageBytes;
      pages.push(pageObj);
    }

    const result = {
      version: VERSION,
      totalPages,
      extractedAt,
      pages,
    };
    if (truncated) result.truncated = true;
    return result;
  } catch (err) {
    console.error('[Reader] Extraction failed:', err.message);
    return { version: VERSION, totalPages: 0, extractedAt, pages: [], error: 'extraction-failed' };
  } finally {
    try { await doc.destroy(); } catch {}
  }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/** Approximate font size for a text item (transform[0] is x-scale ≈ font size). */
function approxFontSize(item) {
  const t = item.transform;
  if (!Array.isArray(t) || t.length < 6) return 0;
  // transform = [a, b, c, d, e, f] — font size ≈ sqrt(a*a + b*b)
  const a = t[0] || 0;
  const b = t[1] || 0;
  return Math.sqrt(a * a + b * b);
}

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Group items into lines by y, then into paragraphs/headings/lists. */
function buildBlocks(items, medianFontSize, headingThreshold) {
  if (!items.length) return [];

  // Each item carries a y (transform[5]) and approx fontSize.
  const enriched = items.map((it) => {
    const t = it.transform || [];
    return {
      str: it.str,
      y: typeof t[5] === 'number' ? t[5] : 0,
      x: typeof t[4] === 'number' ? t[4] : 0,
      fontSize: approxFontSize(it),
      hasEOL: !!it.hasEOL,
    };
  });

  // Group into lines: sort by y desc, then bucket within Y_TOLERANCE.
  // We sort by -y first so the top of the page comes first.
  const sorted = [...enriched].sort((a, b) => b.y - a.y);
  const lines = [];
  let current = null;
  for (const it of sorted) {
    if (!current || Math.abs(it.y - current.y) > Y_TOLERANCE) {
      if (current) lines.push(current);
      current = { y: it.y, items: [it] };
    } else {
      current.items.push(it);
    }
  }
  if (current) lines.push(current);

  // For each line: sort items left-to-right and concatenate.
  const lineObjs = lines.map((ln) => {
    const items = [...ln.items].sort((a, b) => a.x - b.x);
    const text = joinItemsToText(items);
    const sizes = items.map((i) => i.fontSize).filter((s) => s > 0);
    const avgSize = sizes.length ? sizes.reduce((s, v) => s + v, 0) / sizes.length : medianFontSize;
    return { y: ln.y, text, avgSize };
  });

  // Compute average line height (gap between consecutive lines) for paragraph detection.
  const gaps = [];
  for (let i = 1; i < lineObjs.length; i++) {
    const gap = Math.abs(lineObjs[i - 1].y - lineObjs[i].y);
    if (gap > 0) gaps.push(gap);
  }
  const avgGap = gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : medianFontSize * 1.2;

  // Walk lines top-to-bottom, accumulating blocks.
  const blocks = [];
  let buffer = []; // collected line objs for the current paragraph/list

  const flush = () => {
    if (!buffer.length) return;
    const block = bufferToBlock(buffer, headingThreshold);
    if (block) blocks.push(block);
    buffer = [];
  };

  for (let i = 0; i < lineObjs.length; i++) {
    const ln = lineObjs[i];
    if (!ln.text.trim()) {
      flush();
      continue;
    }

    const isHeading = ln.avgSize >= headingThreshold;
    if (isHeading) {
      // headings always become their own block
      flush();
      blocks.push(makeHeadingBlock(ln, headingThreshold));
      continue;
    }

    // Paragraph break: gap from previous line > PARAGRAPH_GAP_FACTOR * avgGap
    if (buffer.length > 0) {
      const prev = buffer[buffer.length - 1];
      const gap = Math.abs(prev.y - ln.y);
      if (gap > avgGap * PARAGRAPH_GAP_FACTOR) flush();
    }
    buffer.push(ln);
  }
  flush();

  return blocks;
}

/** Join PDF text items into a single string, inserting spaces only where necessary. */
function joinItemsToText(items) {
  let out = '';
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const str = cur.str;
    if (i === 0) { out = str; continue; }
    // If previous output already ends with whitespace or current starts with whitespace, no gap.
    if (/\s$/.test(out) || /^\s/.test(str)) {
      out += str;
    } else {
      out += ' ' + str;
    }
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Build a heading block at level 1/2/3 based on how much above threshold the size is. */
function makeHeadingBlock(line, headingThreshold) {
  // Crude leveling: very large = h1, large = h2, slightly large = h3
  let level = 3;
  const ratio = line.avgSize / headingThreshold;
  if (ratio >= 1.6) level = 1;
  else if (ratio >= 1.25) level = 2;
  return { type: 'heading', level, text: line.text };
}

/** Convert a buffer of contiguous lines into a paragraph or list block. */
function bufferToBlock(lines, _headingThreshold) {
  // List detection: every non-empty line starts with bullet or numbered prefix.
  const trimmedTexts = lines.map((l) => l.text.trim()).filter(Boolean);
  if (!trimmedTexts.length) return null;

  const allBulleted = trimmedTexts.every((t) => BULLET_RE.test(t));
  if (allBulleted) {
    return {
      type: 'list',
      ordered: false,
      items: trimmedTexts.map((t) => t.replace(BULLET_RE, '$2').trim()).filter(Boolean),
    };
  }

  const allNumbered = trimmedTexts.every((t) => NUMBERED_RE.test(t));
  if (allNumbered && trimmedTexts.length >= 2) {
    return {
      type: 'list',
      ordered: true,
      items: trimmedTexts.map((t) => {
        const m = t.match(NUMBERED_RE);
        return m ? m[1].trim() : t;
      }).filter(Boolean),
    };
  }

  // Otherwise: paragraph. Join with spaces.
  return { type: 'paragraph', text: trimmedTexts.join(' ').replace(/\s+/g, ' ').trim() };
}

/**
 * Collect image placeholder blocks for a page using the operator list.
 * We DO NOT read image bytes in phase 1 — only width/height metadata so the client
 * can render a placeholder slot.
 */
async function collectImageRefs(page, pageNum) {
  const out = [];
  try {
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS || {};
    const paintImage = OPS.paintImageXObject;
    const paintInline = OPS.paintInlineImageXObject;
    if (!paintImage && !paintInline) return out;

    let index = 0;
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      if (fn !== paintImage && fn !== paintInline) continue;

      const args = ops.argsArray[i] || [];
      let width = 0;
      let height = 0;

      // For paintInlineImageXObject the image object is inline in args[0]
      if (fn === paintInline && args[0] && typeof args[0] === 'object') {
        width = args[0].width || 0;
        height = args[0].height || 0;
      } else {
        // paintImageXObject — args[0] is the object name; resolve via page.objs / commonObjs.
        const name = args[0];
        const dims = await tryResolveImageDims(page, name);
        width = dims.width;
        height = dims.height;
      }

      out.push({
        type: 'image',
        page: pageNum,
        index,
        width,
        height,
      });
      index++;
    }
  } catch (err) {
    // Image discovery is best-effort.
    console.warn(`[Reader] image scan failed on page ${pageNum}:`, err.message);
  }
  return out;
}

/**
 * Attempt to resolve image dimensions from page.objs without blocking forever.
 * In Node, named image objects may not be ready; we fall back to 0/0 if unavailable.
 */
function tryResolveImageDims(page, name) {
  return new Promise((resolve) => {
    const fallback = { width: 0, height: 0 };
    if (!name || !page.objs) return resolve(fallback);
    let settled = false;
    const done = (img) => {
      if (settled) return;
      settled = true;
      if (img && typeof img === 'object') {
        resolve({ width: img.width || 0, height: img.height || 0 });
      } else {
        resolve(fallback);
      }
    };
    try {
      // page.objs.get may be sync (resolved) or take a callback (pending).
      const maybe = page.objs.get(name, (img) => done(img));
      if (maybe && typeof maybe === 'object') return done(maybe);
    } catch {
      return resolve(fallback);
    }
    // Safety timer in case the callback never fires.
    setTimeout(() => done(null), 50);
  });
}

// Suppress lint warning for unused helper alias
void BULLET_CHARS;
