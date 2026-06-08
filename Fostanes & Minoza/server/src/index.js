/**
 * Bootstrap — loads environment variables BEFORE any module imports.
 * This is the actual entry point. It ensures dotenv runs before
 * any module (like db.js) reads process.env at import time.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '..', '.env') });

// Now safe to import everything — env vars are loaded
const { startServer } = await import('./app.js');
startServer();
