import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, FileText, Brain, Trophy, Loader2, Trash2, Edit3,
  CheckCircle2, X, RefreshCw, Shield, Zap, Target,
  AlertTriangle, Crown, Flame, Star, Calendar, TrendingUp,
  Activity, Gauge, Timer,
} from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'
import { LineChart, HBarChart, VBarChart, DonutChart, HourHeatmap } from '../components/AdminCharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  total_users: number
  total_materials: number
  total_quizzes_taken: number
  total_questions_generated: number
  active_users_week: number
  quizzes_today: number
  questions_answered_today: number
}

interface PoolHealth {
  id: string
  title: string
  pool_count: number
  pool_cap: number
  is_healthy: boolean
}

interface PoolQuestion {
  id: string
  material_id: string
  material_title: string
  type: string
  difficulty: string
  content: string
  options: string[]
  correct_answer: string
  explanation: string
  source_text: string
  times_used: number
  created_at: string | null
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = 'dashboard' | 'questions' | 'users' | 'config' | 'challenges' | 'challenges'

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

interface DailyPoint {
  date: string
  quizzes: number
  signups: number
  answers: number
  active_users: number
}

interface AnalyticsData {
  range_days: number
  daily: DailyPoint[]
  score_distribution: { range: string; count: number }[]
  type_split: { label: string; count: number }[]
  difficulty_split: { label: string; count: number }[]
  top_materials: { id: string; title: string; category: string | null; attempts: number }[]
  hourly_activity: { hour: number; count: number }[]
  summary_30d: {
    avg_score: number
    avg_accuracy: number
    total_answers: number
    total_study_minutes: number
  }
}

const DIFF_COLORS: Record<string, string> = {
  easy: c.accent,
  medium: c.brand,
  hard: 'oklch(65% 0.18 25)',
  unknown: c.muted,
}

const TYPE_COLORS: Record<string, string> = {
  mcq: c.brand,
  true_false: c.accent,
  fill_blank: c.purple,
  matching: 'oklch(70% 0.15 250)',
  ordering: 'oklch(70% 0.15 25)',
  unknown: c.muted,
}

const CAT_COLORS: Record<string, string> = {
  standard: c.brand,
  survival: 'oklch(65% 0.18 25)',
  timed: 'oklch(70% 0.15 250)',
  accuracy: c.accent,
  boss: c.purple,
}

function DashboardTab({ stats, poolHealth }: { stats: AdminStats; poolHealth: PoolHealth[] }) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [range, setRange] = useState<number>(14)

  useEffect(() => {
    setAnalyticsLoading(true)
    api.get(`/admin/analytics?days=${range}`)
      .then(res => setAnalytics(res.data))
      .catch(() => setAnalytics(null))
      .finally(() => setAnalyticsLoading(false))
  }, [range])

  const statCards = [
    { label: 'Total Users', value: stats.total_users, icon: Users, color: c.brand },
    { label: 'Materials', value: stats.total_materials, icon: FileText, color: c.accent },
    { label: 'Quizzes Taken', value: stats.total_quizzes_taken, icon: Trophy, color: c.purple },
    { label: 'Questions Generated', value: stats.total_questions_generated, icon: Brain, color: 'oklch(65% 0.18 25)' },
    { label: 'Active This Week', value: stats.active_users_week, icon: Zap, color: c.brand },
    { label: 'Quizzes Today', value: stats.quizzes_today, icon: Target, color: c.accent },
  ]

  // Derived: peak day / total in range
  const totalQuizzesRange = analytics?.daily.reduce((s, d) => s + d.quizzes, 0) ?? 0
  const totalSignupsRange = analytics?.daily.reduce((s, d) => s + d.signups, 0) ?? 0
  const peakDay = analytics?.daily.reduce<DailyPoint | null>((peak, d) => (!peak || d.answers > peak.answers ? d : peak), null) ?? null

  return (
    <div className="space-y-8">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <div key={stat.label} className="rounded-xl p-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={14} style={{ color: stat.color }} />
              <span className="text-[10px] uppercase tracking-wider font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{stat.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* ═══ Engagement Trend (line chart) ═══ */}
      <div className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              <TrendingUp size={14} style={{ color: c.brand }} /> Engagement Trend
            </h3>
            <p className="text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Quizzes, signups, and active users over time
            </p>
          </div>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setRange(d)}
                className="text-[11px] px-2.5 py-1 rounded-md cursor-pointer"
                style={{
                  fontFamily: 'var(--font-space)',
                  background: range === d ? `${c.brand}15` : c.surface,
                  color: range === d ? c.brand : c.muted,
                  border: `1px solid ${range === d ? c.brand : c.border}`,
                }}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {analyticsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: c.brand }} />
          </div>
        ) : analytics && analytics.daily.length > 0 ? (
          <>
            <LineChart
              xLabels={analytics.daily.map(d => d.date)}
              series={[
                { key: 'quizzes', label: 'Quizzes', color: c.brand, data: analytics.daily.map(d => d.quizzes) },
                { key: 'signups', label: 'Signups', color: c.accent, data: analytics.daily.map(d => d.signups) },
                { key: 'active', label: 'Active users', color: c.purple, data: analytics.daily.map(d => d.active_users) },
              ]}
              height={240}
            />

            {/* Quick takeaways */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <Stat label="Quizzes" value={totalQuizzesRange.toLocaleString()} sub={`in last ${range}d`} color={c.brand} />
              <Stat label="Signups" value={totalSignupsRange.toLocaleString()} sub={`in last ${range}d`} color={c.accent} />
              <Stat label="Peak day" value={peakDay ? `${peakDay.answers}` : '—'} sub={peakDay ? new Date(peakDay.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} color={c.purple} />
              <Stat label="Avg DAU" value={analytics.daily.length ? Math.round(analytics.daily.reduce((s, d) => s + d.active_users, 0) / analytics.daily.length).toString() : '—'} sub="users / day" color={'oklch(65% 0.18 25)'} />
            </div>
          </>
        ) : (
          <p className="text-xs text-center py-10" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            No data in this range
          </p>
        )}
      </div>

      {/* ═══ Three-column row: score distribution + type split + difficulty split ═══ */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Score distribution */}
          <div className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              <Gauge size={14} style={{ color: c.accent }} /> Score Distribution
            </h3>
            <p className="text-[11px] mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Quiz scores in last 30 days
            </p>
            <VBarChart
              items={analytics.score_distribution.map(s => ({
                label: s.range,
                value: s.count,
                color: s.range === '0-19' ? 'oklch(65% 0.18 25)' :
                       s.range === '20-39' ? 'oklch(65% 0.16 50)' :
                       s.range === '40-59' ? c.brand :
                       s.range === '60-79' ? 'oklch(70% 0.16 110)' :
                       c.accent,
              }))}
              height={140}
            />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Avg score: <span style={{ color: c.text, fontWeight: 600 }}>{analytics.summary_30d.avg_score}%</span>
              </div>
              <div style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Accuracy: <span style={{ color: c.accent, fontWeight: 600 }}>{analytics.summary_30d.avg_accuracy}%</span>
              </div>
            </div>
          </div>

          {/* Question type split */}
          <div className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              <Brain size={14} style={{ color: c.purple }} /> Question Types
            </h3>
            <p className="text-[11px] mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Pool composition by type
            </p>
            <DonutChart
              data={analytics.type_split.map(t => ({
                label: t.label,
                value: t.count,
                color: TYPE_COLORS[t.label] || c.muted,
              }))}
              size={130}
              centerLabel="total"
              centerValue={analytics.type_split.reduce((s, t) => s + t.count, 0).toLocaleString()}
            />
          </div>

          {/* Difficulty split */}
          <div className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              <Flame size={14} style={{ color: c.brand }} /> Difficulty Mix
            </h3>
            <p className="text-[11px] mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Pool composition by difficulty
            </p>
            <DonutChart
              data={analytics.difficulty_split.map(d => ({
                label: d.label,
                value: d.count,
                color: DIFF_COLORS[d.label] || c.muted,
              }))}
              size={130}
              centerLabel="questions"
              centerValue={analytics.difficulty_split.reduce((s, d) => s + d.count, 0).toLocaleString()}
            />
          </div>
        </div>
      )}

      {/* ═══ Two column: top materials + hourly heatmap ═══ */}
      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Top materials */}
          <div className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              <Trophy size={14} style={{ color: c.brand }} /> Top Materials (30d)
            </h3>
            <p className="text-[11px] mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Most-attempted by quiz takers
            </p>
            <HBarChart
              items={analytics.top_materials.map(m => ({
                label: m.title,
                value: m.attempts,
                hint: m.category || undefined,
                color: m.category ? CAT_COLORS[m.category] : c.brand,
              }))}
              defaultColor={c.brand}
            />
          </div>

          {/* Hourly heatmap */}
          <div className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <h3 className="text-sm font-bold flex items-center gap-2 mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              <Activity size={14} style={{ color: c.accent }} /> Activity by Hour
            </h3>
            <p className="text-[11px] mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Answers per hour, last 7 days (UTC)
            </p>
            <HourHeatmap hours={analytics.hourly_activity} color={c.accent} />
            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
              <div style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                <Timer size={10} className="inline mr-1" />
                Total study: <span style={{ color: c.text, fontWeight: 600 }}>{Math.round(analytics.summary_30d.total_study_minutes / 60).toLocaleString()}h</span>
              </div>
              <div style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Total answers: <span style={{ color: c.text, fontWeight: 600 }}>{analytics.summary_30d.total_answers.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pool Health (existing) */}
      <div>
        <h3 className="text-xs uppercase tracking-wider font-bold mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          <Brain size={13} /> Pool Health
        </h3>
        <div className="space-y-2">
          {poolHealth.map((pool) => (
            <div key={pool.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{pool.title}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 rounded-full overflow-hidden" style={{ background: c.border }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min((pool.pool_count / pool.pool_cap) * 100, 100)}%`,
                      background: pool.is_healthy ? c.accent : c.brand,
                    }}
                  />
                </div>
                <span className="text-xs font-medium w-16 text-right" style={{ fontFamily: 'var(--font-space)', color: pool.is_healthy ? c.accent : c.brand }}>
                  {pool.pool_count}/{pool.pool_cap}
                </span>
              </div>
            </div>
          ))}
          {poolHealth.length === 0 && (
            <p className="text-sm py-4 text-center" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No public challenges yet</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-lg p-3" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
      <p className="text-[10px] uppercase tracking-wider font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{label}</p>
      <p className="text-lg font-bold mt-0.5" style={{ fontFamily: 'var(--font-space)', color }}>{value}</p>
      {sub && <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{sub}</p>}
    </div>
  )
}

// ─── Questions Tab ────────────────────────────────────────────────────────────

function QuestionsTab() {
  const [questions, setQuestions] = useState<PoolQuestion[]>([])
  const [total, setTotal] = useState(0)
  const [flaggedCount, setFlaggedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [flaggedOnly, setFlaggedOnly] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filter) params.set('difficulty', filter)
      if (flaggedOnly) params.set('flagged_only', 'true')
      params.set('limit', '30')
      const res = await api.get(`/admin/questions?${params}`)
      setQuestions(res.data.questions)
      setTotal(res.data.total)
      setFlaggedCount(res.data.flagged_count || 0)
    } catch {
      setQuestions([])
    } finally {
      setLoading(false)
    }
  }, [filter, flaggedOnly])

  useEffect(() => { fetchQuestions() }, [fetchQuestions])

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await api.delete(`/admin/questions/${id}`)
      setQuestions((prev) => prev.filter((q) => q.id !== id))
      setTotal((prev) => prev - 1)
    } catch {}
    setDeleting(null)
  }

  const diffColors: Record<string, string> = {
    easy: c.accent,
    medium: c.brand,
    hard: 'oklch(65% 0.18 25)',
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {total} questions
          </p>
          {flaggedCount > 0 && (
            <button
              onClick={() => setFlaggedOnly(!flaggedOnly)}
              className="text-xs font-medium px-2.5 py-1 rounded-md cursor-pointer"
              style={{
                fontFamily: 'var(--font-space)',
                background: flaggedOnly ? 'oklch(65% 0.18 25 / 0.15)' : c.surface,
                color: flaggedOnly ? 'oklch(65% 0.18 25)' : 'oklch(65% 0.18 25)',
                border: `1px solid ${flaggedOnly ? 'oklch(65% 0.18 25)' : c.border}`,
              }}
            >
              {flaggedCount} flagged
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          {['', 'easy', 'medium', 'hard'].map((d) => (
            <button
              key={d}
              onClick={() => setFilter(d)}
              className="text-xs px-2.5 py-1 rounded-md cursor-pointer"
              style={{
                fontFamily: 'var(--font-space)',
                background: filter === d ? `${c.brand}18` : c.surface,
                color: filter === d ? c.brand : c.muted,
                border: `1px solid ${filter === d ? c.brand : c.border}`,
              }}
            >
              {d || 'All'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={20} className="animate-spin" style={{ color: c.brand }} />
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q) => (
            <div key={q.id} className="rounded-xl p-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${diffColors[q.difficulty] || c.muted}15`, color: diffColors[q.difficulty] || c.muted }}>
                      {q.difficulty}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: c.surface, color: c.muted }}>
                      {q.type}
                    </span>
                    {(q as any).quality_score != null && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: (q as any).quality_score >= 60 ? `${c.accent}15` : 'oklch(65% 0.18 25 / 0.1)', color: (q as any).quality_score >= 60 ? c.accent : 'oklch(65% 0.18 25)' }}>
                        Q:{(q as any).quality_score}
                      </span>
                    )}
                    {(q as any).flagged && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'oklch(65% 0.18 25 / 0.15)', color: 'oklch(65% 0.18 25)' }}>
                        FLAGGED
                      </span>
                    )}
                    <span className="text-[10px]" style={{ color: c.muted }}>
                      {q.material_title}
                    </span>
                  </div>
                  <p className="text-sm font-medium mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{q.content}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {q.options.map((opt, i) => (
                      <span
                        key={i}
                        className="text-[11px] px-2 py-0.5 rounded"
                        style={{
                          fontFamily: 'var(--font-space)',
                          background: opt === q.correct_answer ? `${c.accent}15` : c.surface,
                          color: opt === q.correct_answer ? c.accent : c.muted,
                          border: opt === q.correct_answer ? `1px solid ${c.accent}40` : `1px solid ${c.border}`,
                        }}
                      >
                        {opt}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(q.id)}
                  disabled={deleting === q.id}
                  className="p-1.5 rounded-md cursor-pointer transition-colors hover:opacity-70 flex-shrink-0"
                  style={{ color: 'oklch(65% 0.18 25)' }}
                  title="Delete question"
                >
                  {deleting === q.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
          {questions.length === 0 && (
            <p className="text-sm text-center py-8" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No questions found</p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── XP Config Tab ────────────────────────────────────────────────────────────

function ConfigTab() {
  const [config, setConfig] = useState<Record<string, { per_correct: number; perfect_bonus: number }> | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.get('/admin/xp-config').then((res) => setConfig(res.data)).catch(() => {})
  }, [])

  const handleSave = async () => {
    if (!config) return
    setSaving(true)
    try {
      await api.put('/admin/xp-config', {
        easy_per_correct: config.easy.per_correct,
        easy_perfect_bonus: config.easy.perfect_bonus,
        medium_per_correct: config.medium.per_correct,
        medium_perfect_bonus: config.medium.perfect_bonus,
        hard_per_correct: config.hard.per_correct,
        hard_perfect_bonus: config.hard.perfect_bonus,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
    setSaving(false)
  }

  if (!config) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: c.brand }} /></div>

  const diffMeta = [
    { key: 'easy', label: 'Easy', color: c.accent },
    { key: 'medium', label: 'Medium', color: c.brand },
    { key: 'hard', label: 'Hard', color: 'oklch(65% 0.18 25)' },
  ]

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
        Adjust XP rewards per difficulty. Changes apply immediately to new quizzes.
      </p>

      {diffMeta.map(({ key, label, color }) => (
        <div key={key} className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
          <h4 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color }}>
            <Zap size={13} /> {label}
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                XP per correct answer
              </label>
              <input
                type="number"
                value={config[key].per_correct}
                onChange={(e) => setConfig({ ...config, [key]: { ...config[key], per_correct: parseInt(e.target.value) || 0 } })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium block mb-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Perfect score bonus
              </label>
              <input
                type="number"
                value={config[key].perfect_bonus}
                onChange={(e) => setConfig({ ...config, [key]: { ...config[key], perfect_bonus: parseInt(e.target.value) || 0 } })}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
              />
            </div>
          </div>
        </div>
      ))}

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
        style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle2 size={14} /> : <RefreshCw size={14} />}
        {saved ? 'Saved' : 'Save Changes'}
      </button>
    </div>
  )
}

// ─── Challenges Tab ───────────────────────────────────────────────────────────

interface Challenge {
  id: string
  title: string
  description: string | null
  challenge_category: string
  is_featured: boolean
  is_public: boolean
  scheduled_at: string | null
  expires_at: string | null
  pool_stats: { total: number; easy: number; medium: number; hard: number }
  created_at: string | null
}

const categoryColors: Record<string, string> = {
  standard: c.brand,
  survival: 'oklch(65% 0.18 25)',
  timed: 'oklch(70% 0.15 250)',
  accuracy: c.accent,
  boss: 'oklch(70% 0.15 300)',
}

function ChallengesTab() {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Challenge | null>(null)
  const [saving, setSaving] = useState(false)

  // Edit form state
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editFeatured, setEditFeatured] = useState(false)
  const [editScheduled, setEditScheduled] = useState('')
  const [editExpires, setEditExpires] = useState('')

  useEffect(() => {
    api.get('/admin/challenges').then((res) => {
      setChallenges(res.data.challenges)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const openEdit = (ch: Challenge) => {
    setEditing(ch)
    setEditTitle(ch.title)
    setEditDesc(ch.description || '')
    setEditCategory(ch.challenge_category)
    setEditFeatured(ch.is_featured)
    setEditScheduled(ch.scheduled_at ? ch.scheduled_at.slice(0, 16) : '')
    setEditExpires(ch.expires_at ? ch.expires_at.slice(0, 16) : '')
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      await api.put(`/admin/challenges/${editing.id}`, {
        title: editTitle,
        description: editDesc || null,
        challenge_category: editCategory,
        is_featured: editFeatured,
        scheduled_at: editScheduled ? new Date(editScheduled).toISOString() : null,
        expires_at: editExpires ? new Date(editExpires).toISOString() : null,
      })
      setChallenges((prev) => prev.map((ch) => ch.id === editing.id ? {
        ...ch,
        title: editTitle,
        description: editDesc || null,
        challenge_category: editCategory,
        is_featured: editFeatured,
        scheduled_at: editScheduled ? new Date(editScheduled).toISOString() : null,
        expires_at: editExpires ? new Date(editExpires).toISOString() : null,
      } : ch))
      setEditing(null)
    } catch {}
    setSaving(false)
  }

  const toggleFeatured = async (ch: Challenge) => {
    try {
      await api.put(`/admin/challenges/${ch.id}`, { is_featured: !ch.is_featured })
      setChallenges((prev) => prev.map((c2) => c2.id === ch.id ? { ...c2, is_featured: !c2.is_featured } : c2))
    } catch {}
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: c.brand }} /></div>

  return (
    <div>
      {challenges.length === 0 ? (
        <div className="text-center py-16">
          <Flame size={32} className="mx-auto mb-3" style={{ color: c.muted }} />
          <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No challenges found. Set a material's challenge_category to make it a challenge.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {challenges.map((ch) => {
            const catColor = categoryColors[ch.challenge_category] || c.muted
            const now = new Date()
            const isScheduled = ch.scheduled_at && new Date(ch.scheduled_at) > now
            const isExpired = ch.expires_at && new Date(ch.expires_at) < now

            return (
              <div key={ch.id} className="rounded-xl p-5 flex flex-col md:flex-row md:items-center gap-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <h3 className="text-sm font-bold truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{ch.title}</h3>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase" style={{ background: `${catColor}15`, color: catColor }}>{ch.challenge_category}</span>
                    {ch.is_featured && <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ background: `${c.brand}15`, color: c.brand }}>Featured</span>}
                    {isScheduled && <span className="text-[10px] font-medium px-2 py-0.5 rounded flex items-center gap-1" style={{ background: c.surface, color: c.muted }}><Calendar size={9} /> Scheduled</span>}
                    {isExpired && <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: 'oklch(25% 0.04 25)', color: 'oklch(65% 0.12 25)' }}>Expired</span>}
                  </div>
                  <p className="text-xs mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    Pool: {ch.pool_stats.total} ({ch.pool_stats.easy}E / {ch.pool_stats.medium}M / {ch.pool_stats.hard}H)
                  </p>
                  {ch.description && <p className="text-xs line-clamp-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{ch.description}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleFeatured(ch)} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: ch.is_featured ? `${c.brand}12` : c.surface, color: ch.is_featured ? c.brand : c.muted, border: `1px solid ${ch.is_featured ? c.brand : c.border}` }}>
                    <Star size={12} className="inline mr-1" />{ch.is_featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button onClick={() => openEdit(ch)} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: c.surface, color: c.text, border: `1px solid ${c.border}` }}>
                    <Edit3 size={12} className="inline mr-1" />Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {editing && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setEditing(null)}>
            <div className="absolute inset-0" style={{ background: `${c.bg}ee` }} />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-lg rounded-2xl p-8 max-h-[85vh] overflow-y-auto" style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-lg" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Edit Challenge</h2>
                <button onClick={() => setEditing(null)} className="p-1.5 cursor-pointer" style={{ color: c.muted }}><X size={18} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[11px] uppercase tracking-widest font-semibold block mb-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Title</label>
                  <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="w-full px-4 py-3 rounded-xl text-sm outline-none" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }} />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-widest font-semibold block mb-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Description</label>
                  <textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }} />
                </div>
                <div>
                  <label className="text-[11px] uppercase tracking-widest font-semibold block mb-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Category</label>
                  <div className="flex flex-wrap gap-1.5">
                    {['standard', 'survival', 'timed', 'accuracy', 'boss'].map((cat) => (
                      <button key={cat} onClick={() => setEditCategory(cat)} className="text-xs font-medium px-3 py-2 rounded-lg cursor-pointer uppercase" style={{ fontFamily: 'var(--font-space)', background: editCategory === cat ? `${categoryColors[cat]}15` : c.surface, border: `1.5px solid ${editCategory === cat ? categoryColors[cat] : c.border}`, color: editCategory === cat ? categoryColors[cat] : c.muted }}>
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditFeatured(!editFeatured)} className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: editFeatured ? `${c.brand}12` : c.surface, border: `1.5px solid ${editFeatured ? c.brand : c.border}`, color: editFeatured ? c.brand : c.muted }}>
                    <Star size={14} /> Featured {editFeatured ? 'ON' : 'OFF'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] uppercase tracking-widest font-semibold block mb-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Scheduled At</label>
                    <input type="datetime-local" value={editScheduled} onChange={(e) => setEditScheduled(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-xs outline-none" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text, colorScheme: 'dark' }} />
                  </div>
                  <div>
                    <label className="text-[11px] uppercase tracking-widest font-semibold block mb-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Expires At</label>
                    <input type="datetime-local" value={editExpires} onChange={(e) => setEditExpires(e.target.value)} className="w-full px-3 py-2.5 rounded-xl text-xs outline-none" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text, colorScheme: 'dark' }} />
                  </div>
                </div>
                <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Scheduled: challenge becomes visible at this time. Expires: challenge hidden after this time. Leave empty for always visible.</p>
              </div>
              <button onClick={handleSave} disabled={!editTitle.trim() || saving} className="w-full mt-6 py-3.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────

function AdminContent() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [poolHealth, setPoolHealth] = useState<PoolHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await api.get('/admin/dashboard')
        setStats(res.data.stats)
        setPoolHealth(res.data.pool_health)
      } catch (err: any) {
        if (err.response?.status === 403) {
          setError('Admin access required')
        } else {
          setError('Failed to load admin data')
        }
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [])

  const tabs: { id: Tab; label: string; icon: typeof Users }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: Target },
    { id: 'challenges', label: 'Challenges', icon: Flame },
    { id: 'questions', label: 'Questions', icon: Brain },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'config', label: 'XP Config', icon: Zap },
  ]

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Shield size={40} style={{ color: c.muted }} />
        <p className="text-lg font-bold mt-4" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{error}</p>
      </div>
    )
  }

  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Crown size={18} style={{ color: c.brand }} />
            <h1 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Admin Panel</h1>
          </div>
        </div>

        {/* Sidebar + Content Layout */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left sidebar nav (desktop: vertical, mobile: horizontal fitted row) */}
          <nav className="md:w-52 flex-shrink-0">
            <div className="flex md:flex-col gap-1 rounded-2xl p-2 md:p-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="flex-1 md:flex-none flex items-center justify-center md:justify-start gap-2 md:gap-3 px-2 md:px-4 py-2.5 md:py-3.5 rounded-xl text-xs md:text-sm font-medium cursor-pointer whitespace-nowrap md:w-full text-center md:text-left"
                  style={{
                    fontFamily: 'var(--font-space)',
                    background: activeTab === id ? `${c.brand}15` : 'transparent',
                    color: activeTab === id ? c.brand : c.muted,
                    transition: 'all 150ms ease',
                  }}
                >
                  <Icon size={16} />
                  <span className="hidden sm:inline md:inline">{label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* Right content area */}
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="flex justify-center py-20">
                <Loader2 size={24} className="animate-spin" style={{ color: c.brand }} />
              </div>
            ) : (
              <>
                {activeTab === 'dashboard' && stats && <DashboardTab stats={stats} poolHealth={poolHealth} />}
                {activeTab === 'challenges' && <ChallengesTab />}
                {activeTab === 'questions' && <QuestionsTab />}
                {activeTab === 'users' && <UsersTab />}
                {activeTab === 'config' && <ConfigTab />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Users Tab (simple) ───────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<any | null>(null)
  const [activity, setActivity] = useState<any[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [moderating, setModerating] = useState(false)
  const [warnReason, setWarnReason] = useState('')
  const [showWarnInput, setShowWarnInput] = useState(false)

  useEffect(() => {
    api.get('/admin/users?limit=50').then((res) => {
      setUsers(res.data.users)
      setTotal(res.data.total)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const openUser = async (user: any) => {
    setSelectedUser(user)
    setActivityLoading(true)
    try {
      const res = await api.get(`/admin/users/${user.id}/activity`)
      setActivity(res.data.activity)
      setSelectedUser(res.data.user)
    } catch {}
    setActivityLoading(false)
  }

  const handleModerate = async (action: string, value?: number) => {
    if (!selectedUser) return
    setModerating(true)
    try {
      const res = await api.post(`/admin/users/${selectedUser.id}/moderate`, { action, value })
      setSelectedUser((prev: any) => prev ? { ...prev, role: res.data.new_role, xp: res.data.new_xp } : null)
      setUsers((prev) => prev.map((u) => u.id === selectedUser.id ? { ...u, role: res.data.new_role, xp: res.data.new_xp } : u))
    } catch {}
    setModerating(false)
  }

  const handleWarn = async () => {
    if (!selectedUser || !warnReason.trim()) return
    setModerating(true)
    try {
      await api.post(`/admin/users/${selectedUser.id}/moderate`, { action: 'warn', reason: warnReason.trim() })
      setWarnReason('')
      setShowWarnInput(false)
    } catch {}
    setModerating(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin" style={{ color: c.brand }} /></div>

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* User list */}
      <div className="flex-1 min-w-0 space-y-2">
        <p className="text-xs font-medium mb-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{total} total users</p>
        {users.map((u) => (
          <div
            key={u.id}
            onClick={() => openUser(u)}
            className="flex items-center gap-3 p-4 rounded-xl cursor-pointer transition-colors"
            style={{
              background: selectedUser?.id === u.id ? `${c.brand}08` : c.card,
              border: `1px solid ${selectedUser?.id === u.id ? c.brand : c.border}`,
            }}
          >
            {u.picture ? (
              <img src={u.picture} alt="" className="w-9 h-9 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: c.surface, color: c.muted }}>
                {u.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                {u.name}
                {u.role === 'admin' && <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${c.purple}15`, color: c.purple }}>ADMIN</span>}
                {u.role === 'moderator' && <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${c.accent}15`, color: c.accent }}>MOD</span>}
                {u.role === 'banned' && <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: 'oklch(25% 0.04 25)', color: 'oklch(65% 0.15 25)' }}>BANNED</span>}
              </p>
              <p className="text-[11px] truncate" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{u.email}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{u.xp} XP</p>
              <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Lv.{u.level}</p>
            </div>
          </div>
        ))}
      </div>

      {/* User detail / audit panel */}
      {selectedUser && (
        <div className="w-full lg:w-96 flex-shrink-0 space-y-4">
          {/* User info card */}
          <div className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <div className="flex items-center gap-3 mb-4">
              {selectedUser.picture ? (
                <img src={selectedUser.picture} alt="" className="w-12 h-12 rounded-full" />
              ) : (
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold" style={{ background: c.surface, color: c.muted }}>{selectedUser.name?.charAt(0)}</div>
              )}
              <div>
                <p className="text-base font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{selectedUser.name}</p>
                <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{selectedUser.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-2 rounded-lg" style={{ background: c.surface }}>
                <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{selectedUser.xp}</p>
                <p className="text-[9px] uppercase" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>XP</p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: c.surface }}>
                <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{selectedUser.level}</p>
                <p className="text-[9px] uppercase" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Level</p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: c.surface }}>
                <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{selectedUser.streak}</p>
                <p className="text-[9px] uppercase" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Streak</p>
              </div>
            </div>
            <p className="text-[10px] mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Joined: {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleDateString() : 'Unknown'}
              {selectedUser.last_active_date && ` · Last active: ${new Date(selectedUser.last_active_date).toLocaleDateString()}`}
            </p>

            {/* Moderation actions */}
            <div className="space-y-3">
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Moderation</p>
              <div className="flex flex-wrap gap-1.5">
                <button onClick={() => setShowWarnInput(!showWarnInput)} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: 'oklch(30% 0.06 65)', color: 'oklch(75% 0.15 65)', border: '1px solid oklch(35% 0.08 65)' }}>
                  <AlertTriangle size={11} className="inline mr-1" />Warn
                </button>
                {selectedUser.role === 'user' && (
                  <button onClick={() => handleModerate('make_mod')} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: `${c.accent}12`, color: c.accent, border: `1px solid ${c.accent}25` }}>
                    Make Mod
                  </button>
                )}
                {selectedUser.role !== 'admin' && selectedUser.role !== 'moderator' && (
                  <button onClick={() => handleModerate('promote')} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: `${c.purple}12`, color: c.purple, border: `1px solid ${c.purple}25` }}>
                    Promote
                  </button>
                )}
                {(selectedUser.role === 'admin' || selectedUser.role === 'moderator') && (
                  <button onClick={() => handleModerate('demote')} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: c.surface, color: c.muted, border: `1px solid ${c.border}` }}>
                    Demote
                  </button>
                )}
                <button onClick={() => handleModerate('reset_xp')} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: c.surface, color: 'oklch(65% 0.15 25)', border: `1px solid ${c.border}` }}>
                  Reset XP
                </button>
                <button onClick={() => handleModerate('reset_streak')} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: c.surface, color: 'oklch(65% 0.15 25)', border: `1px solid ${c.border}` }}>
                  Reset Streak
                </button>
                <button onClick={() => handleModerate('xp_penalty', 100)} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: c.surface, color: 'oklch(65% 0.15 50)', border: `1px solid ${c.border}` }}>
                  -100 XP
                </button>
                {selectedUser.role !== 'banned' ? (
                  <button onClick={() => handleModerate('ban')} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(65% 0.18 25)', border: '1px solid oklch(30% 0.06 25)' }}>
                    Ban
                  </button>
                ) : (
                  <button onClick={() => handleModerate('unban')} disabled={moderating} className="text-[11px] font-medium px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: `${c.accent}12`, color: c.accent, border: `1px solid ${c.accent}25` }}>
                    Unban
                  </button>
                )}
              </div>

              {/* Warning input */}
              {showWarnInput && (
                <div className="flex gap-2 mt-2">
                  <input
                    type="text"
                    value={warnReason}
                    onChange={(e) => setWarnReason(e.target.value)}
                    placeholder="Reason for warning..."
                    className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                    onKeyDown={(e) => e.key === 'Enter' && handleWarn()}
                  />
                  <button onClick={handleWarn} disabled={!warnReason.trim() || moderating} className="text-[11px] font-semibold px-3 py-2 rounded-lg cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: 'oklch(75% 0.15 65)', color: c.bg }}>
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Audit log */}
          <div className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Activity Log</p>
            {activityLoading ? (
              <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin" style={{ color: c.brand }} /></div>
            ) : activity.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No activity recorded</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5 py-2" style={{ borderBottom: `1px solid ${c.border}` }}>
                    <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: a.type === 'quiz_completed' ? `${c.brand}12` : a.type === 'badge_earned' ? `${c.accent}12` : c.surface }}>
                      {a.type === 'quiz_completed' && <Target size={10} style={{ color: c.brand }} />}
                      {a.type === 'material_uploaded' && <FileText size={10} style={{ color: c.muted }} />}
                      {a.type === 'badge_earned' && <Trophy size={10} style={{ color: c.accent }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] leading-snug" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                        {a.type === 'quiz_completed' && <>{a.quiz_title} — <span style={{ color: a.score >= 80 ? c.accent : a.score >= 50 ? c.brand : 'oklch(65% 0.15 25)' }}>{Math.round(a.score || 0)}%</span> ({a.correct_count}/{a.total_questions})</>}
                        {a.type === 'material_uploaded' && <>Uploaded: {a.material_title}</>}
                        {a.type === 'badge_earned' && <>Earned badge: {a.badge_key}</>}
                      </p>
                      <p className="text-[9px] mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                        {a.completed_at ? new Date(a.completed_at).toLocaleString() : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  return (
    <RequireAuth>
      <AdminContent />
    </RequireAuth>
  )
}
