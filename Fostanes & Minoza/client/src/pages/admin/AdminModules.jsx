import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
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

export default function AdminModules() {
  const chart = useChartTheme();
  const tooltipStyle = getTooltipStyle(chart);
  const [stats, setStats] = useState({ trends: [], distribution: {} });
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await admin.modulesStats(range);
        const d = res.data || {};
        setStats({
          trends: (d.trends || []).map(r => ({ date: fmt(r.date), count: parseInt(r.count) })),
          distribution: d.distribution || {},
        });
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, [range]);

  const dist = [
    { name: 'Public', value: parseInt(stats.distribution.public_count || 0), fill: chart.passFrom },
    { name: 'Private', value: parseInt(stats.distribution.private_count || 0), fill: chart.axis },
  ];
  const totalModules = dist.reduce((a, d) => a + d.value, 0);

  return (
    <div>
      <div className="admin-page__header">
        <h1 className="admin-page__title">Modules</h1>
        <p className="admin-page__subtitle">Module upload trends and distribution</p>
      </div>

      <div className="admin-stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-card__icon"><FileText size={16} /></div>
          <span className="admin-stat-card__label">Total Modules</span>
          <span className="admin-stat-card__value">{totalModules}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Public</span>
          <span className="admin-stat-card__value" style={{ color: 'var(--color-accent)' }}>{dist[0].value}</span>
        </div>
        <div className="admin-stat-card">
          <span className="admin-stat-card__label">Private</span>
          <span className="admin-stat-card__value">{dist[1].value}</span>
        </div>
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
            <span className="admin-chart-card__title">Modules Uploaded</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.trends}>
              <defs>
                <linearGradient id="barGradM" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e8d48b" stopOpacity={1} />
                  <stop offset="100%" stopColor="#c9a227" stopOpacity={0.7} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chart.axis, fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(201,162,39,0.05)' }} />
              <Bar dataKey="count" name="Uploads" fill="url(#barGradM)" radius={[8, 8, 0, 0]} barSize={30} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="admin-chart-card">
          <div className="admin-chart-card__header">
            <span className="admin-chart-card__title">Visibility Ratio</span>
          </div>
          {dist.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={dist} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} cornerRadius={4} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {dist.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="admin-empty" style={{ height: 280 }}><p>No module data yet</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
