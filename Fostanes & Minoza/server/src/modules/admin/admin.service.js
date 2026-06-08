import { query } from '../../database/db.js';
import { cached } from '../../utils/cache.js';

const CACHE_TTL = 30000; // 30 seconds

// Allowed values for the role filter on getAllUsers / getUsersList.
// 'all' = no filter (default).
const ROLE_FILTERS = new Set(['all', 'guest', 'student', 'teacher', 'admin']);

// Allowed user-type filters for attempt trends.
const USER_TYPE_FILTERS = new Set(['all', 'real', 'guest']);

// ===== OVERVIEW STATS =====
// Splits user counts and attempt counts by guest vs real (student/teacher/admin).
// Existing fields (totalUsers, totalQuizzes, totalAttempts, totalModules,
// aiRequestsToday) are preserved. New fields:
//   - totalGuests, totalAttemptsByGuests
//   - newSignupsThisWeek, newGuestsThisWeek
// totalUsers now counts only REAL users (role != 'guest') to match the
// "real" growth metric admins care about.
export async function getOverviewStats() {
  return cached('admin:stats', async () => {
    const [usersSplit, quizzes, modules, attemptsSplit, aiToday, weekSignups] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE role != 'guest') AS real_users,
          COUNT(*) FILTER (WHERE role = 'guest') AS guests
        FROM users
      `),
      query('SELECT COUNT(*) as count FROM quizzes'),
      query('SELECT COUNT(*) as count FROM modules'),
      query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE u.role = 'guest') AS by_guests
        FROM attempts a
        JOIN users u ON u.id = a.user_id
      `),
      query(`SELECT COUNT(*) as count FROM ai_requests WHERE created_at >= CURRENT_DATE`),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE role != 'guest') AS real_users,
          COUNT(*) FILTER (WHERE role = 'guest') AS guests
        FROM users
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `),
    ]);
    return {
      totalUsers: parseInt(usersSplit.rows[0].real_users) || 0,
      totalGuests: parseInt(usersSplit.rows[0].guests) || 0,
      totalQuizzes: parseInt(quizzes.rows[0].count) || 0,
      totalModules: parseInt(modules.rows[0].count) || 0,
      totalAttempts: parseInt(attemptsSplit.rows[0].total) || 0,
      totalAttemptsByGuests: parseInt(attemptsSplit.rows[0].by_guests) || 0,
      aiRequestsToday: parseInt(aiToday.rows[0].count) || 0,
      newSignupsThisWeek: parseInt(weekSignups.rows[0].real_users) || 0,
      newGuestsThisWeek: parseInt(weekSignups.rows[0].guests) || 0,
    };
  }, CACHE_TTL);
}

// ===== USER GROWTH =====
// Returns one row per day with both real_users and guests counts so the
// admin chart can render a stacked / dual-series view.
// Shape: [{ date, real_users, guests }, ...]
export async function getUserGrowth(days = 30) {
  const d = parseInt(days) || 30;
  return cached(`admin:userGrowth:${d}`, async () => {
    const result = await query(
      `SELECT
         DATE(created_at) as date,
         COUNT(*) FILTER (WHERE role != 'guest') AS real_users,
         COUNT(*) FILTER (WHERE role = 'guest') AS guests
       FROM users
       WHERE created_at >= NOW() - make_interval(days => $1)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [d]
    );
    return result.rows;
  }, CACHE_TTL);
}

// ===== QUIZ ACTIVITY =====
export async function getQuizActivity(days = 30) {
  const d = parseInt(days) || 30;
  return cached(`admin:quizActivity:${d}`, async () => {
    const result = await query(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM quizzes
       WHERE created_at >= NOW() - make_interval(days => $1)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [d]
    );
    return result.rows;
  }, CACHE_TTL);
}

// ===== ATTEMPT TRENDS =====
// userType: 'all' (default) | 'real' | 'guest'
//   - 'all'   no filter
//   - 'real'  WHERE u.role != 'guest'
//   - 'guest' WHERE u.role = 'guest'
export async function getAttemptTrends(days = 30, userType = 'all') {
  const d = parseInt(days) || 30;
  const ut = USER_TYPE_FILTERS.has(userType) ? userType : 'all';
  return cached(`admin:attemptTrends:${d}:${ut}`, async () => {
    let where = '';
    if (ut === 'real') where = `AND u.role != 'guest'`;
    else if (ut === 'guest') where = `AND u.role = 'guest'`;

    const result = await query(
      `SELECT DATE(a.completed_at) as date, COUNT(*) as count
       FROM attempts a
       JOIN users u ON u.id = a.user_id
       WHERE a.completed_at IS NOT NULL
         AND a.completed_at >= NOW() - make_interval(days => $1)
         ${where}
       GROUP BY DATE(a.completed_at)
       ORDER BY date ASC`,
      [d]
    );
    return result.rows;
  }, CACHE_TTL);
}

// ===== SCORE DISTRIBUTION =====
export async function getScoreDistribution() {
  return cached('admin:scoreDist', async () => {
    const result = await query(`
      SELECT
        CASE
          WHEN score >= 0  AND score < 10  THEN '0-10'
          WHEN score >= 10 AND score < 20  THEN '10-20'
          WHEN score >= 20 AND score < 30  THEN '20-30'
          WHEN score >= 30 AND score < 40  THEN '30-40'
          WHEN score >= 40 AND score < 50  THEN '40-50'
          WHEN score >= 50 AND score < 60  THEN '50-60'
          WHEN score >= 60 AND score < 70  THEN '60-70'
          WHEN score >= 70 AND score < 80  THEN '70-80'
          WHEN score >= 80 AND score < 90  THEN '80-90'
          WHEN score >= 90 AND score <= 100 THEN '90-100'
        END as range,
        COUNT(*) as count
      FROM attempts
      WHERE completed_at IS NOT NULL
      GROUP BY range
      ORDER BY range ASC
    `);
    return result.rows;
  }, CACHE_TTL);
}

// ===== PASS/FAIL RATIO =====
export async function getPassFailRatio(days = 30) {
  const d = parseInt(days) || 30;
  return cached(`admin:passFail:${d}`, async () => {
    const result = await query(
      `SELECT
        DATE(completed_at) as date,
        SUM(CASE WHEN score >= 70 THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN score < 70 THEN 1 ELSE 0 END) as failed
       FROM attempts
       WHERE completed_at IS NOT NULL
         AND completed_at >= NOW() - make_interval(days => $1)
       GROUP BY DATE(completed_at)
       ORDER BY date ASC`,
      [d]
    );
    return result.rows;
  }, CACHE_TTL);
}

// ===== TOP QUIZZES =====
export async function getTopQuizzes(limit = 10) {
  return cached(`admin:topQuizzes:${limit}`, async () => {
    const result = await query(`
      SELECT q.id, q.title, q.attempt_count, q.is_public,
        u.display_name as creator_name,
        (SELECT COUNT(*) FROM questions WHERE quiz_id = q.id) as question_count,
        q.created_at
      FROM quizzes q
      JOIN users u ON u.id = q.created_by
      ORDER BY q.attempt_count DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }, CACHE_TTL);
}

// ===== TOP USERS =====
// Excludes guests — they don't accumulate XP / streaks for global ranking.
//
// Implementation note: the previous version had two correlated subqueries
// per row (`(SELECT COUNT(*) FROM quizzes ...)` and `(SELECT COUNT(*) FROM
// attempts ...)`) which fire per-row — for limit=10 that's 20 extra round
// trips. Replaced with a single LEFT JOIN + GROUP BY so it's one query.
export async function getTopUsers(limit = 10) {
  return cached(`admin:topUsers:${limit}`, async () => {
    const result = await query(`
      SELECT
        u.id, u.display_name, u.email, u.avatar_url, u.xp, u.level, u.streak, u.role, u.created_at,
        COALESCE(q.cnt, 0) AS quizzes_created,
        COALESCE(a.cnt, 0) AS total_attempts
      FROM users u
      LEFT JOIN (
        SELECT created_by, COUNT(*) AS cnt FROM quizzes GROUP BY created_by
      ) q ON q.created_by = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS cnt FROM attempts GROUP BY user_id
      ) a ON a.user_id = u.id
      WHERE u.role != 'guest'
      ORDER BY u.xp DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }, CACHE_TTL);
}

// ===== MODULE STATS =====
export async function getModuleStats(days = 30) {
  const d = parseInt(days) || 30;
  return cached(`admin:moduleStats:${d}`, async () => {
    const [trends, distribution] = await Promise.all([
      query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM modules
         WHERE created_at >= NOW() - make_interval(days => $1)
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [d]
      ),
      query(`
        SELECT
          SUM(CASE WHEN is_public THEN 1 ELSE 0 END) as public_count,
          SUM(CASE WHEN NOT is_public THEN 1 ELSE 0 END) as private_count
        FROM modules
      `),
    ]);
    return {
      trends: trends.rows,
      distribution: distribution.rows[0] || { public_count: 0, private_count: 0 },
    };
  }, CACHE_TTL);
}

// ===== AI USAGE =====
export async function getAIUsage(days = 30) {
  const d = parseInt(days) || 30;
  return cached(`admin:aiUsage:${d}`, async () => {
    const [trends, byType] = await Promise.all([
      query(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM ai_requests
         WHERE created_at >= NOW() - make_interval(days => $1)
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
        [d]
      ),
      query(
        `SELECT request_type, COUNT(*) as count
         FROM ai_requests
         WHERE created_at >= NOW() - make_interval(days => $1)
         GROUP BY request_type
         ORDER BY count DESC`,
        [d]
      ),
    ]);
    return { trends: trends.rows, byType: byType.rows };
  }, CACHE_TTL);
}

// ===== RECENT ACTIVITY =====
// Each row is annotated with `actor_role` so the admin UI can flag
// guest-driven actions in the feed.
export async function getRecentActivity(limit = 20) {
  return cached(`admin:activity:${limit}`, async () => {
    const result = await query(`
      (SELECT 'attempt' as type, a.id::text, u.display_name, u.avatar_url,
        u.role AS actor_role,
        CONCAT('Scored ', ROUND(a.score), '% on ', q.title) as description,
        a.completed_at as created_at
       FROM attempts a
       JOIN users u ON u.id = a.user_id
       JOIN quizzes q ON q.id = a.quiz_id
       WHERE a.completed_at IS NOT NULL
       ORDER BY a.completed_at DESC LIMIT $1)
      UNION ALL
      (SELECT 'signup' as type, u.id::text, u.display_name, u.avatar_url,
        u.role AS actor_role,
        CASE WHEN u.role = 'guest' THEN 'Started a guest session' ELSE 'Joined Lexara' END as description,
        u.created_at
       FROM users u
       ORDER BY u.created_at DESC LIMIT $1)
      UNION ALL
      (SELECT 'quiz_created' as type, q.id::text, u.display_name, u.avatar_url,
        u.role AS actor_role,
        CONCAT('Created quiz: ', q.title) as description,
        q.created_at
       FROM quizzes q JOIN users u ON u.id = q.created_by
       ORDER BY q.created_at DESC LIMIT $1)
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }, 15000); // 15s cache for activity
}

// ===== ALL USERS (PAGINATED) =====
// Optional `role` filter: 'all' (default), 'guest', 'student', 'teacher', 'admin'.
export async function getAllUsers(page = 1, limit = 20, search = '', role = 'all') {
  const offset = (page - 1) * limit;
  const safeRole = ROLE_FILTERS.has(role) ? role : 'all';

  // Main query: $1 = limit, $2 = offset, then optional $3 (search), optional next (role).
  const mainParts = [];
  const mainParams = [limit, offset];
  if (search) {
    mainParams.push(`%${search}%`);
    mainParts.push(`(display_name ILIKE $${mainParams.length} OR email ILIKE $${mainParams.length})`);
  }
  if (safeRole !== 'all') {
    mainParams.push(safeRole);
    mainParts.push(`role = $${mainParams.length}`);
  }
  const mainWhere = mainParts.length ? `WHERE ${mainParts.join(' AND ')}` : '';

  // Count query: rebuild placeholders starting at $1 (no limit/offset).
  const countParts = [];
  const countParams = [];
  if (search) {
    countParams.push(`%${search}%`);
    countParts.push(`(display_name ILIKE $${countParams.length} OR email ILIKE $${countParams.length})`);
  }
  if (safeRole !== 'all') {
    countParams.push(safeRole);
    countParts.push(`role = $${countParams.length}`);
  }
  const countWhere = countParts.length ? `WHERE ${countParts.join(' AND ')}` : '';

  const [users, total] = await Promise.all([
    query(`
      SELECT
        u.id, u.display_name, u.email, u.avatar_url, u.role, u.xp, u.level, u.streak, u.last_active, u.created_at,
        COALESCE(q.cnt, 0) AS quizzes_created,
        COALESCE(a.cnt, 0) AS total_attempts
      FROM users u
      LEFT JOIN (
        SELECT created_by, COUNT(*) AS cnt FROM quizzes GROUP BY created_by
      ) q ON q.created_by = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS cnt FROM attempts GROUP BY user_id
      ) a ON a.user_id = u.id
      ${mainWhere}
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, mainParams),
    query(`SELECT COUNT(*) as count FROM users ${countWhere}`, countParams),
  ]);

  return {
    users: users.rows,
    total: parseInt(total.rows[0].count),
    page,
    totalPages: Math.ceil(parseInt(total.rows[0].count) / limit),
  };
}

// ===== ACTIVATE/DEACTIVATE USER =====

// Returns the user row needed to gate admin-on-admin deactivation. Read-only.
export async function findUserById(userId) {
  const result = await query(
    'SELECT id, display_name, email, role, is_active FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0] || null;
}

export async function setUserActive(userId, active) {
  const result = await query(
    'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, display_name, email, role, is_active',
    [active !== false, userId]
  );
  // When deactivating, immediately revoke ALL of the user's refresh
  // tokens. Their existing access token (max 15 min lifetime) will
  // expire on its own, and without a valid refresh they can't rotate.
  // /auth/refresh also re-checks is_active as a final defense.
  if (active === false && result.rows[0]) {
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
  }
  return result.rows[0];
}

// ===== LOG AI REQUEST =====
// Best-effort analytics write. Callers fire-and-forget so a DB hiccup
// doesn't fail the user's request — but we still want to know about
// errors. Catch internally and console.warn so they show up in the
// Railway logs instead of being silently swallowed.
export async function logAIRequest(userId, requestType) {
  try {
    await query(
      'INSERT INTO ai_requests (user_id, request_type) VALUES ($1, $2)',
      [userId, requestType]
    );
  } catch (err) {
    console.warn('[Admin] logAIRequest failed:', err.message);
  }
}


// ===== GAME MODE — Admin analytics =====
//
// Powered by the game_lobbies + game_attempts + game_question_events
// tables introduced by migrate-game-mode.js. All queries are cached
// for 30s (matches the rest of the admin dashboard) so a refresh
// doesn't hammer the DB.

/**
 * Top-line numbers for the Admin Game Mode page.
 * - active lobbies (open + in_progress)
 * - games today / 7d
 * - total games played
 * - average game duration
 */
export async function getGameOverview() {
  return cached('admin:gameOverview', async () => {
    const [active, todays, weeks, totalAttempts, durations] = await Promise.all([
      query(`SELECT COUNT(*)::int AS c FROM game_lobbies WHERE status IN ('open','in_progress')`),
      query(`SELECT COUNT(*)::int AS c FROM game_lobbies WHERE status = 'finished' AND ended_at >= CURRENT_DATE`),
      query(`SELECT COUNT(*)::int AS c FROM game_lobbies WHERE status = 'finished' AND ended_at >= NOW() - INTERVAL '7 days'`),
      query(`SELECT COUNT(*)::int AS c FROM game_attempts`),
      query(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (ended_at - started_at)))::int, 0) AS avg_seconds
               FROM game_lobbies
              WHERE status = 'finished' AND started_at IS NOT NULL AND ended_at IS NOT NULL
                AND ended_at >= NOW() - INTERVAL '30 days'`),
    ]);
    return {
      activeLobbies: active.rows[0].c,
      gamesToday: todays.rows[0].c,
      gamesWeek: weeks.rows[0].c,
      totalAttempts: totalAttempts.rows[0].c,
      avgGameSeconds: parseInt(durations.rows[0].avg_seconds) || 0,
    };
  }, CACHE_TTL);
}

/** Games-finished trend by day. */
export async function getGameTrends(days = 30) {
  const d = parseInt(days) || 30;
  return cached(`admin:gameTrends:${d}`, async () => {
    const r = await query(
      `SELECT DATE(ended_at) AS date, COUNT(*)::int AS count
         FROM game_lobbies
        WHERE status = 'finished'
          AND ended_at >= NOW() - make_interval(days => $1)
        GROUP BY DATE(ended_at)
        ORDER BY date ASC`,
      [d]
    );
    return r.rows;
  }, CACHE_TTL);
}

/**
 * Top game-mode players. Ranked by wins, ties broken by total
 * games played (so a 1-and-1 player ranks below a 1-and-0 player
 * but above a 0-and-many player).
 */
export async function getTopGamePlayers(limit = 10) {
  return cached(`admin:topGamePlayers:${limit}`, async () => {
    const r = await query(
      `SELECT
          u.id, u.display_name, u.avatar_url, u.role,
          COUNT(*)::int AS games_played,
          COUNT(*) FILTER (WHERE ga.rank = 1)::int AS wins,
          COALESCE(AVG(ga.score)::int, 0) AS avg_score,
          COALESCE(SUM(ga.xp_earned)::int, 0) AS total_xp
        FROM game_attempts ga
        JOIN users u ON u.id = ga.user_id
        GROUP BY u.id, u.display_name, u.avatar_url, u.role
        ORDER BY wins DESC, games_played DESC
        LIMIT $1`,
      [limit]
    );
    return r.rows;
  }, CACHE_TTL);
}

/**
 * Most-played quizzes in Game Mode.
 */
export async function getTopGameQuizzes(limit = 10) {
  return cached(`admin:topGameQuizzes:${limit}`, async () => {
    const r = await query(
      `SELECT
          q.id, q.title,
          COUNT(DISTINCT ga.lobby_id)::int AS games_played,
          COUNT(*)::int AS total_attempts
        FROM game_attempts ga
        JOIN quizzes q ON q.id = ga.quiz_id
        GROUP BY q.id, q.title
        ORDER BY games_played DESC, total_attempts DESC
        LIMIT $1`,
      [limit]
    );
    return r.rows;
  }, CACHE_TTL);
}
