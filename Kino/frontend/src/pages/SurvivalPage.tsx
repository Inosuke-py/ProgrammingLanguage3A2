import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heart, Flame, Loader2, ArrowRight, Trophy, RefreshCw, X,
} from 'lucide-react'
import { RequireAuth, useAuth } from '../lib/auth'
import { useBadgeUnlock } from '../lib/badge-context'
import api from '../lib/api'
import { theme as c } from '../theme'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]
const HEART_FULL = 'oklch(70% 0.22 25)'
const HEART_LOST = 'oklch(35% 0.04 280)'
const TIMER_SECONDS = 20
const TIMEOUT_SENTINEL = '__TIMEOUT__'

interface Question {
  id: string
  content: string
  options: string[]
  type: string
  order_index: number
}

interface NextQuestionResult {
  is_correct: boolean
  correct_answer: string
  explanation: string | null
  source_text: string | null
  game_over: boolean
  pool_exhausted?: boolean
  survival_count: number | null
  hearts_remaining: number | null
  longest_survival?: number
  xp_earned?: number
  badges_earned?: { key: string; name: string; description: string; icon: string; rarity: string }[]
  next_question: Question | null
}

interface InitState {
  quizId: string
  hearts: number
  survivalCount: number
  attemptsRemaining: number
  firstQuestion: Question | null
  title: string
}

function SurvivalContent() {
  const { quizId } = useParams<{ quizId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const initState = (location.state as Partial<InitState>) || {}
  const { user } = useAuth()
  const { showBadgeUnlock } = useBadgeUnlock()

  const [hearts, setHearts] = useState<number>(initState.hearts ?? 3)
  const [survivalCount, setSurvivalCount] = useState<number>(initState.survivalCount ?? 0)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(
    initState.firstQuestion ?? null
  )
  const [selected, setSelected] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<NextQuestionResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(!initState.firstQuestion)
  const [gameOver, setGameOver] = useState(false)
  const [exitConfirm, setExitConfirm] = useState(false)
  const [timeLeft, setTimeLeft] = useState<number>(TIMER_SECONDS)
  const [timedOut, setTimedOut] = useState(false)
  const startTimeRef = useRef<number>(Date.now())

  // If we landed without a question (e.g. direct URL hit), fetch the quiz state.
  useEffect(() => {
    if (currentQuestion) return
    const fetchInitial = async () => {
      try {
        const res = await api.get(`/quizzes/${quizId}`)
        const q = res.data?.questions?.[0]
        if (q) {
          setCurrentQuestion(q)
          setHearts(res.data.hearts_remaining ?? 3)
          setSurvivalCount(res.data.survival_count ?? 0)
        } else {
          navigate('/challenges', { replace: true })
        }
      } catch {
        navigate('/challenges', { replace: true })
      } finally {
        setLoading(false)
      }
    }
    fetchInitial()
  }, [quizId, currentQuestion, navigate])

  const submit = useCallback(
    async (option: string) => {
      if (!currentQuestion || submitting || revealed) return
      const isTimeout = option === TIMEOUT_SENTINEL
      setSelected(isTimeout ? null : option)
      setSubmitting(true)
      if (isTimeout) setTimedOut(true)
      const timeTaken = (Date.now() - startTimeRef.current) / 1000

      try {
        const res = await api.post<NextQuestionResult>(
          `/quizzes/${quizId}/next-question`,
          {
            question_id: currentQuestion.id,
            user_answer: option,
            confidence: 'somewhat',
            time_taken: timeTaken,
          }
        )
        setRevealed(res.data)

        if (res.data.hearts_remaining != null) {
          setHearts(res.data.hearts_remaining)
        }
        if (res.data.survival_count != null) {
          setSurvivalCount(res.data.survival_count)
        }

        if (res.data.game_over) {
          // Hold on the reveal for a moment, then show game over screen
          setTimeout(() => setGameOver(true), 1400)
          // Fire the badge celebration after the game-over screen appears
          const earned = res.data.badges_earned ?? []
          if (earned.length > 0) {
            setTimeout(() => showBadgeUnlock(earned, res.data.xp_earned), 1700)
          }
        }
      } catch {
        // Recover gracefully — back to the question
        setSelected(null)
        setRevealed(null)
        setTimedOut(false)
      } finally {
        setSubmitting(false)
      }
    },
    [currentQuestion, quizId, submitting, revealed, showBadgeUnlock]
  )

  const advance = useCallback(() => {
    if (!revealed?.next_question) return
    setCurrentQuestion(revealed.next_question)
    setRevealed(null)
    setSelected(null)
    setTimedOut(false)
    setTimeLeft(TIMER_SECONDS)
    startTimeRef.current = Date.now()
  }, [revealed])

  // 20-second countdown — runs only while a question is active and not yet answered.
  useEffect(() => {
    if (!currentQuestion || revealed || submitting || gameOver) return
    setTimeLeft(TIMER_SECONDS)
    const start = Date.now()
    const tick = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000
      const remaining = Math.max(0, TIMER_SECONDS - elapsed)
      setTimeLeft(remaining)
      if (remaining <= 0) {
        clearInterval(tick)
        // Auto-submit a sentinel that the backend will mark wrong → heart lost.
        submit(TIMEOUT_SENTINEL)
      }
    }, 100)
    return () => clearInterval(tick)
  }, [currentQuestion?.id, revealed, submitting, gameOver, submit])

  // Keyboard support: 1-4 for option, Enter for next
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (gameOver) return
      if (revealed) {
        if (e.key === 'Enter' || e.key === ' ') advance()
        return
      }
      if (!currentQuestion) return
      const idx = parseInt(e.key, 10) - 1
      if (idx >= 0 && idx < currentQuestion.options.length) {
        submit(currentQuestion.options[idx])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [currentQuestion, revealed, gameOver, submit, advance])

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: c.bg }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: HEART_FULL }} />
      </div>
    )
  }

  if (gameOver && revealed) {
    return <GameOverScreen result={revealed} userId={user?.id} />
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: c.bg }}>
        <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          Loading...
        </p>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col relative overflow-hidden"
      style={{
        background: `radial-gradient(ellipse 80vw 60vh at 50% -10%, ${HEART_FULL}10 0%, transparent 60%), ${c.bg}`,
      }}
    >
      {/* Top status bar: hearts left, streak counter, exit */}
      <header className="relative px-5 md:px-10 py-5 flex items-center justify-between gap-4" style={{ zIndex: 2 }}>
        <Hearts count={hearts} />

        <div className="flex items-center gap-4 md:gap-6">
          <Timer seconds={timeLeft} active={!revealed && !submitting} />
          <StreakCounter count={survivalCount} />
        </div>

        <button
          onClick={() => setExitConfirm(true)}
          aria-label="Exit run"
          className="p-2 rounded-lg cursor-pointer hover:opacity-70"
          style={{ color: c.muted, transition: 'opacity 200ms ease-out' }}
        >
          <X size={20} />
        </button>
      </header>

      {/* Question stage */}
      <main className="relative flex-1 flex items-center justify-center px-5 md:px-10 pb-10" style={{ zIndex: 1 }}>
        <div className="w-full max-w-3xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentQuestion.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <p
                className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-4 text-center"
                style={{ fontFamily: 'var(--font-space)', color: HEART_FULL }}
              >
                Question {survivalCount + 1}
              </p>
              <h1
                className="font-bold text-2xl md:text-3xl lg:text-[34px] leading-tight text-center mb-10"
                style={{ fontFamily: 'var(--font-space)', color: c.text, maxWidth: '32ch', margin: '0 auto 2.5rem' }}
              >
                {currentQuestion.content}
              </h1>

              <div className="grid gap-3 max-w-xl mx-auto">
                {currentQuestion.options.map((opt, i) => {
                  const isSelected = selected === opt
                  const correctAnswer = revealed?.correct_answer
                  const showCorrect = revealed && opt === correctAnswer
                  const showWrong = revealed && isSelected && opt !== correctAnswer

                  let bg: string = c.surface
                  let border: string = c.border
                  let color: string = c.text
                  let badgeBg: string = c.bg
                  let badgeColor: string = c.muted

                  if (showCorrect) {
                    bg = `${c.accent}1a`
                    border = c.accent
                    badgeBg = c.accent
                    badgeColor = c.bg
                  } else if (showWrong) {
                    bg = 'oklch(28% 0.06 25)'
                    border = HEART_FULL
                    badgeBg = HEART_FULL
                    badgeColor = c.bg
                  } else if (isSelected) {
                    bg = `${HEART_FULL}10`
                    border = HEART_FULL
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => submit(opt)}
                      disabled={!!revealed || submitting}
                      className="w-full flex items-center gap-4 px-5 py-4 rounded-xl text-left text-base md:text-lg font-medium cursor-pointer disabled:cursor-default"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: bg,
                        border: `1.5px solid ${border}`,
                        color,
                        transition:
                          'background 180ms cubic-bezier(0.16,1,0.3,1), border-color 180ms cubic-bezier(0.16,1,0.3,1)',
                      }}
                    >
                      <span
                        className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{
                          background: badgeBg,
                          color: badgeColor,
                          border: !showCorrect && !showWrong ? `1px solid ${c.border}` : 'none',
                        }}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1">{opt}</span>
                    </button>
                  )
                })}
              </div>

              {/* Reveal panel: correct answer + explanation + Next */}
              <AnimatePresence>
                {revealed && !revealed.game_over && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3, ease: EASE, delay: 0.05 }}
                    className="max-w-xl mx-auto mt-8"
                  >
                    <div
                      className="rounded-xl p-5"
                      style={{
                        background: c.card,
                        border: `1px solid ${c.border}`,
                      }}
                    >
                      <p
                        className="text-xs uppercase tracking-[0.18em] font-bold mb-2"
                        style={{
                          fontFamily: 'var(--font-space)',
                          color: revealed.is_correct ? c.accent : HEART_FULL,
                        }}
                      >
                        {revealed.is_correct
                          ? 'Correct'
                          : timedOut
                            ? "Time's up"
                            : 'Lost a heart'}
                      </p>
                      {!revealed.is_correct && revealed.correct_answer && (
                        <p
                          className="text-xs mb-2"
                          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                        >
                          Answer:{' '}
                          <span style={{ color: c.text, fontWeight: 600 }}>
                            {revealed.correct_answer}
                          </span>
                        </p>
                      )}
                      {revealed.explanation && (
                        <p
                          className="text-sm leading-relaxed mb-4"
                          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                        >
                          {revealed.explanation}
                        </p>
                      )}
                      <button
                        onClick={advance}
                        autoFocus
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold cursor-pointer"
                        style={{
                          fontFamily: 'var(--font-space)',
                          background: c.brand,
                          color: c.bg,
                        }}
                      >
                        Next question
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Exit confirmation */}
      <AnimatePresence>
        {exitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 flex items-center justify-center z-50 px-5"
            style={{ background: `${c.bg}cc`, backdropFilter: 'blur(4px)' }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="rounded-2xl p-6 max-w-sm w-full"
              style={{ background: c.card, border: `1px solid ${c.border}` }}
            >
              <h3
                className="font-bold text-lg mb-2"
                style={{ fontFamily: 'var(--font-space)', color: c.text }}
              >
                Quit this run?
              </h3>
              <p
                className="text-sm leading-relaxed mb-5"
                style={{ fontFamily: 'var(--font-space)', color: c.muted }}
              >
                You'll lose your streak and this counts as one of your 3 daily attempts. There's no resume.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setExitConfirm(false)}
                  className="flex-1 py-3 rounded-lg text-sm font-semibold cursor-pointer"
                  style={{
                    fontFamily: 'var(--font-space)',
                    background: c.surface,
                    color: c.text,
                    border: `1px solid ${c.border}`,
                  }}
                >
                  Keep playing
                </button>
                <button
                  onClick={() => navigate('/challenges')}
                  className="flex-1 py-3 rounded-lg text-sm font-semibold cursor-pointer"
                  style={{
                    fontFamily: 'var(--font-space)',
                    background: HEART_FULL,
                    color: c.bg,
                  }}
                >
                  Quit
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Countdown timer ─────────────────────────────────────────────────────────

function Timer({ seconds, active }: { seconds: number; active: boolean }) {
  const pct = Math.max(0, Math.min(1, seconds / TIMER_SECONDS))
  const r = 16
  const circ = 2 * Math.PI * r
  const dashOffset = circ * (1 - pct)
  const danger = seconds <= 5
  const color = danger ? HEART_FULL : pct > 0.5 ? c.accent : c.brand
  const display = Math.max(0, Math.ceil(seconds))

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: 44, height: 44 }}
      aria-label={`${display} seconds left`}
      role="timer"
    >
      <svg
        width={44}
        height={44}
        viewBox="0 0 44 44"
        style={{
          transform: 'rotate(-90deg)',
          transition: 'opacity 200ms ease-out',
          opacity: active ? 1 : 0.4,
        }}
      >
        <circle
          cx={22}
          cy={22}
          r={r}
          fill="none"
          stroke={c.border}
          strokeWidth={2.5}
        />
        <circle
          cx={22}
          cy={22}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashOffset}
          style={{
            transition: 'stroke-dashoffset 100ms linear, stroke 250ms ease-out',
            filter: danger ? `drop-shadow(0 0 6px ${HEART_FULL}88)` : 'none',
          }}
        />
      </svg>
      <motion.span
        key={display}
        initial={{ scale: danger ? 1.2 : 1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums"
        style={{
          fontFamily: 'var(--font-space)',
          color: danger ? HEART_FULL : c.text,
        }}
      >
        {display}
      </motion.span>
    </div>
  )
}

// ─── Hearts row ──────────────────────────────────────────────────────────────

function Hearts({ count }: { count: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`${count} hearts remaining`}>
      {[2, 1, 0].map((i) => {
        // Render 3 hearts; hearts at index < count are full
        const isFull = i < count
        return (
          <motion.div
            key={i}
            animate={
              isFull
                ? { scale: 1, y: 0 }
                : { scale: 0.85, y: 0, rotate: 0 }
            }
            transition={{ duration: 0.4, ease: EASE }}
          >
            <Heart
              size={26}
              fill={isFull ? HEART_FULL : 'transparent'}
              strokeWidth={2}
              style={{
                color: isFull ? HEART_FULL : HEART_LOST,
                filter: isFull ? `drop-shadow(0 0 8px ${HEART_FULL}66)` : 'none',
                transition: 'color 200ms ease-out',
              }}
            />
          </motion.div>
        )
      })}
    </div>
  )
}

// ─── Streak counter ──────────────────────────────────────────────────────────

function StreakCounter({ count }: { count: number }) {
  return (
    <motion.div
      key={count}
      initial={{ scale: 0.92 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="flex items-center gap-2"
    >
      <Flame size={18} style={{ color: count > 0 ? c.brand : c.muted }} />
      <span
        className="text-2xl md:text-3xl font-extrabold tabular-nums"
        style={{
          fontFamily: 'var(--font-space)',
          color: count > 0 ? c.text : c.muted,
        }}
      >
        {count}
      </span>
    </motion.div>
  )
}

// ─── Game Over Screen ────────────────────────────────────────────────────────

function GameOverScreen({
  result,
  userId,
}: {
  result: NextQuestionResult
  userId?: string
}) {
  const navigate = useNavigate()
  const survived = result.survival_count ?? 0
  const personalBest = result.longest_survival ?? 0
  const isNewRecord = survived === personalBest && survived > 0
  void userId

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{
        background: `radial-gradient(ellipse 100vw 80vh at 50% 50%, ${HEART_FULL}14 0%, transparent 65%), ${c.bg}`,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
        className="text-center max-w-md w-full"
      >
        <p
          className="text-xs uppercase tracking-[0.3em] font-semibold mb-3"
          style={{ fontFamily: 'var(--font-space)', color: HEART_FULL }}
        >
          Run over
        </p>
        <h1
          className="font-extrabold text-6xl md:text-7xl tracking-tight mb-2"
          style={{
            fontFamily: 'var(--font-space)',
            color: c.text,
            textShadow: `0 0 40px ${HEART_FULL}40`,
          }}
        >
          {survived}
        </h1>
        <p
          className="text-base mb-1"
          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
        >
          {survived === 1 ? 'question' : 'questions'} survived
        </p>

        {isNewRecord && survived > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full"
            style={{
              background: `${c.brand}18`,
              border: `1px solid ${c.brand}`,
            }}
          >
            <Trophy size={14} style={{ color: c.brand }} />
            <span
              className="text-xs font-bold uppercase tracking-wider"
              style={{ fontFamily: 'var(--font-space)', color: c.brand }}
            >
              New personal best
            </span>
          </motion.div>
        )}

        {result.xp_earned ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            className="text-sm mt-6"
            style={{ fontFamily: 'var(--font-space)', color: c.muted }}
          >
            <span className="font-bold" style={{ color: c.brand }}>
              +{result.xp_earned} XP
            </span>{' '}
            earned
          </motion.p>
        ) : null}

        {result.pool_exhausted && (
          <p
            className="text-xs mt-4"
            style={{ fontFamily: 'var(--font-space)', color: c.muted, opacity: 0.8 }}
          >
            You exhausted the question pool. That's a clean sweep.
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.4 }}
          className="flex flex-col sm:flex-row gap-3 mt-10"
        >
          <button
            onClick={() => navigate('/challenges')}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{
              fontFamily: 'var(--font-space)',
              background: c.brand,
              color: c.bg,
            }}
          >
            <RefreshCw size={15} />
            Pick another challenge
          </button>
          <button
            onClick={() => navigate('/leaderboard')}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold cursor-pointer"
            style={{
              fontFamily: 'var(--font-space)',
              background: c.surface,
              color: c.text,
              border: `1px solid ${c.border}`,
            }}
          >
            <Trophy size={15} />
            Survival leaderboard
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

export default function SurvivalPage() {
  return (
    <RequireAuth>
      <SurvivalContent />
    </RequireAuth>
  )
}
