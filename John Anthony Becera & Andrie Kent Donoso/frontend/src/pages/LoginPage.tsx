import { useEffect, useState, useCallback } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Shield, Sparkles, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useBadgeUnlock } from '../lib/badge-context'
import { markExplorerLogin } from '../lib/explorer'
import api from '../lib/api'
import { theme as c } from '../theme'
import FloatingParticles from '../components/landing/FloatingParticles'

interface PublicStats {
  total_questions: number
  total_sessions: number
  active_learners: number
}

interface SampleQuestion {
  content: string
  options: string[]
  correct_answer: string
}

const FALLBACK_QUESTION: SampleQuestion = {
  content: 'Which planet has the most moons in our solar system?',
  options: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'],
  correct_answer: 'Saturn',
}

type AuthState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'error'; message: string }

const EASE_OUT_QUART: [number, number, number, number] = [0.16, 1, 0.3, 1]

export default function LoginPage() {
  const { login, user } = useAuth()
  const { showBadgeUnlock } = useBadgeUnlock()
  const navigate = useNavigate()

  const [authState, setAuthState] = useState<AuthState>({ status: 'idle' })
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [sample, setSample] = useState<SampleQuestion>(FALLBACK_QUESTION)
  const [picked, setPicked] = useState<string | null>(null)

  // The QuizTease has one question. Engaging with it counts as the second
  // half of the secret-badge breadcrumb (the first half is the landing demo).
  const handlePick = useCallback((option: string) => {
    setPicked(option)
    markExplorerLogin()
  }, [])

  // Already logged in, bounce to dashboard
  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  // Pull a real sample question + active-learner count to make the page feel alive
  useEffect(() => {
    let cancelled = false
    api
      .get(`/public/sample-question?_t=${Date.now()}`)
      .then((res) => {
        if (cancelled) return
        if (res.data?.content && Array.isArray(res.data.options) && res.data.options.length >= 2) {
          setSample(res.data)
        }
      })
      .catch(() => {})
    api
      .get('/public/stats')
      .then((res) => {
        if (!cancelled) setStats(res.data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const handleSuccess = useCallback(
    async (credentialResponse: { credential?: string }) => {
      const credential = credentialResponse.credential
      if (!credential) {
        setAuthState({
          status: 'error',
          message: "Google didn't return a sign-in token. Try again.",
        })
        return
      }
      setAuthState({ status: 'pending' })
      try {
        const earnedBadge = await login(credential)
        // If the user found both quizzes, fire the secret-badge celebration
        // before navigating so the modal lands cleanly on the dashboard.
        if (earnedBadge) {
          showBadgeUnlock([earnedBadge])
        }
        navigate('/dashboard', { replace: true })
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setAuthState({
          status: 'error',
          message:
            typeof detail === 'string' && detail
              ? detail
              : "We couldn't sign you in. Check your connection and try again.",
        })
      }
    },
    [login, navigate, showBadgeUnlock]
  )

  const handleError = useCallback(() => {
    setAuthState({
      status: 'error',
      message:
        "Sign-in didn't go through. If you blocked the pop-up, allow it and try again.",
    })
  }, [])

  return (
    <div
      className="min-h-screen relative overflow-hidden flex flex-col"
      style={{ background: c.bg }}
    >
      {/* Ambient particles, contained behind everything */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <FloatingParticles />
      </div>

      {/* Soft radial gold spotlight; centered behind the right column on desktop, top on mobile */}
      <div
        className="absolute pointer-events-none"
        style={{
          inset: 0,
          background: `radial-gradient(ellipse 50vw 70vh at 60% 50%, ${c.brand}14 0%, transparent 60%)`,
          zIndex: 0,
        }}
      />

      {/* Tiny back link */}
      <header className="relative px-6 md:px-10 py-5" style={{ zIndex: 2 }}>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm no-underline transition-opacity hover:opacity-80"
          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
        >
          <ArrowLeft size={14} />
          Back
        </Link>
      </header>

      {/* Main split layout — preview left, sign-in right (stacks on mobile) */}
      <main
        className="relative flex-1 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-10 lg:gap-12 px-6 md:px-10 pb-12 md:pb-16 items-center"
        style={{ zIndex: 1 }}
      >
        {/* Left: a real quiz tease */}
        <QuizTease sample={sample} picked={picked} onPick={handlePick} stats={stats} />

        {/* Right: sign-in column, asymmetric — no card, just a focused stack */}
        <SignInColumn
          authState={authState}
          onSuccess={handleSuccess}
          onError={handleError}
        />
      </main>
    </div>
  )
}

// ── QuizTease ──────────────────────────────────────────────────────────────
// Live sample question to make the login feel like the room next door, not a wall.
// Picking an option just highlights it (correct = accent, wrong = quiet red) and
// reveals a tiny hint that drops users into the funnel: "this is the kind of
// thing you'll see inside."

function QuizTease({
  sample,
  picked,
  onPick,
  stats,
}: {
  sample: SampleQuestion
  picked: string | null
  onPick: (option: string) => void
  stats: PublicStats | null
}) {
  const revealed = picked !== null
  return (
    <div className="max-w-xl">
      {/* Eyebrow + headline */}
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT_QUART }}
        className="text-[11px] uppercase tracking-[0.2em] font-semibold mb-4"
        style={{ fontFamily: 'var(--font-space)', color: c.brand }}
      >
        <Sparkles size={11} className="inline mr-1.5 -mt-0.5" />
        A taste of what's inside
      </motion.p>

      <motion.h1
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT_QUART, delay: 0.05 }}
        className="font-bold text-3xl md:text-4xl lg:text-5xl leading-[1.05] tracking-tight mb-6"
        style={{ fontFamily: 'var(--font-space)', color: c.text }}
      >
        Pick the answer.
        <br />
        <span style={{ color: c.brand }}>See what playing feels like.</span>
      </motion.h1>

      {/* The question card. NOT decorative; a real interactive surface. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE_OUT_QUART, delay: 0.1 }}
        className="rounded-2xl p-5 md:p-6"
        style={{
          background: c.card,
          border: `1px solid ${c.border}`,
          boxShadow: `0 24px 60px ${c.bg}aa, 0 0 0 1px ${c.brand}08 inset`,
        }}
      >
        <p
          className="text-base md:text-lg font-medium leading-snug mb-4"
          style={{ fontFamily: 'var(--font-space)', color: c.text }}
        >
          {sample.content}
        </p>

        <div className="grid gap-2">
          {sample.options.slice(0, 4).map((opt, i) => {
            const isPicked = picked === opt
            const isCorrect = opt === sample.correct_answer
            const showAsCorrect = revealed && isCorrect
            const showAsWrong = revealed && isPicked && !isCorrect

            const bg = showAsCorrect
              ? `${c.accent}18`
              : showAsWrong
              ? 'oklch(28% 0.06 25)'
              : c.surface
            const border = showAsCorrect
              ? c.accent
              : showAsWrong
              ? 'oklch(60% 0.18 25)'
              : c.border
            const color = revealed && (showAsCorrect || showAsWrong) ? c.text : c.muted

            return (
              <button
                key={i}
                onClick={() => !revealed && onPick(opt)}
                disabled={revealed}
                className="text-left text-sm md:text-[15px] font-medium px-4 py-3 rounded-xl flex items-center gap-3 cursor-pointer disabled:cursor-default"
                style={{
                  fontFamily: 'var(--font-space)',
                  background: bg,
                  border: `1px solid ${border}`,
                  color,
                  transition:
                    'background 200ms cubic-bezier(0.16,1,0.3,1), border-color 200ms cubic-bezier(0.16,1,0.3,1), color 200ms cubic-bezier(0.16,1,0.3,1)',
                }}
                aria-pressed={isPicked}
              >
                <span
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold flex-shrink-0"
                  style={{
                    background:
                      showAsCorrect
                        ? c.accent
                        : showAsWrong
                        ? 'oklch(60% 0.18 25)'
                        : c.bg,
                    color: showAsCorrect || showAsWrong ? c.bg : c.muted,
                    border: showAsCorrect || showAsWrong ? 'none' : `1px solid ${c.border}`,
                  }}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{opt}</span>
              </button>
            )
          })}
        </div>

        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: EASE_OUT_QUART }}
              className="overflow-hidden"
            >
              <div
                className="mt-4 pt-4 text-sm leading-relaxed"
                style={{
                  fontFamily: 'var(--font-space)',
                  color: c.muted,
                  borderTop: `1px solid ${c.border}`,
                }}
              >
                {picked === sample.correct_answer ? (
                  <span>
                    <span style={{ color: c.accent, fontWeight: 600 }}>Correct.</span>{' '}
                    Inside, every right answer earns XP, builds a streak, and unlocks badges.
                  </span>
                ) : (
                  <span>
                    Not quite. The answer is{' '}
                    <span style={{ color: c.accent, fontWeight: 600 }}>
                      {sample.correct_answer}
                    </span>
                    . Inside, every wrong answer shows you exactly which paragraph it came from.
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Live signal: people studying right now */}
      {stats && stats.active_learners > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-5 text-xs"
          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle"
            style={{ background: c.accent, boxShadow: `0 0 6px ${c.accent}` }}
          />
          {stats.active_learners.toLocaleString()} learners active in the last 30 days
        </motion.p>
      )}
    </div>
  )
}

// ── SignInColumn ───────────────────────────────────────────────────────────
// No card. Just the logo, a one-line promise, the Google button, and the
// state-aware footer (loading / error / trust signals).

function SignInColumn({
  authState,
  onSuccess,
  onError,
}: {
  authState: AuthState
  onSuccess: (response: { credential?: string }) => void
  onError: () => void
}) {
  const isPending = authState.status === 'pending'
  const errorMessage = authState.status === 'error' ? authState.message : null

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT_QUART, delay: 0.15 }}
      className="w-full max-w-sm flex flex-col"
      aria-busy={isPending}
    >
      {/* Logo: real kino.svg, sized big enough to feel intentional */}
      <div className="flex items-center gap-3 mb-10">
        <img
          src="/kino.svg"
          alt=""
          aria-hidden="true"
          className="w-12 h-12"
          style={{ filter: `drop-shadow(0 0 16px ${c.brand}66)` }}
        />
        <span
          className="font-extrabold text-2xl tracking-tight"
          style={{ fontFamily: 'var(--font-space)', color: c.text }}
        >
          KINO
        </span>
      </div>

      {/* Heading: short, no restated subtitle */}
      <h2
        className="font-bold text-3xl md:text-[34px] leading-[1.05] mb-3"
        style={{ fontFamily: 'var(--font-space)', color: c.text }}
      >
        Step inside.
      </h2>
      <p
        className="text-base mb-10"
        style={{ fontFamily: 'var(--font-space)', color: c.muted }}
      >
        One click in. No passwords, ever.
      </p>

      {/* Google button + pending overlay live in a positioned wrapper */}
      <div className="relative">
        <div
          className={isPending ? 'opacity-30 pointer-events-none' : ''}
          style={{ transition: 'opacity 200ms ease-out' }}
        >
          <GoogleLogin
            onSuccess={onSuccess}
            onError={onError}
            theme="filled_black"
            shape="pill"
            size="large"
            text="continue_with"
            width="320"
          />
        </div>

        <AnimatePresence>
          {isPending && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex items-center gap-3"
              role="status"
              aria-live="polite"
            >
              <Loader2
                size={18}
                className="animate-spin"
                style={{ color: c.brand }}
              />
              <span
                className="text-sm font-medium"
                style={{ fontFamily: 'var(--font-space)', color: c.text }}
              >
                Signing you in...
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error block, sits inline below the button — never silent */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT_QUART }}
            className="mt-4 overflow-hidden"
            role="alert"
          >
            <div
              className="flex items-start gap-2.5 rounded-lg px-3.5 py-3"
              style={{
                background: 'oklch(22% 0.05 25)',
                border: '1px solid oklch(40% 0.12 25)',
              }}
            >
              <AlertCircle
                size={15}
                className="mt-0.5 flex-shrink-0"
                style={{ color: 'oklch(72% 0.18 25)' }}
              />
              <p
                className="text-[13px] leading-snug"
                style={{ fontFamily: 'var(--font-space)', color: 'oklch(85% 0.04 25)' }}
              >
                {errorMessage}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trust signals + legal: subtle, single row */}
      <div
        className="mt-10 pt-7 flex items-center gap-6 flex-wrap"
        style={{ borderTop: `1px solid ${c.border}` }}
      >
        <span
          className="inline-flex items-center gap-2 text-[13px]"
          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
        >
          <Shield size={13} style={{ color: c.muted }} />
          Private by default
        </span>
        <span
          className="inline-flex items-center gap-2 text-[13px]"
          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
        >
          <Sparkles size={13} style={{ color: c.muted }} />
          Free, always
        </span>
      </div>

      <p
        className="mt-5 text-[12px] leading-relaxed"
        style={{ fontFamily: 'var(--font-space)', color: c.muted }}
      >
        By continuing, you agree to our{' '}
        <Link
          to="/terms"
          className="underline hover:opacity-100"
          style={{ color: c.text, textUnderlineOffset: '2px' }}
        >
          Terms
        </Link>{' '}
        and{' '}
        <Link
          to="/privacy"
          className="underline hover:opacity-100"
          style={{ color: c.text, textUnderlineOffset: '2px' }}
        >
          Privacy Policy
        </Link>
        .
      </p>
    </motion.aside>
  )
}
