import { query } from '../../database/db.js';

export async function createModule(userId, title, fileName, fileBuffer, readerContent = null) {
  // readerContent is a JS object (or null) — pg serializes JSONB params from JS objects.
  // extracted_at is set to NOW() when we have content, NULL otherwise.
  const result = await query(
    `INSERT INTO modules (user_id, title, file_name, file_data, reader_content, reader_content_extracted_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $5::jsonb IS NULL THEN NULL ELSE NOW() END)
     RETURNING id, user_id, title, file_name, page_count, is_public, created_at,
               (reader_content IS NOT NULL) AS has_reader`,
    [userId, title, fileName, fileBuffer, readerContent]
  );
  return result.rows[0];
}

/** Fetch reader content + access metadata for a module. */
export async function getModuleReaderContent(moduleId) {
  const result = await query(
    `SELECT id, user_id, is_public, reader_content, reader_content_extracted_at
       FROM modules WHERE id = $1`,
    [moduleId]
  );
  return result.rows[0] || null;
}

/** Update reader content for an existing module (used by backfill / re-extract). */
export async function setModuleReaderContent(moduleId, readerContent) {
  const result = await query(
    `UPDATE modules
        SET reader_content = $2,
            reader_content_extracted_at = CASE WHEN $2::jsonb IS NULL THEN NULL ELSE NOW() END
      WHERE id = $1
      RETURNING id`,
    [moduleId, readerContent]
  );
  return result.rowCount > 0;
}

export async function listModules(userId) {
  const result = await query(
    `SELECT id, user_id, title, file_name, page_count, is_public, created_at
     FROM modules WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * List public modules.
 *
 * Paginated. Default page size of 50 is large enough to fit most
 * "Public Library" UIs without scrolling, but a UI that wants more
 * can pass {limit, offset}. Hard-capped at 100 per page so a
 * malicious client can't request the entire table at once.
 */
export async function listPublicModules({ limit = 50, offset = 0 } = {}) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit) || 50, 100));
  const safeOffset = Math.max(0, parseInt(offset) || 0);

  const [rows, count] = await Promise.all([
    query(
      `SELECT m.id, m.user_id, m.title, m.file_name, m.page_count, m.is_public, m.created_at,
              u.display_name as creator_name
       FROM modules m JOIN users u ON u.id = m.user_id
       WHERE m.is_public = true
       ORDER BY m.created_at DESC
       LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset]
    ),
    query(`SELECT COUNT(*) AS count FROM modules WHERE is_public = true`),
  ]);

  return {
    modules: rows.rows,
    meta: {
      limit: safeLimit,
      offset: safeOffset,
      total: parseInt(count.rows[0].count, 10),
    },
  };
}

export async function getModuleById(moduleId) {
  const result = await query(
    `SELECT id, user_id, title, file_name, page_count, is_public, created_at FROM modules WHERE id = $1`,
    [moduleId]
  );
  return result.rows[0] || null;
}

export async function getModuleFile(moduleId) {
  const result = await query(
    `SELECT file_data, file_name FROM modules WHERE id = $1`,
    [moduleId]
  );
  return result.rows[0] || null;
}

export async function updateModule(moduleId, userId, updates) {
  const fields = [];
  const values = [];
  let i = 1;

  if (updates.title !== undefined) { fields.push(`title = $${i++}`); values.push(updates.title); }
  if (updates.isPublic !== undefined) { fields.push(`is_public = $${i++}`); values.push(updates.isPublic); }
  if (updates.pageCount !== undefined) { fields.push(`page_count = $${i++}`); values.push(updates.pageCount); }

  if (fields.length === 0) return null;

  values.push(moduleId, userId);
  const result = await query(
    `UPDATE modules SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function deleteModule(moduleId, userId) {
  const result = await query(
    `DELETE FROM modules WHERE id = $1 AND user_id = $2 RETURNING id`,
    [moduleId, userId]
  );
  return result.rowCount > 0;
}
