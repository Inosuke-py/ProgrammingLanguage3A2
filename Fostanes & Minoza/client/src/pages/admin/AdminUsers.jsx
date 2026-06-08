import { useState, useEffect } from 'react';
import { Search, Users } from 'lucide-react';
import { admin } from '../../services/api';
import Avatar from '../../components/shared/Avatar';

const ROLE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
  { value: 'admin', label: 'Admins' },
  { value: 'guest', label: 'Guests' },
];

export default function AdminUsers() {
  const [data, setData] = useState({ users: [], total: 0, page: 1, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await admin.usersList(page, 20, search, roleFilter);
        setData(res.data || { users: [], total: 0, page: 1, totalPages: 1 });
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    const debounce = setTimeout(load, 300);
    return () => clearTimeout(debounce);
  }, [page, search, roleFilter]);

  async function handleToggleActive(user) {
    const newActive = user.is_active === false;
    try {
      await admin.userSetActive(user.id, newActive);
      setData(prev => ({
        ...prev,
        users: prev.users.map(u => u.id === user.id ? { ...u, is_active: newActive } : u),
      }));
    } catch (err) { alert(err.message); }
  }

  return (
    <div>
      <div className="admin-page__header">
        <h1 className="admin-page__title">Users</h1>
        <p className="admin-page__subtitle">Manage all registered users</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div className="admin-search">
            <Search size={14} className="admin-search__icon" />
            <input
              className="admin-search__input"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="admin-search__input"
            style={{ paddingLeft: 12, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
            aria-label="Filter by role"
          >
            {ROLE_FILTERS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>
          {data.total} {roleFilter === 'all' ? 'total users' : `${ROLE_FILTERS.find(r => r.value === roleFilter)?.label.toLowerCase() || ''}`}
        </span>
      </div>

      <div className="admin-chart-card" style={{ padding: 0 }}>
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>XP</th>
                <th>Level</th>
                <th>Streak</th>
                <th>Quizzes</th>
                <th>Attempts</th>
                <th>Joined</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 14, width: 60, borderRadius: 4 }} /></td>
                    ))}
                  </tr>
                ))
              ) : data.users.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>
                  <div className="admin-empty"><Users size={32} strokeWidth={1} /><p>No users found</p></div>
                </td></tr>
              ) : (
                data.users.map(u => {
                  const isGuest = u.role === 'guest';
                  return (
                    <tr key={u.id}>
                      <td data-label="User">
                        <div className="admin-table__user">
                          <Avatar
                            src={u.avatar_url}
                            name={u.display_name}
                            size={32}
                            className="admin-table__avatar"
                          />
                          <span className="admin-table__name">{u.display_name}</span>
                          {isGuest && <span className="admin-guest-pill">Guest</span>}
                        </div>
                      </td>
                      <td data-label="Email">{u.email || '—'}</td>
                      <td data-label="Role"><span className={`admin-table__role admin-table__role--${u.role}`}>{u.role}</span></td>
                      <td data-label="XP">{u.xp?.toLocaleString()}</td>
                      <td data-label="Level">{u.level}</td>
                      <td data-label="Streak">{u.streak}🔥</td>
                      <td data-label="Quizzes">{u.quizzes_created}</td>
                      <td data-label="Attempts">{u.total_attempts}</td>
                      <td data-label="Joined">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td data-label="Status">
                        <button
                          className={`btn btn--xs ${u.is_active === false ? 'btn--primary' : 'btn--danger-ghost'}`}
                          onClick={() => handleToggleActive(u)}
                          disabled={u.role === 'admin'}>
                          {u.is_active === false ? 'Activate' : 'Deactivate'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {data.totalPages > 1 && (
        <div className="admin-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span className="admin-pagination__info">Page {data.page} of {data.totalPages}</span>
          <button disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
