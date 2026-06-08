import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, BookOpen, Trophy, Flame, Star, Clock, TrendingUp, BarChart3, Users,
  Globe, Lock, Trash2, Pencil, MoreVertical, X, ClipboardList, Download, Zap
} from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import { users as usersApi, quizzes as quizzesApi } from '../services/api';
import './Dashboard.css';

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  // Server returns leaderboard rows in the form { name: "First L.", xp, level, streak }.
  // Derive the same shape from the current user so we can still highlight "me"
  // without leaking ids/avatars to the network response.
  const meDisplayName = (() => {
    const dn = user?.display_name?.trim();
    if (!dn) return null;
    const parts = dn.split(/\s+/);
    return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
  })();
  const [stats, setStats] = useState(null);
  const [myQuizzes, setMyQuizzes] = useState([]);
  const [recentAttempts, setRecentAttempts] = useState([]);
  const [publicQuizzes, setPublicQuizzes] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLbModal, setShowLbModal] = useState(false);
  const [showAllQuizzes, setShowAllQuizzes] = useState(false);
  const [showAllAttempts, setShowAllAttempts] = useState(false);

  // Quiz management state
  const [menuOpen, setMenuOpen] = useState(null);
  const [editingQuiz, setEditingQuiz] = useState(null);

  // Records modal state
  const [recordsModal, setRecordsModal] = useState(null); // { quizId, title }
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function loadDashboard() {
      try {
        const [statsRes, myQuizzesRes, attemptsRes, publicRes, lbRes] = await Promise.allSettled([
          usersApi.stats(),
          quizzesApi.list({ mine: 'true', limit: 6 }),
          usersApi.attempts({ limit: 10 }),
          quizzesApi.list({ limit: 8 }),
          usersApi.leaderboard(),
        ]);
        if (!alive) return;

        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data?.stats);
        if (myQuizzesRes.status === 'fulfilled') setMyQuizzes(myQuizzesRes.value.data || []);
        if (attemptsRes.status === 'fulfilled') setRecentAttempts(attemptsRes.value.data?.attempts || []);
        if (publicRes.status === 'fulfilled') setPublicQuizzes(publicRes.value.data || []);
        if (lbRes.status === 'fulfilled') setLeaderboard(lbRes.value.data?.leaderboard || []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadDashboard();
    return () => { alive = false; };
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e) {
      if (!e.target.closest('.quiz-menu')) setMenuOpen(null);
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  async function handleTogglePublic(e, quiz) {
    e.preventDefault(); e.stopPropagation();
    try {
      await quizzesApi.update(quiz.id, { isPublic: !quiz.is_public });
      setMyQuizzes(prev => prev.map(q =>
        q.id === quiz.id ? { ...q, is_public: !q.is_public } : q
      ));
      setMenuOpen(null);
    } catch (err) { alert(err.message); }
  }

  async function handleTogglePractice(e, quiz) {
    e.preventDefault(); e.stopPropagation();
    try {
      const newVal = quiz.allow_practice === false;
      await quizzesApi.update(quiz.id, { allowPractice: newVal });
      setMyQuizzes(prev => prev.map(q =>
        q.id === quiz.id ? { ...q, allow_practice: newVal } : q
      ));
      setMenuOpen(null);
    } catch (err) { alert(err.message); }
  }

  async function handleDeleteQuiz(e, quiz) {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`Delete "${quiz.title}"? This cannot be undone.`)) return;
    try {
      await quizzesApi.delete(quiz.id);
      setMyQuizzes(prev => prev.filter(q => q.id !== quiz.id));
      setMenuOpen(null);
    } catch (err) { alert(err.message); }
  }

  async function handleRenameQuiz(e, quizId) {
    e.preventDefault(); e.stopPropagation();
    if (!editingQuiz?.title?.trim()) return;
    try {
      await quizzesApi.update(quizId, { title: editingQuiz.title.trim() });
      setMyQuizzes(prev => prev.map(q =>
        q.id === quizId ? { ...q, title: editingQuiz.title.trim() } : q
      ));
      setEditingQuiz(null);
      setMenuOpen(null);
    } catch (err) { alert(err.message); }
  }

  async function openRecords(e, quiz) {
    e.preventDefault(); e.stopPropagation();
    setMenuOpen(null);
    setRecordsModal({ quizId: quiz.id, title: quiz.title });
    setRecordsLoading(true);
    try {
      const res = await quizzesApi.leaderboard(quiz.id);
      setRecords(res.data?.entries || []);
    } catch (err) {
      console.error(err);
      setRecords([]);
    } finally { setRecordsLoading(false); }
  }

  function downloadCSV() {
    if (!records.length || !recordsModal) return;
    const headers = ['Rank', 'Student', 'Best Score (%)', 'Best Time (s)', 'Attempts', 'Date'];
    const rows = records.map((r, i) => [
      i + 1,
      `"${r.name}"`,
      Math.round(r.bestScore),
      r.bestTime || '',
      r.attemptsCount,
      r.achievedAt ? new Date(r.achievedAt).toLocaleDateString() : '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recordsModal.title.replace(/[^a-zA-Z0-9]/g, '_')}_records.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const xpProgress = stats ? ((stats.xp % 100) / 100) * 100 : 0;

  return (
    <div className="dashboard">
      <div className="dash-shell">
        {/* ===== LEFT RAIL — Explore Public Quizzes ===== */}
        <aside className="dash-rail dash-rail--left">
          <div className="dash-section dash-rail__section">
            <div className="dash-section__header">
              <h3><Users size={18} /> Explore Public Quizzes</h3>
              <Link to="/explore" className="btn btn--ghost">View All</Link>
            </div>
            {publicQuizzes.length > 0 ? (
              <div className="public-grid public-grid--rail">
                {publicQuizzes.map((q) => (
                  <Link to={`/quiz/${q.id}`} key={q.id} className="public-card card card--interactive">
                    <h4>{q.title}</h4>
                    <div className="public-card__meta">
                      <span>by {q.creator_name}</span>
                      <span>{q.question_count || 0} Q</span>
                      <span>{q.attempt_count} plays</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="dash-empty">
                <Users size={32} strokeWidth={1} />
                <p>No public quizzes available yet.</p>
              </div>
            )}
          </div>
        </aside>

        {/* ===== CENTER — main dashboard content ===== */}
        <main className="dash-main">
        {/* Header */}
        <motion.div className="dash-header"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
          <div>
            <span className="label">Dashboard</span>
            <h1 className="dash-header__title">
              Welcome back, <span className="hero__accent">{user?.display_name?.split(' ')[0]}</span>
            </h1>
          </div>
          <div className="dash-header__actions">
            <Link to="/create" className="btn btn--primary btn--lg" id="dash-create">
              <Plus size={18} /> Create Quiz
            </Link>
            <Link to="/game" className="btn btn--outline btn--lg dash-game-btn" id="dash-game-mode">
              <Trophy size={18} /> Game Mode
            </Link>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="stats-grid">
          {[
            { icon: Star, label: 'Total XP', value: stats?.xp ?? 0, accent: true },
            { icon: TrendingUp, label: 'Level', value: stats?.level ?? 1 },
            { icon: Flame, label: 'Streak', value: `${stats?.streak ?? 0} days` },
            { icon: BarChart3, label: 'Avg Score', value: `${Math.round(stats?.avg_score ?? 0)}%` },
          ].map((s, i) => (
            <motion.div key={s.label} className={`stat-card ${s.accent ? 'stat-card--accent' : ''}`}
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08, duration: 0.5 }}>
              <div className="stat-card__icon"><s.icon size={18} strokeWidth={1.5} /></div>
              <span className="stat-card__value">{s.value}</span>
              <span className="stat-card__label">{s.label}</span>
            </motion.div>
          ))}
        </div>

        {/* XP Progress Bar */}
        {stats && (
          <motion.div className="xp-section"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
            <div className="xp-section__header">
              <span className="xp-section__level">Level {stats.level}</span>
              <span className="xp-section__xp">{stats.xp % 100} / 100 XP to next level</span>
            </div>
            <div className="xp-bar">
              <motion.div className="xp-bar__fill"
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress}%` }}
                transition={{ delay: 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
            </div>
          </motion.div>
        )}

        {/* Score Distribution + Leaderboard */}
        <div className="dash-grid dash-grid--insights">
          {/* Score Distribution */}
          <section className="dash-section">
            <div className="dash-section__header">
              <h3><BarChart3 size={18} /> Score Distribution</h3>
            </div>
            {recentAttempts.length > 0 ? (
              <div className="score-chart">
                {recentAttempts.slice(0, 10).map((a, i) => (
                  <div key={a.id} className="score-chart__bar-wrap" title={`${a.quiz_title}: ${Math.round(a.score)}%`}>
                    <div className="score-chart__bar"
                      style={{ height: `${Math.max(a.score, 5)}%` }}>
                      <span className={`score-chart__val ${a.score >= 70 ? '' : 'score-chart__val--fail'}`}>
                        {Math.round(a.score)}
                      </span>
                    </div>
                    <span className="score-chart__label">Q{i + 1}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dash-empty" style={{ minHeight: 120 }}>
                <p>Take quizzes to see your score distribution</p>
              </div>
            )}
          </section>

          {/* Global Leaderboard */}
          <section className="dash-section">
            <div className="dash-section__header">
              <h3><Trophy size={18} /> Leaderboard</h3>
              {leaderboard.length > 5 && (
                <button className="btn btn--ghost" onClick={() => setShowLbModal(true)}>View All</button>
              )}
            </div>
            {leaderboard.length > 0 ? (
              <div className="global-lb">
                {leaderboard.slice(0, 5).map((u, i) => (
                  <div key={i} className={`global-lb__row ${meDisplayName && u.name === meDisplayName ? 'global-lb__row--me' : ''}`}>
                    <span className="global-lb__rank">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <span className="global-lb__name">{u.name}</span>
                    <span className="global-lb__xp">{u.xp} XP</span>
                    <span className="global-lb__level">Lv.{u.level}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dash-empty" style={{ minHeight: 120 }}>
                <p>No leaderboard data yet</p>
              </div>
            )}
          </section>
        </div>
        </main>

        {/* ===== RIGHT RAIL — My Quizzes + Recent Attempts ===== */}
        <aside className="dash-rail dash-rail--right">
          <section className="dash-section dash-rail__section">
            <div className="dash-section__header">
              <h3><BookOpen size={18} /> My Quizzes</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                {myQuizzes.length > 3 && <button className="btn btn--ghost" onClick={() => setShowAllQuizzes(v => !v)}>{showAllQuizzes ? 'Show Less' : `View All (${myQuizzes.length})`}</button>}
                <Link to="/create" className="btn btn--ghost">+ New</Link>
              </div>
            </div>
            {loading ? (
              <div className="dash-empty"><div className="skeleton" style={{ width: '100%', height: 120 }} /></div>
            ) : myQuizzes.length > 0 ? (
              <div className="quiz-list">
                {(showAllQuizzes ? myQuizzes : myQuizzes.slice(0, 3)).map((q) => (
                  <div key={q.id} className={`quiz-item card card--interactive ${menuOpen === q.id ? 'quiz-item--menu-open' : ''}`}>
                    <Link to={`/quiz/${q.id}`} className="quiz-item__link">
                      <div className="quiz-item__info">
                        {editingQuiz?.id === q.id ? (
                          <form onSubmit={(e) => handleRenameQuiz(e, q.id)} className="quiz-item__edit">
                            <input
                              value={editingQuiz.title}
                              onChange={(e) => setEditingQuiz({ ...editingQuiz, title: e.target.value })}
                              className="quiz-item__edit-input"
                              autoFocus
                              onClick={(e) => e.preventDefault()}
                              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setEditingQuiz(null); } }}
                            />
                            <button type="submit" className="btn btn--primary btn--xs" onClick={(e) => handleRenameQuiz(e, q.id)}>Save</button>
                            <button type="button" className="btn btn--ghost btn--xs" onClick={(e) => { e.preventDefault(); setEditingQuiz(null); }}>
                              <X size={12} />
                            </button>
                          </form>
                        ) : (
                          <h4>{q.title}</h4>
                        )}
                        <div className="quiz-item__meta">
                          <span>{q.question_count || 0} questions</span>
                          <span>•</span>
                          <span>{q.attempt_count} attempts</span>
                        </div>
                      </div>
                    </Link>

                    <div className="quiz-item__actions">
                      <div className={`quiz-item__badge ${q.is_public ? 'quiz-item__badge--public' : ''}`}>
                        {q.is_public ? 'Public' : 'Private'}
                      </div>

                      <div className="quiz-menu">
                        <button className="quiz-menu__trigger"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(menuOpen === q.id ? null : q.id); }}>
                          <MoreVertical size={16} />
                        </button>

                        {menuOpen === q.id && (
                          <div className="quiz-menu__dropdown">
                            <button className="quiz-menu__item" onClick={(e) => openRecords(e, q)}>
                              <ClipboardList size={14} /> Records
                            </button>
                            <button className="quiz-menu__item" onClick={(e) => handleTogglePublic(e, q)}>
                              {q.is_public ? <><Lock size={14} /> Make Private</> : <><Globe size={14} /> Make Public</>}
                            </button>
                            <button className="quiz-menu__item" onClick={(e) => handleTogglePractice(e, q)}>
                              <Zap size={14} /> {q.allow_practice !== false ? 'Disable Practice' : 'Enable Practice'}
                            </button>
                            <button className="quiz-menu__item" onClick={(e) => {
                              e.preventDefault(); e.stopPropagation();
                              setEditingQuiz({ id: q.id, title: q.title });
                              setMenuOpen(null);
                            }}>
                              <Pencil size={14} /> Rename
                            </button>
                            <div className="quiz-menu__divider" />
                            <button className="quiz-menu__item quiz-menu__item--danger" onClick={(e) => handleDeleteQuiz(e, q)}>
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dash-empty">
                <BookOpen size={32} strokeWidth={1} />
                <p>No quizzes yet. Create your first one!</p>
                <Link to="/create" className="btn btn--outline">Create Quiz</Link>
              </div>
            )}
          </section>

          <section className="dash-section dash-rail__section">
            <div className="dash-section__header">
              <h3><Clock size={18} /> Recent Attempts</h3>
              {recentAttempts.length > 4 && <button className="btn btn--ghost" onClick={() => setShowAllAttempts(v => !v)}>{showAllAttempts ? 'Show Less' : `View All (${recentAttempts.length})`}</button>}
            </div>
            {loading ? (
              <div className="dash-empty"><div className="skeleton" style={{ width: '100%', height: 120 }} /></div>
            ) : recentAttempts.length > 0 ? (
              <div className="attempt-list">
                {(showAllAttempts ? recentAttempts : recentAttempts.slice(0, 4)).map((a) => (
                  <div key={a.id} className="attempt-item">
                    <div className="attempt-item__info">
                      <h5>{a.quiz_title}</h5>
                      <span className="attempt-item__date">
                        {new Date(a.completed_at).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="attempt-item__score">
                      <span className={`score-badge ${a.score >= 70 ? 'score-badge--pass' : 'score-badge--fail'}`}>
                        {Math.round(a.score)}%
                      </span>
                      <span className="attempt-item__xp">+{a.xp_earned} XP</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="dash-empty">
                <Trophy size={32} strokeWidth={1} />
                <p>No attempts yet. Take a quiz to start earning XP!</p>
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* ===== LEADERBOARD MODAL ===== */}
      <AnimatePresence>
        {showLbModal && (
          <motion.div className="records-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowLbModal(false)}>
            <motion.div className="records-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="records-modal__header">
                <h3><Trophy size={18} /> Global Leaderboard</h3>
                <button className="records-modal__close" onClick={() => setShowLbModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="records-modal__body">
                <div className="global-lb">
                  {leaderboard.map((u, i) => (
                    <div key={i} className={`global-lb__row ${meDisplayName && u.name === meDisplayName ? 'global-lb__row--me' : ''}`}>
                      <span className="global-lb__rank">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <span className="global-lb__name">{u.name}</span>
                      <span className="global-lb__xp">{u.xp} XP</span>
                      <span className="global-lb__level">Lv.{u.level}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== RECORDS MODAL ===== */}
      <AnimatePresence>
        {recordsModal && (
          <motion.div className="records-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setRecordsModal(null)}>
            <motion.div className="records-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="records-modal__header">
                <div>
                  <h3><ClipboardList size={18} /> Quiz Records</h3>
                  <p className="records-modal__subtitle">{recordsModal.title}</p>
                </div>
                <div className="records-modal__header-actions">
                  {records.length > 0 && (
                    <button className="btn btn--ghost btn--sm" onClick={downloadCSV}>
                      <Download size={14} /> CSV
                    </button>
                  )}
                  <button className="records-modal__close" onClick={() => setRecordsModal(null)}>
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="records-modal__body">
                {recordsLoading ? (
                  <div className="records-loading">
                    <div className="skeleton" style={{ width: '100%', height: 40 }} />
                    <div className="skeleton" style={{ width: '100%', height: 40 }} />
                    <div className="skeleton" style={{ width: '100%', height: 40 }} />
                  </div>
                ) : records.length > 0 ? (
                  <table className="records-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Student</th>
                        <th>Best Score</th>
                        <th>Time</th>
                        <th>Attempts</th>
                        <th>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r, i) => (
                        <tr key={i} className={i < 3 ? 'records-table__top' : ''}>
                          <td className="records-table__rank">
                            {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                          </td>
                          <td className="records-table__name">{r.name}</td>
                          <td>
                            <span className={`score-badge ${r.bestScore >= 70 ? 'score-badge--pass' : 'score-badge--fail'}`}>
                              {Math.round(r.bestScore)}%
                            </span>
                          </td>
                          <td className="records-table__time">
                            {r.bestTime ? `${Math.floor(r.bestTime / 60)}m ${r.bestTime % 60}s` : '—'}
                          </td>
                          <td>{r.attemptsCount}×</td>
                          <td className="records-table__date">
                            {r.achievedAt ? new Date(r.achievedAt).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="records-empty">
                    <Trophy size={32} strokeWidth={1} />
                    <p>No one has taken this quiz yet.</p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
