/**
 * GameStats
 * ─────────
 * The user's Game Mode dashboard card. Lifetime numbers + last 10
 * games. Linked from the Dashboard via the "Game Mode" button.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy, Medal, Zap, Clock, Activity, ArrowRight, Award } from 'lucide-react';
import GameModeGate from './GameModeGate';
import { game as gameApi } from '../../services/api';
import './GameStats.css';

function GameStatsInner() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    gameApi.myStats()
      .then((r) => {
        if (!alive) return;
        setStats(r.data?.stats || null);
        setRecent(r.data?.recent || []);
      })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const accuracy = stats && (stats.total_correct + stats.total_wrong) > 0
    ? Math.round((stats.total_correct / (stats.total_correct + stats.total_wrong)) * 100)
    : 0;

  return (
    <div className="gs">
      <header className="gs__header">
        <span className="label">Game Mode</span>
        <h1 className="gs__title">Your Quiz Bowl Stats</h1>
        <Link to="/game" className="btn btn--primary">
          Play <ArrowRight size={14} />
        </Link>
      </header>

      <div className="gs__cards">
        <Stat icon={<Trophy size={16} />} label="Games Played" value={stats?.games_played ?? 0} />
        <Stat icon={<Medal size={16} />} label="Wins" value={stats?.wins ?? 0} accent />
        <Stat icon={<Award size={16} />} label="Podium" value={(stats?.wins ?? 0) + (stats?.seconds ?? 0) + (stats?.thirds ?? 0)} />
        <Stat icon={<Activity size={16} />} label="Accuracy" value={`${accuracy}%`} />
        <Stat icon={<Zap size={16} />} label="Total XP" value={stats?.total_game_xp ?? 0} />
        <Stat icon={<Clock size={16} />} label="Avg Buzz" value={stats?.avg_buzz_time_ms ? `${(stats.avg_buzz_time_ms / 1000).toFixed(1)}s` : '—'} />
      </div>

      <section className="gs__panel">
        <h2>Recent Games</h2>
        {loading ? (
          <div className="gs__loading">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="gs__empty">No games yet. Hop into a lobby above.</div>
        ) : (
          <ul className="gs__recent">
            {recent.map((r) => (
              <li key={r.id}>
                <span className="gs__recent-rank">#{r.rank}</span>
                <span className="gs__recent-quiz">
                  <strong>{r.quiz_title}</strong>
                  <span>{r.mode} · {r.correct_count}/{r.total_questions} correct</span>
                </span>
                <span className="gs__recent-score">{r.score} pts</span>
                <span className="gs__recent-xp">+{r.xp_earned} XP</span>
                <span className="gs__recent-date">{new Date(r.completed_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, label, value, accent = false }) {
  return (
    <div className={`gs-stat ${accent ? 'gs-stat--accent' : ''}`}>
      <span className="gs-stat__icon">{icon}</span>
      <span className="gs-stat__label">{label}</span>
      <span className="gs-stat__value">{value}</span>
    </div>
  );
}

export default function GameStats() {
  return <GameModeGate><GameStatsInner /></GameModeGate>;
}
