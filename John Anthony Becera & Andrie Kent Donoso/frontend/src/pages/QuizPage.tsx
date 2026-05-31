import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, ArrowRight, CheckCircle2, HelpCircle, Meh, ThumbsUp, XCircle, Lightbulb, Clock, Flame } from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'

interface Question {
  id: string
  type: string
  content: string
  options: string[]
  order_index: number
}

interface Quiz {
  id: string
  title: string
  question_count: number
  questions: Question[]
}

type Confidence = 'guessing' | 'somewhat' | 'very_sure'

const confidenceOptions: { value: Confidence; label: string; icon: typeof HelpCircle; color: string }[] = [
  { value: 'guessing', label: 'Guessing', icon: HelpCircle, color: 'oklch(65% 0.15 25)' },
  { value: 'somewhat', label: 'Somewhat sure', icon: Meh, color: c.brand },
  { value: 'very_sure', label: 'Very sure', icon: ThumbsUp, color: c.accent },
]

function QuizContent() {
  const { quizId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const quizConfig = (location.state as any) || {}
  const isExplainMode = quizConfig.mode === 'explain_learn'
  const hasTimer = quizConfig.time_pressure === true
  const timePerQuestion = quizConfig.time_per_question || 30

  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, { answer: string; confidence: Confidence }>>({})
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [selectedConfidence, setSelectedConfidence] = useState<Confidence | null>(null)
  const [showConfidence, setShowConfidence] = useState(false)
  const [showExplanation, setShowExplanation] = useState(false)
  const [currentExplanation, setCurrentExplanation] = useState<{ correct: string; explanation: string; isCorrect: boolean } | null>(null)
  const [streak, setStreak] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState(timePerQuestion)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const endpoint = isExplainMode ? `/quizzes/${quizId}?include_answers=true` : `/quizzes/${quizId}`
        const res = await api.get(endpoint)
        setQuiz(res.data)
      } catch {
        navigate('/dashboard')
      } finally {
        setIsLoading(false)
      }
    }
    fetchQuiz()
  }, [quizId, navigate, isExplainMode])

  // Timer logic
  useEffect(() => {
    if (!hasTimer || showExplanation) return
    setTimeLeft(timePerQuestion)

    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev: number) => {
        if (prev <= 1) {
          // Time's up: auto-submit with "guessing" confidence if no answer selected
          if (timerRef.current) clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [currentIndex, hasTimer, timePerQuestion, showExplanation])

  // Auto-advance when timer hits 0
  useEffect(() => {
    if (!hasTimer || timeLeft > 0 || showExplanation || !quiz) return
    const currentQuestion = quiz.questions[currentIndex]
    if (!currentQuestion) return

    // Force answer with empty string (will be marked wrong since it won't match correct_answer)
    const forcedAnswer = selectedOption || '__TIME_EXPIRED__'
    const newAnswers = {
      ...answers,
      [currentQuestion.id]: { answer: forcedAnswer, confidence: 'guessing' as Confidence },
    }
    setAnswers(newAnswers)

    if (currentIndex === quiz.questions.length - 1) {
      handleSubmit(newAnswers)
    } else {
      setCurrentIndex((prev) => prev + 1)
      setSelectedOption(null)
      setSelectedConfidence(null)
      setShowConfidence(false)
    }
  }, [timeLeft])

  if (isLoading || !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: c.bg }}>
        <Loader2 size={32} className="animate-spin" style={{ color: c.brand }} />
      </div>
    )
  }

  const currentQuestion = quiz.questions[currentIndex]
  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: c.bg }}>
        <p className="text-base font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          No questions available for this quiz.
        </p>
        <button onClick={() => navigate('/dashboard')} className="text-sm font-semibold px-5 py-2.5 rounded-lg cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
          Back to dashboard
        </button>
      </div>
    )
  }
  const isLastQuestion = currentIndex === quiz.questions.length - 1
  const progress = ((currentIndex + 1) / quiz.questions.length) * 100
  const timerProgress = hasTimer ? (timeLeft / timePerQuestion) * 100 : 100
  const timerUrgent = hasTimer && timeLeft <= 5
  const timerColor = timerUrgent ? 'oklch(65% 0.2 25)' : c.brand

  const handleSelectOption = (option: string) => {
    if (showExplanation) return
    setSelectedOption(option)
    setShowConfidence(true)
  }

  const handleConfirmAnswer = () => {
    if (!selectedOption || !currentQuestion) return
    if (timerRef.current) clearInterval(timerRef.current)

    const newAnswers = {
      ...answers,
      [currentQuestion.id]: { answer: selectedOption, confidence: (selectedConfidence ?? 'guessing') as Confidence },
    }
    setAnswers(newAnswers)

    if (isExplainMode && (currentQuestion as any).correct_answer) {
      const isCorrect = selectedOption === (currentQuestion as any).correct_answer
      setCurrentExplanation({
        correct: (currentQuestion as any).correct_answer,
        explanation: (currentQuestion as any).explanation || '',
        isCorrect,
      })
      setShowExplanation(true)
      if (isCorrect) setStreak((prev) => prev + 1)
      else setStreak(0)
      return
    }

    if (isLastQuestion) {
      handleSubmit(newAnswers)
    } else {
      setCurrentIndex((prev) => prev + 1)
      setSelectedOption(null)
      setSelectedConfidence(null)
      setShowConfidence(false)
      setStreak((prev) => prev + 1)
    }
  }

  const handleContinueAfterExplanation = () => {
    setShowExplanation(false)
    setCurrentExplanation(null)

    if (isLastQuestion) {
      handleSubmit(answers)
    } else {
      setCurrentIndex((prev) => prev + 1)
      setSelectedOption(null)
      setSelectedConfidence(null)
      setShowConfidence(false)
    }
  }

  const handleSubmit = async (finalAnswers: Record<string, { answer: string; confidence: Confidence }>) => {
    if (isSubmitting) return // Guard against double-submit
    setIsSubmitting(true)
    try {
      const res = await api.post(`/quizzes/${quizId}/submit`, {
        answers: Object.entries(finalAnswers).map(([question_id, data]) => ({
          question_id,
          user_answer: data.answer,
          confidence: data.confidence,
          time_taken: null,
        })),
      })
      navigate(`/results/${res.data.attempt_id}`, { state: { ...res.data, classroomId: quizConfig.classroomId } })
    } catch (err) {
      console.error('Quiz submit failed:', err)
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: c.bg }}>
      {/* Top bar */}
      <div className="px-4 md:px-8 py-4 flex items-center justify-between" style={{ background: c.surface, borderBottom: `1px solid ${c.border}` }}>
        <span className="text-sm font-medium truncate max-w-[200px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          {quiz.title}
        </span>
        <div className="flex items-center gap-5">
          {/* Timer */}
          {hasTimer && (
            <motion.div
              animate={timerUrgent ? { scale: [1, 1.15, 1] } : {}}
              transition={timerUrgent ? { duration: 0.6, repeat: Infinity } : {}}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
              style={{ background: timerUrgent ? 'oklch(25% 0.06 25)' : 'transparent' }}
            >
              <motion.div
                animate={timerUrgent ? { rotate: [0, 10, -10, 0] } : {}}
                transition={timerUrgent ? { duration: 0.3, repeat: Infinity } : {}}
              >
                <Clock size={14} style={{ color: timerColor }} />
              </motion.div>
              <span className="text-sm font-bold tabular-nums" style={{ fontFamily: 'var(--font-space)', color: timerColor }}>
                {timeLeft}s
              </span>
            </motion.div>
          )}
          {/* Streak */}
          <div className="flex items-center gap-1.5">
            <Flame size={14} style={{ color: streak > 0 ? c.brand : c.muted }} />
            <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: streak > 0 ? c.brand : c.muted }}>
              {streak}
            </span>
          </div>
          {/* Progress counter */}
          <span className="text-sm font-medium tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            {currentIndex + 1}<span style={{ color: c.muted }}>/{quiz.questions.length}</span>
          </span>
        </div>
      </div>

      {/* Progress bar (combines page progress + timer) */}
      <div className="w-full h-1.5 relative" style={{ background: c.border }}>
        {/* Page progress (background) */}
        <motion.div
          className="absolute inset-y-0 left-0"
          style={{ background: `${c.brand}30` }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
        {/* Timer progress (foreground, continuous shrink with CSS transition) */}
        {hasTimer && (
          <div
            className="absolute inset-y-0 left-0 transition-none"
            style={{
              background: timerColor,
              width: `${timerProgress}%`,
              transition: `width ${timeLeft > 0 ? '1s' : '0s'} linear`,
            }}
          />
        )}
        {!hasTimer && (
          <motion.div
            className="absolute inset-y-0 left-0"
            style={{ background: c.brand }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        )}
      </div>

      {/* Urgent overlay: red vignette + screen shake when ≤5s */}
      <AnimatePresence>
        {timerUrgent && hasTimer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 pointer-events-none z-40"
            style={{ boxShadow: 'inset 0 0 120px 40px oklch(40% 0.2 25 / 0.15)' }}
          />
        )}
      </AnimatePresence>

      {/* Question area */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        <motion.div
          className="w-full max-w-xl"
          animate={timerUrgent && hasTimer ? { x: [0, -2, 2, -1, 1, 0] } : { x: 0 }}
          transition={timerUrgent ? { duration: 0.4, repeat: Infinity, repeatDelay: 0.6 } : {}}
        >
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Question number badge */}
            <div className="flex items-center gap-3 mb-5">
              <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md" style={{ fontFamily: 'var(--font-space)', color: c.brand, background: `${c.brand}12` }}>
                Question {currentIndex + 1}
              </span>
              {isExplainMode && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-space)', color: c.accent, background: `${c.accent}12` }}>
                  Learn mode
                </span>
              )}
            </div>

            {/* Question text */}
            <h2 className="font-bold text-2xl md:text-3xl mb-8 leading-snug" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {currentQuestion.content}
            </h2>

            {/* Options */}
            <div className="space-y-3">
              {currentQuestion.options.map((option, i) => {
                const isSelected = selectedOption === option
                return (
                  <motion.button
                    key={option}
                    whileHover={!showExplanation ? { scale: 1.01, x: 4 } : {}}
                    whileTap={!showExplanation ? { scale: 0.99 } : {}}
                    onClick={() => handleSelectOption(option)}
                    disabled={showExplanation}
                    className="w-full text-left rounded-xl px-5 py-4 text-base font-medium cursor-pointer transition-colors disabled:cursor-default"
                    style={{
                      fontFamily: 'var(--font-space)',
                      background: isSelected ? `${c.brand}15` : c.card,
                      border: isSelected ? `2px solid ${c.brand}` : `1px solid ${c.border}`,
                      color: isSelected ? c.text : c.muted,
                    }}
                  >
                    <span className="font-bold mr-3 text-lg" style={{ color: isSelected ? c.brand : c.muted }}>
                      {String.fromCharCode(65 + i)}.
                    </span>
                    {option.replace(/^[A-D]\.\s*/, '')}
                  </motion.button>
                )
              })}
            </div>

            {/* Next button */}
            {!showExplanation && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleConfirmAnswer}
                disabled={!selectedOption || isSubmitting}
                className="mt-6 w-full flex items-center justify-center gap-2 font-bold text-base py-4 rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 16px ${c.brand}33` }}
              >
                {isSubmitting ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : isLastQuestion ? (
                  <>
                    <CheckCircle2 size={18} />
                    Submit quiz
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight size={18} />
                  </>
                )}
              </motion.button>
            )}

            {/* Confidence rating (optional, below Next button) */}
            <AnimatePresence>
              {showConfidence && selectedOption && !showExplanation && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="mt-4"
                >
                  <p className="text-xs font-medium mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    Confidence (optional)
                  </p>
                  <div className="flex gap-1.5">
                    {confidenceOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setSelectedConfidence(selectedConfidence === opt.value ? null : opt.value)}
                        className="flex-1 flex items-center justify-center gap-1 py-2 md:py-3 rounded-lg text-[11px] md:text-sm font-medium cursor-pointer transition-all"
                        style={{
                          fontFamily: 'var(--font-space)',
                          background: selectedConfidence === opt.value ? `${opt.color}18` : c.card,
                          border: selectedConfidence === opt.value ? `1.5px solid ${opt.color}` : `1px solid ${c.border}`,
                          color: selectedConfidence === opt.value ? opt.color : c.muted,
                        }}
                      >
                        <opt.icon size={12} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Explain & Learn: explanation panel */}
            <AnimatePresence>
              {showExplanation && currentExplanation && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="mt-6 rounded-2xl p-6"
                  style={{ background: c.surface, border: `1px solid ${c.border}` }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    {currentExplanation.isCorrect ? (
                      <>
                        <CheckCircle2 size={20} style={{ color: c.accent }} />
                        <span className="font-bold text-base" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>Correct!</span>
                      </>
                    ) : (
                      <>
                        <XCircle size={20} style={{ color: 'oklch(65% 0.18 25)' }} />
                        <span className="font-bold text-base" style={{ fontFamily: 'var(--font-space)', color: 'oklch(65% 0.18 25)' }}>Incorrect</span>
                      </>
                    )}
                  </div>

                  {!currentExplanation.isCorrect && (
                    <div className="rounded-xl px-4 py-3 mb-4" style={{ background: `${c.accent}08`, border: `1px solid ${c.accent}20` }}>
                      <span className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>Correct answer</span>
                      <span className="text-base font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{currentExplanation.correct}</span>
                    </div>
                  )}

                  {currentExplanation.explanation && (
                    <div className="flex items-start gap-2.5 mb-5">
                      <Lightbulb size={16} className="mt-0.5 flex-shrink-0" style={{ color: c.brand }} />
                      <p className="text-sm leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                        {currentExplanation.explanation}
                      </p>
                    </div>
                  )}

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleContinueAfterExplanation}
                    className="w-full flex items-center justify-center gap-2 font-bold text-base py-4 rounded-xl cursor-pointer"
                    style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 16px ${c.brand}33` }}
                  >
                    {isLastQuestion ? 'See results' : 'Next question'}
                    <ArrowRight size={16} />
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

export default function QuizPage() {
  return (
    <RequireAuth>
      <QuizContent />
    </RequireAuth>
  )
}
