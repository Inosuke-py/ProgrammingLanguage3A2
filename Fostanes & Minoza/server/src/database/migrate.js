import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '..', '..', '.env') });

async function migrate() {
  console.log('[Migrate] Starting database migration...');

  const { query, testConnection } = await import('./db.js');

  const connected = await testConnection();
  if (!connected) {
    console.error('[Migrate] Cannot connect to database. Aborting.');
    process.exit(1);
  }

  try {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Remove comment-only lines, then split by semicolons
    const cleaned = schema.replace(/^--.*$/gm, '');
    const statements = cleaned
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 5); // Filter empty and trivial fragments

    console.log(`[Migrate] Executing ${statements.length} statements...`);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 70).replace(/\n/g, ' ');
      try {
        await query(stmt);
        console.log(`[Migrate] ✓ (${i + 1}/${statements.length}) ${preview}`);
      } catch (err) {
        if (err.code === '42P07' || err.code === '42710') {
          console.log(`[Migrate] ⊘ (${i + 1}) Already exists: ${preview}`);
        } else {
          console.error(`[Migrate] ✗ (${i + 1}) FAILED: ${preview}`);
          console.error(`   Error: ${err.message} (code: ${err.code})`);
          throw err;
        }
      }
    }

    console.log('[Migrate] ✓ All done.');
  } catch (err) {
    console.error('[Migrate] ✗ Migration failed:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

migrate();
