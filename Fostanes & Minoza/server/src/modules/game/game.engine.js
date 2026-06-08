/**
 * Game Mode — Pure game state machine (Quiz Bowl).
 *
 * This module owns the in-memory, per-lobby live game state. It is
 * deliberately decoupled from Socket.IO and from the database:
 *   - Sockets are NOT imported here. The socket layer (game.socket.js)
 *     calls into this module and emits events based on what comes back.
 *   - The DB is touched only at game START (load questions) and at
 *     game END (persist results via gameService.finalizeGame). NO DB
 *     writes during the live game — keeps buzz latency ≤1ms.
 *
 * Phases:
 *   0 idle              — game hasn't started yet
 *   1 countdown         — 3-2-1 GO
 *   2 question_displayed — readers can read, no buzzes yet (small read window)
 *   3 buzz_open         — anyone (not locked out) can press buzz
 *   4 player_answering  — the buzzed player has the floor (10s)
 *   5 reveal            — correct answer shown for a beat
 *   6 finished          — final ranking computed
 *
 * Lockout per-question: a player who buzzes wrong (or times out) for
 * a question CAN'T buzz again on that question. They reset for the
 * next question.
 *
 * Time-handling: all timers are server-side setTimeout. Phase
 * transitions emit through a callback the socket layer registers.
 * No client trust for timing.
 *
 * Memory: one GameState per active lobby. Cleaned up after FINISHED_LOBBY_TTL_MS.
 */

import { GAME_LIMITS, SCORING } from './game.config.js';
import { query } from '../../database/db.js';
import * as gameService from './game.service.js';

// ─────────────────────────────────────────────────────────────────────
// Active games map: lobbyId → GameState
// ─────────────────────────────────────────────────────────────────────
const games = new Map();

/**
 * Construct a new GameState for a lobby and store it in the map.
 * Loads the questions from the chosen quiz and shuffles them.
 *
 * @param {object} args
 * @param {string} args.lobbyId
 * @param {string} args.quizId
 * @param {Array}  args.players       [{ userId, displayName, avatarId }]
 * @param {Array}  args.spectators    [{ userId, displayName }]
 * @param {string} args.hostUserId
 * @param {function} args.emit        (event, payload) → void; called for every
 *                                    state transition the lobby room should
 *                                    receive. Provided by the socket layer.
 *
 * Returns the constructed game state (also stored in the map).
 */
export async function startGame({ lobbyId, quizId, players, spectators = [], hostUserId, emit }) {
  if (games.has(lobbyId)) {
    throw new Error('Game already in progress for this lobby');
  }
  if (!Array.isArray(players) || players.length === 0) {
    throw new Error('Cannot start a game with zero players');
  }

  // Load questions. We fetch ONLY question_text + options + correct_answer
  // + sort_order. The correct_answer NEVER leaves the server.
  const qres = await query(
    `SELECT id, question_type, question_text, options, correct_answer, explanation
       FROM questions
      WHERE quiz_id = $1
      ORDER BY sort_order ASC`,
    [quizId]
  );
  if (qres.rows.length === 0) {
    throw new Error('Quiz has no questions');
  }

  // Shuffle + cap at MAX_QUESTIONS_PER_GAME so games stay fast-paced
  // and bound memory.
  const shuffled = shuffle(qres.rows).slice(0, GAME_LIMITS.MAX_QUESTIONS_PER_GAME);

  const state = {
    lobbyId,
    quizId,
    hostUserId,
    players: players.map((p) => ({
      ...p,
      score: 0,
      correct: 0,
      wrong: 0,
      timeouts: 0,
      buzzTimes: [],            // ms-from-question-display values
      lockedOutForQuestion: false,
      abandoned: false,
      lastSeen: Date.now(),
    })),
    spectators,
    questions: shuffled,
    currentIdx: -1,             // pre-game; first transition increments to 0
    phase: 'idle',
    phaseDeadline: 0,           // wall-clock ms when current phase auto-advances
    questionStartedAt: 0,       // wall-clock ms when current question was displayed
    buzzedUserId: null,         // who currently has the floor
    buzzedAt: 0,                // wall-clock ms when they buzzed
    questionEvents: [],         // accumulated for batch insert at FINISHED
    timer: null,                // active setTimeout handle
    disconnectTimers: new Map(),// userId → setTimeout handle for the
                                // 30s reconnect-grace window. Tracked so
                                // they're cleared if the game finalizes
                                // early (otherwise they fire against a
                                // freed state and noop, but cleaner).
    emit,                       // socket layer's broadcast hook
    finished: false,
    // Avatar-select phase: in-memory reservation map (userId → avatarId).
    // Seeded with the lobby's avatar_id so players who already picked
    // one in the lobby keep theirs. Players can change during the 15s
    // window. Committed back to player.avatarId on phase end.
    avatarReservations: {},
  };
  // Seed reservations from lobby avatar_id.
  for (const p of state.players) {
    if (p.avatarId) state.avatarReservations[p.userId] = p.avatarId;
  }
  games.set(lobbyId, state);

  // Kick off with the 15-second avatar-select phase, THEN 3-2-1 countdown.
  enterPhase(state, 'avatar_select');
  return state;
}

/**
 * Avatar pick during the avatar_select phase. Players can change
 * their avatar freely as long as no other non-abandoned player
 * currently holds it. Returns { ok, code? }.
 */
export function pickAvatar({ lobbyId, userId, avatarId }) {
  const state = games.get(lobbyId);
  if (!state) return { ok: false, code: 'NO_GAME' };
  if (state.phase !== 'avatar_select') return { ok: false, code: 'NOT_AVATAR_PHASE' };

  const player = state.players.find((p) => p.userId === userId);
  if (!player) return { ok: false, code: 'NOT_A_PLAYER' };
  if (player.abandoned) return { ok: false, code: 'ABANDONED' };

  if (typeof avatarId !== 'number' || !Number.isInteger(avatarId) || avatarId < 1 || avatarId > 5) {
    return { ok: false, code: 'INVALID_AVATAR' };
  }

  // Is this avatar already reserved by another non-abandoned player?
  for (const [uid, aid] of Object.entries(state.avatarReservations)) {
    if (uid === userId) continue;
    if (aid !== avatarId) continue;
    const other = state.players.find((p) => p.userId === uid);
    if (other && !other.abandoned) {
      return { ok: false, code: 'AVATAR_TAKEN' };
    }
  }

  state.avatarReservations[userId] = avatarId;
  // Broadcast updated phase snapshot so every client re-renders the grid.
  if (typeof state.emit === 'function') {
    state.emit('game:phase', getPublicState(state));
  }
  return { ok: true };
}

/**
 * Buzz attempt. Called by the socket layer when a player presses
 * space (or the buzz button). Only valid during BUZZ_OPEN phase.
 * Returns { ok: boolean, code?: string, currentBuzzer?: userId }.
 */
export function buzz({ lobbyId, userId, clientTime }) {
  const state = games.get(lobbyId);
  if (!state) return { ok: false, code: 'NO_GAME' };

  // Phase check (with grace window for buzzes arriving right at the
  // edge of a phase transition).
  const now = Date.now();
  const inBuzzWindow =
    state.phase === 'buzz_open' ||
    (state.phase === 'reveal' && now - state.phaseDeadline < GAME_LIMITS.BUZZ_GRACE_AFTER_TIMEOUT_MS);
  if (!inBuzzWindow) return { ok: false, code: 'NOT_BUZZ_PHASE' };

  // Player must be in the game (and not abandoned).
  const player = state.players.find((p) => p.userId === userId);
  if (!player) return { ok: false, code: 'NOT_A_PLAYER' };
  if (player.abandoned) return { ok: false, code: 'ABANDONED' };

  // Per-question lockout.
  if (player.lockedOutForQuestion) return { ok: false, code: 'LOCKED_OUT' };

  // First-buzz wins (server-authoritative timestamp).
  if (state.buzzedUserId) return { ok: false, code: 'TOO_LATE' };

  // Record.
  const responseTimeMs = now - state.questionStartedAt;
  state.buzzedUserId = userId;
  state.buzzedAt = now;
  player.buzzTimes.push(responseTimeMs);
  state.questionEvents.push({
    questionId: state.questions[state.currentIdx].id,
    userId,
    eventType: 'buzz',
    responseTimeMs,
  });

  // Move to PLAYER_ANSWERING; the buzzed player has 10s.
  enterPhase(state, 'player_answering');
  return { ok: true, currentBuzzer: userId, responseTimeMs };
}

/**
 * Answer submission. Only the buzzed player can submit.
 * Returns { ok, isCorrect?, code? }.
 */
export function submitAnswer({ lobbyId, userId, text }) {
  const state = games.get(lobbyId);
  if (!state) return { ok: false, code: 'NO_GAME' };
  if (state.phase !== 'player_answering') return { ok: false, code: 'NOT_ANSWER_PHASE' };
  if (state.buzzedUserId !== userId) return { ok: false, code: 'NOT_YOUR_TURN' };

  const player = state.players.find((p) => p.userId === userId);
  if (!player) return { ok: false, code: 'NOT_A_PLAYER' };

  const q = state.questions[state.currentIdx];
  const isCorrect = compareAnswer(text, q.correct_answer, q.options);

  if (isCorrect) {
    // Score: base + speed bonus from question display → buzz time.
    const buzzMs = state.buzzedAt - state.questionStartedAt;
    const speedBonus = Math.max(
      0,
      Math.round(SCORING.SPEED_BONUS_MAX * (1 - buzzMs / SCORING.SPEED_BONUS_DECAY_MS))
    );
    const points = SCORING.POINTS_PER_CORRECT + speedBonus;
    player.score += points;
    player.correct += 1;
    state.questionEvents.push({
      questionId: q.id,
      userId,
      eventType: 'correct',
      responseTimeMs: null,
    });
    nextQuestion(state, { revealAnswer: q.correct_answer, winnerUserId: userId, pointsAwarded: points });
    return { ok: true, isCorrect: true, points };
  }

  // Wrong answer: lock this player out for this question, return to BUZZ_OPEN.
  player.wrong += 1;
  player.lockedOutForQuestion = true;
  state.questionEvents.push({
    questionId: q.id,
    userId,
    eventType: 'wrong',
    responseTimeMs: null,
  });

  // Are all players now locked out / abandoned? If so, reveal.
  if (allOut(state)) {
    nextQuestion(state, { revealAnswer: q.correct_answer });
    return { ok: true, isCorrect: false, allOut: true };
  }

  // Otherwise, give the floor back; remaining time on the question is
  // forgiven — re-open buzz with a fresh BUZZ_OPEN_TIMEOUT_MS window.
  state.buzzedUserId = null;
  state.buzzedAt = 0;
  enterPhase(state, 'buzz_open');
  return { ok: true, isCorrect: false, allOut: false };
}

/**
 * Player or spectator disconnect.
 *
 * For PLAYERS: marks them soft-abandoned. A reconnect within
 *   RECONNECT_GRACE_MS clears the abandoned flag. After the grace
 *   window the player is permanently abandoned for this game.
 *   The timer is tracked on state.disconnectTimers so finalize()
 *   can cancel it.
 *
 * For SPECTATORS: no abandon flow — they can rejoin freely whenever.
 *   We simply note the disconnect (nothing else to do).
 */
export function handleDisconnect({ lobbyId, userId }) {
  const state = games.get(lobbyId);
  if (!state) return;
  // Spectator? Nothing to schedule.
  if (state.spectators?.some((s) => s.userId === userId)) return;

  const player = state.players.find((p) => p.userId === userId);
  if (!player) return;
  player.lastSeen = Date.now();

  // Cancel any prior timer for this user (back-to-back disconnect/
  // reconnect cycles are common on flaky networks).
  const prior = state.disconnectTimers.get(userId);
  if (prior) clearTimeout(prior);

  // Schedule a permanent-abandon if they don't reconnect.
  const t = setTimeout(() => {
    state.disconnectTimers.delete(userId);
    const s = games.get(lobbyId);
    if (!s || s.finished) return;
    const p = s.players.find((x) => x.userId === userId);
    if (!p) return;
    if (Date.now() - p.lastSeen >= GAME_LIMITS.RECONNECT_GRACE_MS - 100) {
      p.abandoned = true;
      // Release any avatar reservation so others can pick it.
      if (s.avatarReservations && s.avatarReservations[userId]) {
        delete s.avatarReservations[userId];
        if (s.phase === 'avatar_select' && typeof s.emit === 'function') {
          s.emit('game:phase', getPublicState(s));
        }
      }
      // If they had the floor, free it.
      if (s.buzzedUserId === userId && s.phase === 'player_answering') {
        const q = s.questions[s.currentIdx];
        s.questionEvents.push({
          questionId: q.id,
          userId,
          eventType: 'timeout',
          responseTimeMs: null,
        });
        s.buzzedUserId = null;
        if (allOut(s)) nextQuestion(s, { revealAnswer: q.correct_answer });
        else enterPhase(s, 'buzz_open');
      }
      // If everyone's now abandoned, end the game.
      if (s.players.every((x) => x.abandoned)) finalize(s);
    }
  }, GAME_LIMITS.RECONNECT_GRACE_MS);
  state.disconnectTimers.set(userId, t);
}

/**
 * Player or spectator reconnect.
 *
 * For PLAYERS: clears soft-abandon flag if within grace window,
 *   cancels the pending abandon timer, returns the snapshot.
 *   If past grace (already permanently abandoned), returns null.
 *
 * For SPECTATORS: always returns the snapshot — they can rejoin
 *   any time and aren't subject to abandon logic.
 */
export function handleReconnect({ lobbyId, userId }) {
  const state = games.get(lobbyId);
  if (!state) return null;

  // Spectator path — always allowed back in.
  if (state.spectators?.some((s) => s.userId === userId)) {
    return getPublicState(state, userId);
  }

  const player = state.players.find((p) => p.userId === userId);
  if (!player) return null;
  player.lastSeen = Date.now();
  if (player.abandoned) {
    // Already past grace — they're out for good.
    return null;
  }
  // Cancel the pending abandon timer.
  const t = state.disconnectTimers.get(userId);
  if (t) {
    clearTimeout(t);
    state.disconnectTimers.delete(userId);
  }
  return getPublicState(state, userId);
}

/**
 * Public snapshot for a specific user. Strips correct_answer.
 * Spectators see everything except correct_answer.
 */
export function getPublicState(state, viewerUserId = null) {
  const q = state.currentIdx >= 0 ? state.questions[state.currentIdx] : null;
  const isInRevealOrFinished = state.phase === 'reveal' || state.phase === 'finished';
  return {
    lobbyId: state.lobbyId,
    phase: state.phase,
    phaseDeadline: state.phaseDeadline,
    questionIndex: state.currentIdx,
    totalQuestions: state.questions.length,
    questionStartedAt: state.questionStartedAt,
    buzzedUserId: state.buzzedUserId,
    currentQuestion: q && state.phase !== 'idle' && state.phase !== 'countdown'
      ? {
          id: q.id,
          questionType: q.question_type,
          questionText: q.question_text,
          options: q.options,
          // correctAnswer/explanation only at reveal/finished.
          ...(isInRevealOrFinished
            ? { correctAnswer: q.correct_answer, explanation: q.explanation }
            : {}),
        }
      : null,
    players: state.players.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      avatarId: p.avatarId,
      score: p.score,
      correct: p.correct,
      wrong: p.wrong,
      lockedOutForQuestion: p.lockedOutForQuestion,
      abandoned: p.abandoned,
    })),
    avatarReservations: { ...state.avatarReservations },
  };
}

/** Lookup a live game by lobbyId. */
export function getGame(lobbyId) {
  return games.get(lobbyId);
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────

function enterPhase(state, phase) {
  // Cancel any pending phase timer.
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.phase = phase;
  const now = Date.now();

  switch (phase) {
    case 'avatar_select': {
      state.phaseDeadline = now + GAME_LIMITS.AVATAR_SELECT_DURATION_MS;
      state.timer = setTimeout(() => {
        // Commit reservations to player.avatarId, then continue to countdown.
        for (const p of state.players) {
          const reserved = state.avatarReservations[p.userId];
          if (reserved) p.avatarId = reserved;
        }
        enterPhase(state, 'countdown');
      }, GAME_LIMITS.AVATAR_SELECT_DURATION_MS);
      break;
    }
    case 'countdown': {
      state.phaseDeadline = now + GAME_LIMITS.PRE_QUESTION_COUNTDOWN_MS;
      state.timer = setTimeout(() => advanceToNextQuestion(state), GAME_LIMITS.PRE_QUESTION_COUNTDOWN_MS);
      break;
    }
    case 'question_displayed': {
      // Brief read-only window before buzzing opens (1s).
      state.phaseDeadline = now + 1000;
      state.timer = setTimeout(() => enterPhase(state, 'buzz_open'), 1000);
      break;
    }
    case 'buzz_open': {
      state.phaseDeadline = now + GAME_LIMITS.BUZZ_OPEN_TIMEOUT_MS;
      state.timer = setTimeout(() => {
        // No one buzzed — reveal the answer.
        const q = state.questions[state.currentIdx];
        state.questionEvents.push({
          questionId: q.id,
          userId: null,
          eventType: 'reveal',
          responseTimeMs: null,
        });
        nextQuestion(state, { revealAnswer: q.correct_answer });
      }, GAME_LIMITS.BUZZ_OPEN_TIMEOUT_MS);
      break;
    }
    case 'player_answering': {
      state.phaseDeadline = now + GAME_LIMITS.ANSWER_INPUT_TIMEOUT_MS;
      state.timer = setTimeout(() => {
        // Buzzer didn't answer in time — lock them out, free the floor.
        const player = state.players.find((p) => p.userId === state.buzzedUserId);
        if (player) {
          player.timeouts += 1;
          player.lockedOutForQuestion = true;
        }
        const q = state.questions[state.currentIdx];
        state.questionEvents.push({
          questionId: q.id,
          userId: state.buzzedUserId,
          eventType: 'timeout',
          responseTimeMs: null,
        });
        state.buzzedUserId = null;
        state.buzzedAt = 0;

        if (allOut(state)) {
          nextQuestion(state, { revealAnswer: q.correct_answer });
        } else {
          enterPhase(state, 'buzz_open');
        }
      }, GAME_LIMITS.ANSWER_INPUT_TIMEOUT_MS);
      break;
    }
    case 'reveal': {
      // Brief moment to show the answer before next question.
      state.phaseDeadline = now + 2500;
      state.timer = setTimeout(() => advanceToNextQuestion(state), 2500);
      break;
    }
    case 'finished': {
      state.phaseDeadline = now;
      state.timer = null;
      break;
    }
    default:
      break;
  }

  // Notify the socket layer.
  if (typeof state.emit === 'function') {
    state.emit('game:phase', getPublicState(state));
  }
}

function advanceToNextQuestion(state) {
  state.currentIdx += 1;

  // Game over?
  if (state.currentIdx >= state.questions.length) {
    finalize(state);
    return;
  }

  // Reset per-question lockouts.
  for (const p of state.players) p.lockedOutForQuestion = false;
  state.buzzedUserId = null;
  state.buzzedAt = 0;
  state.questionStartedAt = Date.now();
  enterPhase(state, 'question_displayed');
}

function nextQuestion(state, { revealAnswer, winnerUserId = null, pointsAwarded = 0 } = {}) {
  // Show reveal phase (also displays the correct answer to all clients).
  state.questionStartedAt = state.questionStartedAt; // no-op, just clarity
  if (typeof state.emit === 'function') {
    state.emit('game:question_resolved', {
      questionIndex: state.currentIdx,
      correctAnswer: revealAnswer,
      winnerUserId,
      pointsAwarded,
    });
  }
  enterPhase(state, 'reveal');
}

function allOut(state) {
  return state.players.every((p) => p.abandoned || p.lockedOutForQuestion);
}

async function finalize(state) {
  if (state.finished) return;
  state.finished = true;
  if (state.timer) { clearTimeout(state.timer); state.timer = null; }
  // Cancel any pending reconnect-grace timers — the game is over,
  // they don't need to fire anymore.
  if (state.disconnectTimers) {
    for (const t of state.disconnectTimers.values()) clearTimeout(t);
    state.disconnectTimers.clear();
  }
  state.phase = 'finished';
  state.phaseDeadline = Date.now();

  // Compute ranking. Ties broken by avg buzz time (faster = higher).
  const ranked = state.players.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aAvg = a.buzzTimes.length ? avg(a.buzzTimes) : Infinity;
    const bAvg = b.buzzTimes.length ? avg(b.buzzTimes) : Infinity;
    return aAvg - bAvg;
  });

  const results = ranked.map((p, i) => {
    const rank = i + 1;
    const xpRaw =
      p.correct * SCORING.XP_PER_CORRECT +
      (rank === 1 ? SCORING.XP_FIRST_PLACE_BONUS : 0) +
      (rank === 2 ? SCORING.XP_SECOND_PLACE_BONUS : 0) +
      (rank === 3 ? SCORING.XP_THIRD_PLACE_BONUS : 0);
    return {
      userId: p.userId,
      quizId: state.quizId,
      score: p.score,
      rank,
      correctCount: p.correct,
      wrongCount: p.wrong,
      timeoutCount: p.timeouts,
      avgBuzzTimeMs: p.buzzTimes.length ? Math.round(avg(p.buzzTimes)) : null,
      totalQuestions: state.questions.length,
      xpEarnedRaw: xpRaw,
      // xpEarned is filled in below after the daily-cap check.
      xpEarned: 0,
    };
  });

  // Apply per-user 24h XP cap (anti-farm). Run BEFORE finalizeGame
  // so the persisted xp_earned reflects what was actually awarded.
  for (const r of results) {
    if (r.xpEarnedRaw <= 0) continue;
    try {
      const earnedSoFar = await gameService.getXpEarnedLast24h(r.userId);
      const remaining = Math.max(0, SCORING.GAME_XP_DAILY_CAP - earnedSoFar);
      r.xpEarned = Math.min(r.xpEarnedRaw, remaining);
    } catch (e) {
      // If the cap query fails, fall back to the raw amount — better
      // to over-award once than block all rewards on a transient DB hiccup.
      console.warn('[Game] xp cap lookup failed:', e.message);
      r.xpEarned = r.xpEarnedRaw;
    }
  }

  // Emit final ranking to the lobby room before persisting (in case
  // the DB write is slow, players still see the results immediately).
  // We strip `xpEarnedRaw` from the public payload — clients only need
  // to see the awarded amount (post-cap), not the pre-cap calculation.
  if (typeof state.emit === 'function') {
    const publicResults = results.map(({ xpEarnedRaw: _omit, ...rest }) => rest);
    state.emit('game:ended', { ranking: publicResults, finalState: getPublicState(state) });
  }

  // Persist results + question events. Best-effort.
  try {
    await gameService.finalizeGame({
      lobbyId: state.lobbyId,
      results,
      questionEvents: state.questionEvents,
    });
    // Award XP to each player. Reuses the existing addXP helper so
    // levels and streaks update naturally. The dynamic import is
    // wrapped because a stale build / hot-reload could (rarely)
    // fail to resolve it; we still persisted xp_earned in the DB
    // either way, so this just keeps user-level XP in sync.
    let addXP;
    try {
      ({ addXP } = await import('../users/user.service.js'));
    } catch (e) {
      console.warn('[Game] could not load user.service for XP award:', e.message);
    }
    if (typeof addXP === 'function') {
      for (const r of results) {
        if (r.xpEarned > 0) {
          try { await addXP(r.userId, r.xpEarned); } catch (e) {
            console.warn('[Game] addXP failed for', r.userId, e.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[Game] finalize persist error:', err.message);
  }

  // Free the in-memory state after a short grace window so a stale
  // refresh can still pick up the final ranking via lobby:state.
  setTimeout(() => {
    games.delete(state.lobbyId);
  }, GAME_LIMITS.FINISHED_LOBBY_TTL_MS);
}

function compareAnswer(userText, correctText, options) {
  const u = String(userText || '').trim().toLowerCase();
  const c = String(correctText || '').trim().toLowerCase();
  if (!u || !c) return false;
  if (u === c) return true;

  // Letter-form correct (A/B/C/D) or letter-form user — same logic
  // as the existing solo-quiz grading.
  if (/^[a-d]$/.test(c)) {
    const idx = c.charCodeAt(0) - 97;
    if (Array.isArray(options) && options[idx]) {
      const opt = String(options[idx]).trim().toLowerCase();
      if (u === opt) return true;
    }
  }
  if (/^[a-d]$/.test(u)) {
    const idx = u.charCodeAt(0) - 97;
    if (Array.isArray(options) && options[idx]) {
      const opt = String(options[idx]).trim().toLowerCase();
      if (c === opt) return true;
    }
  }
  return false;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function avg(nums) {
  let s = 0;
  for (const n of nums) s += n;
  return s / nums.length;
}
