/**
 * Game Mode — Socket.IO server.
 *
 * Phase 2 wiring: presence + lobby room broadcasts + invites.
 * Game-state events (buzz/answer/score) come in Phase 3 (game.engine).
 *
 * Architecture:
 *   - One Socket.IO Server attached to the existing HTTP server, NOT
 *     a separate port. Same origin, same auth cookie.
 *   - Connection handshake reads the `access_token` cookie and
 *     verifies the JWT. Sockets without a valid token are rejected.
 *   - Each socket joins:
 *       * room "user:<userId>"   — for direct messages (invites)
 *       * room "presence"        — when on a Game Mode page
 *       * room "lobby:<lobbyId>" — when in a lobby
 *   - Presence is GAME-MODE ONLY. The client emits `presence:enter`
 *     when navigating into /game (and `presence:leave` on the way
 *     out). This keeps the broadcast scope tiny — only people who
 *     actually want to play see each other in the sidebar.
 *   - Presence broadcasts are debounced per-server (1s window) so
 *     a flood of join/leave events coalesces into one delta message.
 *   - Per-socket event rate limit prevents a misbehaving client
 *     from saturating the loop.
 *
 * IMPORTANT: this module deliberately does NOT touch any game-state
 * machine yet. It only manages connection lifecycle, presence, and
 * lobby-room broadcasts. Game-engine events get layered on in the
 * next commit.
 */

import { Server as IOServer } from 'socket.io';
import { verifyAccessToken } from '../../middleware/auth.js';
import { GAME_LIMITS, GAME_MODE_ENABLED } from './game.config.js';
import * as gameService from './game.service.js';
import * as gameEngine from './game.engine.js';

// Tiny cookie parser. Socket.IO's handshake gives us the raw Cookie
// header string; we just need to find access_token=... in it. Avoids
// adding the standalone `cookie` package as a dependency.
function parseCookieHeader(header) {
  const out = {};
  if (typeof header !== 'string' || !header) return out;
  for (const pair of header.split(';')) {
    const i = pair.indexOf('=');
    if (i === -1) continue;
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

// ─── In-memory presence map ─────────────────────────────────────────
// userId → {
//   socketIds: Set<string>,   // user can have multiple tabs
//   displayName: string,
//   avatarUrl: string|null,
// }
const presence = new Map();

// Debounced presence broadcaster — accumulates joins/leaves and emits
// one snapshot delta message per debounce window.
let presenceFlushTimer = null;
const presenceQueue = { joined: new Map(), left: new Set() };

// ─── Per-socket rate limiter ────────────────────────────────────────
// Token bucket per socket. Each event consumes 1 token. Tokens
// regenerate at EVENTS_PER_SOCKET_PER_SEC. Misbehavior = silent drop.
const socketBuckets = new WeakMap(); // socket → { tokens, lastRefill }

// ─── Invite cooldown map ────────────────────────────────────────────
// Key: `${senderId}::${targetId}` → expiresAt (ms epoch).
// Prevents one user from spamming invites at the same target. The
// cooldown is per-sender-per-target so different senders can each
// invite the same target independently.
const inviteCooldowns = new Map();
function inviteCooldownKey(senderId, targetId) {
  return `${senderId}::${targetId}`;
}
// Periodic sweep so the map doesn't grow unbounded across uptime.
setInterval(() => {
  const now = Date.now();
  for (const [k, expires] of inviteCooldowns.entries()) {
    if (expires <= now) inviteCooldowns.delete(k);
  }
}, 60 * 1000).unref?.();

// ─── Pending join-requests map ──────────────────────────────────────
// requestId → { lobbyId, requesterId, requesterName, hostId, createdAt, timer }
// Used by the request-to-join flow on public 1v1/2v2/party5 lobbies.
// Solo lobbies are hidden from the public browser; spectator joins
// remain instant. A request auto-expires after 30s if the host
// doesn't respond.
const joinRequests = new Map();

function takeToken(socket, max = GAME_LIMITS.EVENTS_PER_SOCKET_PER_SEC) {
  let bucket = socketBuckets.get(socket);
  const now = Date.now();
  if (!bucket) {
    bucket = { tokens: max, lastRefill: now };
    socketBuckets.set(socket, bucket);
  }
  // Refill linearly: max tokens per second.
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(max, bucket.tokens + elapsed * max);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

let ioRef = null;

/**
 * Attach a Socket.IO server to the given HTTP server. Idempotent —
 * if called twice, the existing server is returned.
 */
export function attachGameSocket(httpServer) {
  if (ioRef) return ioRef;
  if (!GAME_MODE_ENABLED) {
    console.log('[Socket] Game Mode disabled by env — socket layer not started.');
    return null;
  }

  const io = new IOServer(httpServer, {
    path: '/socket.io/',
    // Permissive in dev (vite proxies), strict same-origin in prod.
    cors: {
      origin: process.env.CLIENT_URL || true,
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 25000,
    // Keep payloads small. We never need long-poll fallback for our
    // usage; if a client can't WS, they probably can't play anyway.
    transports: ['websocket', 'polling'],
  });

  // ── Auth middleware ─────────────────────────────────────────────
  // Reads the access_token cookie, verifies the JWT, and attaches
  // user identity to socket.data. No anonymous sockets.
  io.use((socket, next) => {
    try {
      const cookies = parseCookieHeader(socket.handshake.headers.cookie || '');
      const token = cookies.access_token;
      if (!token) return next(new Error('UNAUTHENTICATED'));
      const decoded = verifyAccessToken(token);
      // Block guests (matches REST behavior).
      if (decoded.role === 'guest') return next(new Error('GUEST_BLOCKED'));
      socket.data.userId = decoded.id;
      socket.data.displayName = decoded.displayName;
      socket.data.email = decoded.email;
      socket.data.role = decoded.role;
      return next();
    } catch (err) {
      return next(new Error('INVALID_TOKEN'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, displayName } = socket.data;

    // Always join own user channel for direct messages (invites etc).
    socket.join(`user:${userId}`);

    // ── presence:enter ─────────────────────────────────────────────
    // Client calls this when entering Game Mode pages, AND on each
    // socket reconnect (the client emits it from a 'reconnect' handler
    // so we re-establish presence after a transient network blip).
    //
    // Each socket carries its OWN id. We always wipe any entry whose
    // socketIds were tied to a now-defunct socket and add this fresh
    // socket. This avoids "phantom online forever" entries when a
    // socket reconnects with a new id without a clean disconnect.
    socket.on('presence:enter', () => {
      if (!takeToken(socket)) return;
      socket.join('presence');

      let entry = presence.get(userId);
      if (!entry) {
        entry = {
          socketIds: new Set(),
          displayName,
          // avatar_url isn't on the JWT — clients can render initials
          // until they fetch full profile data if they need to.
          avatarUrl: null,
        };
        presence.set(userId, entry);
        presenceQueue.joined.set(userId, entry);
        presenceQueue.left.delete(userId);
      } else {
        // Existing entry — prune any socket ids that aren't actually
        // connected anymore. Without this, a reconnect-after-blip
        // leaks a stale id and the user appears online forever.
        for (const sid of entry.socketIds) {
          if (!io.sockets.sockets.has(sid)) entry.socketIds.delete(sid);
        }
      }
      entry.socketIds.add(socket.id);
      schedulePresenceFlush();

      // Send the current snapshot to JUST this socket so it has the
      // initial sidebar state without waiting for a flush.
      socket.emit('presence:snapshot', {
        users: Array.from(presence.entries()).map(([uid, e]) => ({
          userId: uid,
          displayName: e.displayName,
          avatarUrl: e.avatarUrl,
        })),
      });
    });

    // ── presence:leave ─────────────────────────────────────────────
    // Client calls this when leaving Game Mode pages. We DON'T fully
    // disconnect — they still own user:<userId> for invites — but
    // they leave the presence room and pop off the sidebar.
    socket.on('presence:leave', () => {
      if (!takeToken(socket)) return;
      socket.leave('presence');
      removePresenceSocket(userId, socket.id);
    });

    // ── lobby:join (joins the broadcast room only — DB join is REST) ─
    // Membership is established via REST. This event just subscribes
    // the client's socket to the lobby's broadcast room.
    socket.on('lobby:join', async ({ lobbyId } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof lobbyId !== 'string' || lobbyId.length < 8) return;
      // Verify they're an actual member.
      try {
        const lobby = await gameService.getLobby(lobbyId);
        if (!lobby) return socket.emit('lobby:error', { code: 'LOBBY_NOT_FOUND' });
        const me = lobby.members.find((m) => m.user_id === userId);
        if (!me) return socket.emit('lobby:error', { code: 'NOT_A_MEMBER' });
        socket.join(`lobby:${lobbyId}`);
        socket.data.lobbyId = lobbyId;
        // Send the requesting socket a fresh snapshot. The rest of
        // the room already sees membership changes via the REST-side
        // change events the client emits below.
        socket.emit('lobby:state', { lobby });
      } catch (err) {
        console.warn('[Socket] lobby:join error:', err.message);
      }
    });

    // ── lobby:leaveRoom (just leaves the broadcast room) ───────────
    // Used when the user navigates away from a lobby page but doesn't
    // want to leave the lobby itself. The REST endpoint /leave is for
    // actually leaving the lobby (DB-level).
    socket.on('lobby:leaveRoom', ({ lobbyId } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof lobbyId !== 'string') return;
      socket.leave(`lobby:${lobbyId}`);
      if (socket.data.lobbyId === lobbyId) socket.data.lobbyId = null;
    });

    // ── lobby:changed ──────────────────────────────────────────────
    // After a successful REST mutation (join/leave/ready/avatar/quiz),
    // the client emits this to ask the server to broadcast a state
    // refresh to everyone in the lobby room. The actual mutation is
    // already in the DB — this is just a broadcast trigger.
    socket.on('lobby:changed', async ({ lobbyId } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof lobbyId !== 'string') return;
      try {
        const lobby = await gameService.getLobby(lobbyId);
        if (!lobby) return;
        io.to(`lobby:${lobbyId}`).emit('lobby:state', { lobby });
      } catch (err) {
        console.warn('[Socket] lobby:changed error:', err.message);
      }
    });

    // ── lobby:joinRequest ──────────────────────────────────────────
    // Public-lobby player join now requires host approval. Solo
    // lobbies are hidden from the public browser entirely (they're
    // already at capacity once the host joins). Spectator joins
    // remain instant and skip this flow.
    //
    // Flow:
    //   requester → server: lobby:joinRequest { lobbyId }
    //   server validates lobby is open + has slot + not already requested
    //   server → host: lobby:joinRequested { requestId, requester:{userId,displayName} }
    //   server → requester: lobby:joinRequestSent { lobbyId, requestId }
    //   host → server: lobby:joinResponse { requestId, accepted }
    //   server (on accept) → adds member via service.joinLobby + fanout
    //                     → requester gets lobby:joinApproved { lobbyId }
    //                       (their client navigates to /game/lobby/:id)
    //   server (on decline / timeout) → requester gets
    //                                   lobby:joinDeclined { lobbyId, reason }
    //
    // 30s timeout: if host doesn't respond, the request expires and
    // the requester is told to try again later.
    socket.on('lobby:joinRequest', async ({ lobbyId } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof lobbyId !== 'string') return;
      try {
        const lobby = await gameService.getLobby(lobbyId);
        if (!lobby) {
          socket.emit('lobby:joinDeclined', { lobbyId, reason: 'LOBBY_NOT_FOUND' });
          return;
        }
        if (lobby.status !== 'open') {
          socket.emit('lobby:joinDeclined', { lobbyId, reason: 'NOT_OPEN' });
          return;
        }
        if (lobby.host_user_id === userId) {
          // Host can't request to join their own lobby.
          socket.emit('lobby:joinDeclined', { lobbyId, reason: 'SELF' });
          return;
        }
        if (lobby.members.some((m) => m.user_id === userId)) {
          socket.emit('lobby:joinDeclined', { lobbyId, reason: 'ALREADY_IN' });
          return;
        }
        // Capacity precheck (best-effort; the actual join still
        // rechecks under FOR UPDATE inside the service).
        const playerCount = lobby.members.filter((m) => m.role === 'player').length;
        const cap = ({ solo: 1, '1v1': 2, '2v2': 4, party5: 5 })[lobby.mode] || 5;
        if (playerCount >= cap) {
          socket.emit('lobby:joinDeclined', { lobbyId, reason: 'LOBBY_FULL' });
          return;
        }
        // De-duplicate: if this requester already has an open request
        // for this lobby, don't create a second one.
        for (const r of joinRequests.values()) {
          if (r.lobbyId === lobbyId && r.requesterId === userId) {
            socket.emit('lobby:joinRequestSent', { lobbyId, requestId: r.requestId });
            return;
          }
        }
        const requestId = `${userId}::${lobbyId}::${Date.now()}`;
        const req = {
          requestId,
          lobbyId,
          requesterId: userId,
          requesterName: displayName,
          hostId: lobby.host_user_id,
          createdAt: Date.now(),
        };
        joinRequests.set(requestId, req);
        // Auto-expire after 30s.
        const timer = setTimeout(() => {
          if (joinRequests.has(requestId)) {
            joinRequests.delete(requestId);
            io.to(`user:${req.requesterId}`).emit('lobby:joinDeclined', {
              lobbyId,
              reason: 'TIMEOUT',
            });
            io.to(`user:${req.hostId}`).emit('lobby:joinRequestExpired', { requestId });
          }
        }, 30 * 1000);
        timer.unref?.();
        req.timer = timer;

        // Tell host.
        io.to(`user:${lobby.host_user_id}`).emit('lobby:joinRequested', {
          requestId,
          lobbyId,
          mode: lobby.mode,
          requester: { userId, displayName },
        });
        // Ack to requester.
        socket.emit('lobby:joinRequestSent', { lobbyId, requestId });
      } catch (err) {
        console.warn('[Socket] lobby:joinRequest error:', err.message);
        socket.emit('lobby:joinDeclined', { lobbyId, reason: 'INTERNAL' });
      }
    });

    // ── lobby:joinResponse ─────────────────────────────────────────
    // Host approves or declines a pending join request.
    socket.on('lobby:joinResponse', async ({ requestId, accepted } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof requestId !== 'string' || typeof accepted !== 'boolean') return;
      const req = joinRequests.get(requestId);
      if (!req) {
        // Already expired / consumed.
        return;
      }
      // Only the host of the lobby can respond.
      if (req.hostId !== userId) {
        return;
      }
      // Consume the request.
      if (req.timer) clearTimeout(req.timer);
      joinRequests.delete(requestId);
      // Tell ALL host tabs to drop this request from their UI (the host
      // could have multiple lobby-room tabs open — one approves, the
      // others should clear their stale popup).
      io.to(`user:${req.hostId}`).emit('lobby:joinRequestExpired', { requestId });

      if (!accepted) {
        io.to(`user:${req.requesterId}`).emit('lobby:joinDeclined', {
          lobbyId: req.lobbyId,
          reason: 'HOST_DECLINED',
        });
        return;
      }
      // Approve: actually add them via the service (race-safe).
      try {
        await gameService.joinLobby({
          lobbyId: req.lobbyId,
          userId: req.requesterId,
          role: 'player',
        });
        // Once they're a member, clear any invite cooldowns the
        // requester might have on senders in this lobby — the join
        // resolved them, so retries shouldn't be blocked.
        for (const k of inviteCooldowns.keys()) {
          if (k.endsWith(`::${req.requesterId}`)) inviteCooldowns.delete(k);
        }
        // Broadcast updated lobby state to all room members.
        const lobby = await gameService.getLobby(req.lobbyId);
        if (lobby) io.to(`lobby:${req.lobbyId}`).emit('lobby:state', { lobby });
        // Tell the requester to navigate.
        io.to(`user:${req.requesterId}`).emit('lobby:joinApproved', {
          lobbyId: req.lobbyId,
        });
      } catch (err) {
        // Lobby got full / closed in the gap. Tell both parties.
        const reason = err?.code || 'INTERNAL';
        io.to(`user:${req.requesterId}`).emit('lobby:joinDeclined', {
          lobbyId: req.lobbyId,
          reason,
        });
        socket.emit('lobby:joinResponseError', {
          requestId,
          reason,
          message: err?.message || 'Could not approve.',
        });
      }
    });

    // ── lobby:joinCancel ───────────────────────────────────────────
    // Requester withdraws their pending request (e.g. they got bored).
    socket.on('lobby:joinCancel', ({ requestId } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof requestId !== 'string') return;
      const req = joinRequests.get(requestId);
      if (!req || req.requesterId !== userId) return;
      if (req.timer) clearTimeout(req.timer);
      joinRequests.delete(requestId);
      io.to(`user:${req.hostId}`).emit('lobby:joinRequestExpired', { requestId });
    });

    // ── lobby:invite ───────────────────────────────────────────────
    // Live invite popup with sender ack + cooldown.
    //
    // Flow:
    //   sender → server: lobby:invite { lobbyId, targetUserId }
    //   server → sender: lobby:inviteSent { targetUserId, cooldownUntil }   (success)
    //                 OR lobby:inviteRejected { targetUserId, code, retryInMs? }
    //   server → target: lobby:invited { lobbyId, fromUserId, fromDisplayName, ... }
    //   target → server: lobby:inviteResponse { lobbyId, fromUserId, accepted }
    //   server → sender: lobby:inviteResponse { targetUserId, accepted }
    //
    // Server validation:
    //   - Sender is in the named lobby
    //   - Target ≠ self
    //   - Target is online (in presence map) — otherwise OFFLINE
    //   - Cooldown not active for this (sender, target) pair — otherwise COOLDOWN
    //   - Lobby still has an open player slot — otherwise LOBBY_FULL
    socket.on('lobby:invite', async ({ lobbyId, targetUserId } = {}) => {
      if (!takeToken(socket)) return;
      if (
        typeof lobbyId !== 'string' ||
        typeof targetUserId !== 'string' ||
        targetUserId === userId
      ) return;

      // Cooldown gate (sender-specific, target-specific).
      const cdKey = inviteCooldownKey(userId, targetUserId);
      const now = Date.now();
      const cdExpires = inviteCooldowns.get(cdKey);
      if (cdExpires && cdExpires > now) {
        socket.emit('lobby:inviteRejected', {
          targetUserId,
          code: 'COOLDOWN',
          retryInMs: cdExpires - now,
        });
        return;
      }

      // Target must be online (in the presence map). Otherwise the
      // invite would silently fall on the floor.
      if (!presence.has(targetUserId)) {
        socket.emit('lobby:inviteRejected', {
          targetUserId,
          code: 'OFFLINE',
        });
        return;
      }

      try {
        const lobby = await gameService.getLobby(lobbyId);
        if (!lobby) {
          socket.emit('lobby:inviteRejected', { targetUserId, code: 'LOBBY_NOT_FOUND' });
          return;
        }
        // Sender must be a member.
        if (!lobby.members.some((m) => m.user_id === userId)) {
          socket.emit('lobby:inviteRejected', { targetUserId, code: 'NOT_A_MEMBER' });
          return;
        }
        // Lobby must still be open and have room for one more player.
        if (lobby.status !== 'open') {
          socket.emit('lobby:inviteRejected', { targetUserId, code: 'NOT_OPEN' });
          return;
        }

        // Set cooldown BEFORE forwarding so a spam-fast double-emit is rejected.
        const cooldownUntil = now + GAME_LIMITS.INVITE_COOLDOWN_MS;
        inviteCooldowns.set(cdKey, cooldownUntil);

        // Forward to target.
        io.to(`user:${targetUserId}`).emit('lobby:invited', {
          lobbyId,
          inviteCode: lobby.invite_code,
          mode: lobby.mode,
          quizTitle: lobby.quiz_title || null,
          fromUserId: userId,
          fromDisplayName: displayName,
          // 30s soft TTL on the client. Server doesn't enforce — the
          // accept flow re-checks lobby joinability anyway.
          expiresAt: now + 30 * 1000,
        });

        // Acknowledge to sender so their UI flips to "Invited".
        socket.emit('lobby:inviteSent', {
          targetUserId,
          cooldownUntil,
        });
      } catch (err) {
        console.warn('[Socket] lobby:invite error:', err.message);
        socket.emit('lobby:inviteRejected', { targetUserId, code: 'INTERNAL' });
      }
    });

    // ── lobby:inviteResponse ───────────────────────────────────────
    // Target accepts/declines the popup. We forward the decision back
    // to the sender so their UI can flip from "Invited" → "Joining…"
    // or "Declined" (which clears after a few seconds, allowing a
    // fresh invite once the cooldown expires).
    socket.on('lobby:inviteResponse', ({ lobbyId, fromUserId, accepted } = {}) => {
      if (!takeToken(socket)) return;
      if (
        typeof lobbyId !== 'string' ||
        typeof fromUserId !== 'string' ||
        typeof accepted !== 'boolean'
      ) return;
      // Only forward to the original sender's user channel.
      io.to(`user:${fromUserId}`).emit('lobby:inviteResponse', {
        lobbyId,
        targetUserId: userId,
        accepted,
      });
      // Clear the cooldown either way:
      //   - on decline, sender can retry without waiting
      //   - on accept, the cooldown becomes irrelevant since the
      //     target is now a member; if they later leave, the sender
      //     can re-invite without waiting.
      inviteCooldowns.delete(inviteCooldownKey(fromUserId, userId));
    });

    // ── disconnect ─────────────────────────────────────────────────
    socket.on('disconnect', () => {
      removePresenceSocket(userId, socket.id);
      // Only clean up pending join-requests if the user is now FULLY
      // offline (no other tab/socket open). A user closing a tab while
      // another tab still holds presence shouldn't lose their pending
      // join requests.
      if (!presence.has(userId)) {
        for (const [requestId, req] of joinRequests.entries()) {
          if (req.requesterId === userId) {
            if (req.timer) clearTimeout(req.timer);
            joinRequests.delete(requestId);
            io.to(`user:${req.hostId}`).emit('lobby:joinRequestExpired', { requestId });
          }
        }
      }
      // If they were in a live game, schedule the abandon-on-no-reconnect.
      if (socket.data.lobbyId) {
        gameEngine.handleDisconnect({ lobbyId: socket.data.lobbyId, userId });
      }
    });

    // ───── GAME ENGINE EVENTS (Phase 3) ───────────────────────────
    // Live multiplayer events. The engine is server-authoritative;
    // clients only emit intent and the server replies + broadcasts.

    // game:start — only the host (or spectator) can start.
    socket.on('game:start', async ({ lobbyId } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof lobbyId !== 'string') return;
      try {
        const lobby = await gameService.getLobby(lobbyId);
        if (!lobby) return socket.emit('game:error', { code: 'LOBBY_NOT_FOUND' });
        if (lobby.status !== 'open') return socket.emit('game:error', { code: 'NOT_STARTABLE' });
        if (!lobby.quiz_id) return socket.emit('game:error', { code: 'NO_QUIZ_SELECTED' });

        // Authority: host or the spectator can press Start.
        const isHost = lobby.host_user_id === userId;
        const isSpectator = lobby.members.some(
          (m) => m.user_id === userId && m.role === 'spectator'
        );
        if (!isHost && !isSpectator) {
          return socket.emit('game:error', { code: 'NOT_AUTHORIZED' });
        }

        // All players (not spectators) must be ready.
        const players = lobby.members.filter((m) => m.role === 'player');
        if (players.length === 0) {
          return socket.emit('game:error', { code: 'NO_PLAYERS' });
        }
        // Per-mode minimum players. Solo requires 1 (the host),
        // 1v1 requires 2, 2v2 requires 2 (allows 2v0 which is fine
        // for casual queues — change to 4 if you want strict teams),
        // party5 requires 2.
        const MODE_MIN_PLAYERS = { solo: 1, '1v1': 2, '2v2': 2, party5: 2 };
        const minPlayers = MODE_MIN_PLAYERS[lobby.mode] || 1;
        if (players.length < minPlayers) {
          return socket.emit('game:error', {
            code: 'NOT_ENOUGH_PLAYERS',
            message: `${lobby.mode} mode needs at least ${minPlayers} players.`,
          });
        }
        if (!players.every((p) => p.ready)) {
          return socket.emit('game:error', { code: 'NOT_ALL_READY' });
        }

        // Mark the lobby in-progress (DB) and start the engine.
        // If the engine throws (e.g. quiz has no questions, was
        // deleted, etc.), roll back the status so the lobby isn't
        // stuck in_progress with no engine running.
        await gameService.markLobbyInProgress(lobbyId);
        try {
          await gameEngine.startGame({
            lobbyId,
            quizId: lobby.quiz_id,
            players: players.map((p) => ({
              userId: p.user_id,
              displayName: p.display_name,
              avatarId: p.avatar_id,
            })),
            spectators: lobby.members
              .filter((m) => m.role === 'spectator')
              .map((s) => ({ userId: s.user_id, displayName: s.display_name })),
            hostUserId: lobby.host_user_id,
            // Bridge engine events → socket broadcasts.
            emit: (event, payload) => {
              io.to(`lobby:${lobbyId}`).emit(event, payload);
            },
          });
        } catch (engineErr) {
          // Roll back the status to 'open' so users aren't stranded.
          await gameService.rollbackLobbyToOpen(lobbyId).catch(() => {});
          // Re-broadcast the open state.
          const refreshed = await gameService.getLobby(lobbyId).catch(() => null);
          if (refreshed) io.to(`lobby:${lobbyId}`).emit('lobby:state', { lobby: refreshed });
          socket.emit('game:error', {
            code: 'START_FAILED',
            message: engineErr?.message || 'Could not start the game.',
          });
          return;
        }

        // Also nudge the lobby-state for clients still on the lobby
        // browser so they can route to the play screen.
        io.to(`lobby:${lobbyId}`).emit('game:started', { lobbyId });
      } catch (err) {
        console.warn('[Socket] game:start error:', err.message);
        socket.emit('game:error', { code: 'INTERNAL', message: err.message });
      }
    });

    // game:rejoin — client carries lobbyId in URL and reconnects after
    // a transient disconnect. Returns the current public state.
    socket.on('game:rejoin', ({ lobbyId } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof lobbyId !== 'string') return;
      const snapshot = gameEngine.handleReconnect({ lobbyId, userId });
      if (snapshot) {
        socket.join(`lobby:${lobbyId}`);
        socket.data.lobbyId = lobbyId;
        socket.emit('game:phase', snapshot);
      } else {
        socket.emit('game:error', { code: 'NOT_REJOINABLE' });
      }
    });

    // game:buzz — buzzer event. Server-authoritative timestamp.
    socket.on('game:buzz', ({ lobbyId, clientTime } = {}) => {
      // Higher-priority rate limit (5/s) since legit buzzes can be fast.
      if (!takeToken(socket, GAME_LIMITS.BUZZ_EVENTS_PER_SOCKET_PER_SEC)) return;
      if (typeof lobbyId !== 'string') return;
      const result = gameEngine.buzz({ lobbyId, userId, clientTime });
      if (!result.ok) {
        socket.emit('game:buzzRejected', { code: result.code });
        return;
      }
      io.to(`lobby:${lobbyId}`).emit('game:buzzed', {
        userId,
        responseTimeMs: result.responseTimeMs,
      });
    });

    // game:pickAvatar — pick/change avatar during the avatar_select phase.
    socket.on('game:pickAvatar', ({ lobbyId, avatarId } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof lobbyId !== 'string') return;
      const result = gameEngine.pickAvatar({ lobbyId, userId, avatarId });
      if (!result.ok) {
        socket.emit('game:pickAvatarRejected', { code: result.code });
      }
      // Success broadcast handled inside the engine via game:phase.
    });

    // game:submitAnswer — answer text from the buzzed player.
    socket.on('game:submitAnswer', ({ lobbyId, text } = {}) => {
      if (!takeToken(socket)) return;
      if (typeof lobbyId !== 'string' || typeof text !== 'string') return;
      // Cap text length (cheap safety net against giant payloads).
      const trimmed = text.slice(0, 500);
      const result = gameEngine.submitAnswer({ lobbyId, userId, text: trimmed });
      if (!result.ok) {
        socket.emit('game:answerRejected', { code: result.code });
        return;
      }
      // Broadcast result to the whole lobby room so other players +
      // spectators can see who answered and whether it was wrong
      // (drives the wrong-answer overlay UI).
      io.to(`lobby:${lobbyId}`).emit('game:answerResult', {
        userId,
        displayName,
        isCorrect: result.isCorrect,
        points: result.points || 0,
        text: trimmed,
      });
    });
  });

  ioRef = io;

  console.log('[Socket] Game Mode socket server attached on /socket.io/');
  return io;
}

// ─── Presence helpers ───────────────────────────────────────────────

function removePresenceSocket(userId, socketId) {
  const entry = presence.get(userId);
  if (!entry) return;
  entry.socketIds.delete(socketId);
  if (entry.socketIds.size === 0) {
    presence.delete(userId);
    presenceQueue.left.add(userId);
    presenceQueue.joined.delete(userId);
    schedulePresenceFlush();
  }
}

function schedulePresenceFlush() {
  if (presenceFlushTimer) return;
  presenceFlushTimer = setTimeout(() => {
    presenceFlushTimer = null;
    flushPresence();
  }, GAME_LIMITS.PRESENCE_BROADCAST_DEBOUNCE_MS);
}

function flushPresence() {
  if (!ioRef) return;
  if (presenceQueue.joined.size === 0 && presenceQueue.left.size === 0) return;

  const delta = {
    joined: Array.from(presenceQueue.joined.entries()).map(([uid, e]) => ({
      userId: uid,
      displayName: e.displayName,
      avatarUrl: e.avatarUrl,
    })),
    left: Array.from(presenceQueue.left),
  };
  presenceQueue.joined.clear();
  presenceQueue.left.clear();

  ioRef.to('presence').emit('presence:delta', delta);
}

/**
 * Programmatically broadcast a fresh lobby state to its room.
 * Useful from REST routes after a write that needs to propagate.
 */
export function broadcastLobbyState(lobbyId, lobby) {
  if (!ioRef || !lobby) return;
  ioRef.to(`lobby:${lobbyId}`).emit('lobby:state', { lobby });
}

/**
 * Send an event to a specific user across all their sockets.
 */
export function emitToUser(userId, event, payload) {
  if (!ioRef) return;
  ioRef.to(`user:${userId}`).emit(event, payload);
}
