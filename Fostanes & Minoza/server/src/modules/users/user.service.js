import { query } from '../../database/db.js';

/**
 * Find user by Google ID.
 */
export async function findByGoogleId(googleId) {
  const result = await query('SELECT * FROM users WHERE google_id = $1', [googleId]);
  return result.rows[0] || null;
}

/**
 * Find user by ID.
 */
export async function findById(id) {
  const result = await query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Find user by email.
 */
export async function findByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

/**
 * Admin emails — these accounts get admin role automatically.
 */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

/**
 * Create or update user from Google OAuth profile.
 * Upserts on google_id — returns the user row.
 * Assigns admin role if email is in the admin list.
 */
export async function upsertGoogleUser({ googleId, displayName, email, avatarUrl }) {
  const role = ADMIN_EMAILS.includes(email?.toLowerCase()) ? 'admin' : 'student';
  const result = await query(
    `INSERT INTO users (google_id, display_name, email, avatar_url, role, last_active)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (google_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       avatar_url = EXCLUDED.avatar_url,
       role = CASE WHEN $3 = ANY($6::text[]) THEN 'admin' ELSE users.role END,
       last_active = NOW()
     RETURNING *`,
    [googleId, displayName, email, avatarUrl, role, ADMIN_EMAILS]
  );
  return result.rows[0];
}

/**
 * Create a guest user (anonymous).
 */
export async function createGuestUser(displayName = 'Guest') {
  const result = await query(
    `INSERT INTO users (display_name, role) VALUES ($1, 'guest') RETURNING *`,
    [displayName]
  );
  return result.rows[0];
}

/**
 * Update user profile fields.
 */
export async function updateUser(id, updates) {
  const allowed = ['display_name', 'avatar_url'];
  const fields = [];
  const values = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  if (fields.length === 0) return findById(id);

  values.push(id);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return result.rows[0];
}

/**
 * Update user XP and recalculate level.
 * Level formula: level = floor(sqrt(xp / 100)) + 1
 */
export async function addXP(userId, xpAmount) {
  const result = await query(
    `UPDATE users SET
       xp = xp + $2,
       level = FLOOR(SQRT((xp + $2) / 100.0)) + 1,
       last_active = NOW()
     WHERE id = $1
     RETURNING id, xp, level, streak`,
    [userId, xpAmount]
  );
  return result.rows[0];
}

/**
 * Update user streak. Resets to 1 if last_active was more than 48h ago.
 */
export async function updateStreak(userId) {
  const result = await query(
    `UPDATE users SET
       streak = CASE
         WHEN DATE(last_active) = CURRENT_DATE THEN streak
         WHEN last_active >= NOW() - INTERVAL '48 hours' THEN streak + 1
         ELSE 1
       END,
       last_active = NOW()
     WHERE id = $1
     RETURNING streak`,
    [userId]
  );
  return result.rows[0]?.streak || 0;
}

/**
 * Get user stats for dashboard.
 */
/**
 * Global leaderboard — top users by XP.
 */
export async function getGlobalLeaderboard(limit = 10) {
  const result = await query(
    `SELECT id, display_name, avatar_url, xp, level, streak
     FROM users
     WHERE role != 'guest'
     ORDER BY xp DESC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Recompute a user's xp / level / streak from their attempts table.
 * Used after a guest -> Google merge so the merged user reflects the
 * combined (guest + existing) attempt history.
 *
 * Accepts an optional pg client so it can run inside a transaction; falls
 * back to the shared pool when called standalone.
 *
 * - xp     = SUM(attempts.xp_earned)
 * - level  = floor(sqrt(xp / 100)) + 1   (matches addXP())
 * - streak = consecutive distinct days ending at the most recent attempt;
 *            0 when there are no attempts.
 */
export async function recomputeUserStatsFromAttempts(client, userId) {
  const exec = client
    ? (text, params) => client.query(text, params)
    : (text, params) => query(text, params);

  const agg = await exec(
    `SELECT
       COALESCE(SUM(xp_earned), 0)::int AS total_xp,
       COUNT(*)::int                    AS total_attempts,
       MAX(completed_at)                AS last_attempt_at
     FROM attempts
     WHERE user_id = $1 AND completed_at IS NOT NULL`,
    [userId]
  );
  const totalXp = parseInt(agg.rows[0].total_xp) || 0;
  const lastAttemptAt = agg.rows[0].last_attempt_at;

  let streak = 0;
  if (lastAttemptAt) {
    const streakRow = await exec(
      `WITH days AS (
         SELECT DISTINCT DATE(completed_at) AS d
         FROM attempts
         WHERE user_id = $1 AND completed_at IS NOT NULL
       ),
       ordered AS (
         SELECT d, ROW_NUMBER() OVER (ORDER BY d DESC) AS rn
         FROM days
       )
       SELECT COUNT(*)::int AS s
       FROM ordered
       WHERE d = (SELECT MAX(d) FROM days) - (rn - 1) * INTERVAL '1 day'`,
      [userId]
    );
    streak = parseInt(streakRow.rows[0]?.s) || 0;
  }

  await exec(
    `UPDATE users
       SET xp = $2,
           level = FLOOR(SQRT($2 / 100.0)) + 1,
           streak = $3,
           last_active = NOW()
     WHERE id = $1`,
    [userId, totalXp, streak]
  );
}

export async function getUserStats(userId) {
  const result = await query(
    `SELECT
       u.xp, u.level, u.streak,
       COUNT(DISTINCT a.id) as total_attempts,
       COUNT(DISTINCT a.quiz_id) as unique_quizzes,
       COALESCE(AVG(a.score), 0) as avg_score,
       COALESCE(SUM(a.xp_earned), 0) as total_xp_earned
     FROM users u
     LEFT JOIN attempts a ON a.user_id = u.id
     WHERE u.id = $1
     GROUP BY u.id, u.xp, u.level, u.streak`,
    [userId]
  );
  return result.rows[0];
}

// =============================================
// AI PROVIDER KEYS — encrypted, per-user
// =============================================

import { encryptSecret, decryptSecret, lastFour } from '../../utils/crypto.js';

// Providers the user can save personal keys for.
//   - 'mistral' / 'gemini': SDK-based, baseUrl is fixed.
//   - 'openai-compatible': any OpenAI-format endpoint (OpenRouter, Groq,
//     Together, OpenAI itself, DeepSeek, custom self-hosted, etc.).
//     Requires both apiKey AND baseUrl AND model in the saved envelope.
const ALLOWED_PROVIDERS = ['mistral', 'gemini', 'openai-compatible'];

/**
 * Read the user's stored AI provider key envelopes.
 * Returns the raw JSONB so the caller can decide what to expose vs decrypt.
 */
async function getRawProviderKeys(userId) {
  const result = await query(
    'SELECT ai_provider_keys FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.ai_provider_keys || {};
}

/**
 * Public API for the client — describe what's saved without revealing keys.
 * Returns: {
 *   mistral: { hasKey: true, last4: "a3f9", model: "..." },
 *   gemini: { hasKey: false },
 *   'openai-compatible': { hasKey: true, last4: "...", model: "...", baseUrl: "https://..." }
 * }
 */
export async function listUserAIKeys(userId) {
  const stored = await getRawProviderKeys(userId);
  const out = {};
  for (const provider of ALLOWED_PROVIDERS) {
    const entry = stored[provider];
    out[provider] = entry?.ciphertext
      ? {
          hasKey: true,
          last4: entry.last4 || '',
          model: entry.model || '',
          // baseUrl is only relevant for openai-compatible; safe to surface.
          ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
        }
      : { hasKey: false };
  }
  return out;
}

/**
 * Save (or replace) a user's API key for a provider.
 * Encrypts the plaintext before persisting; the plaintext is discarded
 * immediately after encryption.
 *
 * For 'openai-compatible', a baseUrl is required and stored alongside the
 * encrypted key. baseUrl is treated as non-sensitive metadata (it's just
 * a URL like https://api.groq.com/openai/v1).
 */
export async function saveUserAIKey(userId, provider, apiKey, model, baseUrl) {
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  if (typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    throw new Error('API key looks too short to be valid');
  }
  if (provider === 'openai-compatible') {
    if (typeof baseUrl !== 'string' || !/^https?:\/\//i.test(baseUrl)) {
      throw new Error('Base URL must be a valid HTTP(S) URL');
    }
    if (typeof model !== 'string' || !model.trim()) {
      throw new Error('Model id is required for openai-compatible providers');
    }
  }

  const trimmed = apiKey.trim();
  const envelope = encryptSecret(trimmed);
  const entry = {
    ...envelope,
    last4: lastFour(trimmed),
    model: typeof model === 'string' && model.trim() ? model.trim() : '',
    savedAt: new Date().toISOString(),
    ...(provider === 'openai-compatible' && baseUrl
      ? { baseUrl: baseUrl.trim().replace(/\/+$/, '') }
      : {}),
  };

  // Merge into the JSONB column without touching other providers.
  await query(
    `UPDATE users
     SET ai_provider_keys = jsonb_set(
       COALESCE(ai_provider_keys, '{}'::jsonb),
       $2,
       $3::jsonb,
       true
     )
     WHERE id = $1`,
    [userId, `{${provider}}`, JSON.stringify(entry)]
  );

  return {
    hasKey: true,
    last4: entry.last4,
    model: entry.model,
    ...(entry.baseUrl ? { baseUrl: entry.baseUrl } : {}),
  };
}

/**
 * Remove a user's saved key for a provider.
 */
export async function deleteUserAIKey(userId, provider) {
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  await query(
    `UPDATE users
     SET ai_provider_keys = ai_provider_keys - $2
     WHERE id = $1`,
    [userId, provider]
  );
}

/**
 * INTERNAL — called by the AI service before invoking a provider.
 *
 * Resolves what API key + model to use for this request, by precedence:
 *   1. Per-request override (an explicit `apiKey` in the request body).
 *      We trust the caller to have validated this (e.g. CreateQuiz UI).
 *   2. The user's saved encrypted key (decrypted on the fly).
 *   3. The platform's environment fallback (returned as null so the
 *      provider helper falls back to env.{provider}ApiKey).
 *
 * NEVER returns the resolved key to the caller for any other purpose.
 */
export async function resolveUserAICreds(userId, provider, requestOverride = {}) {
  // Per-request override wins.
  if (requestOverride.apiKey && requestOverride.apiKey.trim()) {
    return {
      apiKey: requestOverride.apiKey.trim(),
      model: requestOverride.model?.trim() || null,
      baseUrl: requestOverride.baseUrl?.trim() || null,
      source: 'request',
    };
  }

  // Saved key.
  const stored = await getRawProviderKeys(userId);
  const entry = stored?.[provider];
  if (entry?.ciphertext) {
    try {
      const apiKey = decryptSecret(entry);
      return {
        apiKey,
        model: requestOverride.model?.trim() || entry.model || null,
        baseUrl: requestOverride.baseUrl?.trim() || entry.baseUrl || null,
        source: 'saved',
      };
    } catch (err) {
      console.error(`[AI] Failed to decrypt ${provider} key for user ${userId}:`, err.message);
      // Fall through to platform key.
    }
  }

  // Platform fallback.
  return {
    apiKey: null,
    model: requestOverride.model?.trim() || null,
    baseUrl: requestOverride.baseUrl?.trim() || null,
    source: 'platform',
  };
}
