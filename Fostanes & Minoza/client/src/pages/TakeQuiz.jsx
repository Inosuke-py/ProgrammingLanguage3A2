import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronRight, Send, Loader2, AlertCircle, Share2, Check, Zap, CheckCircle, XCircle, Palette, Lightbulb, User, ArrowLeft } from 'lucide-react';
import useAuthStore from '../store/useAuthStore';
import { quizzes as quizzesApi, getShareUrl } from '../services/api';
import { MODULE_THEMES } from '../components/shared/moduleThemes';
import './TakeQuiz.css';

const SESSION_KEY = (id) => `lexara-quiz-progress-${id}`;

export default function TakeQuiz() {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  // CRITICAL — wait for auth to finish initializing before deciding
  // whether to show the welcome gate vs the authenticated pre-start
  // screen. On a fresh navigate to a shared link, the quiz fetch can
  // resolve BEFORE the auth /me check, which would briefly render the
  // wrong UI (gate flashing past the authed screen, or the authed
  // screen showing for an unauthed visitor). Holding the render until
  // auth is settled removes the race entirely.
  const authLoading = useAuthStore((s) => s.loading);

  const [quiz, setQuiz] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [feedback, setFeedback] = useState(null); // { isCorrect, correctAnswer, explanation }
  const [showConfirm, setShowConfirm] = useState(false);
  const [streak, setStreak] = useState(0);
  const [theme, setTheme] = useState(() => {
    try {
      const v = localStorage.getItem(`lexara-quiz-theme-${id}`);
      if (!v) return 'none';
      return ['none', 'novel', 'scifi', 'kids', 'pixel', 'slingshot'].includes(v) ? v : 'none';
    } catch { return 'none'; }
  });
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  // Welcome-gate state — only used when there's no signed-in user on /quiz/:id.
  // 'choose' shows the Google / Guest cards; 'name' shows the name-entry step.
  const [guestStep, setGuestStep] = useState('choose');
  const [guestName, setGuestName] = useState('');
  const [guestSubmitting, setGuestSubmitting] = useState(false);
  const [guestError, setGuestError] = useState(null);
  const timerRef = useRef(null);
  // Re-entry guard for handleSubmit — prevents double-submission via
  // fast double-click. Sync ref because setSubmitting is async.
  const submittingRef = useRef(false);

  useEffect(() => {
    try {
      if (theme === 'none') localStorage.removeItem(`lexara-quiz-theme-${id}`);
      else localStorage.setItem(`lexara-quiz-theme-${id}`, theme);
    } catch {}
  }, [id, theme]);

  useEffect(() => {
    loadQuiz();
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [id]);

  // Restore progress from sessionStorage. If a timer is already running
  // (e.g. fast remount after a refresh), clear it before starting a new
  // one. Without this, two ticks compete and `elapsed` jumps by 2/sec.
  useEffect(() => {
    if (!quiz) return;
    try {
      const saved = sessionStorage.getItem(SESSION_KEY(id));
      if (saved) {
        const { answers: a, currentIndex: ci, elapsed: el, started: st } = JSON.parse(saved);
        if (st && a) {
          setAnswers(a);
          setCurrentIndex(ci || 0);
          setElapsed(el || 0);
          setStarted(true);
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
        }
      }
    } catch {}
  }, [quiz, id]);

  // Persist progress to sessionStorage
  useEffect(() => {
    if (!started || !quiz) return;
    sessionStorage.setItem(SESSION_KEY(id), JSON.stringify({ answers, currentIndex, elapsed, started }));
  }, [answers, currentIndex, elapsed, started, id, quiz]);

  // Warn user before leaving during active quiz
  useEffect(() => {
    if (!started || submitting) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [started, submitting]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    if (!started || !quiz || feedback || showConfirm) return;
    // Don't intercept keys while the user is typing in a text field —
    // Enter should commit/blur naturally, not jump pages.
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.target.blur();
      }
      return;
    }
    const question = quiz.questions[currentIndex];
    const total = quiz.questions.length;

    // 1-4 or A-D to select option
    if (question.question_type !== 'fillinblank') {
      let idx = -1;
      if (e.key >= '1' && e.key <= '4') idx = parseInt(e.key) - 1;
      else if (/^[a-dA-D]$/.test(e.key)) idx = e.key.toUpperCase().charCodeAt(0) - 65;

      if (idx >= 0 && idx < (question.options?.length || 0)) {
        e.preventDefault();
        selectAnswer(question.id, question.options[idx]);
        return;
      }
    }

    // Enter to advance or submit
    if (e.key === 'Enter' && answers[question.id]) {
      e.preventDefault();
      if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1);
      else attemptSubmit();
    }

    // Arrow keys for forward navigation only — going back is disabled
    if (e.key === 'ArrowRight' && currentIndex < total - 1) {
      e.preventDefault();
      setCurrentIndex(currentIndex + 1);
    }
  }, [started, quiz, currentIndex, answers, feedback, showConfirm]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  async function loadQuiz() {
    try {
      const res = await quizzesApi.take(id);
      setQuiz(res.data.quiz);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startQuiz(practice = false) {
    if (!user) {
      setError('Please sign in to take this quiz.');
      return;
    }
    setPracticeMode(practice);
    setStarted(true);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  async function submitGuest() {
    const name = guestName.trim();
    if (name.length < 2) {
      setGuestError('Please enter at least 2 characters.');
      return;
    }
    if (name.length > 80) {
      setGuestError('Name must be 80 characters or fewer.');
      return;
    }
    setGuestError(null);
    setGuestSubmitting(true);
    try {
      const ok = await loginAsGuest(name);
      if (!ok) {
        // Pull whatever error the store stashed; fall back to generic copy.
        const storeErr = useAuthStore.getState().error;
        setGuestError(storeErr || 'Failed to start guest session. Please try again.');
        setGuestSubmitting(false);
        return;
      }
      // Refresh the quiz so any server-side gating that depends on the
      // session sees the new user, then drop straight into the quiz.
      await loadQuiz();
      setGuestSubmitting(false);
      setPracticeMode(false);
      setStarted(true);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) {
      setGuestError(err?.message || 'Failed to start guest session. Please try again.');
      setGuestSubmitting(false);
    }
  }

  async function shareQuiz() {
    const url = getShareUrl(id);
    if (navigator.share) {
      try { await navigator.share({ title: quiz?.title, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function selectAnswer(questionId, answer) {
    if (feedback) return; // locked during feedback
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));

    if (practiceMode) {
      // Instant feedback — check against server on submit (we don't have correct answers client-side)
      // For practice mode, we'll submit single-question check
      checkPracticeAnswer(questionId, answer);
    }
  }

  async function checkPracticeAnswer(questionId, answer) {
    try {
      const res = await quizzesApi.check(id, [{ questionId, selectedAnswer: answer }]);
      const graded = res.data.gradedAnswers?.find(a => a.questionId === questionId);
      if (graded) {
        setFeedback({
          isCorrect: graded.isCorrect,
          correctAnswer: graded.correctAnswer,
          explanation: graded.explanation,
        });
        if (graded.isCorrect) setStreak(s => s + 1);
        else setStreak(0);
      }
    } catch {
      setFeedback(null);
    }
  }

  function advanceFromFeedback() {
    setFeedback(null);
    const total = quiz.questions.length;
    if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }

  function attemptSubmit() {
    const total = quiz.questions.length;
    const unanswered = total - Object.keys(answers).length;
    if (unanswered > 0) {
      setShowConfirm(true);
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    if (!user) {
      setError('You must be signed in to submit answers.');
      return;
    }
    // Re-entry guard. Without this, a fast double-click (or React not yet
    // re-rendering after setSubmitting(true)) can fire the submit twice
    // and create two attempts, doubling XP and leaderboard entries.
    // Using a ref instead of state because state updates are async.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setShowConfirm(false);
    if (timerRef.current) clearInterval(timerRef.current);
    setSubmitting(true);
    sessionStorage.removeItem(SESSION_KEY(id));
    try {
      const formattedAnswers = Object.entries(answers).map(([questionId, selectedAnswer]) => ({
        questionId,
        selectedAnswer,
      }));
      const res = await quizzesApi.submit(id, {
        answers: formattedAnswers,
        timeTaken: elapsed,
      });
      navigate(`/results/${res.data.attempt.id}`, { state: { results: res.data } });
    } catch (err) {
      submittingRef.current = false;
      setError(err.message);
      setSubmitting(false);
    }
  }

  const formatTime = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  if (loading || authLoading) {
    return (
      <div className="quiz-loading">
        <div className="skeleton" style={{ width: 200, height: 4, borderRadius: 999 }} />
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <div className="quiz-loading">
        <AlertCircle size={32} />
        <p>{error}</p>
      </div>
    );
  }

  if (!quiz) return null;
  const question = quiz.questions[currentIndex];
  const total = quiz.questions.length;
  const answeredCount = Object.keys(answers).length;

  // Pre-start screen
  if (!started) {
    // Unauthenticated visitor — shared-link recipient. Show the welcome gate.
    if (!user) {
      return (
        <div className="quiz-start" data-quiz-theme={theme}>
          <div className="quiz-gate">
            <motion.div
              className="quiz-gate__shell"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="quiz-gate__header">
                <span className="label">Quiz</span>
                <h1 className="quiz-gate__title text-serif">{quiz.title}</h1>
                {quiz.description && (
                  <p className="quiz-gate__description">{quiz.description}</p>
                )}
                <div className="quiz-gate__meta">
                  <span>{total} questions</span>
                  <span>•</span>
                  <span>Pass: {quiz.passing_score}%</span>
                </div>
              </div>

              <div className="quiz-gate__divider" aria-hidden="true" />

              <AnimatePresence mode="wait">
                {guestStep === 'choose' ? (
                  <motion.div
                    key="choose"
                    className="quiz-gate__choice-row"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      type="button"
                      className="quiz-gate__choice quiz-gate__choice--google"
                      onClick={loginWithGoogle}
                    >
                      <Lightbulb size={26} strokeWidth={1.5} className="quiz-gate__choice-icon" />
                      <span className="quiz-gate__choice-label">Sign in with Google</span>
                      <span className="quiz-gate__choice-desc">Save your score and streak</span>
                    </button>
                    <button
                      type="button"
                      className="quiz-gate__choice quiz-gate__choice--guest"
                      onClick={() => {
                        setGuestError(null);
                        setGuestStep('name');
                      }}
                    >
                      <User size={26} strokeWidth={1.5} className="quiz-gate__choice-icon" />
                      <span className="quiz-gate__choice-label">Continue as Guest</span>
                      <span className="quiz-gate__choice-desc">Take this quiz without an account</span>
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="name"
                    className="quiz-gate__name-step"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label className="quiz-gate__name-label" htmlFor="quiz-gate-name">
                      Almost there. What name should appear on the leaderboard?
                    </label>
                    <input
                      id="quiz-gate-name"
                      type="text"
                      className="quiz-gate__name-input"
                      value={guestName}
                      onChange={(e) => {
                        setGuestName(e.target.value);
                        if (guestError) setGuestError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !guestSubmitting) {
                          e.preventDefault();
                          submitGuest();
                        }
                      }}
                      placeholder="Full name"
                      maxLength={80}
                      autoFocus
                      autoComplete="name"
                      spellCheck="false"
                      disabled={guestSubmitting}
                      aria-invalid={guestError ? 'true' : 'false'}
                    />
                    <span className="quiz-gate__name-hint">
                      Visible on the leaderboard. 2–80 characters.
                    </span>
                    {guestError && (
                      <div className="quiz-gate__error" role="alert">{guestError}</div>
                    )}
                    <div className="quiz-gate__name-actions">
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                          setGuestError(null);
                          setGuestStep('choose');
                        }}
                        disabled={guestSubmitting}
                      >
                        <ArrowLeft size={15} /> Back
                      </button>
                      <button
                        type="button"
                        className="btn btn--primary"
                        onClick={submitGuest}
                        disabled={guestSubmitting || guestName.trim().length < 2}
                      >
                        {guestSubmitting ? (
                          <><Loader2 size={15} className="spin" /> Starting…</>
                        ) : (
                          <>Continue <ChevronRight size={15} /></>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </div>
      );
    }

    // Authenticated user — original pre-start screen, untouched.
    return (
      <div className="quiz-start" data-quiz-theme={theme}>
        <div className="container container--narrow">
          <motion.div className="quiz-start__card card"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <button
              type="button"
              className="quiz-start__back"
              onClick={() => navigate('/explore')}
              aria-label="Back to quizzes"
            >
              <ArrowLeft size={15} /> Back to Quizzes
            </button>

            <span className="label">Quiz</span>
            <h1 style={{ fontSize: 'var(--text-3xl)', marginTop: 'var(--space-2)' }}>{quiz.title}</h1>
            {quiz.description && <p style={{ marginTop: 'var(--space-3)' }}>{quiz.description}</p>}
            <div className="quiz-start__meta">
              <span>{total} questions</span>
              <span>•</span>
              <span>Pass: {quiz.passing_score}%</span>
            </div>
            <div className="quiz-start__actions">
              <button className="btn btn--primary btn--lg" onClick={() => startQuiz(false)}>
                Begin Quiz
              </button>
              {quiz.allow_practice !== false && (
                <button className="btn btn--outline btn--lg" onClick={() => startQuiz(true)}>
                  <Zap size={15} /> Practice Mode
                </button>
              )}
              {/* Note: a `{!user && ...}` Sign In button used to live here. It
                  was dead code because we already return the welcome gate above
                  when `user` is null. Removed to make the auth path explicit. */}
              <button className="btn btn--ghost" onClick={shareQuiz}>
                {copied ? <><Check size={15} /> Copied!</> : <><Share2 size={15} /> Share</>}
              </button>
            </div>
            {error && <div className="create-error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-take" data-quiz-theme={theme}>
      <div className="container container--narrow">
        {/* Header */}
        <div className="quiz-take__header">
          <div className="quiz-take__progress">
            <div className="quiz-take__progress-bar">
              <motion.div className="quiz-take__progress-fill"
                animate={{ width: `${((currentIndex + 1) / total) * 100}%` }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <span className="quiz-take__count">{currentIndex + 1} / {total}</span>
          </div>
          <div className="quiz-take__header-right">
            {practiceMode && streak > 1 && (
              <span className="quiz-take__streak">🔥 {streak}</span>
            )}
            {practiceMode && <span className="badge badge--accent">Practice</span>}
            <button
              className={`quiz-take__theme-btn ${theme !== 'none' ? 'quiz-take__theme-btn--active' : ''}`}
              onClick={() => setThemePickerOpen((v) => !v)}
              title="Reading theme"
              aria-expanded={themePickerOpen}
            >
              <Palette size={14} />
            </button>
            <div className="quiz-take__timer">
              <Clock size={14} /> {formatTime(elapsed)}
            </div>
          </div>
        </div>

        {themePickerOpen && (
          <div className="quiz-theme-picker" role="menu">
            <div className="quiz-theme-picker__header">
              <span className="quiz-theme-picker__title">Quiz Theme</span>
              <span className="quiz-theme-picker__hint">Visual only — your answers are unaffected.</span>
            </div>
            <div className="quiz-theme-picker__grid">
              {MODULE_THEMES.map((t) => (
                <button
                  key={t.id}
                  role="menuitem"
                  className={`quiz-theme-card quiz-theme-card--${t.id} ${theme === t.id ? 'quiz-theme-card--active' : ''}`}
                  onClick={() => { setTheme(t.id); setThemePickerOpen(false); }}
                >
                  <span className="quiz-theme-card__swatch" aria-hidden="true" />
                  <span className="quiz-theme-card__name">
                    {t.label}
                    {theme === t.id && <Check size={12} className="quiz-theme-card__check" />}
                  </span>
                  <span className="quiz-theme-card__desc">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Question */}
        <AnimatePresence mode="wait">
          <motion.div key={currentIndex} className="question-card card"
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>

            <span className="badge" style={{ marginBottom: 'var(--space-3)' }}>{question.question_type}</span>
            <h3 className="question-card__text">{question.question_text}</h3>

            <div className="options-list">
              {question.question_type === 'fillinblank' ? (
                <input
                  type="text"
                  className={`fillinblank-input ${answers[question.id] ? 'fillinblank-input--filled' : ''} ${feedback ? (feedback.isCorrect ? 'fillinblank-input--correct' : 'fillinblank-input--wrong') : ''}`}
                  placeholder="Type your answer..."
                  value={answers[question.id] || ''}
                  maxLength={200}
                  autoComplete="off"
                  spellCheck="false"
                  onChange={(e) => selectAnswer(question.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.target.blur();
                      if (answers[question.id]?.trim()) {
                        if (currentIndex < total - 1) setCurrentIndex(currentIndex + 1);
                        else attemptSubmit();
                      }
                    }
                  }}
                  autoFocus
                  disabled={!!feedback}
                />
              ) : (
                question.options?.map((opt, oi) => (
                  <button key={oi}
                    className={`option-btn ${answers[question.id] === opt ? 'option-btn--selected' : ''} ${feedback && opt === feedback.correctAnswer ? 'option-btn--correct' : ''} ${feedback && answers[question.id] === opt && !feedback.isCorrect ? 'option-btn--wrong' : ''}`}
                    onClick={() => selectAnswer(question.id, opt)}
                    disabled={!!feedback}>
                    <span className="option-btn__letter">{String.fromCharCode(65 + oi)}</span>
                    <span>{opt}</span>
                    {feedback && opt === feedback.correctAnswer && <CheckCircle size={16} className="option-btn__icon" />}
                    {feedback && answers[question.id] === opt && !feedback.isCorrect && <XCircle size={16} className="option-btn__icon" />}
                  </button>
                ))
              )}
            </div>

            {/* Practice Mode Feedback */}
            {feedback && (
              <motion.div className={`practice-feedback ${feedback.isCorrect ? 'practice-feedback--correct' : 'practice-feedback--wrong'}`}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="practice-feedback__header">
                  {feedback.isCorrect
                    ? <><CheckCircle size={18} /> Correct!</>
                    : <><XCircle size={18} /> Incorrect — {feedback.correctAnswer}</>}
                </div>
                {feedback.explanation && (
                  <p className="practice-feedback__explanation">{feedback.explanation}</p>
                )}
                <button className="btn btn--sm btn--outline" onClick={advanceFromFeedback}>
                  {currentIndex < total - 1 ? 'Next Question →' : 'See Results'}
                </button>
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation (hidden during practice feedback) */}
        {!feedback && (
          <div className="quiz-take__nav quiz-take__nav--forward">
            {currentIndex < total - 1 ? (
              <button className="btn btn--outline" onClick={() => setCurrentIndex(currentIndex + 1)}>
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button className="btn btn--primary" onClick={attemptSubmit}
                disabled={submitting || answeredCount === 0}>
                {submitting ? <><Loader2 size={16} className="spin" /> Submitting...</>
                  : <><Send size={16} /> Submit ({answeredCount}/{total})</>}
              </button>
            )}
          </div>
        )}

        {error && <div className="create-error" style={{ marginTop: 'var(--space-4)' }}>{error}</div>}

        {/* Keyboard hint */}
        {!practiceMode && question.question_type !== 'fillinblank' && (
          <p className="quiz-take__hint">Press 1–{question.options?.length || 4} to select, Enter to advance</p>
        )}

        {/* Question dots — display-only progress (no jumping back) */}
        <div className="question-dots question-dots--readonly" role="list" aria-label="Question progress">
          {quiz.questions.map((q, i) => (
            <span key={q.id}
              role="listitem"
              aria-current={i === currentIndex ? 'step' : undefined}
              className={`question-dot ${i === currentIndex ? 'question-dot--current' : ''} ${answers[q.id] ? 'question-dot--answered' : ''}`} />
          ))}
        </div>
      </div>

      {/* Submit Confirmation Modal */}
      {showConfirm && (
        <div className="confirm-overlay" onClick={() => setShowConfirm(false)}>
          <motion.div className="confirm-modal card" onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <h3>Submit Quiz?</h3>
            <p>You have <strong>{total - answeredCount}</strong> unanswered question{total - answeredCount > 1 ? 's' : ''}. Submit anyway?</p>
            <div className="confirm-modal__actions">
              <button className="btn btn--ghost" onClick={() => setShowConfirm(false)}>Go Back</button>
              <button className="btn btn--primary" onClick={handleSubmit}>Submit Anyway</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
