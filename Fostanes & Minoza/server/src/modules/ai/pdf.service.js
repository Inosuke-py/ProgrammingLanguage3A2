import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PDFParse, VerbosityLevel } = require('pdf-parse');

/**
 * Extract text content from a PDF buffer.
 * @param {Buffer} buffer - The PDF file buffer
 * @returns {Promise<string>} Extracted text
 */
export async function extractTextFromPDF(buffer) {
  const parser = new PDFParse({
    verbosity: VerbosityLevel.ERRORS,
    data: new Uint8Array(buffer),
  });
  try {
    await parser.load();
    const raw = await parser.getText();

    // getText() may return string, array of page texts, or object
    let text;
    if (typeof raw === 'string') {
      text = raw;
    } else if (Array.isArray(raw)) {
      text = raw.join('\n');
    } else if (raw && typeof raw === 'object') {
      // Some versions return { text: '...' } or pages array
      text = raw.text || JSON.stringify(raw);
    } else {
      text = String(raw || '');
    }

    console.log(`[PDF] Extracted ${text.length} characters`);
    return text;
  } catch (err) {
    console.error('[PDF] Extraction failed:', err.message);
    throw new Error('Failed to extract text from PDF. The file may be corrupted or image-only.');
  } finally {
    try { parser.destroy(); } catch {}
  }
}
