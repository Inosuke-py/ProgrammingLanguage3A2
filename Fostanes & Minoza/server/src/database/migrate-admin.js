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
    // Create ai_requests tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        request_type VARCHAR(50) NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_ai_requests_user_id ON ai_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at ON ai_requests(created_at);
    `);
    console.log('OK: ai_requests table created');

    // Set admin role for the target user
    const result = await pool.query(
      `UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, display_name`,
      ['fostanesmarkrenier@gmail.com']
    );
    if (result.rowCount > 0) {
      console.log(`OK: Admin role set for ${result.rows[0].display_name} (${result.rows[0].id})`);
    } else {
      console.log('WARN: User fostanesmarkrenier@gmail.com not found — admin role will be set on next login');
    }
  } catch (e) {
    console.error('Migration failed:', e.message);
  } finally {
    await pool.end();
  }
}

migrate();
