/**
 * Game Mode (Quiz Bowl) — runtime limits and tunables.
 *
 * Centralized so we have ONE place to tweak behavior under load.
 * All caps trigger graceful degradation, never crashes.
 */

// ───── Lobby capacities (per-mode) ───────────────────────────────────
// Player slots, NOT counting spectators. The +1 spectator slot is
// always implicitly available.
export const MODE_CAPACITY = Object.freeze({
  solo: 1,
  '1v1': 2,
  '2v2': 4,
  party5: 5,
});
export const MAX_SPECTATORS_PER_LOBBY = 1;

// ───── Server-wide guardrails ────────────────────────────────────────
export const GAME_LIMITS = Object.freeze({
  // Hard cap on concurrent active (open + in_progress) lobbies. New
  // create requests beyond this get a friendly 503 + retry advice.
  MAX_CONCURRENT_LOBBIES: parseInt(process.env.GAME_MODE_MAX_LOBBIES) || 500,

  // Idle lobbies (no activity, no members ready) get reaped after this.
  // 30 min keeps "I'll set up a lobby and invite friends" workflows alive
  // long enough to actually invite people.
  LOBBY_IDLE_TIMEOUT_MS: 30 * 60 * 1000,

  // After a game finishes, we keep the in-memory state around briefly so
  // the final ranking can be re-fetched on a refresh. Then it's GC'd.
  FINISHED_LOBBY_TTL_MS: 60 * 1000,

  // Presence sidebar broadcasts are debounced by this much. With 1000s
  // of users churning connect/disconnect, raw broadcasts would saturate.
  PRESENCE_BROADCAST_DEBOUNCE_MS: 1000,

  // Per-socket rate limit on game events (excluding buzz, which has its
  // own limit below). Above this → silent drop with a warn.
  EVENTS_PER_SOCKET_PER_SEC: 10,
  BUZZ_EVENTS_PER_SOCKET_PER_SEC: 5,

  // After the 10s answer timer expires, we still accept a buzz arriving
  // within this grace window — covers network jitter for legit attempts.
  BUZZ_GRACE_AFTER_TIMEOUT_MS: 50,

  // Player loses connection mid-game. We keep their slot reserved this
  // long for them to reconnect. After that they're marked abandoned and
  // the game continues without them.
  RECONNECT_GRACE_MS: 30 * 1000,

  // Max questions per game. We trim the quiz to this if it has more,
  // both to keep games fast-paced and to bound memory/event volume.
  MAX_QUESTIONS_PER_GAME: 20,

  // The 15-second avatar select countdown.
  AVATAR_SELECT_DURATION_MS: 15 * 1000,

  // The 3-2-1 GO countdown.
  PRE_QUESTION_COUNTDOWN_MS: 3 * 1000,

  // After a question is shown, this is how long ANYONE has to buzz
  // before the question auto-reveals.
  BUZZ_OPEN_TIMEOUT_MS: 30 * 1000,

  // Once a player buzzes, they get this long to type and submit.
  ANSWER_INPUT_TIMEOUT_MS: 10 * 1000,

  // Anti-spam: same sender can't re-invite the same target faster than this.
  // Enforced server-side; client also shows a visual cooldown so the UX
  // matches the server's reality.
  INVITE_COOLDOWN_MS: 10 * 1000,
});

// ───── Scoring & XP ──────────────────────────────────────────────────
// Game-mode XP is intentionally smaller than solo-quiz XP so multiplayer
// doesn't become an XP-farm shortcut. Top finishers get a flat bonus.
export const SCORING = Object.freeze({
  POINTS_PER_CORRECT: 100,
  // Faster buzz → bonus. Linear from +50 (instant) to 0 (5s+ from question display).
  SPEED_BONUS_MAX: 50,
  SPEED_BONUS_DECAY_MS: 5000,
  // XP awarded post-game. Small.
  XP_PER_CORRECT: 5,
  XP_FIRST_PLACE_BONUS: 20,
  XP_SECOND_PLACE_BONUS: 10,
  XP_THIRD_PLACE_BONUS: 5,
  // Anti-farm: cap how much game-mode XP a single user can earn per
  // 24-hour rolling window. Above this, results still record but no
  // additional XP is added. Keeps the leaderboard XP-grinding-proof
  // without blocking play.
  GAME_XP_DAILY_CAP: 500,
});

// ───── Feature flag ──────────────────────────────────────────────────
// Default ON in dev, configurable via env. If false, the REST endpoints
// + socket namespace return a "coming soon" payload and the client
// hides the entry-point button.
export const GAME_MODE_ENABLED =
  process.env.GAME_MODE_ENABLED !== 'false';
