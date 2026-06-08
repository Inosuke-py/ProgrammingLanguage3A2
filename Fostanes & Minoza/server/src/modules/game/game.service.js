/**
 * Game Mode — Persistence layer (Quiz Bowl).
 *
 * Pure DB operations. NO socket logic, NO in-memory game state. The
 * socket layer (Phase 2) will sit on top and call these for durability.
 *
 * Concurrency model:
 *   - Lobby create/join uses transactions + UNIQUE constraints to be
 *     race-safe. Two users can't claim the last open slot or the same
 *     avatar simultaneously — the second INSERT fails with conflict.
 *   - "User in active lobby" check is done at the application layer
 *     (we look up their existing memberships before insert) instead of
 *     a DB partial unique index, because the constraint depends on
 *     the *other* table's status column, which a partial unique can't
 *     reference.
 *   - Lobby capacity is enforced by re-counting members inside the
 *     transaction with FOR UPDATE on the lobby row, so two simultaneous
 *     joins to the same lobby serialize.
 */

import { query, transaction } from '../../database/db.js';
import { MODE_CAPACITY, MAX_SPECTATORS_PER_LOBBY, GAME_LIMITS, SCORING } from './game.config.js';

// ─────────────────────────────────────────────────────────────────────
// Errors used by this module — typed so the route layer can map them
// to the right HTTP status without sniffing message strings.
// ─────────────────────────────────────────────────────────────────────
export class GameError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// ─────────────────────────────────────────────────────────────────────
// LOBBY OPERATIONS
// ─────────────────────────────────────────────────────────────────────

/**
 * Get the count of currently-active (open + in_progress) lobbies.
 * Used by the route layer to check the global cap before creating.
 */
export async function getActiveLobbyCount() {
  const r = await query(
    `SELECT COUNT(*)::int AS count
       FROM game_lobbies
      WHERE status IN ('open', 'in_progress')`
  );
  return r.rows[0].count;
}

/**
 * Find a user's currently active lobby (if any).
 * Returns the lobby row + role + member_id, or null.
 *
 * Used as a precheck on create/join: a user can only be in ONE active
 * lobby at a time. If they're already in one, the UI should redirect
 * them to it instead of letting them start a second.
 */
export async function getUserActiveLobby(userId) {
  const r = await query(
    `SELECT
        l.id, l.host_user_id, l.quiz_id, l.mode, l.status,
        l.invite_code, l.is_public, l.created_at, l.started_at, l.ended_at,
        m.role AS my_role,
        m.id AS my_member_id
       FROM game_lobby_members m
       JOIN game_lobbies l ON l.id = m.lobby_id
      WHERE m.user_id = $1
        AND l.status IN ('open', 'in_progress')
      LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

/**
 * Create a lobby. The host is automatically added as the first member
 * (role=player, ready=false, no avatar yet).
 *
 * Race-safety:
 *   - Re-checks the host has no other active lobby INSIDE the
 *     transaction with FOR UPDATE on the user row.
 *   - Re-checks the global cap inside the transaction. If we're past
 *     the cap, throw — caller maps to 503.
 *   - Invite-code collision is handled by retrying on UNIQUE violation
 *     up to 3 times before giving up.
 */
export async function createLobby({ hostUserId, mode, quizId = null, isPublic = true }) {
  if (!MODE_CAPACITY[mode]) {
    throw new GameError('INVALID_MODE', `Unknown mode: ${mode}`);
  }

  return transaction(async (client) => {
    // Lock the user row so concurrent create-from-two-tabs serialize.
    await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [hostUserId]);

    // User can't be in another active lobby.
    const existing = await client.query(
      `SELECT l.id FROM game_lobby_members m
        JOIN game_lobbies l ON l.id = m.lobby_id
       WHERE m.user_id = $1 AND l.status IN ('open', 'in_progress')
       LIMIT 1`,
      [hostUserId]
    );
    if (existing.rowCount > 0) {
      throw new GameError(
        'ALREADY_IN_LOBBY',
        'You are already in an active lobby. Leave it first.',
        409
      );
    }

    // Global cap.
    const cap = await client.query(
      `SELECT COUNT(*)::int AS count
         FROM game_lobbies
        WHERE status IN ('open', 'in_progress')`
    );
    if (cap.rows[0].count >= GAME_LIMITS.MAX_CONCURRENT_LOBBIES) {
      throw new GameError(
        'SERVER_BUSY',
        'Too many active games right now — please try again in a minute.',
        503
      );
    }

    // Insert the lobby. The invite_code column exists in the schema
    // for future flexibility but is not exposed to the UI — invites
    // happen via the live online sidebar, not by typing a code.
    const r = await client.query(
      `INSERT INTO game_lobbies (host_user_id, quiz_id, mode, is_public)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [hostUserId, quizId, mode, isPublic]
    );
    const lobby = r.rows[0];

    // Add the host as a player member.
    await client.query(
      `INSERT INTO game_lobby_members (lobby_id, user_id, role)
       VALUES ($1, $2, 'player')`,
      [lobby.id, hostUserId]
    );

    return lobby;
  });
}

/**
 * Join a lobby (as player or spectator).
 *
 * Race-safety: lobby row is locked with FOR UPDATE so two simultaneous
 * joins to the SAME lobby see consistent capacity. UNIQUE (lobby_id, user_id)
 * also rejects same-user-from-two-tabs at the DB level.
 *
 * Returns the inserted member row.
 */
export async function joinLobby({ lobbyId, userId, role = 'player' }) {
  if (role !== 'player' && role !== 'spectator') {
    throw new GameError('INVALID_ROLE', 'role must be "player" or "spectator"');
  }

  return transaction(async (client) => {
    // Lock the lobby and read its mode.
    const lr = await client.query(
      `SELECT id, mode, status FROM game_lobbies WHERE id = $1 FOR UPDATE`,
      [lobbyId]
    );
    if (lr.rowCount === 0) {
      throw new GameError('LOBBY_NOT_FOUND', 'Lobby not found.', 404);
    }
    const lobby = lr.rows[0];
    if (lobby.status !== 'open') {
      throw new GameError(
        'LOBBY_NOT_JOINABLE',
        `This lobby is ${lobby.status} — cannot join.`,
        409
      );
    }

    // User can't be in another active lobby.
    const existing = await client.query(
      `SELECT l.id FROM game_lobby_members m
        JOIN game_lobbies l ON l.id = m.lobby_id
       WHERE m.user_id = $1 AND l.status IN ('open', 'in_progress')
       LIMIT 1`,
      [userId]
    );
    if (existing.rowCount > 0) {
      // If the user is already in THIS lobby, return idempotently.
      if (existing.rows[0].id === lobbyId) {
        const me = await client.query(
          `SELECT * FROM game_lobby_members WHERE lobby_id = $1 AND user_id = $2`,
          [lobbyId, userId]
        );
        return me.rows[0];
      }
      throw new GameError(
        'ALREADY_IN_LOBBY',
        'You are already in another active lobby. Leave it first.',
        409
      );
    }

    // Capacity check (per-role).
    const counts = await client.query(
      `SELECT role, COUNT(*)::int AS count
         FROM game_lobby_members
        WHERE lobby_id = $1
        GROUP BY role`,
      [lobbyId]
    );
    const playerCount = counts.rows.find((r) => r.role === 'player')?.count || 0;
    const spectatorCount = counts.rows.find((r) => r.role === 'spectator')?.count || 0;
    if (role === 'player' && playerCount >= MODE_CAPACITY[lobby.mode]) {
      throw new GameError(
        'LOBBY_FULL',
        `This lobby is full (${MODE_CAPACITY[lobby.mode]} players max).`,
        409
      );
    }
    if (role === 'spectator' && spectatorCount >= MAX_SPECTATORS_PER_LOBBY) {
      throw new GameError(
        'SPECTATOR_FULL',
        'This lobby already has a spectator.',
        409
      );
    }

    // Insert. UNIQUE (lobby_id, user_id) prevents accidental duplicate.
    try {
      const r = await client.query(
        `INSERT INTO game_lobby_members (lobby_id, user_id, role)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [lobbyId, userId, role]
      );
      return r.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new GameError('ALREADY_JOINED', 'You are already in this lobby.', 409);
      }
      throw err;
    }
  });
}

/**
 * Leave a lobby. If the host leaves and there are other members,
 * promote the oldest remaining player to host. If the host leaves
 * and is alone, mark the lobby abandoned.
 *
 * Returns { lobbyClosed: boolean, newHostId?: string }.
 */
export async function leaveLobby({ lobbyId, userId }) {
  return transaction(async (client) => {
    // Lock the lobby row.
    const lr = await client.query(
      `SELECT id, host_user_id, status FROM game_lobbies WHERE id = $1 FOR UPDATE`,
      [lobbyId]
    );
    if (lr.rowCount === 0) return { lobbyClosed: true };
    const lobby = lr.rows[0];

    // Remove the member.
    const del = await client.query(
      `DELETE FROM game_lobby_members WHERE lobby_id = $1 AND user_id = $2 RETURNING role`,
      [lobbyId, userId]
    );
    if (del.rowCount === 0) {
      // Wasn't a member — nothing to do.
      return { lobbyClosed: false };
    }

    // Are there any members left?
    const remaining = await client.query(
      `SELECT user_id, role, joined_at
         FROM game_lobby_members
        WHERE lobby_id = $1
        ORDER BY joined_at ASC`,
      [lobbyId]
    );

    // Empty lobby → mark abandoned (or finished if it was in progress).
    if (remaining.rowCount === 0) {
      const newStatus = lobby.status === 'in_progress' ? 'finished' : 'abandoned';
      await client.query(
        `UPDATE game_lobbies SET status = $1, ended_at = NOW() WHERE id = $2`,
        [newStatus, lobbyId]
      );
      return { lobbyClosed: true };
    }

    // Host left → promote oldest player (or oldest spectator if no players).
    if (lobby.host_user_id === userId) {
      const players = remaining.rows.filter((r) => r.role === 'player');
      const newHost = players[0] || remaining.rows[0];
      await client.query(
        `UPDATE game_lobbies SET host_user_id = $1 WHERE id = $2`,
        [newHost.user_id, lobbyId]
      );
      return { lobbyClosed: false, newHostId: newHost.user_id };
    }

    return { lobbyClosed: false };
  });
}

/**
 * List active public lobbies (browser view).
 * Returns lobbies with member counts, joinable first.
 *
 * Solo lobbies are excluded — they're at capacity the moment the host
 * joins (capacity = 1) so they're nothing for other users to join.
 * Listing them just creates clutter and a confusing "Full" button.
 */
export async function listPublicLobbies({ limit = 20, excludeUserId = null } = {}) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit) || 20, 50));
  const params = [safeLimit];
  let exclusionClause = '';
  if (excludeUserId) {
    params.push(excludeUserId);
    exclusionClause = `AND l.host_user_id <> $${params.length}`;
  }
  const r = await query(
    `SELECT
        l.id, l.mode, l.status, l.invite_code, l.created_at,
        l.host_user_id,
        u.display_name AS host_name,
        u.avatar_url AS host_avatar,
        q.id AS quiz_id, q.title AS quiz_title,
        COALESCE(p.player_count, 0)::int AS player_count,
        COALESCE(s.spectator_count, 0)::int AS spectator_count
       FROM game_lobbies l
       JOIN users u ON u.id = l.host_user_id
       LEFT JOIN quizzes q ON q.id = l.quiz_id
       LEFT JOIN (
         SELECT lobby_id, COUNT(*) AS player_count
           FROM game_lobby_members WHERE role = 'player' GROUP BY lobby_id
       ) p ON p.lobby_id = l.id
       LEFT JOIN (
         SELECT lobby_id, COUNT(*) AS spectator_count
           FROM game_lobby_members WHERE role = 'spectator' GROUP BY lobby_id
       ) s ON s.lobby_id = l.id
      WHERE l.status = 'open'
        AND l.is_public = true
        AND l.mode <> 'solo'
        ${exclusionClause}
      ORDER BY l.created_at DESC
      LIMIT $1`,
    params
  );
  return r.rows;
}

/**
 * Fetch a lobby by id, with its members and chosen quiz.
 * Used for the lobby room view.
 */
export async function getLobby(lobbyId) {
  const lobbyRes = await query(
    `SELECT
        l.*,
        q.id AS quiz_id, q.title AS quiz_title,
        u.display_name AS host_name
       FROM game_lobbies l
       LEFT JOIN quizzes q ON q.id = l.quiz_id
       JOIN users u ON u.id = l.host_user_id
      WHERE l.id = $1`,
    [lobbyId]
  );
  if (lobbyRes.rowCount === 0) return null;

  const membersRes = await query(
    `SELECT
        m.id AS member_id, m.user_id, m.role, m.avatar_id, m.ready, m.joined_at,
        u.display_name, u.avatar_url
       FROM game_lobby_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.lobby_id = $1
      ORDER BY m.joined_at ASC`,
    [lobbyId]
  );
  return { ...lobbyRes.rows[0], members: membersRes.rows };
}

/**
 * Switch a member's role within the lobby (player ↔ spectator).
 * Race-safe: re-counts capacity inside a transaction with FOR UPDATE.
 *
 * Spectators don't ready up — switching to spectator clears the ready flag.
 * Switching to player when there's no open slot rejects with NO_OPEN_SLOT.
 *
 * Game must still be 'open' (not in_progress) to switch roles.
 */
export async function switchRole({ lobbyId, userId, newRole }) {
  if (newRole !== 'player' && newRole !== 'spectator') {
    throw new GameError('INVALID_ROLE', 'role must be "player" or "spectator"');
  }
  return transaction(async (client) => {
    const lr = await client.query(
      `SELECT id, mode, status FROM game_lobbies WHERE id = $1 FOR UPDATE`,
      [lobbyId]
    );
    if (lr.rowCount === 0) throw new GameError('LOBBY_NOT_FOUND', 'Lobby not found.', 404);
    const lobby = lr.rows[0];
    if (lobby.status !== 'open') {
      throw new GameError(
        'LOBBY_NOT_JOINABLE',
        'Cannot switch roles after the game has started.',
        409
      );
    }

    const me = await client.query(
      `SELECT role FROM game_lobby_members WHERE lobby_id = $1 AND user_id = $2 FOR UPDATE`,
      [lobbyId, userId]
    );
    if (me.rowCount === 0) throw new GameError('NOT_A_MEMBER', 'You are not in this lobby.', 404);
    if (me.rows[0].role === newRole) return; // no-op

    // Capacity check for the destination role.
    const counts = await client.query(
      `SELECT role, COUNT(*)::int AS count
         FROM game_lobby_members
        WHERE lobby_id = $1
        GROUP BY role`,
      [lobbyId]
    );
    const playerCount = counts.rows.find((r) => r.role === 'player')?.count || 0;
    const spectatorCount = counts.rows.find((r) => r.role === 'spectator')?.count || 0;

    if (newRole === 'player') {
      // We're freeing the spectator slot and taking a player slot.
      if (playerCount >= MODE_CAPACITY[lobby.mode]) {
        throw new GameError(
          'NO_OPEN_SLOT',
          `Player slots are full (${MODE_CAPACITY[lobby.mode]} max).`,
          409
        );
      }
    } else {
      // newRole === 'spectator'
      if (spectatorCount >= MAX_SPECTATORS_PER_LOBBY) {
        throw new GameError(
          'SPECTATOR_FULL',
          'Spectator seat is taken.',
          409
        );
      }
    }

    // Switching to spectator releases ready + avatar (spectators
    // don't have either).
    if (newRole === 'spectator') {
      await client.query(
        `UPDATE game_lobby_members
            SET role = 'spectator', ready = false, avatar_id = NULL
          WHERE lobby_id = $1 AND user_id = $2`,
        [lobbyId, userId]
      );
    } else {
      await client.query(
        `UPDATE game_lobby_members
            SET role = 'player'
          WHERE lobby_id = $1 AND user_id = $2`,
        [lobbyId, userId]
      );
    }
  });
}

/**
 * Host-only: kick a member from the lobby.
 *
 * Server-enforced authority — caller must be the host of the lobby.
 * The host cannot kick themselves (they should use leaveLobby).
 *
 * Returns { kicked: true } on success.
 */
export async function kickMember({ lobbyId, hostUserId, targetUserId }) {
  if (hostUserId === targetUserId) {
    throw new GameError('CANNOT_KICK_SELF', 'Use leave to remove yourself.', 400);
  }
  return transaction(async (client) => {
    const lr = await client.query(
      `SELECT id, host_user_id, status FROM game_lobbies WHERE id = $1 FOR UPDATE`,
      [lobbyId]
    );
    if (lr.rowCount === 0) throw new GameError('LOBBY_NOT_FOUND', 'Lobby not found.', 404);
    const lobby = lr.rows[0];
    if (lobby.host_user_id !== hostUserId) {
      throw new GameError('NOT_HOST', 'Only the host can kick members.', 403);
    }
    if (lobby.status !== 'open') {
      throw new GameError(
        'LOBBY_NOT_JOINABLE',
        'Cannot kick after the game has started.',
        409
      );
    }
    const del = await client.query(
      `DELETE FROM game_lobby_members WHERE lobby_id = $1 AND user_id = $2 RETURNING role`,
      [lobbyId, targetUserId]
    );
    if (del.rowCount === 0) {
      throw new GameError('NOT_A_MEMBER', 'That user is not in this lobby.', 404);
    }
    // If kicking emptied the lobby (host alone with one other → host
    // kicks them, host is alone), the lobby still has the host so it
    // doesn't auto-close. Return lobbyClosed:false consistently.
    return { kicked: true, lobbyClosed: false };
  });
}

/**
 * Fetch a lobby by invite code (kept for completeness; no longer
 * exposed in routes since invites happen via the online sidebar).
 */
export async function getLobbyByInviteCode(code) {
  const r = await query(
    `SELECT id, status FROM game_lobbies WHERE invite_code = $1`,
    [String(code || '').toUpperCase()]
  );
  return r.rows[0] || null;
}

/**
 * Update the chosen quiz (host or spectator only — caller must enforce).
 */
export async function setLobbyQuiz({ lobbyId, quizId }) {
  await query(
    `UPDATE game_lobbies SET quiz_id = $1 WHERE id = $2 AND status = 'open'`,
    [quizId, lobbyId]
  );
}

/**
 * Toggle a member's ready state (self-only — caller passes their own user id).
 */
export async function setMemberReady({ lobbyId, userId, ready }) {
  await query(
    `UPDATE game_lobby_members SET ready = $1 WHERE lobby_id = $2 AND user_id = $3`,
    [!!ready, lobbyId, userId]
  );
}

/**
 * Pick an avatar.
 *
 * Race-safety: UNIQUE (lobby_id, avatar_id) means two players can't grab
 * the same avatar even if both clicks arrive in the same millisecond.
 * The second INSERT fails — we map that to a clean error.
 *
 * Per the product spec, avatars cannot be "swapped" — once taken, the
 * other player must wait for the holder to either pick a different one
 * or release it (set to null).
 */
export async function pickAvatar({ lobbyId, userId, avatarId }) {
  if (avatarId !== null && (typeof avatarId !== 'number' || avatarId < 1 || avatarId > 5)) {
    throw new GameError('INVALID_AVATAR', 'avatarId must be null or 1..5');
  }
  return transaction(async (client) => {
    // Read current avatar so we can free it if changing.
    const cur = await client.query(
      `SELECT avatar_id FROM game_lobby_members
        WHERE lobby_id = $1 AND user_id = $2 FOR UPDATE`,
      [lobbyId, userId]
    );
    if (cur.rowCount === 0) {
      throw new GameError('NOT_A_MEMBER', 'You are not in this lobby.', 404);
    }

    try {
      await client.query(
        `UPDATE game_lobby_members
            SET avatar_id = $1
          WHERE lobby_id = $2 AND user_id = $3`,
        [avatarId, lobbyId, userId]
      );
    } catch (err) {
      if (err.code === '23505') {
        throw new GameError(
          'AVATAR_TAKEN',
          'That avatar is already taken by another player.',
          409
        );
      }
      throw err;
    }
  });
}

/**
 * Mark a lobby in-progress (called when the game actually starts).
 */
export async function markLobbyInProgress(lobbyId) {
  await query(
    `UPDATE game_lobbies
        SET status = 'in_progress', started_at = NOW()
      WHERE id = $1 AND status = 'open'`,
    [lobbyId]
  );
}

/**
 * Roll a lobby back to 'open' status. Called when the engine fails
 * to start (e.g. quiz has no questions or was deleted between the
 * Start click and the engine load) so the lobby isn't stranded
 * in_progress with no engine running.
 */
export async function rollbackLobbyToOpen(lobbyId) {
  await query(
    `UPDATE game_lobbies
        SET status = 'open', started_at = NULL
      WHERE id = $1 AND status = 'in_progress'`,
    [lobbyId]
  );
}

/**
 * Mark a lobby finished and write the per-player results.
 *
 * `results` is an array of { userId, quizId, score, rank, correctCount,
 * wrongCount, timeoutCount, avgBuzzTimeMs, totalQuestions, xpEarned }.
 * One transaction so all results land or none do.
 */
export async function finalizeGame({ lobbyId, results, questionEvents = [] }) {
  return transaction(async (client) => {
    await client.query(
      `UPDATE game_lobbies
          SET status = 'finished', ended_at = NOW()
        WHERE id = $1`,
      [lobbyId]
    );

    if (results.length === 0) return;

    // Bulk insert attempts.
    const placeholders = results
      .map(
        (_, i) =>
          `($${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}, $${i * 11 + 4}, $${i * 11 + 5}, $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9}, $${i * 11 + 10}, $${i * 11 + 11})`
      )
      .join(', ');
    const params = results.flatMap((r) => [
      lobbyId,
      r.userId,
      r.quizId,
      r.score,
      r.rank,
      r.correctCount,
      r.wrongCount,
      r.timeoutCount,
      r.avgBuzzTimeMs ?? null,
      r.totalQuestions,
      r.xpEarned,
    ]);
    await client.query(
      `INSERT INTO game_attempts
         (lobby_id, user_id, quiz_id, score, rank, correct_count, wrong_count,
          timeout_count, avg_buzz_time_ms, total_questions, xp_earned)
       VALUES ${placeholders}
       ON CONFLICT (lobby_id, user_id) DO NOTHING`,
      params
    );

    // Bulk insert question events (analytics).
    if (questionEvents.length > 0) {
      const evPh = questionEvents
        .map(
          (_, i) =>
            `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`
        )
        .join(', ');
      const evParams = questionEvents.flatMap((e) => [
        lobbyId,
        e.questionId,
        e.userId ?? null,
        e.eventType,
        e.responseTimeMs ?? null,
      ]);
      await client.query(
        `INSERT INTO game_question_events
           (lobby_id, question_id, user_id, event_type, response_time_ms)
         VALUES ${evPh}`,
        evParams
      );
    }
  });
}

/**
 * Reap stale lobbies. Run on a setInterval (~5 min).
 *
 * Closes:
 *   - 'open' lobbies older than LOBBY_IDLE_TIMEOUT_MS with no recent activity
 *   - 'in_progress' lobbies older than 2 hours (sanity cutoff)
 *
 * Returns the number of lobbies closed.
 */
export async function reapStaleLobbies() {
  const idleSec = Math.floor(GAME_LIMITS.LOBBY_IDLE_TIMEOUT_MS / 1000);
  const r = await query(
    `UPDATE game_lobbies
        SET status = 'abandoned', ended_at = NOW()
      WHERE (status = 'open'        AND created_at < NOW() - make_interval(secs => $1))
         OR (status = 'in_progress' AND started_at < NOW() - INTERVAL '2 hours')
      RETURNING id`,
    [idleSec]
  );
  return r.rowCount;
}

// ─────────────────────────────────────────────────────────────────────
// USER GAME STATS — for the user dashboard "Game Mode" card.
// ─────────────────────────────────────────────────────────────────────

export async function getUserGameStats(userId) {
  const r = await query(
    `SELECT
        COUNT(*)::int AS games_played,
        COUNT(*) FILTER (WHERE rank = 1)::int AS wins,
        COUNT(*) FILTER (WHERE rank = 2)::int AS seconds,
        COUNT(*) FILTER (WHERE rank = 3)::int AS thirds,
        COALESCE(SUM(correct_count), 0)::int AS total_correct,
        COALESCE(SUM(wrong_count), 0)::int AS total_wrong,
        COALESCE(SUM(timeout_count), 0)::int AS total_timeouts,
        COALESCE(AVG(NULLIF(avg_buzz_time_ms, 0))::int, 0) AS avg_buzz_time_ms,
        COALESCE(SUM(xp_earned), 0)::int AS total_game_xp
       FROM game_attempts
      WHERE user_id = $1`,
    [userId]
  );
  return r.rows[0] || {
    games_played: 0, wins: 0, seconds: 0, thirds: 0,
    total_correct: 0, total_wrong: 0, total_timeouts: 0,
    avg_buzz_time_ms: 0, total_game_xp: 0,
  };
}

export async function getUserRecentGames(userId, limit = 10) {
  const safeLimit = Math.max(1, Math.min(parseInt(limit) || 10, 50));
  const r = await query(
    `SELECT
        ga.id, ga.lobby_id, ga.score, ga.rank, ga.correct_count,
        ga.wrong_count, ga.total_questions, ga.xp_earned, ga.completed_at,
        q.title AS quiz_title,
        l.mode
       FROM game_attempts ga
       JOIN quizzes q ON q.id = ga.quiz_id
       JOIN game_lobbies l ON l.id = ga.lobby_id
      WHERE ga.user_id = $1
      ORDER BY ga.completed_at DESC
      LIMIT $2`,
    [userId, safeLimit]
  );
  return r.rows;
}

/**
 * Sum game-mode XP earned by a user in the last 24 hours.
 * Used by the engine to enforce GAME_XP_DAILY_CAP (anti-farm).
 *
 * Returns the integer XP earned in the rolling window. If a user
 * has earned 480 of a 500 cap, the next finalize() awards them at
 * most 20 more.
 */
export async function getXpEarnedLast24h(userId) {
  const r = await query(
    `SELECT COALESCE(SUM(xp_earned), 0)::int AS xp
       FROM game_attempts
      WHERE user_id = $1
        AND completed_at >= NOW() - INTERVAL '24 hours'`,
    [userId]
  );
  return r.rows[0]?.xp || 0;
}

// ─────────────────────────────────────────────────────────────────────
// Re-export config for the route layer.
// ─────────────────────────────────────────────────────────────────────
export { MODE_CAPACITY, MAX_SPECTATORS_PER_LOBBY, GAME_LIMITS, SCORING };
