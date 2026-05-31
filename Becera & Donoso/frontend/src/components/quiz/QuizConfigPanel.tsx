import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Play, Loader2, Zap, Brain, Clock, Target, Shuffle } from 'lucide-react'
import { theme as c } from '../../theme'
import { useEscapeClose } from '../../hooks/useEscapeClose'
import api from '../../lib/api'
import { BottomSheetModal } from '../BottomSheetModal'

interface QuizConfig {
  question_count: number
  difficulty: 'mixed' | 'easy' | 'medium' | 'hard'
  question_types: string[]
  time_pressure: boolean
  time_per_question: number
  focus_weak: boolean
  mode: 'standard' | 'explain_learn'
}

interface PoolStats {
  total: number
  easy: number
  medium: number
  hard: number
}

interface Props {
  materialId: string
  materialTitle: string
  onStart: (config: QuizConfig) => void
  onCancel: () => void
  isGenerating: boolean
}

const MIN_QUESTIONS_FOR_DIFFICULTY = 5

const difficulties = [
  { id: 'mixed', label: 'Mixed', icon: Shuffle },
  { id: 'easy', label: 'Easy', icon: Zap },
  { id: 'medium', label: 'Medium', icon: Target },
  { id: 'hard', label: 'Hard', icon: Brain },
]

export default function QuizConfigPanel({ materialId, materialTitle, onStart, onCancel, isGenerating }: Props) {
  useEscapeClose(true, onCancel)

  const [poolStats, setPoolStats] = useState<PoolStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)

  const [config, setConfig] = useState<QuizConfig>({
    question_count: 10,
    difficulty: 'mixed',
    question_types: ['mcq', 'true_false', 'fill_blank'],
    time_pressure: false,
    time_per_question: 30,
    focus_weak: false,
    mode: 'standard',
  })

  // Fetch pool stats when panel opens
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get(`/materials/${materialId}/pool-stats`)
        setPoolStats(res.data)
      } catch {
        setPoolStats({ total: 0, easy: 0, medium: 0, hard: 0 })
      } finally {
        setLoadingStats(false)
      }
    }
    fetchStats()
  }, [materialId])

  const isDifficultyAvailable = (id: string): boolean => {
    if (!poolStats) return false
    if (id === 'mixed') return poolStats.total >= MIN_QUESTIONS_FOR_DIFFICULTY
    return (poolStats[id as keyof Omit<PoolStats, 'total'>] || 0) >= MIN_QUESTIONS_FOR_DIFFICULTY
  }

  const getDifficultyCount = (id: string): number => {
    if (!poolStats) return 0
    if (id === 'mixed') return poolStats.total
    return poolStats[id as keyof Omit<PoolStats, 'total'>] || 0
  }

  return (
    <BottomSheetModal onClose={onCancel} maxWidth="max-w-lg">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h2 className="font-bold text-xl mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            Configure your quiz
          </h2>
          <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {materialTitle}
          </p>
        </div>

        {/* Question count */}
        <div className="mb-6">
          <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            Questions
          </label>
          <div className="flex items-center gap-3">
            {[5, 10, 15, 20, 25].map((n) => (
              <button
                key={n}
                onClick={() => setConfig((p) => ({ ...p, question_count: n }))}
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
                style={{
                  fontFamily: 'var(--font-space)',
                  background: config.question_count === n ? `${c.brand}18` : c.surface,
                  border: config.question_count === n ? `2px solid ${c.brand}` : `1px solid ${c.border}`,
                  color: config.question_count === n ? c.brand : c.text,
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="mb-6">
          <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            Difficulty
          </label>
          {loadingStats ? (
            <div className="flex items-center gap-2 py-3">
              <Loader2 size={14} className="animate-spin" style={{ color: c.muted }} />
              <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Checking available questions...</span>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {difficulties.map((d) => {
                const available = isDifficultyAvailable(d.id)
                const count = getDifficultyCount(d.id)
                const isSelected = config.difficulty === d.id

                return (
                  <button
                    key={d.id}
                    onClick={() => available && setConfig((p) => ({ ...p, difficulty: d.id as QuizConfig['difficulty'] }))}
                    disabled={!available}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-lg text-[11px] font-medium transition-colors disabled:cursor-not-allowed"
                    style={{
                      fontFamily: 'var(--font-space)',
                      background: isSelected && available ? `${c.brand}18` : c.surface,
                      border: isSelected && available ? `2px solid ${c.brand}` : `1px solid ${c.border}`,
                      color: !available ? `${c.muted}60` : isSelected ? c.brand : c.text,
                      opacity: available ? 1 : 0.45,
                      cursor: available ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <d.icon size={16} />
                    {d.label}
                    {!available && d.id !== 'mixed' && (
                      <span className="text-[9px]" style={{ color: c.muted }}>Not ready</span>
                    )}
                    {available && d.id !== 'mixed' && (
                      <span className="text-[9px]" style={{ color: c.muted }}>{count} available</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Mode */}
        <div className="mb-6">
          <label className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfig((p) => ({ ...p, mode: 'standard' }))}
              className="py-3 px-4 rounded-lg text-xs font-medium cursor-pointer transition-colors text-left"
              style={{
                fontFamily: 'var(--font-space)',
                background: config.mode === 'standard' ? `${c.brand}18` : c.surface,
                border: config.mode === 'standard' ? `2px solid ${c.brand}` : `1px solid ${c.border}`,
                color: config.mode === 'standard' ? c.brand : c.text,
              }}
            >
              <span className="font-bold block mb-0.5">Standard</span>
              <span style={{ color: c.muted }}>Answer all, see results at end</span>
            </button>
            <button
              onClick={() => setConfig((p) => ({ ...p, mode: 'explain_learn' }))}
              className="py-3 px-4 rounded-lg text-xs font-medium cursor-pointer transition-colors text-left"
              style={{
                fontFamily: 'var(--font-space)',
                background: config.mode === 'explain_learn' ? `${c.accent}18` : c.surface,
                border: config.mode === 'explain_learn' ? `2px solid ${c.accent}` : `1px solid ${c.border}`,
                color: config.mode === 'explain_learn' ? c.accent : c.text,
              }}
            >
              <span className="font-bold block mb-0.5">Explain & Learn</span>
              <span style={{ color: c.muted }}>See explanation after each answer</span>
            </button>
          </div>
        </div>

        {/* Toggles */}
        <div className="mb-6 space-y-3">
          {/* Time pressure */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: c.muted }} />
              <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Time pressure</span>
            </div>
            <button
              onClick={() => setConfig((p) => ({ ...p, time_pressure: !p.time_pressure }))}
              className="w-10 h-5 rounded-full cursor-pointer transition-colors relative"
              style={{ background: config.time_pressure ? c.brand : c.border }}
            >
              <motion.div
                className="absolute top-0.5 w-4 h-4 rounded-full"
                style={{ background: c.text }}
                animate={{ left: config.time_pressure ? '22px' : '2px' }}
                transition={{ duration: 0.2 }}
              />
            </button>
          </div>
          {config.time_pressure && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              className="flex items-center gap-3 pl-6"
            >
              <span className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Seconds per question:</span>
              {[15, 30, 45, 60].map((t) => (
                <button
                  key={t}
                  onClick={() => setConfig((p) => ({ ...p, time_per_question: t }))}
                  className="px-2.5 py-1 rounded text-[11px] font-medium cursor-pointer"
                  style={{
                    fontFamily: 'var(--font-space)',
                    background: config.time_per_question === t ? `${c.brand}18` : 'transparent',
                    color: config.time_per_question === t ? c.brand : c.muted,
                  }}
                >
                  {t}s
                </button>
              ))}
            </motion.div>
          )}

          {/* Focus on weak topics */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Target size={14} style={{ color: c.muted }} />
              <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Focus on weak topics</span>
            </div>
            <button
              onClick={() => setConfig((p) => ({ ...p, focus_weak: !p.focus_weak }))}
              className="w-10 h-5 rounded-full cursor-pointer transition-colors relative"
              style={{ background: config.focus_weak ? c.brand : c.border }}
            >
              <motion.div
                className="absolute top-0.5 w-4 h-4 rounded-full"
                style={{ background: c.text }}
                animate={{ left: config.focus_weak ? '22px' : '2px' }}
                transition={{ duration: 0.2 }}
              />
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-xl text-sm font-medium cursor-pointer transition-colors hover:opacity-80"
            style={{ fontFamily: 'var(--font-space)', color: c.text, background: c.surface, border: `1px solid ${c.border}` }}
          >
            Cancel
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onStart(config)}
            disabled={isGenerating || !isDifficultyAvailable(config.difficulty)}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 16px ${c.brand}33` }}
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {isGenerating ? 'Starting...' : 'Start quiz'}
          </motion.button>
        </div>
      </div>
    </BottomSheetModal>
  )
}
