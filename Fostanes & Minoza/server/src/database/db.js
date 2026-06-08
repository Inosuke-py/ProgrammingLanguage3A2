import pg from 'pg';
const { Pool } = pg;

// Neon requires SSL — parse sslmode from connection string
const dbUrl = process.env.DATABASE_URL || '';
const useSSL = dbUrl.includes('sslmode=require') || dbUrl.includes('neon.tech');

const pool = new Pool({
  connectionString: dbUrl,
  ssl: useSSL ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
});

// Log connection status
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query with $1, $2... placeholders
 * @param {any[]} params - Parameter values
 * @returns {Promise<pg.QueryResult>}
 */
export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === 'development' && duration > 100) {
    console.warn(`[DB] Slow query (${duration}ms):`, text.substring(0, 80));
  }

  return result;
}

/**
 * Get a client from the pool for transactions.
 * ALWAYS release the client in a finally block.
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Execute multiple queries in a transaction.
 * @param {Function} callback - async (client) => { ... }
 */
export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Test database connection.
 */
export async function testConnection() {
  try {
    const result = await pool.query('SELECT NOW() as now');
    console.log(`[DB] Connected to Neon PostgreSQL at ${result.rows[0].now}`);
    return true;
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
    return false;
  }
}

export default pool;
