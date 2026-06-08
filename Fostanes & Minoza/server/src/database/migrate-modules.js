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

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS modules (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(500) NOT NULL,
        file_name VARCHAR(255),
        file_data BYTEA,
        page_count INTEGER DEFAULT 0,
        is_public BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_modules_user_id ON modules(user_id);
    `);
    console.log('OK: modules table created');
  } catch (e) {
    console.error('Migration failed:', e.message);
  } finally {
    await pool.end();
  }
}

migrate();
