import { useState, useEffect } from 'react';
import { BookOpen } from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { admin } from '../../services/api';
import { useChartTheme, getTooltipStyle } from '../../components/shared/chartTheme';

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

function fmt(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminQuizzes() {
  const chart = useChartTheme();
  const tooltipStyle = getTooltipStyle(chart);
  const [topQuizzes, setTopQuizzes] = useState([]);
  const [activity, setActivity] = useState([]);
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [top, act] = await Promise.all([
          admin.quizzesTop(15),
          admin.quizzesActivity(range),
        ]);
        setTopQuizzes(top.data || []);
        setActivity((act.data || []).map(r => ({ date: fmt(r.date), count: parseInt(r.count) })));
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, [range]);

  const publicCount = topQuizzes.filter(q => q.is_public).length;
  const privateCount = topQuizzes.length - publicCount;
  const visibility = [
    { name: 'Public', value: publicCount, fill: chart.passFrom },
    { name: 'Private', value: privateCount, fill: chart.axis },
  ];

  return (
    <div>
      <div className="admin-page__header">
        <h1 className="admin-page__title">Quizzes</h1>
        <p className="admin-page__subtitle">Quiz creation trends and top performers</p>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <div className="admin-range-toggle">
          {RANGES.map(r => (
            <button key={r.days} className={range === r.days ? 'active' : ''} onClick={() => setRange(r.days)}>{r.label}</button>
          ))}
        </div>
      </div>

      <div className="admin-charts-grid">
        <div className="admin-chart-card">
          <div className="admin-chart-card__header">
            <span className="admin-chart-card__title">Quizzes Created</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={activity}>
              <defs>
                <linearGradient id="barGradQ" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e8d48b" stopOpacity={1} />
                  <stop offset="100%" stopColor="#c9a227" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chart.axis, fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(201,162,39,0.05)' }} />
              <Bar dataKey="count" name="Quizzes" fill="url(#barGradQ)" radius={[8, 8, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="admin-chart-card">
          <div className="admin-chart-card__header">
            <span className="admin-chart-card__title">Public vs Private</span>
          </div>
          {visibility.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={visibility} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} cornerRadius={4} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {visibility.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="admin-empty" style={{ height: 280 }}><p>No quiz data yet</p></div>
          )}
        </div>
      </div>

      {/* Top quizzes table */}
      <div className="admin-chart-card" style={{ padding: 0 }}>
        <div className="admin-chart-card__header" style={{ padding: 'var(--space-4) var(--space-5)' }}>
          <span className="admin-chart-card__title">Top Quizzes by Attempts</span>
        </div>
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Title</th>
                <th>Creator</th>
                <th>Questions</th>
                <th>Attempts</th>
                <th>Visibility</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {topQuizzes.map((q, i) => (
                <tr key={q.id}>
                  <td style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{i + 1}</td>
                  <td style={{ fontWeight: 500, color: 'var(--color-text-primary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title}</td>
                  <td>{q.creator_name}</td>
                  <td>{q.question_count}</td>
                  <td style={{ fontWeight: 600 }}>{q.attempt_count}</td>
                  <td>
                    <span className={`admin-table__role ${q.is_public ? 'admin-table__role--admin' : 'admin-table__role--student'}`}>
                      {q.is_public ? 'Public' : 'Private'}
                    </span>
                  </td>
                  <td>{new Date(q.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
