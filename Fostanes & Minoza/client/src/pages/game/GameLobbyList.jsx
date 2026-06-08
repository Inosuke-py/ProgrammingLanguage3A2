/**
 * GameLobbyList
 * ─────────────
 * The Game Mode entry point.
 *   - Shows your active lobby (if any) with a "Resume" button
 *   - "Create Lobby" picker (solo / 1v1 / 2v2 / party5)
 *   - Public lobby browser
 *   - Online users sidebar (presence:enter on mount, presence:leave on unmount)
 */

import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserPlus, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import GameModeGate from './GameModeGate';
import { game as gameApi } from '../../services/api';
import { gameSocket } from '../../services/gameSocket';
import Avatar from '../../components/shared/Avatar';
import useAuthStore from '../../store/useAuthStore';
import './GameLobbyList.css';

const MODE_OPTIONS = [
  { id: 'solo',    label: 'Solo',     desc: '1 player — practice run' },
  { id: '1v1',     label: '1 v 1',    desc: '2 players head-to-head' },
  { id: '2v2',     label: '2 v 2',    desc: '4 players in two pairs' },
  { id: 'party5',  label: 'Party',    desc: '5 players free-for-all' },
];

function GameLobbyListInner() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [myLobby, setMyLobby] = useState(null);
  const [lobbies, setLobbies] = useState([]);
  const [presence, setPresence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [invite, setInvite] = useState(null); // live invitation popup
  const [pendingJoin, setPendingJoin] = useState(null); // { lobbyId, requestId, status: 'waiting'|'declined' }
  const inviteTimerRef = useRef(null);
  const pendingJoinTimerRef = useRef(null);
  const aliveRef = useRef(true);

  // Load initial data + open the socket.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [meRes, listRes] = await Promise.allSettled([
          gameApi.getMyLobby(),
          gameApi.listLobbies(20),
        ]);
        if (!alive) return;
        if (meRes.status === 'fulfilled') setMyLobby(meRes.value.data?.lobby || null);
        if (listRes.status === 'fulfilled') setLobbies(listRes.value.data?.lobbies || []);
      } catch (err) {
        if (alive) setError(err.message || 'Failed to load lobbies.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  // Socket lifecycle: connect, join presence, handle invites.
  useEffect(() => {
    gameSocket.connect();
    gameSocket.setPresence(true);
    gameSocket.emit('presence:enter');

    const offSnapshot = gameSocket.on('presence:snapshot', ({ users }) => {
      setPresence(users || []);
    });
    const offDelta = gameSocket.on('presence:delta', ({ joined, left }) => {
      setPresence((prev) => {
        const map = new Map(prev.map((u) => [u.userId, u]));
        for (const u of joined || []) map.set(u.userId, u);
        for (const id of left || []) map.delete(id);
        return Array.from(map.values());
      });
    });
    const offInvite = gameSocket.on('lobby:invited', (payload) => {
      setInvite(payload);
      // Auto-dismiss after 30s if untouched. Cleanup any prior timer
      // so a flurry of invites doesn't leak handles.
      if (inviteTimerRef.current) clearTimeout(inviteTimerRef.current);
      inviteTimerRef.current = setTimeout(() => {
        if (!aliveRef.current) return;
        setInvite((cur) => {
          if (cur?.lobbyId === payload.lobbyId && cur?.fromUserId === payload.fromUserId) {
            // Implicit decline: tell sender so their UI can recover.
            gameSocket.emit('lobby:inviteResponse', {
              lobbyId: payload.lobbyId,
              fromUserId: payload.fromUserId,
              accepted: false,
            });
            return null;
          }
          return cur;
        });
      }, 30 * 1000);
    });

    // ── Pending join-request flow ──────────────────────────────────
    // We're the requester. Server confirms our request was queued,
    // host can approve/decline, and we display "Waiting for host..."
    // in the UI until something resolves it.
    const offJoinSent = gameSocket.on('lobby:joinRequestSent', ({ lobbyId, requestId }) => {
      // Race: user may have cancelled (clicked Cancel) before this
      // ack arrived. If pendingJoin was cleared, send an immediate
      // cancel for the now-known requestId so the request doesn't
      // linger server-side.
      setPendingJoin((cur) => {
        if (!cur || cur.lobbyId !== lobbyId) {
          gameSocket.emit('lobby:joinCancel', { requestId });
          return cur;
        }
        return { ...cur, requestId, status: 'waiting' };
      });
    });
    const offJoinApproved = gameSocket.on('lobby:joinApproved', ({ lobbyId }) => {
      if (pendingJoinTimerRef.current) {
        clearTimeout(pendingJoinTimerRef.current);
        pendingJoinTimerRef.current = null;
      }
      setPendingJoin(null);
      navigate(`/game/lobby/${lobbyId}`);
    });
    const offJoinDeclined = gameSocket.on('lobby:joinDeclined', ({ lobbyId, reason }) => {
      const reasonText = ({
        HOST_DECLINED: 'The host declined your request.',
        TIMEOUT: 'The host didn\'t respond in time.',
        LOBBY_FULL: 'The lobby filled up before the host could approve.',
        NOT_OPEN: 'The lobby is no longer open.',
        ALREADY_IN: 'You\'re already in this lobby.',
        LOBBY_NOT_FOUND: 'The lobby disappeared.',
      })[reason] || 'Could not join.';
      setPendingJoin({ lobbyId, status: 'declined', message: reasonText });
      if (pendingJoinTimerRef.current) clearTimeout(pendingJoinTimerRef.current);
      pendingJoinTimerRef.current = setTimeout(() => {
        if (aliveRef.current) setPendingJoin(null);
      }, 4000);
    });

    return () => {
      offSnapshot();
      offDelta();
      offInvite();
      offJoinSent();
      offJoinApproved();
      offJoinDeclined();
      if (inviteTimerRef.current) clearTimeout(inviteTimerRef.current);
      if (pendingJoinTimerRef.current) clearTimeout(pendingJoinTimerRef.current);
      gameSocket.setPresence(false);
      gameSocket.emit('presence:leave');
      gameSocket.disconnect();
    };
  }, [navigate]);

  // Mount/unmount tracking for async work that might outlive the component.
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  async function handleCreate(mode) {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const res = await gameApi.createLobby({ mode, isPublic: true });
      const lobby = res.data?.lobby;
      if (lobby?.id) navigate(`/game/lobby/${lobby.id}`);
    } catch (err) {
      setError(err.message || 'Could not create lobby.');
    } finally {
      setCreating(false);
    }
  }

  function handleJoin(lobbyId, role = 'player') {
    setError(null);
    if (role === 'spectator') {
      // Spectator slot is always optional and has only one seat — no
      // host approval needed. Go straight through the REST endpoint.
      gameApi.joinLobby(lobbyId, 'spectator')
        .then(() => navigate(`/game/lobby/${lobbyId}`))
        .catch((err) => setError(err.message || 'Could not join.'));
      return;
    }
    // Player joins on a public lobby require host approval.
    setPendingJoin({ lobbyId, status: 'sending' });
    gameSocket.emit('lobby:joinRequest', { lobbyId });
  }

  function cancelPendingJoin() {
    if (pendingJoin?.requestId) {
      gameSocket.emit('lobby:joinCancel', { requestId: pendingJoin.requestId });
    }
    if (pendingJoinTimerRef.current) {
      clearTimeout(pendingJoinTimerRef.current);
      pendingJoinTimerRef.current = null;
    }
    setPendingJoin(null);
  }

  // Filter self out of the online sidebar — the user already knows
  // they're online; showing themselves is just clutter.
  const othersOnline = useMemo(
    () => presence.filter((u) => u.userId !== me?.id),
    [presence, me?.id]
  );

  async function handleAcceptInvite() {
    if (!invite) return;
    // Tell the sender we accepted (so their UI can flip to "joining…").
    gameSocket.emit('lobby:inviteResponse', {
      lobbyId: invite.lobbyId,
      fromUserId: invite.fromUserId,
      accepted: true,
    });
    if (inviteTimerRef.current) {
      clearTimeout(inviteTimerRef.current);
      inviteTimerRef.current = null;
    }
    try {
      await gameApi.joinLobby(invite.lobbyId);
      navigate(`/game/lobby/${invite.lobbyId}`);
    } catch (err) {
      setError(err.message || 'Could not join.');
    } finally {
      setInvite(null);
    }
  }

  function handleDeclineInvite() {
    if (!invite) return;
    gameSocket.emit('lobby:inviteResponse', {
      lobbyId: invite.lobbyId,
      fromUserId: invite.fromUserId,
      accepted: false,
    });
    if (inviteTimerRef.current) {
      clearTimeout(inviteTimerRef.current);
      inviteTimerRef.current = null;
    }
    setInvite(null);
  }

  return (
    <div className="gm-list">
      <div className="gm-list__main">
        <header className="gm-list__header">
          <span className="label">Game Mode</span>
          <h1 className="gm-list__title">Quiz Bowl</h1>
          <p className="gm-list__subtitle">
            Real-time multiplayer buzzer battles. Pick a mode, queue up,
            and race your friends through a quiz of your choice.
          </p>
        </header>

        {error && <div className="gm-list__error"><AlertCircle size={14} /> {error}</div>}

        {/* RESUME ACTIVE LOBBY */}
        {myLobby && (
          <div className="gm-list__resume">
            <div>
              <strong>You're in a {myLobby.mode} lobby</strong>
              <span> · {myLobby.status === 'in_progress' ? 'game in progress' : 'waiting room'}</span>
            </div>
            <button className="btn btn--primary" onClick={() => navigate(`/game/lobby/${myLobby.id}`)}>
              Resume
            </button>
          </div>
        )}

        {/* CREATE LOBBY */}
        <section className="gm-list__section">
          <h2 className="gm-list__section-title">Create a Lobby</h2>
          <div className="gm-list__modes">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                className="gm-mode-card"
                onClick={() => handleCreate(m.id)}
                disabled={creating || !!myLobby}
              >
                <Plus size={18} />
                <strong>{m.label}</strong>
                <span>{m.desc}</span>
              </button>
            ))}
          </div>
          {!!myLobby && (
            <p className="gm-list__hint">
              You're already in a lobby — leave it first to create a new one.
            </p>
          )}
        </section>

        {/* PUBLIC LOBBIES */}
        <section className="gm-list__section">
          <div className="gm-list__section-head">
            <h2 className="gm-list__section-title">Open Lobbies</h2>
            <button
              className="gm-list__refresh"
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await gameApi.listLobbies(20);
                  setLobbies(res.data?.lobbies || []);
                } catch {} finally { setLoading(false); }
              }}
              aria-label="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {loading ? (
            <div className="gm-list__loading">Loading lobbies…</div>
          ) : lobbies.length === 0 ? (
            <div className="gm-list__empty">
              No public lobbies right now. Create one above to get started.
            </div>
          ) : (
            <div className="gm-list__rows">
              {lobbies.map((l) => {
                const cap = { solo: 1, '1v1': 2, '2v2': 4, party5: 5 }[l.mode] || 5;
                const full = l.player_count >= cap;
                return (
                  <div key={l.id} className="gm-row">
                    <Avatar src={l.host_avatar} name={l.host_name} size={28} />
                    <div className="gm-row__main">
                      <strong>{l.host_name}'s {l.mode} lobby</strong>
                      <span>
                        {l.quiz_title || 'No quiz selected'} · {l.player_count}/{cap} players
                        {l.spectator_count > 0 ? ` · 1 spectator` : ''}
                      </span>
                    </div>
                    <button
                      className="btn btn--outline btn--sm"
                      disabled={full || pendingJoin?.status === 'sending' || pendingJoin?.status === 'waiting'}
                      onClick={() => handleJoin(l.id, 'player')}
                      title={
                        full
                          ? 'Lobby is full'
                          : pendingJoin?.status === 'waiting'
                          ? 'You already have a pending request'
                          : 'Request to join — host will approve'
                      }
                    >
                      {full
                        ? 'Full'
                        : pendingJoin?.status === 'waiting' && pendingJoin.lobbyId === l.id
                        ? 'Pending…'
                        : 'Request Join'}
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => handleJoin(l.id, 'spectator')}
                    >
                      Spectate
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* PRESENCE SIDEBAR */}
      <aside className="gm-list__sidebar">
        <header className="gm-list__sidebar-head">
          <Users size={14} /> Online <span>({othersOnline.length})</span>
        </header>
        {othersOnline.length === 0 ? (
          <div className="gm-list__empty">No one else here yet.</div>
        ) : (
          <ul className="gm-list__online">
            {othersOnline.map((u) => (
              <li key={u.userId}>
                <Avatar src={u.avatarUrl} name={u.displayName} size={26} />
                <span>{u.displayName}</span>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* LIVE INVITATION POPUP */}
      {invite && (
        <div className="gm-invite">
          <UserPlus size={16} />
          <div className="gm-invite__body">
            <strong>{invite.fromDisplayName}</strong> invited you to a {invite.mode} lobby
            {invite.quizTitle ? ` — ${invite.quizTitle}` : ''}
          </div>
          <button className="btn btn--primary btn--sm" onClick={handleAcceptInvite}>Accept</button>
          <button className="btn btn--ghost btn--sm" onClick={handleDeclineInvite}>Decline</button>
        </div>
      )}

      {/* PENDING JOIN-REQUEST POPUP — request to join a public lobby */}
      {pendingJoin && (
        <div className={`gm-invite gm-invite--pending ${pendingJoin.status === 'declined' ? 'is-declined' : ''}`}>
          {pendingJoin.status === 'declined' ? (
            <>
              <AlertCircle size={16} />
              <div className="gm-invite__body">
                <strong>Request denied</strong>
                <span style={{ display: 'block' }}>{pendingJoin.message}</span>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={() => setPendingJoin(null)}>Dismiss</button>
            </>
          ) : (
            <>
              <UserPlus size={16} />
              <div className="gm-invite__body">
                <strong>Waiting for the host…</strong>
                <span style={{ display: 'block' }}>Your join request is pending approval.</span>
              </div>
              <button className="btn btn--ghost btn--sm" onClick={cancelPendingJoin}>Cancel</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function GameLobbyList() {
  return <GameModeGate><GameLobbyListInner /></GameModeGate>;
}
