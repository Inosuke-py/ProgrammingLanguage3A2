/**
 * Self-host the pdf.js worker via Vite's `?url` import.
 *
 * Why this matters:
 *   - Previously we pointed pdfjs.GlobalWorkerOptions.workerSrc at unpkg.com,
 *     which made every PDF render dependent on a third-party CDN being up.
 *     If unpkg is slow or down, the reader/thumbnail/modal-preview break.
 *   - The `?url` suffix makes Vite copy the file into dist/assets with a
 *     content hash and return its URL string. The browser fetches it
 *     same-origin, the service worker can precache it, and we never hit
 *     the network for a third-party host.
 *   - One central import means the version is always in sync with the
 *     react-pdf -> pdfjs-dist version we ship, so we can't drift to a
 *     mismatched worker (which would silently break PDF rendering).
 *
 * Import this module ONCE per page that uses react-pdf — the side
 * effect sets pdfjs.GlobalWorkerOptions.workerSrc on first import.
 */

import { pdfjs } from 'react-pdf';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
