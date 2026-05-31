import { useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, XCircle, BookOpen, ArrowLeft, Trophy, Flame, Zap, Star, Lightbulb, Loader2, Crown, TrendingUp, Dumbbell, BookMarked } from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'
import { useBadgeUnlock } from '../lib/badge-context'

interface QuestionResult {
  question_id: string
  content: string
  user_answer: string
  correct_answer: string
  is_correct: boolean
  explanation: string
  source_text: string
}

interface ResultsData {
  attempt_id: string
  score: number
  correct_count: number
  total_questions: number
  xp_earned: number
  material_id?: string
  is_classroom_quiz?: boolean
  classroomId?: string
  classroom_id?: string
  badges_earned?: { key: string; name: string; description: string; icon: string; rarity: string }[]
  results: QuestionResult[]
}

function getScoreMessage(score: number): { title: string; subtitle: string; icon: typeof Crown; iconColor: string } {
  if (score >= 90) return { title: 'Legendary run', subtitle: 'You crushed it. Almost flawless.', icon: Crown, iconColor: 'oklch(75% 0.18 65)' }
  if (score >= 70) return { title: 'Solid performance', subtitle: 'You know your stuff. A few gaps to close.', icon: TrendingUp, iconColor: 'oklch(70% 0.16 160)' }
  if (score >= 50) return { title: 'Getting there', subtitle: 'Good foundation. Review the misses below.', icon: Dumbbell, iconColor: 'oklch(75% 0.18 65)' }
  return { title: 'Room to grow', subtitle: 'Check the explanations below. You\'ll nail it next time.', icon: BookMarked, iconColor: 'oklch(65% 0.14 280)' }
}

function ExplanationBlock({ questionId, explanation }: { questionId: string; explanation: string }) {
  const [simpleExplanation, setSimpleExplanation] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleELI12 = async () => {
    if (simpleExplanation) return // already loaded
    setIsLoading(true)
    try {
      const res = await api.post('/explain/eli12', { question_id: questionId })
      setSimpleExplanation(res.data.simple_explanation)
    } catch {
      setSimpleExplanation('Could not generate a simpler explanation right now.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="ml-7 mb-3">
      <div className="rounded-lg px-4 py-3" style={{ background: c.surface }}>
        <p className="text-xs leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          {explanation}
        </p>
      </div>
      {!simpleExplanation && (
        <button
          onClick={handleELI12}
          disabled={isLoading}
          className="mt-2 flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 rounded-md cursor-pointer transition-colors hover:opacity-80 disabled:opacity-50"
          style={{ fontFamily: 'var(--font-space)', background: `${c.accent}12`, color: c.accent, border: `1px solid ${c.accent}25` }}
        >
          {isLoading ? <Loader2 size={11} className="animate-spin" /> : <Lightbulb size={11} />}
          Explain like I'm 12
        </button>
      )}
      {simpleExplanation && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 rounded-lg px-4 py-3"
          style={{ background: `${c.accent}08`, border: `1px solid ${c.accent}20` }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <Lightbulb size={11} style={{ color: c.accent }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>Simple explanation</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {simpleExplanation}
          </p>
        </motion.div>
      )}
    </div>
  )
}

function ResultsContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const data = location.state as ResultsData | null
  const { showBadgeUnlock } = useBadgeUnlock()

  // Trigger badge modal on mount if badges were earned (skip for classroom quizzes — revealed later by teacher)
  useEffect(() => {
    if (data?.badges_earned && data.badges_earned.length > 0 && !data.is_classroom_quiz) {
      showBadgeUnlock(data.badges_earned, data.xp_earned)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    navigate('/dashboard')
    return null
  }

  const { title, subtitle, icon: ScoreIcon, iconColor } = getScoreMessage(data.score)
  const scoreColor = data.score >= 80 ? c.accent : data.score >= 50 ? c.brand : 'oklch(65% 0.18 25)'
  const correctResults = data.results.filter((r) => r.is_correct)
  const wrongResults = data.results.filter((r) => !r.is_correct)

  return (
    <div className="min-h-screen" style={{ background: c.bg }}>
      {/* For classroom quizzes: simple submission confirmation (no scores shown) */}
      {data.is_classroom_quiz ? (
        <section className="relative overflow-hidden px-4 md:px-6 min-h-[80vh] flex items-center justify-center text-center" style={{ background: c.bg }}>
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
            <CheckCircle2 size={52} className="mx-auto mb-5" style={{ color: c.accent }} />
            <h1 className="font-bold text-3xl mb-3" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Quiz Submitted</h1>
            <p className="text-base max-w-md mx-auto mb-8" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Your answers have been recorded. Your teacher will reveal results when everyone has finished.
            </p>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                const cid = data.classroomId || data.classroom_id
                navigate(cid ? `/classrooms/${cid}` : '/dashboard')
              }}
              className="font-semibold text-sm px-8 py-3 rounded-xl cursor-pointer"
              style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
            >
              Back to Classroom
            </motion.button>
          </motion.div>
        </section>
      ) : (
      <>
      {/* Hero score section */}
      <section className="relative overflow-hidden px-4 md:px-6 pt-8 md:pt-12 pb-12 md:pb-16" style={{ background: c.surface }}>
        {/* Decorative background elements */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ backgroundImage: `radial-gradient(${c.brand} 1px, transparent 1px)`, backgroundSize: '24px 24px' }} />

        {/* Celebratory particles for high scores */}
        {data.score >= 70 && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  background: i % 3 === 0 ? c.brand : i % 3 === 1 ? c.accent : 'oklch(70% 0.15 300)',
                  left: `${10 + Math.random() * 80}%`,
                  top: '-5%',
                }}
                animate={{
                  y: [0, 600 + Math.random() * 400],
                  x: [0, (Math.random() - 0.5) * 100],
                  opacity: [1, 0],
                  rotate: [0, Math.random() * 360],
                }}
                transition={{
                  duration: 2.5 + Math.random() * 1.5,
                  delay: Math.random() * 1.5,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            ))}
          </div>
        )}

        <div className="relative max-w-5xl mx-auto">
          {/* Back button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-sm mb-8 cursor-pointer transition-colors hover:opacity-70"
            style={{ fontFamily: 'var(--font-space)', color: c.muted }}
          >
            <ArrowLeft size={14} />
            Dashboard
          </motion.button>

          <div className="grid md:grid-cols-2 gap-10 items-center">
            {/* Left: Score display */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Animated icon reaction */}
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.2, duration: 0.6, type: 'spring', stiffness: 200 }}
                className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: `${iconColor}15`, border: `2px solid ${iconColor}30`, boxShadow: `0 0 24px ${iconColor}20` }}
              >
                <ScoreIcon size={30} strokeWidth={2} style={{ color: iconColor }} />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="font-extrabold text-3xl md:text-4xl mb-2"
                style={{ fontFamily: 'var(--font-space)', color: c.text }}
              >
                {title}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-base mb-6"
                style={{ fontFamily: 'var(--font-space)', color: c.muted }}
              >
                {subtitle}
              </motion.p>

              {/* Score ring */}
              <div className="flex items-center gap-6">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke={c.border} strokeWidth="6" />
                    <motion.circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={scoreColor}
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - data.score / 100) }}
                      transition={{ delay: 0.3, duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="font-extrabold text-3xl"
                      style={{ fontFamily: 'var(--font-space)', color: scoreColor }}
                    >
                      {Math.round(data.score)}%
                    </motion.span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} style={{ color: c.accent }} />
                    <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                      {data.correct_count} correct
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle size={16} style={{ color: 'oklch(65% 0.18 25)' }} />
                    <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                      {data.total_questions - data.correct_count} missed
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right: Stats cards */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-2 gap-3"
            >
              {[
                { icon: Zap, label: 'XP Earned', value: `+${data.xp_earned}`, color: c.brand, glow: true },
                { icon: Trophy, label: 'Score', value: `${data.correct_count}/${data.total_questions}`, color: scoreColor, glow: false },
                { icon: Flame, label: 'Accuracy', value: `${Math.round(data.score)}%`, color: c.brand, glow: false },
                { icon: Star, label: 'Questions', value: `${data.total_questions}`, color: c.accent, glow: false },
              ].map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.1, duration: 0.4 }}
                  whileHover={{ y: -2 }}
                  className="rounded-xl p-4"
                  style={{
                    background: c.card,
                    border: `1px solid ${c.border}`,
                    boxShadow: stat.glow ? `0 0 20px ${c.brand}20` : 'none',
                  }}
                >
                  <stat.icon size={16} className="mb-2" style={{ color: stat.color }} />
                  <p className="font-bold text-lg" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{stat.value}</p>
                  <p className="text-[11px] uppercase tracking-wider" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Action buttons (in hero, immediately visible) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="flex items-center gap-3 mt-8"
          >
            {wrongResults.length > 0 && data.material_id && !data.is_classroom_quiz && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/review', { state: { material_id: data.material_id, results: data.results } })}
                className="font-semibold text-sm px-6 py-3 rounded-xl cursor-pointer"
                style={{ fontFamily: 'var(--font-space)', background: c.card, color: c.text, border: `1px solid ${c.border}` }}
              >
                Review mistakes
              </motion.button>
            )}
            {!data.is_classroom_quiz ? (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/dashboard')}
                className="font-semibold text-sm px-8 py-3 rounded-xl cursor-pointer"
                style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 20px ${c.brand}33` }}
              >
                Play again
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  const cid = data.classroomId || data.classroom_id
                  navigate(cid ? `/classrooms/${cid}` : '/dashboard')
                }}
                className="font-semibold text-sm px-8 py-3 rounded-xl cursor-pointer"
                style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 20px ${c.brand}33` }}
              >
                Back to Classroom
              </motion.button>
            )}
          </motion.div>
        </div>
      </section>

      {/* Results breakdown (hidden for classroom quizzes until teacher reveals) */}
      {!data.is_classroom_quiz && (
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Quick answer map */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="flex flex-wrap gap-1.5 mb-10"
        >
          {data.results.map((r, i) => (
            <div
              key={r.question_id}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold"
              style={{
                fontFamily: 'var(--font-space)',
                background: r.is_correct ? `${c.accent}18` : 'oklch(22% 0.03 25)',
                color: r.is_correct ? c.accent : 'oklch(65% 0.14 25)',
                border: `1px solid ${r.is_correct ? `${c.accent}33` : 'oklch(30% 0.03 25)'}`,
              }}
            >
              {i + 1}
            </div>
          ))}
        </motion.div>

        {/* Wrong answers first (learning priority) */}
        {wrongResults.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="mb-10"
          >
            <div className="flex items-center gap-2 mb-5">
              <BookOpen size={16} style={{ color: 'oklch(65% 0.18 25)' }} />
              <h2 className="font-bold text-base" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                Review these ({wrongResults.length})
              </h2>
            </div>

            <div className="space-y-3">
              {wrongResults.map((result, i) => {
                const questionNum = data.results.findIndex((r) => r.question_id === result.question_id) + 1
                return (
                <motion.div
                  key={result.question_id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + i * 0.06, duration: 0.3 }}
                  className="rounded-xl p-5"
                  style={{ background: c.card, border: `1px solid ${c.border}` }}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold" style={{ background: 'oklch(22% 0.03 25)', color: 'oklch(65% 0.14 25)' }}>
                      {questionNum}
                    </span>
                    <p className="font-medium text-sm leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                      {result.content}
                    </p>
                  </div>

                  <div className="ml-7 grid md:grid-cols-2 gap-2 mb-3">
                    <div className="rounded-lg px-3 py-2" style={{ background: 'oklch(20% 0.03 25)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ fontFamily: 'var(--font-space)', color: 'oklch(55% 0.1 25)' }}>Your answer</p>
                      <p className="text-xs font-medium" style={{ fontFamily: 'var(--font-space)', color: 'oklch(70% 0.14 25)' }}>{result.user_answer === '__TIME_EXPIRED__' ? 'Time expired (no answer)' : result.user_answer}</p>
                    </div>
                    <div className="rounded-lg px-3 py-2" style={{ background: `${c.accent}10` }}>
                      <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>Correct answer</p>
                      <p className="text-xs font-medium" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>{result.correct_answer}</p>
                    </div>
                  </div>

                  {result.explanation && (
                    <ExplanationBlock questionId={result.question_id} explanation={result.explanation} />
                  )}

                  {result.source_text && (
                    <div className="ml-7 flex items-start gap-2 rounded-lg px-4 py-3" style={{ background: `${c.brand}06`, border: `1px solid ${c.brand}15` }}>
                      <BookOpen size={12} className="mt-0.5 flex-shrink-0" style={{ color: c.brand }} />
                      <p className="text-xs leading-relaxed italic" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                        "{result.source_text}"
                      </p>
                    </div>
                  )}
                </motion.div>
                )
              })}
            </div>
          </motion.section>
        )}

        {/* Correct answers (collapsed, less visual weight) */}
        {correctResults.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-5">
              <CheckCircle2 size={16} style={{ color: c.accent }} />
              <h2 className="font-bold text-base" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                Nailed it ({correctResults.length})
              </h2>
            </div>

            <div className="space-y-2">
              {correctResults.map((result, i) => (
                <motion.div
                  key={result.question_id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 + i * 0.03, duration: 0.3 }}
                  className="rounded-lg px-4 py-3 flex items-center gap-3"
                  style={{ background: c.card, border: `1px solid ${c.border}` }}
                >
                  <CheckCircle2 size={14} className="flex-shrink-0" style={{ color: c.accent }} />
                  <p className="text-sm truncate" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    {result.content}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>
        )}

        {/* End of results */}
      </main>
      )}

      {/* Classroom quiz: show message that answers will be revealed later */}
      {data.is_classroom_quiz && (
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 text-center">
          <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            Your answers have been submitted. Your teacher will reveal the correct answers later.
          </p>
        </div>
      )}
      </>
      )}
    </div>
  )
}

export default function ResultsPage() {
  return (
    <RequireAuth>
      <ResultsContent />
    </RequireAuth>
  )
}
