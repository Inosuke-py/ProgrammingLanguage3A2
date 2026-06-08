import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Star, Flame, Clock, CheckCircle, XCircle, ArrowRight, RotateCcw } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import { quizzes as quizzesApi } from '../services/api';
import './Results.css';

export default function Results() {
  const { state } = useLocation();
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isGuest = user?.role === 'guest';
  const [results, setResults] = useState(state?.results || null);
  const [loading, setLoading] = useState(!state?.results);

  useEffect(() => {
    if (!state?.results && attemptId) {
      quizzesApi.getAttempt(attemptId)
        .then(res => setResults(res.data))
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }
  }, [attemptId, state]);

  if (loading) {
    return (
      <div className="results-empty">
        <div className="skeleton" style={{ width: 200, height: 20, borderRadius: 8 }} />
      </div>
    );
  }

  if (!results) {
    return (
      <div className="results-empty">
        <p>No results to display.</p>
        {!isGuest && (
          <Link to="/dashboard" className="btn btn--outline">Back to Dashboard</Link>
        )}
      </div>
    );
  }

  const { score, xpEarned, correctCount, totalQuestions, certificateIssued, newLevel, gradedAnswers } = results;
  const passed = score >= 70;

  return (
    <div className="results-page">
      <div className="container container--narrow">
        {/* Score Hero */}
        <motion.div className={`results-hero ${passed ? 'results-hero--pass' : 'results-hero--fail'}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <div className="results-hero__score-ring">
            <svg viewBox="0 0 120 120" className="score-ring">
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--color-surface-2)" strokeWidth="6" />
              <motion.circle cx="60" cy="60" r="52" fill="none"
                stroke={passed ? 'var(--color-success)' : 'var(--color-danger)'}
                strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 52}`}
                initial={{ strokeDashoffset: 2 * Math.PI * 52 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 52 * (1 - score / 100) }}
                transition={{ delay: 0.3, duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                transform="rotate(-90, 60, 60)" />
            </svg>
            <div className="results-hero__score-text">
              <motion.span className="results-hero__score-val"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
                {Math.round(score)}%
              </motion.span>
            </div>
          </div>

          <h2 className="results-hero__title">
            {passed ? 'Excellent Work!' : 'Keep Practicing!'}
          </h2>
          <p className="results-hero__subtitle">
            You got {correctCount} out of {totalQuestions} questions correct.
          </p>

          <div className="results-stats">
            <div className="results-stat">
              <Star size={16} />
              <span>+{xpEarned} XP</span>
            </div>
            {newLevel && (
              <div className="results-stat results-stat--accent">
                <Trophy size={16} />
                <span>Level {newLevel}!</span>
              </div>
            )}
            {certificateIssued && (
              <div className="results-stat results-stat--accent">
                <CheckCircle size={16} />
                <span>Certificate</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Answer Review */}
        <div className="results-review">
          <h3 style={{ marginBottom: 'var(--space-6)' }}>Answer Review</h3>
          <div className="results-answers">
            {gradedAnswers?.map((a, i) => (
              <motion.div key={a.questionId}
                className={`result-answer card ${a.isCorrect ? 'result-answer--correct' : 'result-answer--wrong'}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}>
                <div className="result-answer__header">
                  <span className="result-answer__num">Q{i + 1}</span>
                  {a.isCorrect ? (
                    <CheckCircle size={18} className="result-answer__icon result-answer__icon--correct" />
                  ) : (
                    <XCircle size={18} className="result-answer__icon result-answer__icon--wrong" />
                  )}
                </div>
                <div className="result-answer__details">
                  <div className="result-answer__row">
                    <span className="result-answer__label">Your answer:</span>
                    <span className={a.isCorrect ? 'result-answer__correct' : 'result-answer__wrong-text'}>
                      {a.selectedAnswer || '(No answer)'}
                    </span>
                  </div>
                  {!a.isCorrect && (
                    <div className="result-answer__row">
                      <span className="result-answer__label">Correct:</span>
                      <span className="result-answer__correct">{a.correctAnswer}</span>
                    </div>
                  )}
                  {a.explanation && (
                    <p className="result-answer__explanation">{a.explanation}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="results-actions">
          {results.attempt?.quiz_id && (
            <Link to={`/quiz/${results.attempt.quiz_id}`} className="btn btn--outline btn--lg">
              <RotateCcw size={16} /> Try Again
            </Link>
          )}
          {!isGuest && (
            <>
              <Link to="/dashboard" className="btn btn--outline btn--lg">
                <ArrowRight size={16} /> Dashboard
              </Link>
              <Link to="/create" className="btn btn--primary btn--lg">
                Create Another
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
