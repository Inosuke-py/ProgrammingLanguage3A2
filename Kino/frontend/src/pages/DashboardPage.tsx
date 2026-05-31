import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, FileText, Play, Trash2, Loader2, Flame,
  Eye, Zap, Plus, Share2, Award, Swords,
  Target, AlertTriangle, TrendingUp, Brain, Crosshair, ArrowRight,
  BarChart3, Clock, Sparkles, CheckCircle2, Search, X,
  Shield, Trophy, Crown, Heart, Moon, Rocket, Star,
  BookOpen, FolderOpen, Library, RotateCcw, Users,
} from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { useBadgeUnlock } from '../lib/badge-context'
import QuizConfigPanel from '../components/quiz/QuizConfigPanel'
import ShareModal from '../components/ShareModal'
import UploadModal from '../components/UploadModal'
import { BottomSheetModal } from '../components/BottomSheetModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardUser {
  id: string
  name: string
  picture: string | null
  xp: number
  xp_for_next_level: number
  xp_progress: number
  level: number
  streak: number
  longest_survival: number
  total_questions_answered: number
  accuracy: number
  total_quizzes: number
  role: string
}

interface ContinueLearning {
  material_id: string
  material_title: string
  mastery: number
  last_studied: string
  last_score: number | null
}

interface DailyGoal {
  questions_today: number
  target: number
  xp_remaining: number
  completed: boolean
}

interface WeakTopic {
  topic: string
  miss_count: number
}

interface ActivityItem {
  type: string
  score: number
  correct_count: number
  total_questions: number
  material_title: string
  completed_at: string
}

interface Recommendation {
  type: string
  title: string
  description: string
  action: string
  action_data?: { material_id?: string }
  priority: number
}

interface BadgeItem {
  name: string
  description: string
  icon: string
  rarity: string
  earned_at: string | null
}

interface DashboardMaterial {
  id: string
  title: string
  file_type: string
  page_count: number | null
  section_count: number
  pool_count: number
  mastery: number
  attempt_count: number
  last_studied: string | null
  weak_areas: string[]
  created_at: string
}

interface DashboardData {
  user: DashboardUser
  continue_learning: ContinueLearning | null
  daily_goal: DailyGoal
  weak_topics: WeakTopic[]
  activity: ActivityItem[]
  materials: DashboardMaterial[]
  recommendations: Recommendation[]
  badges: { recent: BadgeItem[]; total_count: number }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

const ease = [0.16, 1, 0.3, 1] as const

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

function scoreColor(score: number): string {
  if (score >= 70) return c.accent
  if (score >= 50) return c.brand
  return 'oklch(65% 0.2 25)'
}

// ─── XP Progress Bar ──────────────────────────────────────────────────────────

function XPProgressBar({ user }: { user: DashboardUser }) {
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            Level {user.level}
          </span>
          <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {user.xp}/{user.xp_for_next_level} XP
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: c.border }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${c.brand}, ${c.accent})` }}
            initial={{ width: '0%' }}
            animate={{ width: `${user.xp_progress}%` }}
            transition={{ delay: 0.4, duration: 1, ease }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Daily Goal Ring ──────────────────────────────────────────────────────────

function DailyGoalRing({ goal, compact = false }: { goal: DailyGoal; compact?: boolean }) {
  const progress = Math.min(goal.questions_today / goal.target, 1)
  const radius = 48
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - progress)

  if (compact) {
    return (
      <div className="relative w-16 h-16">
        <svg width="100%" height="100%" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke={c.border} strokeWidth="10" />
          <motion.circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={goal.completed ? c.accent : c.brand}
            strokeWidth="10" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.0, ease }}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '64px 64px' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {goal.completed ? (
            <CheckCircle2 size={20} style={{ color: c.accent }} />
          ) : (
            <span className="font-bold text-base" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {goal.questions_today}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 md:gap-4">
      <div className="relative w-24 h-24 md:w-32 md:h-32">
        <svg width="100%" height="100%" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke={c.border} strokeWidth="8" />
          <motion.circle
            cx="64" cy="64" r={radius} fill="none"
            stroke={goal.completed ? c.accent : c.brand}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.2, ease }}
            style={{ transform: 'rotate(-90deg)', transformOrigin: '64px 64px' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {goal.completed ? (
            <CheckCircle2 size={24} style={{ color: c.accent }} />
          ) : (
            <>
              <span className="font-bold text-2xl md:text-3xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                {goal.questions_today}
              </span>
              <span className="text-[9px] md:text-[10px] font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                /{goal.target}
              </span>
            </>
          )}
        </div>
      </div>
      {goal.completed ? (
        <span className="text-xs md:text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>
          Goal complete!
        </span>
      ) : (
        <div className="text-center">
          <span className="text-xs md:text-sm font-semibold block" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            {goal.target - goal.questions_today} left
          </span>
          <span className="text-[10px] md:text-xs mt-0.5 block" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            +{goal.xp_remaining} XP
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Material Card State Helpers ──────────────────────────────────────────────

function getMaterialCardStyle(material: DashboardMaterial): {
  border: string
  background: string
  extraClass: string
} {
  // Pool generating state
  if (material.pool_count === 0 && material.attempt_count === 0) {
    return {
      border: `2px dashed ${c.brand}`,
      background: c.card,
      extraClass: 'animate-pulse',
    }
  }
  // Never studied
  if (material.attempt_count === 0) {
    return {
      border: `2px dashed ${c.brand}`,
      background: `color-mix(in oklch, ${c.card} 92%, ${c.brand})`,
      extraClass: '',
    }
  }
  // Low mastery
  if (material.mastery < 40) {
    return {
      border: `1px solid oklch(35% 0.06 40)`,
      background: `color-mix(in oklch, ${c.card} 95%, oklch(60% 0.15 40))`,
      extraClass: '',
    }
  }
  // High mastery
  if (material.mastery > 70) {
    return {
      border: `1px solid color-mix(in oklch, ${c.border} 60%, ${c.accent})`,
      background: c.card,
      extraClass: '',
    }
  }
  // Medium mastery (default)
  return {
    border: `1px solid ${c.border}`,
    background: c.card,
    extraClass: '',
  }
}

// ─── Badge Tooltip ────────────────────────────────────────────────────────────

function BadgeTooltip({ name, description, color, children }: { name: string; description: string; color?: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false)
  const accentColor = color || c.brand

  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow((prev) => !prev)}
    >
      {children}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.25, 1, 0.5, 1] }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg z-50 pointer-events-none whitespace-nowrap"
            style={{ background: c.card, border: `1px solid ${accentColor}30`, boxShadow: `0 4px 16px ${c.bg}90, 0 0 8px ${accentColor}15` }}
          >
            <p className="text-xs font-bold" style={{ fontFamily: 'var(--font-space)', color: accentColor }}>{name}</p>
            <p className="text-[10px] mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{description}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Dashboard Content ───────────────────────────────────────────────────

function DashboardContent() {
  const navigate = useNavigate()
  const { showBadgeUnlock } = useBadgeUnlock()

  const [data, setData] = useState<DashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<DashboardMaterial | null>(null)
  const [showConfig, setShowConfig] = useState<DashboardMaterial | null>(null)
  const [showShare, setShowShare] = useState<DashboardMaterial | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [sharedWithMe, setSharedWithMe] = useState<{ material_id: string; material_title: string; owner_name: string; permission: string }[]>([])
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close modals on Escape
  useEscapeClose(!!selectedMaterial, () => setSelectedMaterial(null))
  useEscapeClose(!!showConfig, () => setShowConfig(null))
  useEscapeClose(!!showShare, () => setShowShare(null))

  const fetchDashboard = useCallback(async () => {
    try {
      const [dashRes, sharedRes] = await Promise.all([
        api.get('/dashboard/'),
        api.get('/shared-with-me/').catch(() => ({ data: [] })),
      ])
      setData(dashRes.data)
      setSharedWithMe(sharedRes.data || [])
    } catch {
      setError('Failed to load dashboard')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
    const interval = setInterval(() => {
      api.get('/dashboard/').then(res => setData(res.data)).catch(() => {})
    }, 20000)
    return () => clearInterval(interval)
  }, [fetchDashboard])

  // Auto-dismiss delete confirmation after 4 seconds
  useEffect(() => {
    if (deletingId) {
      deleteTimerRef.current = setTimeout(() => {
        setDeletingId(null)
      }, 4000)
    }
    return () => {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    }
  }, [deletingId])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    setShowUpload(true)
  }

  const handleDeleteClick = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeletingId(id)
  }

  const handleDeleteConfirm = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    setDeletingId(null)
    try {
      await api.delete(`/materials/${id}`)
      await fetchDashboard()
    } catch (err: any) {
      // 409 = blocked because the material is in use (e.g. assigned to a classroom).
      // FastAPI puts the structured payload in response.data.detail.
      const detail = err?.response?.data?.detail
      if (typeof detail === 'object' && detail?.message) {
        setError(detail.message)
      } else if (typeof detail === 'string') {
        setError(detail)
      } else {
        setError('Failed to delete')
      }
    }
  }

  const handleDeleteCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
    setDeletingId(null)
  }

  const handleGenerateQuiz = async (materialId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const mat = data?.materials.find((m) => m.id === materialId)
    if (mat) {
      setSelectedMaterial(null)
      setShowConfig(mat)
    }
  }

  const handlePublishChallenge = async (materialId: string) => {
    try {
      await api.post('/challenges/admin/publish', { material_id: materialId })
      setSelectedMaterial(null)
      setError(null)
      await fetchDashboard()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to publish challenge')
    }
  }

  const handleStartQuiz = async (config: any) => {
    if (!showConfig) return
    setIsGenerating(showConfig.id)
    setError(null)
    try {
      const res = await api.post('/quizzes/generate', {
        material_id: showConfig.id,
        question_count: config.question_count,
        question_types: config.question_types,
        difficulty: config.difficulty,
        mode: config.mode,
        focus_weak: config.focus_weak,
      })
      navigate(`/quiz/${res.data.id}`, {
        state: { mode: config.mode, time_pressure: config.time_pressure, time_per_question: config.time_per_question },
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate quiz.')
    } finally {
      setIsGenerating(null)
      setShowConfig(null)
    }
  }

  // Loading state
  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: c.bg }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        >
          <Loader2 size={36} style={{ color: c.brand }} />
        </motion.div>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-sm font-medium"
          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
        >
          Analyzing your progress...
        </motion.p>
      </div>
    )
  }

  const { user, continue_learning, daily_goal, weak_topics, activity, materials, recommendations, badges } = data

  // Client-side search filter
  const filteredMaterials = searchQuery.trim()
    ? materials.filter(m => m.title.toLowerCase().includes(searchQuery.toLowerCase()))
    : materials

  return (
    <div
      className="min-h-screen"
      style={{ background: c.bg }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      <AnimatePresence>
        {dragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: `${c.bg}ee` }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <Upload size={56} className="mx-auto mb-4" style={{ color: c.brand }} />
              <p className="font-bold text-2xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Drop your file</p>
              <p className="text-base mt-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>PDF, PPTX, or DOCX</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Main Content ───────────────────────────────────────────────── */}
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-8">
        {/* Error banner */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-xl px-5 py-4 mb-6 text-sm flex items-center justify-between"
              style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(75% 0.15 25)', border: '1px solid oklch(30% 0.04 25)' }}
            >
              <span>{error}</span>
              <div className="flex items-center gap-3">
                <button onClick={fetchDashboard} className="text-xs font-semibold cursor-pointer underline opacity-80 hover:opacity-100" style={{ color: 'oklch(75% 0.15 25)' }}>
                  Retry
                </button>
                <button onClick={() => setError(null)} className="cursor-pointer opacity-60 hover:opacity-100" aria-label="Dismiss error">
                  <X size={14} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── Hero Section: Greeting + Inline Stats ────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mb-4 md:mb-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 md:gap-6">
            <div>
              <h1 className="font-bold text-2xl md:text-3xl lg:text-4xl mb-1 md:mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                {getGreeting()}, {user.name.split(' ')[0]}
              </h1>
              <p className="text-sm md:text-base" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                {user.streak > 0
                  ? `${user.streak}-day streak`
                  : 'Start a streak today'
                }
                {' · '}
                <span style={{ color: c.accent }}>{user.accuracy}%</span>
                {' · '}
                {daily_goal.completed
                  ? 'Goal done'
                  : `${daily_goal.target - daily_goal.questions_today} left today`
                }
              </p>
            </div>
            <div className="hidden md:block w-full lg:w-80">
              <XPProgressBar user={user} />
            </div>
          </div>
        </motion.section>

        {/* ─── Continue Learning — Dominant Section ─────────────────────── */}
        {continue_learning && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5, ease }}
            className="rounded-xl md:rounded-2xl p-4 md:p-10 mb-5 md:mb-10 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${c.surface} 0%, color-mix(in oklch, ${c.surface} 85%, ${c.brand}) 100%)`,
            }}
          >
            {/* Top gradient bar */}
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: `linear-gradient(90deg, ${c.brand}, ${c.accent})` }} />
            {/* Subtle glow - hidden on mobile */}
            <div
              className="absolute top-0 right-0 w-80 h-80 rounded-full opacity-10 pointer-events-none hidden md:block"
              style={{ background: `radial-gradient(circle, ${c.brand} 0%, transparent 70%)`, transform: 'translate(30%, -40%)' }}
            />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-8">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] md:text-xs uppercase tracking-wider mb-1 md:mb-3 font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Continue learning
                </p>
                <h2 className="font-bold text-lg md:text-2xl lg:text-3xl mb-2 md:mb-4 truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  {continue_learning.material_title}
                </h2>
                <div className="flex items-center gap-3 mb-3 md:mb-5">
                  <span className="text-base md:text-xl font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
                    {continue_learning.mastery}%
                  </span>
                  {continue_learning.last_score !== null && (
                    <span className="text-[10px] md:text-xs px-2 md:px-3 py-0.5 md:py-1 rounded-full font-semibold" style={{ fontFamily: 'var(--font-space)', background: `${scoreColor(continue_learning.last_score)}20`, color: scoreColor(continue_learning.last_score) }}>
                      Last: {continue_learning.last_score}%
                    </span>
                  )}
                </div>
                <div className="w-full max-w-lg h-2 md:h-3.5 rounded-full overflow-hidden" style={{ background: c.border }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${c.brand}, ${c.accent})` }}
                    initial={{ width: '0%' }}
                    animate={{ width: `${continue_learning.mastery}%` }}
                    transition={{ delay: 0.3, duration: 0.8, ease }}
                  />
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/viewer/${continue_learning.material_id}`)}
                className="flex items-center justify-center gap-2 font-bold text-sm md:text-base lg:text-lg px-5 md:px-6 lg:px-10 py-3 md:py-4 lg:py-5 rounded-xl cursor-pointer w-full md:w-auto"
                style={{
                  fontFamily: 'var(--font-space)',
                  background: c.brand,
                  color: c.bg,
                  boxShadow: `0 0 40px ${c.brand}50, 0 4px 20px ${c.brand}30`,
                }}
              >
                <Play size={16} />
                Continue
              </motion.button>
            </div>
          </motion.section>
        )}

        {/* ─── Two Column Layout ────────────────────────────────────────── */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-12">
          {/* ─── Left Column ───────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-6 lg:gap-10">
            {/* AI Recommendations - hidden on mobile */}
            {recommendations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.4, ease }}
                className="hidden md:block"
              >
                <h3 className="text-xs uppercase tracking-wider mb-4 flex items-center gap-2 font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  <Sparkles size={14} style={{ color: c.brand }} /> Recommended For You
                </h3>
                <div className="flex flex-col gap-1">
                  {recommendations.slice(0, 4).map((rec, i) => (
                    <motion.div
                      key={i}
                      whileHover={{ x: 4 }}
                      className="rounded-xl px-4 py-3.5 cursor-pointer transition-colors"
                      style={{ background: 'transparent' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = c.surface }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                      onClick={() => {
                        if (rec.action === 'continue' && rec.action_data?.material_id) {
                          navigate(`/viewer/${rec.action_data.material_id}`)
                        } else if (rec.action_data?.material_id) {
                          const mat = materials.find(m => m.id === rec.action_data?.material_id)
                          if (mat) setShowConfig(mat)
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${c.brand}10` }}>
                          {rec.type === 'daily_goal' && <Target size={14} style={{ color: c.brand }} />}
                          {rec.type === 'weak_topic' && <AlertTriangle size={14} style={{ color: 'oklch(65% 0.2 25)' }} />}
                          {rec.type === 'low_mastery' && <TrendingUp size={14} style={{ color: c.brand }} />}
                          {rec.type === 'new_material' && <Sparkles size={14} style={{ color: c.accent }} />}
                          {rec.type === 'try_mode' && <Swords size={14} style={{ color: c.purple }} />}
                          {rec.type === 'continue' && <Play size={14} style={{ color: c.brand }} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                            {rec.title}
                          </p>
                          <p className="text-xs truncate" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                            {rec.description}
                          </p>
                        </div>
                        <ArrowRight size={14} className="flex-shrink-0" style={{ color: c.muted }} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ─── Mobile-only Progress Strip (lives between hero and materials) ─── */}
            {/* Desktop has the same data in the right sidebar; this prevents users
                on mobile from scrolling past all their materials to find their progress. */}
            <div className="lg:hidden mb-6">
              <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Your Progress
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {/* Daily Goal compact */}
                <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                  <div className="flex-shrink-0">
                    <DailyGoalRing goal={daily_goal} compact />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-widest font-semibold mb-0.5 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                      <Target size={11} /> Daily Goal
                    </p>
                    <p className="text-base font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                      {daily_goal.questions_today} / {daily_goal.target} questions
                    </p>
                    <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: daily_goal.completed ? c.accent : c.muted }}>
                      {daily_goal.completed ? 'Goal reached today' : `${daily_goal.target - daily_goal.questions_today} left · +${daily_goal.xp_remaining} XP`}
                    </p>
                  </div>
                </div>

                {/* Needs Review summary */}
                {weak_topics.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                    <p className="text-xs uppercase tracking-widest font-semibold mb-3 flex items-center gap-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                      <AlertTriangle size={11} /> Needs Review
                    </p>
                    <div className="flex flex-col gap-2.5">
                      {weak_topics.slice(0, 3).map((t, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: t.miss_count >= 5 ? 'oklch(65% 0.2 25)' : t.miss_count >= 3 ? c.brand : c.accent }}
                          />
                          <span className="text-sm truncate flex-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                            {t.topic}
                          </span>
                          <span className="text-xs flex-shrink-0 font-semibold px-1.5 py-0.5 rounded" style={{ fontFamily: 'var(--font-space)', background: `${t.miss_count >= 5 ? 'oklch(65% 0.2 25)' : c.brand}15`, color: t.miss_count >= 5 ? 'oklch(65% 0.2 25)' : c.brand }}>
                            {t.miss_count}x
                          </span>
                        </div>
                      ))}
                    </div>
                    {weak_topics.length > 3 && (
                      <p className="text-[10px] mt-2.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                        +{weak_topics.length - 3} more weak {weak_topics.length - 3 === 1 ? 'topic' : 'topics'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Materials Section */}
            {materials.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, ease }}
                className="text-center py-20 rounded-2xl"
                style={{ background: c.card, border: `1px solid ${c.border}` }}
              >
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
                  style={{ background: `${c.brand}10` }}
                >
                  <FileText size={36} style={{ color: c.brand }} />
                </motion.div>
                <p className="font-bold text-xl mb-3" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  No materials yet
                </p>
                <p className="text-base max-w-md mx-auto mb-8" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Upload your first PDF, PPTX, or DOCX to start your learning journey.
                </p>
                <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 font-bold text-base px-8 py-4 rounded-xl cursor-pointer transition-transform hover:scale-[1.03]" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 24px ${c.brand}33` }}>
                  <Upload size={18} />
                  Upload your first file
                </button>
              </motion.div>
            ) : (
              <div>
                {/* Search + Title bar */}
                <div className="flex items-center justify-between mb-4 md:mb-5 gap-4">
                  <h3 className="font-bold text-sm md:text-base uppercase tracking-wide flex-shrink-0" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    Your Materials
                  </h3>
                  {materials.length >= 4 && (
                    <div className="relative max-w-xs w-full hidden sm:block">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: c.muted }} />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search materials..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none"
                        style={{
                          fontFamily: 'var(--font-space)',
                          background: c.surface,
                          border: `1px solid ${c.border}`,
                          color: c.text,
                        }}
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer opacity-60 hover:opacity-100"
                          style={{ color: c.muted }}
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-5">
                  {/* Upload card — always first */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.3, ease }}
                    whileHover={{ y: -4, borderColor: c.brand }}
                    onClick={() => setShowUpload(true)}
                    className="rounded-xl md:rounded-2xl p-4 md:p-6 flex flex-col items-center justify-center cursor-pointer transition-all"
                    style={{ background: c.card, border: `2px dashed ${c.border}`, minHeight: '180px' }}
                  >
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style={{ background: `${c.brand}10` }}>
                      <Plus size={24} style={{ color: c.brand }} />
                    </div>
                    <p className="font-bold text-base mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                      Add material
                    </p>
                    <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                      PDF, PPTX, DOCX
                    </p>
                  </motion.div>

                  {filteredMaterials.map((material, i) => {
                    const cardStyle = getMaterialCardStyle(material)
                    const isDeleting = deletingId === material.id
                    const isPoolGenerating = material.pool_count === 0 && material.attempt_count === 0
                    const isNeverStudied = material.attempt_count === 0 && material.pool_count > 0
                    const isHighMastery = material.mastery > 70

                    return (
                      <motion.div
                        key={material.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.04, duration: 0.3, ease }}
                        whileHover={{ y: -4 }}
                        onClick={() => !isDeleting && setSelectedMaterial(material)}
                        className={`rounded-xl md:rounded-2xl p-4 md:p-6 flex flex-col justify-between group transition-all cursor-pointer relative ${cardStyle.extraClass}`}
                        style={{ background: cardStyle.background, border: cardStyle.border, minHeight: '160px' }}
                      >
                        {/* Delete confirmation overlay */}
                        <AnimatePresence>
                          {isDeleting && (
                            <motion.div
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 4 }}
                              className="absolute inset-x-0 bottom-0 z-10 rounded-b-2xl px-5 py-4 flex items-center justify-between"
                              style={{ background: 'oklch(20% 0.04 25)', borderTop: '1px solid oklch(30% 0.06 25)' }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: 'oklch(75% 0.12 25)' }}>
                                Delete this material?
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={handleDeleteCancel}
                                  className="text-xs font-semibold px-4 py-2 rounded-md cursor-pointer"
                                  style={{ fontFamily: 'var(--font-space)', color: c.muted, background: c.surface }}
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={(e) => handleDeleteConfirm(material.id, e)}
                                  className="text-xs font-semibold px-4 py-2 rounded-md cursor-pointer"
                                  style={{ fontFamily: 'var(--font-space)', color: 'oklch(95% 0.01 25)', background: 'oklch(45% 0.15 25)' }}
                                >
                                  Delete
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div>
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${c.brand}12` }}>
                                {isPoolGenerating ? (
                                  <Loader2 size={20} className="animate-spin" style={{ color: c.brand }} />
                                ) : (
                                  <FileText size={20} style={{ color: c.brand }} />
                                )}
                              </div>
                              {isNeverStudied && (
                                <span
                                  className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
                                  style={{ fontFamily: 'var(--font-space)', background: `${c.brand}20`, color: c.brand }}
                                >
                                  New
                                </span>
                              )}
                              {isPoolGenerating && (
                                <span
                                  className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
                                  style={{ fontFamily: 'var(--font-space)', background: `${c.purple}20`, color: c.purple }}
                                >
                                  Generating
                                </span>
                              )}
                              {isHighMastery && (
                                <CheckCircle2 size={16} style={{ color: c.accent }} />
                              )}
                            </div>
                            <button
                              onClick={(e) => handleDeleteClick(material.id, e)}
                              className="p-2 rounded-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: c.muted }}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                          <h3 className="font-bold text-base mb-1.5 line-clamp-2 leading-snug" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                            {material.title}
                          </h3>
                          <p className="text-xs mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                            {material.attempt_count} quizzes taken
                            {material.last_studied && ` · ${relativeTime(material.last_studied)}`}
                          </p>
                          {/* Mastery bar */}
                          <div className="w-full h-2.5 rounded-full mb-2" style={{ background: c.border }}>
                            <motion.div
                              className="h-full rounded-full"
                              style={{
                                background: isHighMastery
                                  ? `linear-gradient(90deg, ${c.accent}, color-mix(in oklch, ${c.accent} 70%, ${c.brand}))`
                                  : material.mastery < 40
                                    ? 'oklch(60% 0.15 40)'
                                    : c.brand,
                              }}
                              initial={{ width: '0%' }}
                              animate={{ width: `${material.mastery}%` }}
                              transition={{ delay: 0.2 + i * 0.04, duration: 0.6, ease }}
                            />
                          </div>
                          <span className="text-xs font-bold" style={{
                            fontFamily: 'var(--font-space)',
                            color: isHighMastery ? c.accent : material.mastery < 40 ? 'oklch(65% 0.15 40)' : c.brand,
                          }}>
                            {material.mastery}% mastery
                          </span>
                          {/* Weak areas */}
                          {material.weak_areas.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {material.weak_areas.slice(0, 2).map((area) => (
                                <span
                                  key={area}
                                  className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                                  style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(70% 0.12 25)' }}
                                >
                                  {area}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="mt-4 pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${c.border}` }}>
                          {material.pool_count >= 20 ? (
                            <span className="text-xs flex items-center gap-1.5 font-medium" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>
                              <Zap size={12} /> Quiz ready
                            </span>
                          ) : (
                            <span className="text-xs flex items-center gap-1.5 font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                              <Loader2 size={12} className="animate-spin" /> Preparing quiz...
                            </span>
                          )}
                          <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: c.brand }} />
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Shared with me */}
            {sharedWithMe.length > 0 && (
              <div className="mt-6 lg:mt-10">
                <h3 className="font-bold text-sm md:text-base uppercase tracking-wide mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Shared with me
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-5">
                  {sharedWithMe.map((item) => (
                    <Link
                      key={item.material_id}
                      to={`/viewer/${item.material_id}`}
                      className="rounded-xl md:rounded-2xl p-4 md:p-6 flex flex-col justify-between no-underline transition-all hover:opacity-90"
                      style={{ background: c.card, border: `1px solid ${c.border}`, minHeight: '160px' }}
                    >
                      <div>
                        <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center mb-3 md:mb-4" style={{ background: `${c.purple}12` }}>
                          <FileText size={18} style={{ color: c.purple }} />
                        </div>
                        <h3 className="font-bold text-sm md:text-base mb-1 line-clamp-2 leading-snug" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                          {item.material_title}
                        </h3>
                        <p className="text-[10px] md:text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                          from {item.owner_name}
                        </p>
                      </div>
                      <div className="mt-3 pt-2" style={{ borderTop: `1px solid ${c.border}` }}>
                        <span className="text-[10px] md:text-xs font-medium" style={{ fontFamily: 'var(--font-space)', color: item.permission === 'quiz' ? c.accent : c.muted }}>
                          {item.permission === 'quiz' ? 'View + Quiz' : 'View only'}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── Right Sidebar (desktop only — mobile has inline progress strip above materials) ──── */}
          <aside className="hidden lg:flex w-[360px] flex-shrink-0 flex-col gap-8">
            {/* Daily Goal */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4, ease }}
              className="rounded-2xl p-6"
              style={{ background: c.card, border: `1px solid ${c.border}` }}
            >
              <h4 className="text-xs uppercase tracking-wider mb-5 flex items-center gap-2 font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                <Target size={14} /> Daily Goal
              </h4>
              <DailyGoalRing goal={daily_goal} />
            </motion.div>

            {/* Weak Topics — simple list, no card wrapper */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4, ease }}
              className="pt-2"
            >
              <h4 className="text-xs uppercase tracking-wider mb-4 flex items-center gap-2 font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                <AlertTriangle size={14} /> Needs Review
              </h4>
              {weak_topics.length === 0 ? (
                <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  No weak areas detected yet. Take some quizzes to see insights.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {weak_topics.slice(0, 5).map((t, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ background: t.miss_count >= 5 ? 'oklch(65% 0.2 25)' : t.miss_count >= 3 ? c.brand : c.accent }}
                      />
                      <span className="text-sm truncate flex-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                        {t.topic}
                      </span>
                      <span className="text-xs flex-shrink-0 font-semibold px-2 py-0.5 rounded" style={{ fontFamily: 'var(--font-space)', background: `${t.miss_count >= 5 ? 'oklch(65% 0.2 25)' : c.brand}15`, color: t.miss_count >= 5 ? 'oklch(65% 0.2 25)' : c.brand }}>
                        {t.miss_count}x
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Activity Feed — vertical timeline/rail (hidden on mobile) */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4, ease }}
              className="hidden md:block"
            >
              <h4 className="text-xs uppercase tracking-wider mb-4 flex items-center gap-2 font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                <TrendingUp size={14} /> Recent Activity
              </h4>
              {activity.length === 0 ? (
                <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  No activity yet. Take a quiz to get started.
                </p>
              ) : (
                <div className="relative pl-5">
                  {/* Vertical rail */}
                  <div
                    className="absolute left-[7px] top-1 bottom-1 w-px"
                    style={{ background: c.border }}
                  />
                  <div className="flex flex-col gap-4">
                    {activity.slice(0, 6).map((a, i) => (
                      <div key={i} className="relative flex items-start gap-3">
                        {/* Timeline dot */}
                        <div
                          className="absolute -left-5 top-1.5 w-3 h-3 rounded-full border-2"
                          style={{
                            borderColor: scoreColor(a.score),
                            background: c.bg,
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                            <span style={{ color: scoreColor(a.score), fontWeight: 700 }}>{Math.round(a.score)}%</span> on {a.material_title}
                          </p>
                          <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                            {a.correct_count}/{a.total_questions} correct · {relativeTime(a.completed_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>

          </aside>
        </div>
      </div>

      {/* ─── Material Detail Modal ──────────────────────────────────────── */}
      <AnimatePresence>
        {selectedMaterial && (
          <BottomSheetModal onClose={() => setSelectedMaterial(null)} maxWidth="max-w-lg">
            <div className="p-5 md:p-8">
              <div className="flex items-start gap-5 mb-6">
                <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${c.brand}12` }}>
                  <FileText size={26} style={{ color: c.brand }} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-xl leading-tight mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                    {selectedMaterial.title}
                  </h2>
                  <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    {selectedMaterial.page_count} pages · {selectedMaterial.section_count} sections · {selectedMaterial.attempt_count} quizzes taken
                  </p>
                </div>
              </div>

              {/* Mastery */}
              <div className="rounded-xl p-5 mb-6" style={{ background: c.surface }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                    {selectedMaterial.mastery}% Mastery
                  </span>
                  {selectedMaterial.pool_count >= 20 ? (
                    <span className="text-xs font-semibold flex items-center gap-1.5" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>
                      <Zap size={12} /> Quiz ready
                    </span>
                  ) : (
                    <span className="text-xs font-semibold flex items-center gap-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                      <Loader2 size={12} className="animate-spin" /> Preparing quiz...
                    </span>
                  )}
                </div>
                <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: c.border }}>
                  <div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${c.brand}, ${c.accent})`, width: `${selectedMaterial.mastery}%` }} />
                </div>
                {selectedMaterial.pool_count < 20 && (
                  <p className="text-xs mt-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    AI is generating questions for this material. This usually takes 1-2 minutes.
                  </p>
                )}
                {selectedMaterial.weak_areas.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Weak Areas</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedMaterial.weak_areas.map((area) => (
                        <span key={area} className="text-xs px-2.5 py-1 rounded-md" style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(70% 0.12 25)' }}>
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-4">
                <Link
                  to={`/viewer/${selectedMaterial.id}`}
                  className="flex-1 flex items-center justify-center gap-2 font-semibold text-base py-3.5 rounded-xl no-underline transition-transform hover:scale-[1.02]"
                  style={{ fontFamily: 'var(--font-space)', color: c.text, background: c.surface, border: `1px solid ${c.border}` }}
                >
                  <Eye size={17} />
                  Read
                </Link>
                <motion.button
                  whileHover={{ scale: selectedMaterial.pool_count >= 20 ? 1.02 : 1 }}
                  whileTap={{ scale: selectedMaterial.pool_count >= 20 ? 0.98 : 1 }}
                  onClick={(e) => handleGenerateQuiz(selectedMaterial.id, e)}
                  disabled={isGenerating === selectedMaterial.id || selectedMaterial.pool_count < 20}
                  className="flex-1 flex items-center justify-center gap-2 font-bold text-base py-3.5 rounded-xl cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: selectedMaterial.pool_count >= 20 ? `0 0 20px ${c.brand}33` : 'none' }}
                >
                  {isGenerating === selectedMaterial.id ? (
                    <><Loader2 size={17} className="animate-spin" /> Starting...</>
                  ) : selectedMaterial.pool_count < 20 ? (
                    <><Loader2 size={17} className="animate-spin" /> Preparing...</>
                  ) : (
                    <><Play size={17} /> Challenge Me</>
                  )}
                </motion.button>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => { setShowShare(selectedMaterial); setSelectedMaterial(null) }}
                className="w-full mt-4 flex items-center justify-center gap-2 font-medium text-sm py-3 rounded-xl cursor-pointer transition-colors"
                style={{ fontFamily: 'var(--font-space)', color: c.muted, background: c.surface, border: `1px solid ${c.border}` }}
              >
                <Share2 size={15} />
                Share material
              </motion.button>

              {/* Admin: Publish as Challenge */}
              {user.role === 'admin' && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePublishChallenge(selectedMaterial.id)}
                  className="w-full mt-2 flex items-center justify-center gap-2 font-medium text-sm py-3 rounded-xl cursor-pointer transition-colors"
                  style={{ fontFamily: 'var(--font-space)', color: c.accent, background: `${c.accent}10`, border: `1px solid ${c.accent}30` }}
                >
                  <Flame size={15} />
                  Publish as Challenge
                </motion.button>
              )}
            </div>
          </BottomSheetModal>
        )}
      </AnimatePresence>

      {/* Quiz config panel */}
      <AnimatePresence>
        {showConfig && (
          <QuizConfigPanel
            materialId={showConfig.id}
            materialTitle={showConfig.title}
            onStart={handleStartQuiz}
            onCancel={() => setShowConfig(null)}
            isGenerating={isGenerating === showConfig.id}
          />
        )}
      </AnimatePresence>

      {/* Share modal */}
      {showShare && (
        <ShareModal
          materialId={showShare.id}
          materialTitle={showShare.title}
          isOpen={!!showShare}
          onClose={() => setShowShare(null)}
        />
      )}

      {/* Upload modal */}
      <AnimatePresence>
        {showUpload && (
          <UploadModal
            isOpen={showUpload}
            onClose={() => setShowUpload(false)}
            onUploaded={(badges) => {
              fetchDashboard()
              if (badges && badges.length > 0) {
                showBadgeUnlock(badges)
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  )
}
