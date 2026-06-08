/**
 * GamePlay
 * ────────
 * The actual buzzer game. 2D for Phase 1; the 3D scene comes in Phase 2.
 *
 * Flow:
 *   - Mount → connect socket → emit game:rejoin
 *   - avatar_select phase: pick from 5 stylized characters
 *   - countdown → question_displayed → buzz_open
 *   - PLAYER_ANSWERING: prominent countdown + input for the buzzer
 *   - Wrong answer → red "Wrong!" overlay for ~1.8s + red shake on the
 *     submitter's answer card (so the player feels the rejection even
 *     if their gaze is on the input)
 *   - REVEAL → ranking on FINISHED
 *
 * Wrong-overlay race protection:
 *   The server emits 'game:phase: reveal' before 'game:answerResult'
 *   in the all-out case. We deliberately do NOT clear the overlay on
 *   phase transitions — the 1800ms timer is the sole source of truth.
 *   The overlay is only force-cleared when a NEW question begins
 *   (question_displayed) so the next round starts clean.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Send, Trophy, X, Check } from 'lucide-react';
import GameModeGate from './GameModeGate';
import { gameSocket } from '../../services/gameSocket';
import useAuthStore from '../../store/useAuthStore';
import CharacterAvatar, { CHARACTER_NAMES } from '../../components/shared/CharacterAvatar';
import './GamePlay.css';

// Per-character accent hue used for outlines/buzzed-glow/score color.
const AVATAR_HUE = {
  1: '#dc2626', 2: '#f59e0b', 3: '#10b981', 4: '#3b82f6', 5: '#8b5cf6',
};
const AVATAR_IDS = [1, 2, 3, 4, 5];

function GamePlayInner() {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);

  const [phase, setPhase] = useState(null);
  const [answerText, setAnswerText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [, setTick] = useState(0); // forces re-render for countdown
  const [ranking, setRanking] = useState(null);
  const [resolved, setResolved] = useState(null); // { correctAnswer, winnerUserId, pointsAwarded }
  const [error, setError] = useState(null);
  const [wrongOverlay, setWrongOverlay] = useState(null); // { name, text } | null
  const [wrongFlash, setWrongFlash] = useState(false);    // localized red flash on answer card
  const [avatarToast, setAvatarToast] = useState(null);   // 'AVATAR_TAKEN' | etc.
  const inputRef = useRef(null);
  const wrongTimerRef = useRef(null);
  const flashTimerRef = useRef(null);
  const avatarToastTimerRef = useRef(null);

  // Connect, rejoin the live game.
  useEffect(() => {
    gameSocket.connect();
    gameSocket.emit('game:rejoin', { lobbyId });

    const offPhase = gameSocket.on('game:phase', (state) => {
      setPhase(state);
      if (state.phase === 'question_displayed' || state.phase === 'buzz_open') {
        setResolved(null);
        setAnswerText('');
      }
      // ONLY clear the overlay when a brand-new question begins. Do NOT
      // clear on reveal/finished — the server emits 'reveal' BEFORE
      // 'answerResult' in the all-out case, so clearing here would
      // race the overlay's own setter and visibly never show.
      if (state.phase === 'question_displayed') {
        if (wrongTimerRef.current) {
          clearTimeout(wrongTimerRef.current);
          wrongTimerRef.current = null;
        }
        setWrongOverlay(null);
        setWrongFlash(false);
      }
    });
    const offBuzzed = gameSocket.on('game:buzzed', (payload) => {
      setPhase((cur) => cur ? { ...cur, buzzedUserId: payload.userId } : cur);
    });
    const offResolved = gameSocket.on('game:question_resolved', (payload) => {
      setResolved(payload);
    });
    const offBuzzReject = gameSocket.on('game:buzzRejected', ({ code }) => {
      console.warn('[GamePlay] buzz rejected:', code);
    });
    const offAnsReject = gameSocket.on('game:answerRejected', ({ code }) => {
      console.warn('[GamePlay] answer rejected:', code);
      setSubmitting(false);
    });
    const offAnsResult = gameSocket.on('game:answerResult', ({ userId, displayName, isCorrect, text }) => {
      // Submitter clears spinner.
      if (userId === me?.id) setSubmitting(false);
      if (!isCorrect) {
        // Centered overlay for everyone in the room.
        if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
        setWrongOverlay({
          name: displayName || 'Player',
          text: typeof text === 'string' ? text.slice(0, 80) : '',
          self: userId === me?.id,
        });
        wrongTimerRef.current = setTimeout(() => {
          setWrongOverlay(null);
          wrongTimerRef.current = null;
        }, 1800);

        // Localized red flash + shake on the submitter's answer card so
        // they viscerally feel the rejection even before reading the
        // overlay. Other players don't get this — they get the overlay.
        if (userId === me?.id) {
          if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
          setWrongFlash(true);
          flashTimerRef.current = setTimeout(() => {
            setWrongFlash(false);
            flashTimerRef.current = null;
          }, 900);
        }
      }
    });
    const offAvatarReject = gameSocket.on('game:pickAvatarRejected', ({ code }) => {
      if (avatarToastTimerRef.current) clearTimeout(avatarToastTimerRef.current);
      setAvatarToast(code || 'AVATAR_REJECTED');
      avatarToastTimerRef.current = setTimeout(() => {
        setAvatarToast(null);
        avatarToastTimerRef.current = null;
      }, 1500);
    });
    const offEnded = gameSocket.on('game:ended', ({ ranking, finalState }) => {
      setRanking(ranking);
      if (finalState) setPhase(finalState);
    });
    const offError = gameSocket.on('game:error', ({ code, message }) => {
      setError(message || code || 'Game error.');
    });

    return () => {
      offPhase(); offBuzzed(); offResolved(); offBuzzReject();
      offAnsReject(); offAnsResult(); offAvatarReject(); offEnded(); offError();
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      if (avatarToastTimerRef.current) clearTimeout(avatarToastTimerRef.current);
      gameSocket.disconnect();
    };
  }, [lobbyId, me?.id]);

  // 5Hz tick for smooth countdown digits + bars (≥200ms cadence).
  // Only runs while a phase actually has a countdown — pauses on
  // idle/finished/end-screen to save CPU cycles.
  useEffect(() => {
    const phasesNeedingTick = new Set([
      'avatar_select',
      'countdown',
      'question_displayed',
      'buzz_open',
      'player_answering',
      'reveal',
    ]);
    if (!phase || !phasesNeedingTick.has(phase.phase)) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 200);
    return () => clearInterval(id);
  }, [phase?.phase]);

  // Auto-focus the answer input when we get the floor.
  useEffect(() => {
    if (phase?.phase === 'player_answering' && phase.buzzedUserId === me?.id) {
      inputRef.current?.focus();
    }
  }, [phase?.phase, phase?.buzzedUserId, me?.id]);

  // Spacebar to buzz during BUZZ_OPEN.
  useEffect(() => {
    if (!phase) return;
    function onKey(e) {
      const isTextField = e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA';
      if (e.code === 'Space' && !isTextField && phase.phase === 'buzz_open') {
        e.preventDefault();
        buzz();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  function buzz() {
    if (phase?.phase !== 'buzz_open') return;
    const myPlayer = phase.players.find((p) => p.userId === me?.id);
    if (!myPlayer || myPlayer.lockedOutForQuestion || myPlayer.abandoned) return;
    gameSocket.emit('game:buzz', { lobbyId, clientTime: Date.now() });
  }

  function submitAnswer() {
    if (!answerText.trim() || submitting) return;
    setSubmitting(true);
    gameSocket.emit('game:submitAnswer', { lobbyId, text: answerText });
  }

  function pickAvatar(avatarId) {
    if (phase?.phase !== 'avatar_select') return;
    gameSocket.emit('game:pickAvatar', { lobbyId, avatarId });
  }

  if (error) {
    return (
      <div className="gp-error">
        <p>{error}</p>
        <button className="btn btn--primary" onClick={() => navigate('/game')}>Back to Game Mode</button>
      </div>
    );
  }
  if (!phase) return <div className="gp-loading"><Loader2 size={20} className="spin" /></div>;

  const remaining = Math.max(0, phase.phaseDeadline - Date.now());
  const totalForPhase = (() => {
    switch (phase.phase) {
      case 'avatar_select':     return 15 * 1000;
      case 'countdown':         return 3000;
      case 'question_displayed':return 1000;
      case 'buzz_open':         return 30 * 1000;
      case 'player_answering':  return 10 * 1000;
      case 'reveal':            return 2500;
      default:                  return 1;
    }
  })();
  const progress = Math.max(0, Math.min(1, remaining / totalForPhase));
  const remainingSec = Math.max(0, Math.ceil(remaining / 1000));

  const myPlayer = phase.players.find((p) => p.userId === me?.id);
  const buzzer = phase.buzzedUserId
    ? phase.players.find((p) => p.userId === phase.buzzedUserId)
    : null;
  const iAmBuzzer = phase.buzzedUserId === me?.id;
  const canBuzz = phase.phase === 'buzz_open' && myPlayer && !myPlayer.lockedOutForQuestion && !myPlayer.abandoned;

  const reservations = phase.avatarReservations || {};
  const myReservedAvatar = reservations[me?.id];

  // Sanity flag: have we got a stage block for the current phase?
  // If a future server adds a new phase that this client doesn't
  // know about (or the client is on a stale PWA cache), the stage
  // div would render empty — a black screen between top bar and
  // overlay. We track which phase names this build understands and
  // fall through to a generic "syncing" placeholder otherwise.
  const KNOWN_PHASES = ['idle', 'avatar_select', 'countdown', 'question_displayed', 'buzz_open', 'player_answering', 'reveal', 'finished'];
  const phaseKnown = KNOWN_PHASES.includes(phase.phase);

  // ───── End screen ─────
  if (ranking) {
    return (
      <div className="gp-end">
        <div className="gp-end__card">
          <Trophy size={28} />
          <h1>Final Ranking</h1>
          <ol className="gp-end__list">
            {ranking.map((r, i) => {
              const player = phase.players.find((p) => p.userId === r.userId);
              return (
                <li key={r.userId} className={r.userId === me?.id ? 'is-me' : ''}>
                  <span className="gp-end__rank">{i + 1}</span>
                  <span className="gp-end__avatar">
                    {player?.avatarId ? <CharacterAvatar avatarId={player.avatarId} size={36} /> : null}
                  </span>
                  <span className="gp-end__name">{player?.displayName || 'Player'}</span>
                  <span className="gp-end__score">{r.score} pts</span>
                  <span className="gp-end__xp">+{r.xpEarned} XP</span>
                </li>
              );
            })}
          </ol>
          <button className="btn btn--primary btn--lg" onClick={() => navigate('/game')}>
            Back to Game Mode
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gp">
      {/* TOP BAR */}
      <header className="gp__top">
        <button className="gp__back" onClick={() => navigate('/game')}>
          <ArrowLeft size={14} /> Leave
        </button>
        <div className="gp__progress">
          <span className="gp__phase-name">{phase.phase.replace(/_/g, ' ')}</span>
          <div className="gp__bar">
            <div className="gp__bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span className="gp__counter">
            Q {Math.min(Math.max(phase.questionIndex + 1, 1), phase.totalQuestions)} / {phase.totalQuestions}
          </span>
        </div>
      </header>

      {/* SCORE STRIP — hidden during avatar_select since avatars not finalized */}
      {phase.phase !== 'avatar_select' && (
        <div className="gp__scores">
          {phase.players.map((p) => (
            <div
              key={p.userId}
              className={`gp__player ${phase.buzzedUserId === p.userId ? 'is-buzzed' : ''} ${p.lockedOutForQuestion ? 'is-locked' : ''} ${p.userId === me?.id ? 'is-me' : ''}`}
              style={{ '--avatar-hue': AVATAR_HUE[p.avatarId] || '#888' }}
            >
              {p.avatarId ? (
                <CharacterAvatar avatarId={p.avatarId} size={48} className="gp__player-char" />
              ) : (
                <span className="gp__player-bust">
                  <span className="gp__player-head" />
                  <span className="gp__player-body" />
                </span>
              )}
              <span className="gp__player-name">{p.displayName}</span>
              <span className="gp__player-score">{p.score}</span>
            </div>
          ))}
        </div>
      )}

      {/* MAIN STAGE */}
      <div className="gp__stage">
        {/* AVATAR SELECT PHASE */}
        {phase.phase === 'avatar_select' && (
          <div className="gp__avatar-select">
            <div className="gp__avatar-head">
              <span className="label">Pick your character</span>
              <div className="gp__avatar-countdown" aria-live="polite">
                <span className="gp__avatar-countdown-num">{remainingSec}</span>
                <span className="gp__avatar-countdown-label">seconds</span>
              </div>
            </div>
            <div className="gp__avatar-grid">
              {AVATAR_IDS.map((aid) => {
                const takenByOther = Object.entries(reservations).some(
                  ([uid, a]) => a === aid && uid !== me?.id
                );
                const isMine = myReservedAvatar === aid;
                const takerName = takenByOther
                  ? phase.players.find((p) => reservations[p.userId] === aid && p.userId !== me?.id)?.displayName
                  : null;
                return (
                  <button
                    key={aid}
                    type="button"
                    className={`gp__avatar-tile ${isMine ? 'is-mine' : ''} ${takenByOther ? 'is-locked' : ''}`}
                    style={{ '--avatar-hue': AVATAR_HUE[aid] }}
                    onClick={() => !takenByOther && pickAvatar(aid)}
                    disabled={takenByOther}
                    aria-label={`${CHARACTER_NAMES[aid]}${takenByOther ? ' (taken)' : ''}`}
                  >
                    <CharacterAvatar avatarId={aid} size={96} className="gp__avatar-tile-char" />
                    <span className="gp__avatar-tile-name">{CHARACTER_NAMES[aid]}</span>
                    {isMine && <span className="gp__avatar-tile-badge"><Check size={14} /> You</span>}
                    {takenByOther && (
                      <span className="gp__avatar-tile-taken">{takerName || 'Taken'}</span>
                    )}
                  </button>
                );
              })}
            </div>
            {avatarToast === 'AVATAR_TAKEN' && (
              <div className="gp__avatar-toast">That character was just taken</div>
            )}
          </div>
        )}

        {phase.phase === 'countdown' && (
          <div className="gp__countdown">
            <span className="gp__count-num">{remainingSec}</span>
            <span className="gp__count-label">Get ready</span>
          </div>
        )}

        {phase.phase !== 'countdown' && phase.phase !== 'avatar_select' && phase.phase !== 'finished' && phase.currentQuestion && (
          <>
            <div className="gp__question">
              <span className="label">Question {phase.questionIndex + 1}</span>
              <h2>{phase.currentQuestion.questionText}</h2>
              {phase.currentQuestion.options?.length > 0 && (
                <ul className="gp__options">
                  {phase.currentQuestion.options.map((opt, i) => (
                    <li key={i}>
                      <span className="gp__option-letter">{String.fromCharCode(65 + i)}</span>
                      {opt}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* BUZZ STATE */}
            {phase.phase === 'buzz_open' && (
              <div className="gp__buzz-row">
                <button
                  className="gp__buzzer"
                  onClick={buzz}
                  disabled={!canBuzz}
                  title={canBuzz ? 'Press SPACE to buzz' : myPlayer?.lockedOutForQuestion ? 'You\'re out for this question' : 'Spectator'}
                >
                  <span className="gp__buzzer-light" />
                  BUZZ
                </button>
                <span className="gp__buzz-hint">Press <kbd>Space</kbd> or click to buzz in</span>
              </div>
            )}

            {phase.phase === 'player_answering' && buzzer && (
              <div className={`gp__answering ${wrongFlash ? 'is-wrong' : ''}`}>
                <div className="gp__answer-timer" aria-live="polite">
                  <span className="gp__answer-timer-num">{remainingSec}</span>
                  <span className="gp__answer-timer-label">sec left</span>
                  <div className="gp__answer-timer-bar">
                    <div
                      className="gp__answer-timer-bar-fill"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                </div>
                <p className="gp__answering-head">
                  <strong style={{ color: AVATAR_HUE[buzzer.avatarId] }}>{buzzer.displayName}</strong>
                  &nbsp;has the floor.
                </p>
                {iAmBuzzer ? (
                  <form
                    className="gp__answer-form"
                    onSubmit={(e) => { e.preventDefault(); submitAnswer(); }}
                  >
                    <input
                      ref={inputRef}
                      type="text"
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="Type your answer…"
                      maxLength={500}
                      autoComplete="off"
                      spellCheck="false"
                      disabled={submitting}
                    />
                    <button type="submit" className="btn btn--primary" disabled={!answerText.trim() || submitting}>
                      {submitting ? <Loader2 size={14} className="spin" /> : <><Send size={14} /> Submit</>}
                    </button>
                  </form>
                ) : (
                  <p className="gp__waiting">Waiting for their answer…</p>
                )}
              </div>
            )}

            {phase.phase === 'reveal' && resolved && (
              <div className={`gp__reveal ${resolved.winnerUserId ? 'is-correct' : 'is-timeout'}`}>
                <span className="label">{resolved.winnerUserId ? 'Correct' : 'Time\'s up'}</span>
                <h3>{resolved.correctAnswer}</h3>
                {resolved.winnerUserId && (
                  <p>
                    <strong>{phase.players.find((p) => p.userId === resolved.winnerUserId)?.displayName}</strong>
                    &nbsp;+{resolved.pointsAwarded} pts
                  </p>
                )}
              </div>
            )}

            {/* Localized "wrong" banner that lingers after the buzzer
                returns — visible during buzz_open right after a wrong
                answer. Sits in the question card area so the eye sees
                it without taking over the screen. */}
            {wrongFlash && phase.phase === 'buzz_open' && myPlayer?.lockedOutForQuestion && (
              <div className="gp__wrong-banner" role="alert">
                <X size={18} strokeWidth={3} />
                <span>Wrong! You're out this question.</span>
              </div>
            )}
          </>
        )}

        {/* Defensive fallback: if the server has emitted a phase the
            client doesn't recognize (e.g. user is on a stale build that
            predates a new phase being shipped), show a benign loading
            spinner instead of a blank stage. The next phase transition
            will repaint correctly, and a service-worker update on next
            navigation will pull the fresh chunks. */}
        {!phaseKnown && (
          <div className="gp-loading" style={{ padding: 'var(--space-8) 0' }}>
            <Loader2 size={20} className="spin" />
            <span style={{ marginLeft: 8 }}>Syncing game state…</span>
          </div>
        )}
      </div>

      {/* WRONG-ANSWER OVERLAY — overlaid on top of stage, 1.8s */}
      {wrongOverlay && (
        <div className="gp__wrong-overlay" role="alert" aria-live="assertive">
          <div className={`gp__wrong-card ${wrongOverlay.self ? 'is-self' : ''}`}>
            <X size={56} strokeWidth={3.5} />
            <span className="gp__wrong-title">Wrong!</span>
            <span className="gp__wrong-name">{wrongOverlay.name}</span>
            {wrongOverlay.text && <span className="gp__wrong-text">"{wrongOverlay.text}"</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GamePlay() {
  return <GameModeGate><GamePlayInner /></GameModeGate>;
}
