import { useState, useEffect } from 'react';
import { Brain } from 'lucide-react';
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { admin } from '../../services/api';
import { useChartTheme, getTooltipStyle } from '../../components/shared/chartTheme';

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

const TYPE_COLORS = {
  'generate': '#c9a227',
  'generate-from-topic': '#e8d48b',
  'generate-from-file': '#22c55e',
  'extract-quiz': '#3b82f6',
  'analyze-file': '#8b5cf6',
};

function fmt(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AdminAI() {
  const chart = useChartTheme();
  const tooltipStyle = getTooltipStyle(chart);
  const [data, setData] = useState({ trends: [], byType: [] });
  const [range, setRange] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await admin.aiUsage(range);
        const d = res.data || {};
        setData({
          trends: (d.trends || []).map(r => ({ date: fmt(r.date), count: parseInt(r.count) })),
          byType: (d.byType || []).map(r => ({
            name: r.request_type,
            value: parseInt(r.count),
            fill: TYPE_COLORS[r.request_type] || '#888',
          })),
        });
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, [range]);

  const totalRequests = data.byType.reduce((a, d) => a + d.value, 0);

  return (
    <div>
      <div className="admin-page__header">
        <h1 className="admin-page__title">AI Usage</h1>
        <p className="admin-page__subtitle">AI generation requests and usage breakdown</p>
      </div>

      <div className="admin-stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <div className="admin-stat-card">
          <div className="admin-stat-card__icon"><Brain size={16} /></div>
          <span className="admin-stat-card__label">Total Requests ({range}D)</span>
          <span className="admin-stat-card__value">{totalRequests.toLocaleString()}</span>
        </div>
        {data.byType.slice(0, 3).map(t => (
          <div key={t.name} className="admin-stat-card">
            <span className="admin-stat-card__label">{t.name}</span>
            <span className="admin-stat-card__value">{t.value}</span>
          </div>
        ))}
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
            <span className="admin-chart-card__title">AI Requests Over Time</span>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: chart.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: chart.axis, fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="natural" dataKey="count" name="Requests" stroke={chart.lineStroke} strokeWidth={3} dot={{ fill: chart.dotFill, r: 4, strokeWidth: 2, stroke: chart.dotStroke }} activeDot={{ r: 6, fill: chart.dotFill, stroke: chart.dotStroke, strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="admin-chart-card">
          <div className="admin-chart-card__header">
            <span className="admin-chart-card__title">By Request Type</span>
          </div>
          {data.byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={data.byType} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={4} cornerRadius={4} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {data.byType.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="none" />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="admin-empty" style={{ height: 280 }}><p>No AI usage data yet</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
