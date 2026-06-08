/**
 * GameLobby — The pre-game lobby room.
 * ──────────────────────────────────────
 *
 * Skeuomorphic design. Every piece feels carved out of the page:
 *  - Slot cards use `--surface-skeuo` + `--shadow-skeuo`
 *  - Pressed-style on the user's own slot (you "occupy" it)
 *  - Inset-style on empty slots (a hollow "well" you can fill)
 *  - Buttons inherit the existing skeu treatment from index.css
 *
 * Live behavior (Socket.IO):
 *  - Subscribes to lobby:state for any change (someone joins, leaves,
 *    flips ready, picks/drops avatar, host changes the quiz).
 *  - Subscribes to game:started to route everyone to /game/play/:id.
 *  - Subscribes to lobby:kicked to redirect when the host removes us.
 *  - Listens to presence:* for the online sidebar.
 *
 * Server-authoritative actions (REST):
 *  - Ready toggle, avatar pick, role swap, quiz pick, kick, leave, start.
 *  - Each REST mutation triggers a server-side fanoutLobby that
 *    broadcasts lobby:state to everyone in the room.
 *
 * Authority gates (UI-side; server enforces too):
 *  - "Start Game" only renders for host or spectator.
 *  - "Choose Quiz" only renders for host or spectator.
 *  - "Kick" only renders for the host on OTHER players.
 *  - All buttons disabled if status !== 'open'.
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Play,
  Users,
  UserPlus,
  UserMinus,
  Eye,
  Trophy,
  X,
  Check,
  Loader2,
  AlertCircle,
  Crown,
  ArrowLeft,
  ChevronDown,
} from 'lucide-react';
import GameModeGate from './GameModeGate';
import { game as gameApi, quizzes as quizzesApi } from '../../services/api';
import { gameSocket } from '../../services/gameSocket';
import Avatar from '../../components/shared/Avatar';
import useAuthStore from '../../store/useAuthStore';
import './GameLobby.css';

// Per-mode slot count (matches server config).
const MODE_CAPACITY = { solo: 1, '1v1': 2, '2v2': 4, party5: 5 };
const MODE_LABELS = { solo: 'Solo', '1v1': '1 v 1', '2v2': '2 v 2', party5: 'Party' };

function GameLobbyInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);

  const [lobby, setLobby] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actioning, setActioning] = useState(false);          // disables buttons during a REST mutation
  const [presence, setPresence] = useState([]);                // online users sidebar
  const [showQuizPicker, setShowQuizPicker] = useState(false);
  const [myQuizzes, setMyQuizzes] = useState([]);
  const [publicQuizzes, setPublicQuizzes] = useState([]);
  const [kickedToast, setKickedToast] = useState(false);

  // Invite state machine, keyed by targetUserId.
  // Each entry: { status, cooldownUntil?, expiresAt? }
  //   status ∈ 'sending' | 'sent' | 'declined' | 'offline' | 'error'
  // Absence = idle (button shows "Invite").
  const [inviteStates, setInviteStates] = useState({});
  // Pending incoming join requests (host only). Each: { requestId, lobbyId, requester:{userId, displayName}, mode }
  const [joinRequests, setJoinRequests] = useState([]);
  // Drives the per-button countdown re-render every 500ms while any
  // entry has a future cooldownUntil.
  const [, setNowTick] = useState(0);
  const aliveRef = useRef(true);
  const kickToastTimerRef = useRef(null);
  const inviteResetTimersRef = useRef(new Map()); // targetUserId → timeoutId

  // Helper: cancel any prior reset timer for this target before
  // installing a fresh one. Prevents leaks when a target's invite
  // state churns (sent → declined → sent again, etc.). Declared here
  // (above the socket effect) so the effect's event handlers can
  // reference it cleanly via closure.
  const armResetTimer = useCallback((targetUserId, callback, ms) => {
    const prior = inviteResetTimersRef.current.get(targetUserId);
    if (prior) clearTimeout(prior);
    const t = setTimeout(() => {
      inviteResetTimersRef.current.delete(targetUserId);
      if (aliveRef.current) callback();
    }, ms);
    inviteResetTimersRef.current.set(targetUserId, t);
  }, []);

  // ─── Initial load ────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await gameApi.getLobby(id);
        if (!alive) return;
        setLobby(res.data?.lobby || null);
      } catch (err) {
        if (!alive) return;
        // 404 → lobby is gone; bounce to browser.
        if (err.status === 404) {
          navigate('/game', { replace: true });
          return;
        }
        setError(err.message || 'Failed to load lobby.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [id, navigate]);

  // ─── Socket lifecycle ────────────────────────────────────────────
  useEffect(() => {
    gameSocket.connect();
    gameSocket.setPresence(true);
    gameSocket.emit('presence:enter');
    gameSocket.emit('lobby:join', { lobbyId: id });

    const offSnapshot = gameSocket.on('presence:snapshot', ({ users }) => {
      setPresence(users || []);
    });
    const offDelta = gameSocket.on('presence:delta', ({ joined, left }) => {
      setPresence((prev) => {
        const map = new Map(prev.map((u) => [u.userId, u]));
        for (const u of joined || []) map.set(u.userId, u);
        for (const uid of left || []) map.delete(uid);
        return Array.from(map.values());
      });
    });

    const offState = gameSocket.on('lobby:state', ({ lobby: nextLobby }) => {
      if (nextLobby?.id === id) setLobby(nextLobby);
    });
    const offStarted = gameSocket.on('game:started', ({ lobbyId }) => {
      if (lobbyId === id) navigate(`/game/play/${id}`, { replace: true });
    });
    const offKicked = gameSocket.on('lobby:kicked', ({ lobbyId }) => {
      if (lobbyId === id) {
        setKickedToast(true);
        // Brief delay so the user sees the toast before redirect.
        if (kickToastTimerRef.current) clearTimeout(kickToastTimerRef.current);
        kickToastTimerRef.current = setTimeout(() => {
          if (aliveRef.current) navigate('/game', { replace: true });
        }, 1500);
      }
    });

    // Invite acks from the server.
    const offInviteSent = gameSocket.on('lobby:inviteSent', ({ targetUserId, cooldownUntil }) => {
      setInviteStates((prev) => ({
        ...prev,
        [targetUserId]: { status: 'sent', cooldownUntil },
      }));
      // Auto-clear the "sent" state when cooldown ends, returning to idle.
      const ms = Math.max(0, cooldownUntil - Date.now()) + 50;
      armResetTimer(targetUserId, () => {
        setInviteStates((prev) => {
          const cur = prev[targetUserId];
          if (cur?.status === 'sent') {
            const { [targetUserId]: _omit, ...rest } = prev;
            return rest;
          }
          return prev;
        });
      }, ms);
    });
    const offInviteRejected = gameSocket.on('lobby:inviteRejected', ({ targetUserId, code, retryInMs }) => {
      const status = code === 'OFFLINE' ? 'offline' : code === 'COOLDOWN' ? 'sent' : 'error';
      const cooldownUntil = code === 'COOLDOWN' && retryInMs ? Date.now() + retryInMs : undefined;
      setInviteStates((prev) => ({
        ...prev,
        [targetUserId]: { status, cooldownUntil },
      }));
      // Auto-reset transient errors after 3s so user can retry.
      if (status === 'error' || status === 'offline') {
        armResetTimer(targetUserId, () => {
          setInviteStates((prev) => {
            const cur = prev[targetUserId];
            if (cur?.status === status) {
              const { [targetUserId]: _omit, ...rest } = prev;
              return rest;
            }
            return prev;
          });
        }, 3000);
      }
    });
    const offInviteResponse = gameSocket.on('lobby:inviteResponse', ({ targetUserId, accepted }) => {
      if (accepted) {
        // They accepted — they're about to appear in the lobby:state.
        // Clear the per-target invite UI once that happens. For now,
        // flip to a quick "joining…" state.
        setInviteStates((prev) => ({
          ...prev,
          [targetUserId]: { status: 'sent', cooldownUntil: Date.now() + 1000 },
        }));
      } else {
        setInviteStates((prev) => ({
          ...prev,
          [targetUserId]: { status: 'declined' },
        }));
        // Clear after 3s so user can re-invite.
        armResetTimer(targetUserId, () => {
          setInviteStates((prev) => {
            const cur = prev[targetUserId];
            if (cur?.status === 'declined') {
              const { [targetUserId]: _omit, ...rest } = prev;
              return rest;
            }
            return prev;
          });
        }, 3000);
      }
    });

    // ── Host-side: incoming join requests from public-browser clicks. ──
    const offJoinRequested = gameSocket.on('lobby:joinRequested', (req) => {
      // Ignore if it's not for our lobby (defensive — server already
      // routes per user channel).
      if (req?.lobbyId !== id) return;
      setJoinRequests((prev) => {
        // De-dupe by requester.
        if (prev.some((r) => r.requester.userId === req.requester.userId)) return prev;
        return [...prev, req];
      });
    });
    const offJoinExpired = gameSocket.on('lobby:joinRequestExpired', ({ requestId }) => {
      setJoinRequests((prev) => prev.filter((r) => r.requestId !== requestId));
    });

    return () => {
      offSnapshot();
      offDelta();
      offState();
      offStarted();
      offKicked();
      offInviteSent();
      offInviteRejected();
      offInviteResponse();
      offJoinRequested();
      offJoinExpired();
      gameSocket.emit('lobby:leaveRoom', { lobbyId: id });
      gameSocket.setPresence(false);
      gameSocket.emit('presence:leave');
      gameSocket.disconnect();
    };
  }, [id, navigate]);

  // Mount/unmount tracking + cleanup of all per-target reset timers.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (kickToastTimerRef.current) clearTimeout(kickToastTimerRef.current);
      for (const t of inviteResetTimersRef.current.values()) clearTimeout(t);
      inviteResetTimersRef.current.clear();
    };
  }, []);

  // Tick every 500ms so invite cooldown buttons re-render their countdown.
  // Only runs while at least one entry has a future cooldownUntil — sleeps
  // otherwise to avoid waking the event loop for nothing.
  useEffect(() => {
    const hasCountdown = Object.values(inviteStates).some(
      (s) => s.status === 'sent' && s.cooldownUntil && s.cooldownUntil > Date.now()
    );
    if (!hasCountdown) return undefined;
    const id = setInterval(() => setNowTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [inviteStates]);

  // ─── Authority + derived state ───────────────────────────────────
  const myMember = useMemo(
    () => lobby?.members?.find((m) => m.user_id === me?.id) || null,
    [lobby, me]
  );
  const isHost = lobby?.host_user_id === me?.id;
  const players = lobby?.members?.filter((m) => m.role === 'player') || [];
  const spectator = lobby?.members?.find((m) => m.role === 'spectator') || null;
  const capacity = lobby ? (MODE_CAPACITY[lobby.mode] ?? 5) : 5;
  const allReady = players.length > 0 && players.every((p) => p.ready);
  const canStart = (isHost || myMember?.role === 'spectator') && allReady && !!lobby?.quiz_id;
  const lobbyOpen = lobby?.status === 'open';

  // ─── Actions (each wrapped to guard against double-clicks) ───────
  const guardedAction = useCallback(async (fn) => {
    if (actioning) return;
    setActioning(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setActioning(false);
    }
  }, [actioning]);

  const handleReady = () =>
    guardedAction(() => gameApi.setReady(id, !myMember?.ready));

  const handleSwitchRole = (newRole) =>
    guardedAction(() => gameApi.switchRole(id, newRole));

  const handleLeave = () =>
    guardedAction(async () => {
      await gameApi.leaveLobby(id);
      navigate('/game', { replace: true });
    });

  const handleKick = (userId) =>
    guardedAction(() => gameApi.kick(id, userId));

  const handleInvite = (targetUserId) => {
    // Don't fire if a state already exists for this target (sent / cooldown / declined).
    const cur = inviteStates[targetUserId];
    if (cur && cur.status !== 'idle') {
      // Cooldown or in-flight — server would reject anyway.
      if (cur.status === 'sent' && cur.cooldownUntil && cur.cooldownUntil > Date.now()) return;
      if (cur.status === 'sending') return;
    }
    setInviteStates((prev) => ({
      ...prev,
      [targetUserId]: { status: 'sending' },
    }));
    gameSocket.emit('lobby:invite', { lobbyId: id, targetUserId });
  };

  const handleStart = () =>
    guardedAction(async () => {
      // Engine-driven start lives over the socket.
      gameSocket.emit('game:start', { lobbyId: id });
    });

  function respondJoinRequest(requestId, accepted) {
    gameSocket.emit('lobby:joinResponse', { requestId, accepted });
    setJoinRequests((prev) => prev.filter((r) => r.requestId !== requestId));
  }

  // ─── Quiz picker ─────────────────────────────────────────────────
  async function openQuizPicker() {
    setShowQuizPicker(true);
    if (myQuizzes.length || publicQuizzes.length) return;
    try {
      const [mineRes, pubRes] = await Promise.allSettled([
        quizzesApi.list({ mine: 'true', limit: 50 }),
        quizzesApi.list({ limit: 50 }),
      ]);
      if (!aliveRef.current) return;
      if (mineRes.status === 'fulfilled') setMyQuizzes(mineRes.value.data || []);
      if (pubRes.status === 'fulfilled') setPublicQuizzes(pubRes.value.data || []);
    } catch (err) { /* non-fatal */ }
  }

  async function pickQuiz(quizId) {
    setShowQuizPicker(false);
    await guardedAction(() => gameApi.setQuiz(id, quizId));
  }

  // Online users that are NOT already in this lobby.
  const inviteableOnline = useMemo(() => {
    if (!lobby) return presence;
    const inLobby = new Set(lobby.members.map((m) => m.user_id));
    return presence.filter((u) => u.userId !== me?.id && !inLobby.has(u.userId));
  }, [presence, lobby, me]);

  // When a previously-invited user appears in the lobby members,
  // clear their invite state so the entry just disappears from the
  // sidebar (they're no longer in inviteableOnline).
  useEffect(() => {
    if (!lobby) return;
    const inLobby = new Set(lobby.members.map((m) => m.user_id));
    setInviteStates((prev) => {
      let changed = false;
      const next = {};
      for (const [uid, state] of Object.entries(prev)) {
        if (inLobby.has(uid)) { changed = true; continue; }
        next[uid] = state;
      }
      return changed ? next : prev;
    });
  }, [lobby]);

  // Compute the visible label/disabled state for an invite button.
  function inviteButtonState(targetUserId) {
    const s = inviteStates[targetUserId];
    if (!s) return { label: 'Invite', disabled: false, variant: 'outline' };
    if (s.status === 'sending') return { label: 'Sending…', disabled: true, variant: 'outline' };
    if (s.status === 'sent') {
      const remaining = Math.max(0, Math.ceil(((s.cooldownUntil || 0) - Date.now()) / 1000));
      return {
        label: remaining > 0 ? `Invited · ${remaining}s` : 'Invited',
        disabled: true,
        variant: 'outline',
      };
    }
    if (s.status === 'declined') return { label: 'Declined', disabled: true, variant: 'ghost' };
    if (s.status === 'offline')  return { label: 'Offline', disabled: true, variant: 'ghost' };
    if (s.status === 'error')    return { label: 'Try again', disabled: false, variant: 'outline' };
    return { label: 'Invite', disabled: false, variant: 'outline' };
  }

  // ─── Render guards ───────────────────────────────────────────────
  if (loading) {
    return (
      <div className="lobby-loading">
        <Loader2 size={26} className="spin" />
        <span>Loading lobby…</span>
      </div>
    );
  }
  if (!lobby) {
    return (
      <div className="lobby-loading">
        <AlertCircle size={26} />
        <span>Lobby not found.</span>
        <Link to="/game" className="btn btn--primary">Back to Game Mode</Link>
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div className="lobby-page">
      {kickedToast && (
        <div className="lobby-toast lobby-toast--warn">
          <UserMinus size={16} /> The host removed you from the lobby.
        </div>
      )}

      <div className="lobby-page__main">
        {/* HEADER */}
        <header className="lobby-page__header">
          <Link to="/game" className="lobby-back" aria-label="Back to Game Mode">
            <ArrowLeft size={14} /> Back
          </Link>
          <div>
            <span className="label">Lobby · {MODE_LABELS[lobby.mode] || lobby.mode}</span>
            <h1 className="lobby-page__title">
              {lobby.host_name ? `${lobby.host_name}'s game` : 'Game Lobby'}
            </h1>
          </div>
          <div className="lobby-page__header-spacer" />
        </header>

        {error && (
          <div className="lobby-error">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* QUIZ ROW */}
        <section className="lobby-card lobby-card--quiz">
          <div className="lobby-card__head">
            <span className="label">Quiz</span>
            <h2 className="lobby-card__title">
              {lobby.quiz_title || 'No quiz selected'}
            </h2>
          </div>
          {(isHost || myMember?.role === 'spectator') && lobbyOpen && (
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={openQuizPicker}
              disabled={actioning}
            >
              {lobby.quiz_id ? 'Change Quiz' : 'Choose Quiz'} <ChevronDown size={13} />
            </button>
          )}
        </section>

        {/* PLAYER SLOTS */}
        <section className="lobby-section">
          <div className="lobby-section__head">
            <h2 className="lobby-section__title">
              <Users size={16} /> Players
              <span className="lobby-section__count">{players.length} / {capacity}</span>
            </h2>
            {myMember?.role === 'player' ? (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => handleSwitchRole('spectator')}
                disabled={actioning || !lobbyOpen}
                title="Switch to spectator"
              >
                <Eye size={13} /> Spectate Instead
              </button>
            ) : myMember?.role === 'spectator' ? (
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => handleSwitchRole('player')}
                disabled={actioning || !lobbyOpen || players.length >= capacity}
                title={players.length >= capacity ? 'Player slots are full' : 'Switch to player'}
              >
                <Users size={13} /> Play Instead
              </button>
            ) : null}
          </div>

          <div className="lobby-slots">
            {Array.from({ length: capacity }).map((_, i) => {
              const player = players[i];
              if (!player) {
                return (
                  <div key={`empty-${i}`} className="slot slot--empty">
                    <div className="slot__inner">
                      <UserPlus size={20} />
                      <span className="slot__label">Empty</span>
                    </div>
                  </div>
                );
              }
              const isMe = player.user_id === me?.id;
              const isLobbyHost = player.user_id === lobby.host_user_id;
              return (
                <div
                  key={player.member_id}
                  className={`slot slot--occupied ${isMe ? 'slot--me' : ''} ${player.ready ? 'slot--ready' : ''}`}
                >
                  <div className="slot__inner">
                    <Avatar
                      src={player.avatar_url}
                      name={player.display_name}
                      size={48}
                    />
                    <div className="slot__name">
                      {isLobbyHost && <Crown size={11} className="slot__crown" />}
                      <span>{player.display_name}</span>
                      {isMe && <span className="slot__me-tag">You</span>}
                    </div>
                    <div className="slot__status">
                      {player.ready ? (
                        <span className="slot__ready"><Check size={11} /> Ready</span>
                      ) : (
                        <span className="slot__waiting">Waiting…</span>
                      )}
                    </div>
                    {isHost && !isMe && lobbyOpen && (
                      <button
                        type="button"
                        className="slot__kick"
                        onClick={() => handleKick(player.user_id)}
                        disabled={actioning}
                        aria-label={`Kick ${player.display_name}`}
                        title="Kick from lobby"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* SPECTATOR SLOT */}
        <section className="lobby-section">
          <div className="lobby-section__head">
            <h2 className="lobby-section__title">
              <Eye size={16} /> Spectator
              <span className="lobby-section__count">{spectator ? 1 : 0} / 1</span>
            </h2>
          </div>
          <div className="lobby-slots lobby-slots--single">
            {spectator ? (
              <div
                className={`slot slot--occupied slot--spectator ${spectator.user_id === me?.id ? 'slot--me' : ''}`}
              >
                <div className="slot__inner">
                  <Avatar
                    src={spectator.avatar_url}
                    name={spectator.display_name}
                    size={48}
                  />
                  <div className="slot__name">
                    <Eye size={11} className="slot__crown" />
                    <span>{spectator.display_name}</span>
                    {spectator.user_id === me?.id && <span className="slot__me-tag">You</span>}
                  </div>
                  <div className="slot__status">
                    <span className="slot__waiting">Spectating</span>
                  </div>
                  {isHost && spectator.user_id !== me?.id && lobbyOpen && (
                    <button
                      type="button"
                      className="slot__kick"
                      onClick={() => handleKick(spectator.user_id)}
                      disabled={actioning}
                      aria-label={`Kick ${spectator.display_name}`}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="slot slot--empty slot--spectator">
                <div className="slot__inner">
                  <Eye size={20} />
                  <span className="slot__label">No spectator</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ACTION BAR */}
        <section className="lobby-actions">
          {myMember?.role === 'player' && (
            <button
              type="button"
              className={`btn btn--lg ${myMember.ready ? 'btn--outline' : 'btn--primary'}`}
              onClick={handleReady}
              disabled={actioning || !lobbyOpen}
            >
              {myMember.ready ? <><Check size={15} /> You're Ready</> : <>Ready Up</>}
            </button>
          )}
          {(isHost || myMember?.role === 'spectator') && (
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={handleStart}
              disabled={!canStart || actioning || !lobbyOpen}
              title={
                !lobby.quiz_id
                  ? 'Choose a quiz first'
                  : !allReady
                  ? 'All players need to be ready'
                  : 'Start the game'
              }
            >
              <Play size={15} /> Start Game
            </button>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--lg"
            onClick={handleLeave}
            disabled={actioning}
          >
            Leave Lobby
          </button>
        </section>
      </div>

      {/* SIDEBAR — Online users */}
      <aside className="lobby-sidebar">
        <header className="lobby-sidebar__head">
          <Users size={14} /> Online <span>({inviteableOnline.length})</span>
        </header>
        {inviteableOnline.length === 0 ? (
          <div className="lobby-sidebar__empty">No one to invite right now.</div>
        ) : (
          <ul className="lobby-sidebar__list">
            {inviteableOnline.map((u) => {
              const btn = inviteButtonState(u.userId);
              const lobbyFull = players.length >= capacity;
              const disabled = btn.disabled || !lobbyOpen || lobbyFull;
              const title = !lobbyOpen
                ? 'Game already started'
                : lobbyFull
                ? 'Lobby is full'
                : btn.label === 'Declined'
                ? `${u.displayName} declined`
                : btn.label === 'Offline'
                ? `${u.displayName} is no longer online`
                : btn.label.startsWith('Invited')
                ? 'Invite sent — wait before sending another'
                : `Invite ${u.displayName}`;
              return (
                <li key={u.userId}>
                  <Avatar src={u.avatarUrl} name={u.displayName} size={28} />
                  <span className="lobby-sidebar__name">{u.displayName}</span>
                  <button
                    type="button"
                    className={`btn btn--xs btn--${btn.variant}`}
                    onClick={() => handleInvite(u.userId)}
                    disabled={disabled}
                    title={title}
                  >
                    {btn.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* HOST: PENDING JOIN REQUESTS — stack of approval popups */}
      {isHost && joinRequests.length > 0 && (
        <div className="lobby-join-requests">
          {joinRequests.map((req) => (
            <div key={req.requestId} className="lobby-join-req">
              <UserPlus size={16} />
              <div className="lobby-join-req__body">
                <strong>{req.requester.displayName}</strong>
                <span> wants to join your lobby.</span>
              </div>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => respondJoinRequest(req.requestId, true)}
              >
                Approve
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => respondJoinRequest(req.requestId, false)}
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      )}

      {/* QUIZ PICKER MODAL */}
      {showQuizPicker && (
        <div className="lobby-quiz-modal" onClick={() => setShowQuizPicker(false)}>
          <div className="lobby-quiz-modal__inner" onClick={(e) => e.stopPropagation()}>
            <header className="lobby-quiz-modal__head">
              <h3>Choose a Quiz</h3>
              <button
                type="button"
                onClick={() => setShowQuizPicker(false)}
                className="lobby-quiz-modal__close"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>
            <div className="lobby-quiz-modal__body">
              {myQuizzes.length > 0 && (
                <>
                  <p className="lobby-quiz-modal__group">Your Quizzes</p>
                  {myQuizzes.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      className="lobby-quiz-row"
                      onClick={() => pickQuiz(q.id)}
                    >
                      <Trophy size={14} />
                      <span>{q.title}</span>
                      <span className="lobby-quiz-row__count">{q.question_count || 0} q</span>
                    </button>
                  ))}
                </>
              )}
              {publicQuizzes.length > 0 && (
                <>
                  <p className="lobby-quiz-modal__group">Public</p>
                  {publicQuizzes.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      className="lobby-quiz-row"
                      onClick={() => pickQuiz(q.id)}
                    >
                      <Trophy size={14} />
                      <span>{q.title}</span>
                      <span className="lobby-quiz-row__count">{q.question_count || 0} q</span>
                    </button>
                  ))}
                </>
              )}
              {myQuizzes.length === 0 && publicQuizzes.length === 0 && (
                <div className="lobby-quiz-modal__empty">No quizzes available yet.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GameLobby() {
  return <GameModeGate><GameLobbyInner /></GameModeGate>;
}
