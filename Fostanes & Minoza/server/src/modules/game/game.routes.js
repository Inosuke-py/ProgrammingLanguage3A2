/**
 * Game Mode REST endpoints (Quiz Bowl).
 *
 * These endpoints handle persistent state — lobby lifecycle, stats, and
 * the lobby browser. Real-time game events (buzz, answer, score updates)
 * will be added later via Socket.IO and DO NOT live here.
 *
 * All endpoints require authentication. Guests are blocked because the
 * game flow involves long-lived sessions, XP, and leaderboards that
 * don't make sense for ephemeral guest accounts.
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as gameService from './game.service.js';
import { broadcastLobbyState, emitToUser } from './game.socket.js';
import { GAME_MODE_ENABLED, MODE_CAPACITY } from './game.config.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────
// Feature flag guard. If the env var GAME_MODE_ENABLED=false, every
// game-mode endpoint replies 503 with a clean code. The client uses
// the same flag (via the ping endpoint below) to hide its entry point.
// ─────────────────────────────────────────────────────────────────────
function requireGameMode(req, res, next) {
  if (!GAME_MODE_ENABLED) {
    return res.status(503).json({
      success: false,
      errors: [{ code: 'GAME_MODE_DISABLED', message: 'Game Mode is not enabled.' }],
    });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────
// Block guest accounts from all game endpoints.
// ─────────────────────────────────────────────────────────────────────
function blockGuests(req, res, next) {
  if (req.user?.role === 'guest') {
    return res.status(403).json({
      success: false,
      errors: [{ code: 'GUEST_BLOCKED', message: 'Game Mode is for signed-in accounts only.' }],
    });
  }
  next();
}

// Map service-layer GameError → HTTP response.
function handleGameError(err, res, next) {
  if (err && typeof err === 'object' && err.code && err.status) {
    return res.status(err.status).json({
      success: false,
      errors: [{ code: err.code, message: err.message }],
    });
  }
  next(err);
}

// Re-fetch and broadcast the lobby state after a mutating REST call.
// Best-effort: if the broadcast fails (e.g. socket layer disabled),
// we don't fail the user's request. Returns the lobby for callers
// that want to include it in their response.
async function fanoutLobby(lobbyId) {
  try {
    const lobby = await gameService.getLobby(lobbyId);
    if (lobby) broadcastLobbyState(lobbyId, lobby);
    return lobby;
  } catch (err) {
    console.warn('[Game] fanoutLobby error:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// GET /game/status — config probe used by the client to decide whether
// to render the Game Mode entry point. Public (no auth) so the homepage
// can hide the button if the feature is disabled.
// ─────────────────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: GAME_MODE_ENABLED,
      modes: Object.keys(MODE_CAPACITY),
    },
  });
});

// ─── Everything below this requires the feature flag + auth. ─────────
router.use(requireGameMode, authenticate, blockGuests);

// ─────────────────────────────────────────────────────────────────────
// POST /game/lobbies — create a new lobby.
// ─────────────────────────────────────────────────────────────────────
const createLobbySchema = z.object({
  mode: z.enum(['solo', '1v1', '2v2', 'party5']),
  quizId: z.string().uuid().optional(),
  isPublic: z.boolean().optional().default(true),
});
router.post('/lobbies', validate(createLobbySchema), async (req, res, next) => {
  try {
    const { mode, quizId, isPublic } = req.validated;
    const lobby = await gameService.createLobby({
      hostUserId: req.user.id,
      mode,
      quizId: quizId || null,
      isPublic,
    });
    res.status(201).json({ success: true, data: { lobby } });
  } catch (err) {
    handleGameError(err, res, next);
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /game/lobbies — list public open lobbies.
// ─────────────────────────────────────────────────────────────────────
router.get('/lobbies', async (req, res, next) => {
  try {
    const lobbies = await gameService.listPublicLobbies({
      limit: req.query.limit,
      excludeUserId: req.user?.id,
    });
    res.json({ success: true, data: { lobbies } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /game/lobbies/me — your currently active lobby (if any).
// Used by the lobby browser to redirect "you're already in a game"
// flows instead of letting the user start a second one.
// ─────────────────────────────────────────────────────────────────────
router.get('/lobbies/me', async (req, res, next) => {
  try {
    const lobby = await gameService.getUserActiveLobby(req.user.id);
    res.json({ success: true, data: { lobby } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /game/lobbies/:id — fetch a lobby with members.
// Used by the lobby room view.
// ─────────────────────────────────────────────────────────────────────
router.get('/lobbies/:id', async (req, res, next) => {
  try {
    const lobby = await gameService.getLobby(req.params.id);
    if (!lobby) {
      return res.status(404).json({
        success: false,
        errors: [{ code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' }],
      });
    }
    res.json({ success: true, data: { lobby } });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /game/lobbies/:id/join — join as player or spectator.
// ─────────────────────────────────────────────────────────────────────
const joinLobbySchema = z.object({
  role: z.enum(['player', 'spectator']).optional().default('player'),
});
router.post('/lobbies/:id/join', validate(joinLobbySchema), async (req, res, next) => {
  try {
    const member = await gameService.joinLobby({
      lobbyId: req.params.id,
      userId: req.user.id,
      role: req.validated.role,
    });
    fanoutLobby(req.params.id);
    res.json({ success: true, data: { member } });
  } catch (err) {
    handleGameError(err, res, next);
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /game/lobbies/:id/leave — leave or close the lobby.
// ─────────────────────────────────────────────────────────────────────
router.post('/lobbies/:id/leave', async (req, res, next) => {
  try {
    const result = await gameService.leaveLobby({
      lobbyId: req.params.id,
      userId: req.user.id,
    });
    // If the lobby still exists, broadcast the change. If it was
    // closed (host alone left), nobody will be in the room anymore.
    if (!result.lobbyClosed) fanoutLobby(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    handleGameError(err, res, next);
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /game/lobbies/:id/quiz — host or spectator changes the quiz.
// (Caller authority is enforced server-side by checking they're the
// host or the lobby's spectator.)
// ─────────────────────────────────────────────────────────────────────
const setQuizSchema = z.object({ quizId: z.string().uuid() });
router.put('/lobbies/:id/quiz', validate(setQuizSchema), async (req, res, next) => {
  try {
    const lobby = await gameService.getLobby(req.params.id);
    if (!lobby) {
      return res.status(404).json({
        success: false,
        errors: [{ code: 'LOBBY_NOT_FOUND', message: 'Lobby not found.' }],
      });
    }
    const me = lobby.members.find((m) => m.user_id === req.user.id);
    const isHost = lobby.host_user_id === req.user.id;
    const isSpectator = me?.role === 'spectator';
    if (!isHost && !isSpectator) {
      return res.status(403).json({
        success: false,
        errors: [{
          code: 'NOT_AUTHORIZED',
          message: 'Only the host or spectator can change the quiz.',
        }],
      });
    }
    await gameService.setLobbyQuiz({
      lobbyId: req.params.id,
      quizId: req.validated.quizId,
    });
    fanoutLobby(req.params.id);
    res.json({ success: true, data: { lobbyId: req.params.id, quizId: req.validated.quizId } });
  } catch (err) {
    handleGameError(err, res, next);
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /game/lobbies/:id/ready — set my own ready state.
// ─────────────────────────────────────────────────────────────────────
const readySchema = z.object({ ready: z.boolean() });
router.put('/lobbies/:id/ready', validate(readySchema), async (req, res, next) => {
  try {
    await gameService.setMemberReady({
      lobbyId: req.params.id,
      userId: req.user.id,
      ready: req.validated.ready,
    });
    fanoutLobby(req.params.id);
    res.json({ success: true, data: { ready: req.validated.ready } });
  } catch (err) {
    handleGameError(err, res, next);
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /game/lobbies/:id/avatar — pick (or release) my avatar.
// avatarId is null to release.
// ─────────────────────────────────────────────────────────────────────
const avatarSchema = z.object({
  avatarId: z.union([z.number().int().min(1).max(5), z.null()]),
});
router.put('/lobbies/:id/avatar', validate(avatarSchema), async (req, res, next) => {
  try {
    await gameService.pickAvatar({
      lobbyId: req.params.id,
      userId: req.user.id,
      avatarId: req.validated.avatarId,
    });
    fanoutLobby(req.params.id);
    res.json({ success: true, data: { avatarId: req.validated.avatarId } });
  } catch (err) {
    handleGameError(err, res, next);
  }
});

// ─────────────────────────────────────────────────────────────────────
// PUT /game/lobbies/:id/role — swap between player and spectator.
// ─────────────────────────────────────────────────────────────────────
const roleSchema = z.object({ role: z.enum(['player', 'spectator']) });
router.put('/lobbies/:id/role', validate(roleSchema), async (req, res, next) => {
  try {
    await gameService.switchRole({
      lobbyId: req.params.id,
      userId: req.user.id,
      newRole: req.validated.role,
    });
    fanoutLobby(req.params.id);
    res.json({ success: true, data: { role: req.validated.role } });
  } catch (err) {
    handleGameError(err, res, next);
  }
});

// ─────────────────────────────────────────────────────────────────────
// POST /game/lobbies/:id/kick — host removes another player.
// ─────────────────────────────────────────────────────────────────────
const kickSchema = z.object({ targetUserId: z.string().uuid() });
router.post('/lobbies/:id/kick', validate(kickSchema), async (req, res, next) => {
  try {
    const result = await gameService.kickMember({
      lobbyId: req.params.id,
      hostUserId: req.user.id,
      targetUserId: req.validated.targetUserId,
    });
    if (!result.lobbyClosed) fanoutLobby(req.params.id);
    // Notify the kicked user directly so their lobby-room page can
    // redirect them out. They'll get a small "you were kicked" toast.
    emitToUser(req.validated.targetUserId, 'lobby:kicked', {
      lobbyId: req.params.id,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    handleGameError(err, res, next);
  }
});

// ─────────────────────────────────────────────────────────────────────
// GET /game/stats/me — my own game-mode stats card data.
// ─────────────────────────────────────────────────────────────────────
router.get('/stats/me', async (req, res, next) => {
  try {
    const [stats, recent] = await Promise.all([
      gameService.getUserGameStats(req.user.id),
      gameService.getUserRecentGames(req.user.id, 10),
    ]);
    res.json({ success: true, data: { stats, recent } });
  } catch (err) {
    next(err);
  }
});

export default router;
