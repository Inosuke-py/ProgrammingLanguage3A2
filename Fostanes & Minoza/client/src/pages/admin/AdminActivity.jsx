import { useState, useEffect } from 'react';
import { Users, BookOpen, Trophy, UserPlus } from 'lucide-react';
import { admin } from '../../services/api';
import Avatar from '../../components/shared/Avatar';

const TYPE_ICONS = {
  attempt: Trophy,
  signup: UserPlus,
  quiz_created: BookOpen,
};
const TYPE_LABELS = {
  attempt: 'Quiz Attempt',
  signup: 'New User',
  quiz_created: 'Quiz Created',
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminActivity() {
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await admin.activity(50);
        setActivities(res.data || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const filtered = filter === 'all' ? activities : activities.filter(a => a.type === filter);

  return (
    <div>
      <div className="admin-page__header">
        <h1 className="admin-page__title">Activity Feed</h1>
        <p className="admin-page__subtitle">Recent platform activity</p>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {['all', 'attempt', 'signup', 'quiz_created'].map(f => (
          <button
            key={f}
            className={`admin-range-toggle`}
            style={{
              padding: '6px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)',
              background: filter === f ? 'var(--color-accent-subtle)' : 'var(--color-surface-2)',
              color: filter === f ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              border: '1px solid ' + (filter === f ? 'var(--color-border-accent)' : 'var(--color-border)'),
              cursor: 'pointer',
            }}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : TYPE_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="admin-chart-card" style={{ padding: 0 }}>
        <div className="admin-activity-list">
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="admin-activity-item">
                <div className="skeleton" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ width: 120, height: 12, marginBottom: 4, borderRadius: 4 }} />
                  <div className="skeleton" style={{ width: 200, height: 10, borderRadius: 4 }} />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="admin-empty"><Users size={32} strokeWidth={1} /><p>No activity found</p></div>
          ) : (
            filtered.map((a, i) => {
              const Icon = TYPE_ICONS[a.type] || Users;
              const isGuest = a.actor_role === 'guest';
              return (
                <div key={i} className="admin-activity-item">
                  <Avatar
                    src={a.avatar_url}
                    name={a.display_name}
                    size={32}
                    className="admin-activity-item__avatar"
                    icon={<div className="admin-activity-item__icon"><Icon size={14} /></div>}
                  />
                  <div className="admin-activity-item__info">
                    <span className="admin-activity-item__name">
                      {a.display_name}
                      {isGuest && <span className="admin-guest-pill">Guest</span>}
                    </span>
                    <span className="admin-activity-item__desc">{a.description}</span>
                  </div>
                  <span className="admin-activity-item__time">{timeAgo(a.created_at)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
