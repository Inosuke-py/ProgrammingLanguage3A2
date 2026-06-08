/**
 * AdminGameMode
 * ─────────────
 * Admin analytics for the Quiz Bowl Game Mode feature.
 *
 * Sections:
 *  - Overview row: active lobbies, games today, games this week,
 *    total game attempts, average game duration
 *  - Games Per Day chart (configurable 7D / 30D / 90D)
 *  - Top Players table (wins / games / avg score / total XP)
 *  - Most-Played Quizzes table
 *
 * Data sources are all cached for 30s server-side, so refreshing
 * isn't expensive.
 */

import { useEffect, useState } from 'react';
import {
  Trophy, Gamepad2, Users, Clock, TrendingUp, Activity,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { admin } from '../../services/api';
import { useChartTheme, getTooltipStyle } from '../../components/shared/chartTheme';
import Avatar from '../../components/shared/Avatar';

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDuration(seconds) {
  if (!seconds || seconds < 1) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export default function AdminGameMode() {
  const chart = useChartTheme();
  const tooltipStyle = getTooltipStyle(chart);
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState([]);
  const [topPlayers, setTopPlayers] = useState([]);
  const [topQuizzes, setTopQuizzes] = useState([]);
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);

  // Initial overview + leaderboards.
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [o, p, q] = await Promise.allSettled([
          admin.gameOverview(),
          admin.topGamePlayers(10),
          admin.topGameQuizzes(10),
        ]);
        if (!alive) return;
        if (o.status === 'fulfilled') setOverview(o.value.data || null);
        if (p.status === 'fulfilled') setTopPlayers(p.value.data || []);
        if (q.status === 'fulfilled') setTopQuizzes(q.value.data || []);
      } catch (err) { console.error(err); }
      finally { if (alive) setLoading(false); }
    }
    load();
    return () => { alive = false; };
  }, []);

  // Trend chart re-fetches when the range changes.
  useEffect(() => {
    let alive = true;
    admin.gameTrends(range)
      .then((res) => {
        if (!alive) return;
        setTrends((res.data || []).map((r) => ({
          date: fmtDate(r.date),
          count: parseInt(r.count) || 0,
        })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [range]);

  return (
    <div>
      <div className="admin-page__header">
        <h1 className="admin-page__title">Game Mode</h1>
        <p className="admin-page__subtitle">Quiz Bowl multiplayer analytics</p>
      </div>

      {/* OVERVIEW ROW */}
      <div className="admin-stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-card__icon"><Activity size={16} /></div>
          <span className="admin-stat-card__label">Active Lobbies</span>
          <span className="admin-stat-card__value">
            {overview?.activeLobbies?.toLocaleString() ?? '—'}
          </span>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__icon"><Gamepad2 size={16} /></div>
          <span className="admin-stat-card__label">Games Today</span>
          <span className="admin-stat-card__value">
            {overview?.gamesToday?.toLocaleString() ?? '—'}
          </span>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__icon"><TrendingUp size={16} /></div>
          <span className="admin-stat-card__label">Games (7D)</span>
          <span className="admin-stat-card__value">
            {overview?.gamesWeek?.toLocaleString() ?? '—'}
          </span>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__icon"><Users size={16} /></div>
          <span className="admin-stat-card__label">Total Attempts</span>
          <span className="admin-stat-card__value">
            {overview?.totalAttempts?.toLocaleString() ?? '—'}
          </span>
        </div>
        <div className="admin-stat-card">
          <div className="admin-stat-card__icon"><Clock size={16} /></div>
          <span className="admin-stat-card__label">Avg Duration</span>
          <span className="admin-stat-card__value">
            {fmtDuration(overview?.avgGameSeconds)}
          </span>
        </div>
      </div>

      {/* RANGE TOGGLE */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <div className="admin-range-toggle">
          {RANGES.map((r) => (
            <button
              key={r.days}
              className={range === r.days ? 'active' : ''}
              onClick={() => setRange(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* TRENDS CHART */}
      <div className="admin-chart-card">
        <div className="admin-chart-card__header">
          <span className="admin-chart-card__title">
            <Gamepad2 size={16} style={{ marginRight: 8 }} />
            Games Played Over Time
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={trends}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: chart.axis, fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="natural"
              dataKey="count"
              name="Games"
              stroke={chart.lineStroke}
              strokeWidth={3}
              dot={{ fill: chart.dotFill, r: 4, strokeWidth: 2, stroke: chart.dotStroke }}
              activeDot={{ r: 6, fill: chart.dotFill, stroke: chart.dotStroke, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* TOP PLAYERS + TOP QUIZZES */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 'var(--space-4)',
          marginTop: 'var(--space-6)',
        }}
      >
        <div className="admin-chart-card">
          <div className="admin-chart-card__header">
            <span className="admin-chart-card__title">
              <Trophy size={16} style={{ marginRight: 8 }} /> Top Players
            </span>
          </div>
          {loading && topPlayers.length === 0 ? (
            <div className="admin-empty"><p>Loading…</p></div>
          ) : topPlayers.length === 0 ? (
            <div className="admin-empty"><p>No game results yet.</p></div>
          ) : (
            <ul className="admin-activity-list" style={{ marginTop: 'var(--space-2)' }}>
              {topPlayers.map((p, i) => (
                <li key={p.id} className="admin-activity-item">
                  <span className="admin-activity-item__rank" style={{ width: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                    {i + 1}
                  </span>
                  <Avatar src={p.avatar_url} name={p.display_name} size={28} />
                  <div className="admin-activity-item__info">
                    <span className="admin-activity-item__name">
                      {p.display_name}
                      {p.role === 'guest' && <span className="admin-guest-pill">Guest</span>}
                    </span>
                    <span className="admin-activity-item__desc">
                      {p.wins} wins · {p.games_played} games · avg {p.avg_score} pts
                    </span>
                  </div>
                  <span className="admin-activity-item__time">
                    {p.total_xp.toLocaleString()} XP
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-chart-card">
          <div className="admin-chart-card__header">
            <span className="admin-chart-card__title">
              <Trophy size={16} style={{ marginRight: 8 }} /> Most-Played Quizzes
            </span>
          </div>
          {loading && topQuizzes.length === 0 ? (
            <div className="admin-empty"><p>Loading…</p></div>
          ) : topQuizzes.length === 0 ? (
            <div className="admin-empty"><p>No quizzes have been played in Game Mode yet.</p></div>
          ) : (
            <ul className="admin-activity-list" style={{ marginTop: 'var(--space-2)' }}>
              {topQuizzes.map((q, i) => (
                <li key={q.id} className="admin-activity-item">
                  <span className="admin-activity-item__rank" style={{ width: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                    {i + 1}
                  </span>
                  <div className="admin-activity-item__icon"><Gamepad2 size={14} /></div>
                  <div className="admin-activity-item__info">
                    <span className="admin-activity-item__name">{q.title}</span>
                    <span className="admin-activity-item__desc">
                      {q.games_played} games · {q.total_attempts} player attempts
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
