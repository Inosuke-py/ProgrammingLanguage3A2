import { useState, useEffect } from 'react';
import { Users, BookOpen, Brain, Trophy, Activity, UserCircle, TrendingUp } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { admin } from '../../services/api';
import { useChartTheme, getTooltipStyle } from '../../components/shared/chartTheme';
import Avatar from '../../components/shared/Avatar';

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

const ATTEMPT_USER_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'real', label: 'Real' },
  { value: 'guest', label: 'Guests' },
];

function fmt(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminOverview() {
  const chart = useChartTheme();
  const tooltipStyle = getTooltipStyle(chart);
  const [stats, setStats] = useState(null);
  // Stacked signup chart: each row { date, realUsers, guests }
  const [userGrowth, setUserGrowth] = useState([]);
  const [attemptTrends, setAttemptTrends] = useState([]);
  const [scores, setScores] = useState([]);
  const [passFail, setPassFail] = useState([]);
  const [activity, setActivity] = useState([]);
  const [range, setRange] = useState(30);
  const [attemptUserType, setAttemptUserType] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [s, ug, at, sc, pf, act] = await Promise.all([
          admin.stats(),
          admin.usersGrowth(range),
          admin.attemptsTrends(range, attemptUserType),
          admin.attemptsScores(),
          admin.attemptsPassFail(range),
          admin.activity(10),
        ]);
        setStats(s.data || {});
        setUserGrowth((ug.data || []).map(r => ({
          date: fmt(r.date),
          realUsers: parseInt(r.real_users) || 0,
          guests: parseInt(r.guests) || 0,
        })));
        setAttemptTrends((at.data || []).map(r => ({ date: fmt(r.date), count: parseInt(r.count) || 0 })));
        setScores((sc.data || []).filter(r => r.range).map(r => ({
          name: r.range, value: parseInt(r.count) || 0,
          fill: parseInt(r.range) < 30 ? '#ef4444' : parseInt(r.range) < 70 ? '#eab308' : '#22c55e'
        })));
        const totalP = (pf.data || []).reduce((a, r) => a + (parseInt(r.passed) || 0), 0);
        const totalF = (pf.data || []).reduce((a, r) => a + (parseInt(r.failed) || 0), 0);
        setPassFail([
          { name: 'Passed', value: totalP, fill: '#22c55e' },
          { name: 'Failed', value: totalF, fill: '#ef4444' },
        ]);
        setActivity(act.data || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, [range, attemptUserType]);

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <div className="skeleton" style={{ width: 200, height: 28, marginBottom: 24, borderRadius: 8 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 120, borderRadius: 16 }} />
          ))}
        </div>
      </div>
    );
  }

  const totalAttempts = passFail.reduce((a, d) => a + d.value, 0);
  const guestAttempts = stats?.totalAttemptsByGuests || 0;

  return (
    <div className="admin-overview">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Dashboard Overview</h1>
        <div className="admin-range-toggle">
          {RANGES.map(r => (
            <button key={r.days} className={range === r.days ? 'active' : ''} onClick={() => setRange(r.days)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gradient Stat Cards — guests get their own card so admins can see at a glance how much traffic is anonymous */}
      <div className="admin-gradient-stats">
        <div className="admin-gradient-card admin-gradient-card--purple">
          <span className="admin-gradient-card__label">Total Users</span>
          <span className="admin-gradient-card__value">{stats?.totalUsers || 0}</span>
          <span className="admin-gradient-card__sub">+{stats?.newSignupsThisWeek || 0} this week</span>
          <Users size={20} className="admin-gradient-card__icon" />
        </div>
        <div className="admin-gradient-card admin-gradient-card--cyan">
          <span className="admin-gradient-card__label">Total Guests</span>
          <span className="admin-gradient-card__value">{stats?.totalGuests || 0}</span>
          <span className="admin-gradient-card__sub">+{stats?.newGuestsThisWeek || 0} this week</span>
          <UserCircle size={20} className="admin-gradient-card__icon" />
        </div>
        <div className="admin-gradient-card admin-gradient-card--gold">
          <span className="admin-gradient-card__label">Total Attempts</span>
          <span className="admin-gradient-card__value">{stats?.totalAttempts || 0}</span>
          <span className="admin-gradient-card__sub">{guestAttempts} by guests</span>
          <Trophy size={20} className="admin-gradient-card__icon" />
        </div>
        <div className="admin-gradient-card admin-gradient-card--green">
          <span className="admin-gradient-card__label">Total Quizzes</span>
          <span className="admin-gradient-card__value">{stats?.totalQuizzes || 0}</span>
          <span className="admin-gradient-card__sub">{stats?.aiRequestsToday || 0} AI requests today</span>
          <BookOpen size={20} className="admin-gradient-card__icon" />
        </div>
      </div>

      {/* Stacked signup chart: real users (gold) + guests (muted) layered together */}
      <div className="admin-chart-card admin-chart-card--main">
        <div className="admin-chart-card__header">
          <span className="admin-chart-card__title"><TrendingUp size={16} style={{ marginRight: 8 }} />Signups Over Time</span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={userGrowth} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradReal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chart.lineStroke} stopOpacity={0.55} />
                <stop offset="100%" stopColor={chart.lineStroke} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradGuests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(220 8% 55%)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="hsl(220 8% 55%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: chart.lineStroke, strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Area
              type="monotone"
              dataKey="realUsers"
              name="Real Users"
              stackId="1"
              stroke={chart.lineStroke}
              strokeWidth={2}
              fill="url(#gradReal)"
            />
            <Area
              type="monotone"
              dataKey="guests"
              name="Guests"
              stackId="1"
              stroke="hsl(220 8% 60%)"
              strokeWidth={2}
              strokeDasharray="6 4"
              fill="url(#gradGuests)"
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Row 2: Score Distribution + Pass/Fail + Attempts/Day with user-type toggle */}
      <div className="admin-charts-grid admin-charts-grid--3">
        <div className="admin-chart-card">
          <div className="admin-chart-card__header">
            <span className="admin-chart-card__title">Score Distribution</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={scores} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(201,162,39,0.06)' }} />
              <Bar dataKey="value" name="Attempts" radius={[8, 8, 0, 0]}>
                {scores.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="admin-chart-card">
          <div className="admin-chart-card__header">
            <span className="admin-chart-card__title">Pass vs Fail</span>
          </div>
          {totalAttempts > 0 ? (
            <div className="admin-donut-modern">
              <div className="admin-donut-modern__chart">
                <ResponsiveContainer width="100%" height={120}>
                  <PieChart>
                    <Pie data={passFail} cx="50%" cy="50%" innerRadius={35} outerRadius={55} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                      {passFail.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="none" />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="admin-donut-modern__center">
                  <span className="admin-donut-modern__center-label">Attempts</span>
                  <span className="admin-donut-modern__center-value">{totalAttempts}</span>
                </div>
              </div>
              <div className="admin-donut-modern__legend">
                {passFail.map(d => (
                  <div key={d.name} className="admin-donut-modern__legend-item">
                    <span className="admin-donut-modern__legend-ring" style={{ borderColor: d.fill }} />
                    <div>
                      <span className="admin-donut-modern__legend-pct">{Math.round((d.value / totalAttempts) * 100)}%</span>
                      <span className="admin-donut-modern__legend-name">{d.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="admin-empty" style={{ height: 130 }}><p>No data yet</p></div>
          )}
        </div>

        {/* Attempts/Day with a small user-type filter so admins can isolate guest traffic */}
        <div className="admin-chart-card">
          <div className="admin-chart-card__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span className="admin-chart-card__title">Attempts / Day</span>
            <div className="admin-range-toggle" style={{ marginLeft: 'auto' }}>
              {ATTEMPT_USER_TYPES.map(opt => (
                <button
                  key={opt.value}
                  className={attemptUserType === opt.value ? 'active' : ''}
                  onClick={() => setAttemptUserType(opt.value)}
                  type="button"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={attemptTrends.slice(-7)} barSize={30}>
              <defs>
                <linearGradient id="weekBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e8d48b" stopOpacity={1} />
                  <stop offset="100%" stopColor="#c9a227" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(201,162,39,0.06)' }} />
              <Bar dataKey="count" fill="url(#weekBarGrad)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="admin-chart-card">
        <div className="admin-chart-card__header">
          <span className="admin-chart-card__title"><Activity size={16} style={{ marginRight: 8 }} />Recent Activity</span>
        </div>
        <div className="admin-activity-list">
          {activity.length === 0 ? (
            <div className="admin-empty"><p>No recent activity</p></div>
          ) : (
            activity.slice(0, 4).map((a, i) => {
              const isGuest = a.actor_role === 'guest';
              return (
                <div key={i} className="admin-activity-item">
                  <Avatar
                    src={a.avatar_url}
                    name={a.display_name}
                    size={32}
                    className="admin-activity-item__avatar"
                    icon={<div className="admin-activity-item__icon"><Users size={14} /></div>}
                  />
                  <div className="admin-activity-item__info">
                    <span className="admin-activity-item__name">
                      {a.display_name}
                      {isGuest && <span className="admin-guest-pill">Guest</span>}
                    </span>
                    <span className="admin-activity-item__desc">{a.description}</span>
                  </div>
                  <span className="admin-activity-item__time">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
