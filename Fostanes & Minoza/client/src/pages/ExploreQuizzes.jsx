import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Search, SlidersHorizontal, Users, BookOpen, Trophy, Clock
} from 'lucide-react';
import { quizzes as quizzesApi } from '../services/api';
import './ExploreQuizzes.css';

const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'popular', label: 'Most Played' },
  { id: 'name-az', label: 'A–Z' },
  { id: 'name-za', label: 'Z–A' },
  { id: 'questions', label: 'Most Questions' },
];

export default function ExploreQuizzes() {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  useEffect(() => {
    async function load() {
      try {
        const res = await quizzesApi.list({ limit: 50 });
        setQuizzes(res.data || []);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = quizzes;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = quizzes.filter(quiz =>
        quiz.title?.toLowerCase().includes(q) ||
        quiz.creator_name?.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => {
      switch (sortBy) {
        case 'popular': return (b.attempt_count || 0) - (a.attempt_count || 0);
        case 'name-az': return (a.title || '').localeCompare(b.title || '');
        case 'name-za': return (b.title || '').localeCompare(a.title || '');
        case 'questions': return (b.question_count || 0) - (a.question_count || 0);
        default: return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    });
  }, [quizzes, search, sortBy]);

  return (
    <div className="explore-page">
      <div className="container">
        {/* Header */}
        <motion.div className="explore-header"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <Link to="/dashboard" className="explore-back">
            <ArrowLeft size={18} /> Back to Dashboard
          </Link>
          <div className="explore-header__main">
            <div>
              <span className="label">Explore</span>
              <h1 className="text-serif explore-title">Public Quizzes</h1>
              <p className="explore-subtitle">
                Discover quizzes created by the community. Test your knowledge!
              </p>
            </div>
          </div>
        </motion.div>

        {/* Search & Sort */}
        <div className="explore-filter-bar">
          <div className="explore-search">
            <Search size={16} className="explore-search__icon" />
            <input
              type="text"
              className="explore-search__input"
              placeholder="Search by title or creator..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="explore-sort">
            <SlidersHorizontal size={14} />
            <select
              className="explore-sort__select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              {SORT_OPTIONS.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="explore-stats">
          <span><Users size={14} /> {quizzes.length} quizzes available</span>
        </div>

        {/* Grid */}
        <div className="explore-grid">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 180, borderRadius: 12 }} />
            ))
          ) : filtered.length === 0 ? (
            <div className="explore-empty">
              <BookOpen size={40} strokeWidth={1} />
              <p>{search.trim() ? `No quizzes matching "${search}"` : 'No public quizzes available yet.'}</p>
            </div>
          ) : (
            filtered.map((q, i) => (
              <motion.div key={q.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}>
                <Link to={`/quiz/${q.id}`} className="explore-card">
                  <div className="explore-card__header">
                    <h3 className="explore-card__title">{q.title}</h3>
                    {q.description && (
                      <p className="explore-card__desc">{q.description}</p>
                    )}
                  </div>
                  <div className="explore-card__footer">
                    <span className="explore-card__creator">
                      <Users size={12} /> {q.creator_name}
                    </span>
                    <div className="explore-card__stats">
                      <span><BookOpen size={12} /> {q.question_count || 0} Q</span>
                      <span><Trophy size={12} /> {q.attempt_count || 0} plays</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
