import { env } from '../../config/env.js';
import { generateAccessToken, generateRefreshToken } from '../../middleware/auth.js';
import { upsertGoogleUser, createGuestUser, findById, recomputeUserStatsFromAttempts } from '../users/user.service.js';
import { query, transaction } from '../../database/db.js';
import { auditLog } from '../../utils/audit.js';

/**
 * Exchange Google OAuth code for user tokens.
 * 1. Exchange code for Google tokens
 * 2. Fetch Google user profile
 * 3. Upsert user in DB
 * 4. (Optional) Merge a prior guest session's attempts into this Google user
 * 5. Generate JWT pair
 *
 * @param {string} code — authorization code from Google
 * @param {object} [options]
 * @param {string} [options.mergeFromGuestId] — guest user id to merge into the
 *   resulting Google account. The merge runs in a transaction; on failure the
 *   transaction is rolled back and login still proceeds normally.
 */
export async function handleGoogleCallback(code, { mergeFromGuestId } = {}) {
  // Step 1: Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleCallbackUrl,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenResponse.json();
  if (tokenData.error) {
    throw new Error(`Google OAuth error: ${tokenData.error_description || tokenData.error}`);
  }

  // Step 2: Fetch user profile
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  const profile = await profileResponse.json();
  if (!profile.id) {
    throw new Error('Failed to fetch Google profile');
  }

  if (!profile.verified_email) {
    throw new Error('Google email not verified');
  }

  // Step 3: Upsert user
  let user = await upsertGoogleUser({
    googleId: profile.id,
    displayName: profile.name,
    email: profile.email,
    avatarUrl: profile.picture,
  });

  // Step 4: Optional guest -> Google merge.
  // Failures here MUST NOT block login — log and continue.
  if (mergeFromGuestId && mergeFromGuestId !== user.id) {
    try {
      const transferred = await mergeGuestIntoUser(mergeFromGuestId, user.id);
      if (transferred !== null) {
        auditLog('GUEST_MERGED', {
          fromGuestId: mergeFromGuestId,
          intoUserId: user.id,
          attemptsTransferred: transferred,
        });
        // Re-read so the caller gets the recomputed xp/level/streak.
        user = (await findById(user.id)) || user;
      }
    } catch (err) {
      auditLog('GUEST_MERGE_FAILED', {
        fromGuestId: mergeFromGuestId,
        intoUserId: user.id,
        error: err.message,
      });
      // swallow — login proceeds
    }
  }

  // Step 5: Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

/**
 * Transfer a guest user's attempts onto a Google user, recompute the Google
 * user's aggregate stats, and delete the now-orphaned guest row.
 *
 * Runs in a single transaction so a partial migration can never leave the
 * data in a half-merged state. Returns the number of attempts transferred,
 * or null if no merge happened (guest didn't exist or wasn't a guest).
 */
async function mergeGuestIntoUser(guestId, targetUserId) {
  return transaction(async (client) => {
    // Defensive check INSIDE the transaction — guards against TOCTOU and
    // accidental merges from a non-guest account.
    const guestRow = await client.query(
      `SELECT id, role FROM users WHERE id = $1 FOR UPDATE`,
      [guestId]
    );
    if (guestRow.rows.length === 0) return null;
    if (guestRow.rows[0].role !== 'guest') return null;

    // Move the guest's attempts onto the Google user.
    const moved = await client.query(
      `UPDATE attempts SET user_id = $1 WHERE user_id = $2`,
      [targetUserId, guestId]
    );
    const attemptsTransferred = moved.rowCount || 0;

    // Recompute the target user's xp/level/streak from their (now merged) attempts.
    await recomputeUserStatsFromAttempts(client, targetUserId);

    // Recreate per-quiz leaderboard entries for the target user.
    //
    // Why: leaderboard_entries has UNIQUE(quiz_id, user_id) and ON DELETE
    // CASCADE on user_id. When we later DELETE the guest row, any
    // leaderboard entries the guest had also cascade-delete — meaning the
    // attempts now belong to the Google user but their high scores have
    // vanished from every quiz leaderboard. We rebuild from the actual
    // attempts so the score history survives the merge.
    //
    // Group attempts by quiz, take the best score (ties broken by faster
    // time), and upsert. Done as one statement.
    const targetName = await client.query(
      `SELECT display_name FROM users WHERE id = $1`,
      [targetUserId]
    );
    const displayName = targetName.rows[0]?.display_name || 'User';

    await client.query(
      `INSERT INTO leaderboard_entries
         (quiz_id, user_id, display_name, best_score, best_time, attempts_count, achieved_at)
       SELECT
         quiz_id,
         $1,
         $2,
         MAX(score) AS best_score,
         MIN(CASE WHEN score = (SELECT MAX(score) FROM attempts a2 WHERE a2.user_id = $1 AND a2.quiz_id = a.quiz_id)
                  THEN time_taken END) AS best_time,
         COUNT(*) AS attempts_count,
         MAX(completed_at) AS achieved_at
       FROM attempts a
       WHERE user_id = $1
       GROUP BY quiz_id
       ON CONFLICT (quiz_id, user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         best_score = GREATEST(leaderboard_entries.best_score, EXCLUDED.best_score),
         best_time = CASE WHEN EXCLUDED.best_score >= leaderboard_entries.best_score
                          THEN COALESCE(EXCLUDED.best_time, leaderboard_entries.best_time)
                          ELSE leaderboard_entries.best_time END,
         attempts_count = EXCLUDED.attempts_count,
         achieved_at = CASE WHEN EXCLUDED.best_score > leaderboard_entries.best_score
                            THEN EXCLUDED.achieved_at
                            ELSE leaderboard_entries.achieved_at END`,
      [targetUserId, displayName]
    );

    // Delete the guest row — only if it's still a guest (defensive).
    await client.query(
      `DELETE FROM users WHERE id = $1 AND role = 'guest'`,
      [guestId]
    );

    return attemptsTransferred;
  });
}

/**
 * Create a guest session.
 *
 * `displayName` is sanitized to defend against abusive input:
 *   - Coerce to string and trim
 *   - Strip control characters and HTML angle brackets
 *   - Cap at 80 chars (matches the client-side limit on the welcome gate)
 *   - Fall back to "Guest" when empty / blank / under 2 chars
 */
export async function handleGuestLogin(displayName) {
  const safeName = sanitizeGuestName(displayName);
  const user = await createGuestUser(safeName);

  const accessToken = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(user.id);

  return { user, accessToken, refreshToken };
}

function sanitizeGuestName(raw) {
  if (typeof raw !== 'string') return 'Guest';
  let s = raw.normalize('NFC');
  // Strip control chars (incl. zero-width / direction overrides) and HTML brackets.
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E<>]/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length < 2) return 'Guest';
  if (s.length > 80) s = s.slice(0, 80);
  return s;
}

/**
 * Refresh access token using a refresh token.
 */
export async function handleTokenRefresh(refreshTokenValue) {
  const { createHash } = await import('crypto');
  const hash = createHash('sha256').update(refreshTokenValue).digest('hex');

  // Find and validate refresh token
  const result = await query(
    `DELETE FROM refresh_tokens
     WHERE token_hash = $1 AND expires_at > NOW()
     RETURNING user_id`,
    [hash]
  );

  if (result.rows.length === 0) {
    throw new Error('Invalid or expired refresh token');
  }

  const userId = result.rows[0].user_id;
  const user = await findById(userId);

  if (!user) {
    throw new Error('User not found');
  }

  // Block deactivated accounts from refreshing — without this an admin
  // who deactivates a user can't actually log them out. The user's
  // 15-minute access token would expire normally but they could rotate
  // refresh tokens forever. /auth/me alone returning 403 isn't enough
  // because the access token still passes authenticate() on other
  // routes. This is the choke point.
  if (user.is_active === false) {
    throw new Error('Account deactivated');
  }

  // Issue new token pair (rotation)
  const accessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user.id);

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Revoke all refresh tokens for a user (logout everywhere).
 */
export async function revokeAllTokens(userId) {
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

/**
 * Build Google OAuth consent URL.
 * @param {object} [options]
 * @param {string} [options.mergeFromGuestId] — embedded in OAuth state so the
 *   callback knows which guest user to merge into the resulting Google account.
 */
export function getGoogleAuthUrl({ mergeFromGuestId } = {}) {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleCallbackUrl,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });

  if (mergeFromGuestId) {
    // Encode the guest id as the OAuth state. We base64url it so it survives
    // Google's redirect untouched even if the id format ever changes.
    const stateObj = { mergeFromGuestId };
    const encoded = Buffer.from(JSON.stringify(stateObj), 'utf8').toString('base64url');
    params.set('state', encoded);
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Decode the OAuth `state` param produced by getGoogleAuthUrl.
 * Returns {} if missing or malformed — never throws.
 */
export function parseOAuthState(state) {
  if (!state || typeof state !== 'string') return {};
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
