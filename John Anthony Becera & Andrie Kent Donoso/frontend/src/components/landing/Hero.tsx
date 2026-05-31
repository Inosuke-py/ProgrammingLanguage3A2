import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, X as XIcon, Target } from 'lucide-react'
import { theme as c } from '../../theme'
import api from '../../lib/api'
import { markExplorerLanding } from '../../lib/explorer'
import MouseGlow from './MouseGlow'
import FloatingParticles from './FloatingParticles'

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

const FALLBACK_QUESTIONS: SampleQuestion[] = [
  { content: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body'], correct_answer: 'Mitochondria' },
  { content: 'Which planet is closest to the sun?', options: ['Venus', 'Earth', 'Mercury', 'Mars'], correct_answer: 'Mercury' },
  { content: 'What is the chemical symbol for gold?', options: ['Go', 'Gd', 'Au', 'Ag'], correct_answer: 'Au' },
]

function AnimatedCounter({ target, label }: { target: number; label: string }) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!target) return
    let frame: number
    const duration = 2000
    const start = performance.now()
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setCount(Math.floor(eased * target))
      if (progress < 1) frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return (
    <div className="text-center">
      <div className="font-bold text-xl md:text-4xl tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{count.toLocaleString()}+</div>
      <div className="text-[10px] md:text-xs mt-1 uppercase tracking-wider leading-tight" style={{ color: c.muted }}>{label}</div>
    </div>
  )
}

export default function Hero() {
  const [stats, setStats] = useState<PublicStats>({ total_questions: 0, total_sessions: 0, active_learners: 0 })
  const [questions, setQuestions] = useState<SampleQuestion[]>(FALLBACK_QUESTIONS)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [showFeedback, setShowFeedback] = useState(false)
  const [streak, setStreak] = useState(0)
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    api.get('/public/stats').then((res) => setStats(res.data)).catch(() => {})
    // Cache-bust on every mount so refreshes always serve a fresh question set.
    api
      .get(`/public/sample-quiz?count=10&_t=${Date.now()}`)
      .then((res) => {
        if (res.data.questions?.length) setQuestions(res.data.questions)
      })
      .catch(() => {})
  }, [])

  const currentQuestion = questions[currentIndex]
  const total = questions.length
  const progress = ((currentIndex + (showFeedback ? 1 : 0)) / total) * 100

  const handleSelect = (option: string) => {
    if (showFeedback) return
    setSelectedOption(option)
  }

  const handleNext = () => {
    if (!selectedOption) return

    if (!showFeedback) {
      // First click of Next: show feedback
      const isCorrect = selectedOption === currentQuestion.correct_answer
      if (isCorrect) {
        setStreak((s) => s + 1)
      } else {
        setStreak(0)
      }
      setShowFeedback(true)
    } else {
      // Second click: advance
      if (currentIndex + 1 >= total) {
        setCompleted(true)
        // Quietly mark that this browser finished the landing demo. Half of
        // the breadcrumb trail for a secret badge that drops at sign-in.
        markExplorerLanding()
      } else {
        setCurrentIndex(currentIndex + 1)
        setSelectedOption(null)
        setShowFeedback(false)
      }
    }
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setSelectedOption(null)
    setShowFeedback(false)
    setStreak(0)
    setCompleted(false)
  }

  const isCorrect = selectedOption === currentQuestion?.correct_answer

  return (
    <section className="relative pt-24 pb-32 px-6 overflow-hidden" style={{ background: c.bg }}>
      {/* Reactive grid glow follows cursor */}
      <MouseGlow mode="grid" />

      {/* Floating particles */}
      <FloatingParticles />

      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `linear-gradient(${c.text} 1px, transparent 1px), linear-gradient(90deg, ${c.text} 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-24 items-start">
          {/* ─── Left column: text + CTA + stats ─── */}
          <div className="lg:pt-8">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="text-center lg:text-left"
            >
              <h1 className="font-extrabold text-5xl md:text-6xl lg:text-7xl leading-[0.95] tracking-tight mb-6" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                Level up your
                <br />
                <span style={{ color: c.brand }}>study game.</span>
              </h1>

              <p className="text-lg md:text-xl max-w-xl mx-auto lg:mx-0 leading-relaxed mb-10" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Upload your study materials. Get quizzes with streaks, XP, and explanations. Free forever, right in your browser.
              </p>

              <div className="flex flex-col sm:flex-row items-center lg:items-start justify-center lg:justify-start gap-4">
                <Link to="/login">
                  <motion.span
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-block font-semibold text-base px-8 py-4 rounded-xl cursor-pointer relative overflow-hidden"
                    style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 30px ${c.brand}44` }}
                  >
                    Start playing →
                  </motion.span>
                </Link>
                <span className="text-sm" style={{ color: c.muted, fontFamily: 'var(--font-space)' }}>Sign up with Google to get started</span>
              </div>
            </motion.div>

            {/* Live stats bar (real DB numbers) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.6 }}
              whileHover={{ y: -2, boxShadow: `0 8px 30px ${c.brand}10` }}
              className="mt-10 rounded-2xl p-4 md:p-6 flex flex-row items-center justify-around gap-2 md:gap-6 cursor-default"
              style={{ background: c.surface, border: `1px solid ${c.border}` }}
            >
              <AnimatedCounter target={stats.total_questions} label="Questions generated" />
              <div className="w-px h-10" style={{ background: c.border }} />
              <AnimatedCounter target={stats.total_sessions} label="Study sessions" />
              <div className="w-px h-10" style={{ background: c.border }} />
              <AnimatedCounter target={stats.active_learners} label="Active learners" />
            </motion.div>
          </div>
          {/* ─── End left column ─── */}

          {/* ─── Right column: interactive quiz demo ─── */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8 }}
            className="w-full max-w-xl mx-auto lg:mx-0"
          >
            <div className="rounded-2xl p-6 md:p-8 relative" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            {completed ? (
              /* Completion screen */
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: `${c.brand}15`, border: `2px solid ${c.brand}` }}
                >
                  <Target size={28} style={{ color: c.brand }} strokeWidth={2.4} />
                </motion.div>
                <h3 className="font-bold text-2xl mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Demo complete</h3>
                <p className="text-sm mb-6" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Final streak: <span style={{ color: c.brand, fontWeight: 700 }}>×{streak}</span>. Ready for the real thing?
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link to="/login">
                    <motion.span
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      className="inline-block font-semibold text-sm px-6 py-3 rounded-xl cursor-pointer"
                      style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 20px ${c.brand}33` }}
                    >
                      Sign up to play
                    </motion.span>
                  </Link>
                  <button
                    onClick={handleRestart}
                    className="text-sm font-medium px-5 py-3 rounded-xl cursor-pointer"
                    style={{ fontFamily: 'var(--font-space)', background: c.surface, color: c.text, border: `1px solid ${c.border}` }}
                  >
                    Try again
                  </button>
                </div>
              </motion.div>
            ) : currentQuestion ? (
              <>
                {/* Header: progress + streak */}
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    Question {currentIndex + 1} / {total}
                  </span>
                  <motion.span
                    key={streak}
                    initial={{ scale: streak > 0 ? 1.3 : 1 }}
                    animate={{ scale: 1 }}
                    className="text-xs font-bold flex items-center gap-1"
                    style={{ fontFamily: 'var(--font-space)', color: streak > 0 ? c.brand : c.muted }}
                  >
                    <span>×{streak}</span>
                    <span className="text-[10px] uppercase tracking-wider opacity-70">streak</span>
                  </motion.span>
                </div>

                {/* Progress bar */}
                <div className="h-1 rounded-full mb-6 overflow-hidden" style={{ background: c.border }}>
                  <motion.div
                    className="h-full"
                    style={{ background: c.brand }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>

                {/* Question */}
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.3 }}
                    className="text-base md:text-lg font-medium mb-5 leading-relaxed"
                    style={{ fontFamily: 'var(--font-space)', color: c.text }}
                  >
                    {currentQuestion.content}
                  </motion.p>
                </AnimatePresence>

                {/* Options */}
                <div className="space-y-2">
                  {currentQuestion.options.map((opt, i) => {
                    const cleanOpt = opt.replace(/^[A-D]\.\s*/, '')
                    const cleanCorrect = currentQuestion.correct_answer.replace(/^[A-D]\.\s*/, '')
                    const isSelected = selectedOption === opt
                    const isCorrectOption = cleanOpt === cleanCorrect

                    let bg: string = c.surface
                    let border: string = c.border
                    let color: string = c.muted
                    let weight: number = 400

                    if (showFeedback) {
                      if (isCorrectOption) {
                        bg = `${c.accent}15`
                        border = c.accent
                        color = c.text
                        weight = 600
                      } else if (isSelected) {
                        bg = 'oklch(25% 0.05 25)'
                        border = 'oklch(60% 0.18 25)'
                        color = c.text
                        weight = 600
                      }
                    } else if (isSelected) {
                      bg = `${c.brand}15`
                      border = c.brand
                      color = c.text
                      weight = 600
                    }

                    return (
                      <motion.button
                        key={`${currentIndex}-${i}`}
                        whileHover={!showFeedback ? { scale: 1.01, x: 4 } : {}}
                        whileTap={!showFeedback ? { scale: 0.99 } : {}}
                        onClick={() => handleSelect(opt)}
                        disabled={showFeedback}
                        className="w-full text-left rounded-xl px-5 py-3.5 text-sm md:text-base flex items-center gap-3 cursor-pointer disabled:cursor-default transition-colors"
                        style={{
                          fontFamily: 'var(--font-space)',
                          background: bg,
                          border: `1.5px solid ${border}`,
                          color,
                          fontWeight: weight,
                        }}
                      >
                        <span className="font-bold" style={{ color: showFeedback && isCorrectOption ? c.accent : isSelected ? c.brand : c.muted }}>
                          {String.fromCharCode(65 + i)}.
                        </span>
                        <span className="flex-1">{cleanOpt}</span>
                        {showFeedback && isCorrectOption && <Check size={16} style={{ color: c.accent }} />}
                        {showFeedback && isSelected && !isCorrectOption && <XIcon size={16} style={{ color: 'oklch(65% 0.18 25)' }} />}
                      </motion.button>
                    )
                  })}
                </div>

                {/* Feedback message */}
                <AnimatePresence>
                  {showFeedback && (
                    <motion.p
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-4 text-sm text-center font-medium"
                      style={{ fontFamily: 'var(--font-space)', color: isCorrect ? c.accent : 'oklch(70% 0.15 25)' }}
                    >
                      {isCorrect ? 'Nice — streak continues' : 'Not quite. Streak reset.'}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Next button */}
                <motion.button
                  whileHover={selectedOption ? { scale: 1.01 } : {}}
                  whileTap={selectedOption ? { scale: 0.98 } : {}}
                  onClick={handleNext}
                  disabled={!selectedOption}
                  className="mt-6 w-full flex items-center justify-center gap-2 font-bold text-sm py-3.5 rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: selectedOption ? `0 0 16px ${c.brand}33` : 'none' }}
                >
                  {!showFeedback ? 'Check answer' : currentIndex + 1 >= total ? 'Finish' : 'Next →'}
                </motion.button>
              </>
            ) : null}
            </div>
          </motion.div>
          {/* ─── End right column ─── */}
        </div>
      </div>
    </section>
  )
}
