import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, Flame, Zap, Brain, Target, Users, Play,
  Loader2, FileText, Crown, Shield, Swords, TrendingUp, Star,
  Clock, Crosshair, RotateCcw, Heart, AlertTriangle,
} from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { BottomSheetModal } from '../components/BottomSheetModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Challenge {
  id: string
  title: string
  description: string | null
  category: string
  page_count: number | null
  uploader: string
  pool_stats: { easy: number; medium: number; hard: number }
  total_attempts: number
  unique_players: number
  completion_rates: { easy: number | null; medium: number | null; hard: number | null }
  avg_scores: { easy: number | null; medium: number | null; hard: number | null }
  xp_rewards: Record<string, { per_correct: number; perfect_bonus: number }>
  almost_there: { questions_answered: number; total_questions: number } | null
  created_at: string
}

interface ChallengeDetail {
  id: string
  title: string
  description: string | null
  category: string
  page_count: number | null
  uploader: string
  pool_stats: { easy: number; medium: number; hard: number }
  user_scores: { easy: number | null; medium: number | null; hard: number | null }
  completion_rates: { easy: number | null; medium: number | null; hard: number | null }
  avg_scores: { easy: number | null; medium: number | null; hard: number | null }
  total_attempts: number
  unique_players: number
  xp_rewards: Record<string, { per_correct: number; perfect_bonus: number }>
  tiers: Record<string, { question_types: string[]; time_pressure: boolean; time_per_question: number | null }>
  rival: { name: string; picture: string | null; score: number; gap: number } | null
}

interface LeaderboardEntry {
  rank: number
  user_id: string
  name: string
  picture: string | null
  score: number
}

interface PersonalStats {
  challenges_completed: number
  total_attempts: number
  best_score: number
  hardest_cleared: string | null
  total_perfect: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard'

const difficultyMeta: Record<Difficulty, {
  label: string
  icon: typeof Zap
  color: string
  glow: string
  desc: string
  emotionalLabel: (rate: number | null) => string
}> = {
  easy: {
    label: 'Easy',
    icon: Zap,
    color: c.accent,
    glow: `${c.accent}30`,
    desc: 'MCQ + True/False, no timer',
    emotionalLabel: (rate) => rate !== null && rate < 50 ? `Only ${rate}% pass this` : 'Warm up here',
  },
  medium: {
    label: 'Medium',
    icon: Target,
    color: c.brand,
    glow: `${c.brand}30`,
    desc: 'MCQ + Fill Blank + Matching, 30s',
    emotionalLabel: (rate) => rate !== null && rate < 40 ? `Only ${rate}% survive this` : 'Test your knowledge',
  },
  hard: {
    label: 'Hard',
    icon: Brain,
    color: 'oklch(65% 0.18 25)',
    glow: 'oklch(65% 0.18 25 / 0.3)',
    desc: 'All types, 15s per question',
    emotionalLabel: (rate) => rate !== null ? `Only ${rate}% conquer this mode` : 'Prove your mastery',
  },
}

// ─── Featured Challenge Hero ──────────────────────────────────────────────────

function FeaturedHero({ challenge, onOpen }: { challenge: Challenge; onOpen: (id: string) => void }) {
  const hardRate = challenge.completion_rates.hard
  const hardAvg = challenge.avg_scores.hard

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      onClick={() => onOpen(challenge.id)}
      className="relative rounded-2xl p-8 cursor-pointer overflow-hidden group"
      style={{
        background: `linear-gradient(135deg, ${c.card} 0%, oklch(20% 0.04 280) 100%)`,
        border: `1.5px solid ${c.brand}40`,
      }}
    >
      {/* Animated glow border */}
      <div
        className="absolute inset-0 rounded-2xl opacity-40 group-hover:opacity-70 transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${c.brand}20 0%, transparent 60%)`,
        }}
      />

      {/* Content */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Swords size={14} style={{ color: c.brand }} />
          <span className="text-[11px] uppercase tracking-widest font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
            Featured Challenge
          </span>
        </div>

        <h2 className="font-bold text-2xl md:text-3xl mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
          {challenge.title}
        </h2>

        {challenge.description && (
          <p className="text-sm mb-5 max-w-xl" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {challenge.description}
          </p>
        )}

        {/* Stats row */}
        <div className="flex flex-wrap items-center gap-5 mb-5">
          <div className="flex items-center gap-1.5">
            <Users size={13} style={{ color: c.muted }} />
            <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {challenge.total_attempts.toLocaleString()} attempts
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp size={13} style={{ color: c.muted }} />
            <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {challenge.unique_players} players
            </span>
          </div>
          {hardRate !== null && (
            <div className="flex items-center gap-1.5">
              <Shield size={13} style={{ color: 'oklch(65% 0.18 25)' }} />
              <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: 'oklch(65% 0.18 25)' }}>
                Only {hardRate}% completed on Hard
              </span>
            </div>
          )}
        </div>

        {/* Reward preview */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: `${c.brand}15` }}>
            <Trophy size={13} style={{ color: c.brand }} />
            <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
              Up to +{(challenge.xp_rewards?.hard?.per_correct || 25) * 10 + (challenge.xp_rewards?.hard?.perfect_bonus || 200)} XP
            </span>
          </div>
          <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            by {challenge.uploader}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Challenge Card ───────────────────────────────────────────────────────────

function ChallengeCard({ challenge, index, onOpen }: { challenge: Challenge; index: number; onOpen: (id: string) => void }) {
  // Determine the "hardest available" difficulty for atmosphere
  const hardestAvailable: Difficulty = challenge.pool_stats.hard >= 5 ? 'hard' : challenge.pool_stats.medium >= 5 ? 'medium' : 'easy'
  const atmosphere = difficultyMeta[hardestAvailable]

  // Pick the most dramatic stat to show
  const hardRate = challenge.completion_rates.hard
  const medRate = challenge.completion_rates.medium
  const showRate = hardRate !== null ? { diff: 'Hard', rate: hardRate } : medRate !== null ? { diff: 'Medium', rate: medRate } : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileHover={{ y: -4, scale: 1.01 }}
      onClick={() => onOpen(challenge.id)}
      className="rounded-2xl p-5 cursor-pointer transition-all relative overflow-hidden group"
      style={{
        background: c.card,
        border: `1px solid ${c.border}`,
      }}
    >
      {/* Difficulty atmosphere glow */}
      <div
        className="absolute top-0 right-0 w-24 h-24 opacity-20 group-hover:opacity-40 transition-opacity"
        style={{
          background: `radial-gradient(circle, ${atmosphere.color}40 0%, transparent 70%)`,
        }}
      />

      <div className="relative z-10">
        {/* Title */}
        <h3 className="font-bold text-base mb-1.5 line-clamp-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
          {challenge.title}
        </h3>

        {/* Emotional copy / completion stat */}
        {challenge.almost_there ? (
          <p className="text-xs font-medium mb-4" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
            <RotateCcw size={10} className="inline mr-1" />
            You reached Q{challenge.almost_there.questions_answered}/{challenge.almost_there.total_questions} last attempt
          </p>
        ) : showRate ? (
          <p className="text-xs font-medium mb-4 inline-flex items-center gap-1.5" style={{ fontFamily: 'var(--font-space)', color: atmosphere.color }}>
            {showRate.rate < 50 ? (
              <>
                <AlertTriangle size={11} />
                Only {showRate.rate}% survive {showRate.diff} mode
              </>
            ) : (
              `${showRate.rate}% completion on ${showRate.diff}`
            )}
          </p>
        ) : challenge.description ? (
          <p className="text-xs mb-4 line-clamp-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {challenge.description}
          </p>
        ) : (
          <p className="text-xs mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {challenge.total_attempts > 0 ? `${challenge.total_attempts.toLocaleString()} attempts so far` : 'Be the first to attempt'}
          </p>
        )}

        {/* Difficulty indicators */}
        <div className="flex items-center gap-3 mb-4">
          {(['easy', 'medium', 'hard'] as const).map((diff) => {
            const meta = difficultyMeta[diff]
            const available = challenge.pool_stats[diff] >= 5
            return (
              <div key={diff} className="flex items-center gap-1">
                <meta.icon size={11} style={{ color: available ? meta.color : c.muted, opacity: available ? 1 : 0.35 }} />
                <span className="text-[10px] font-medium" style={{ fontFamily: 'var(--font-space)', color: available ? meta.color : c.muted, opacity: available ? 1 : 0.35 }}>
                  {meta.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* XP reward + players */}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${c.border}` }}>
          <div className="flex items-center gap-1.5">
            <Star size={11} style={{ color: c.brand }} />
            <span className="text-[11px] font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
              +{(challenge.xp_rewards?.[hardestAvailable]?.per_correct || 10) * 10} XP
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Users size={11} style={{ color: c.muted }} />
            <span className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              {challenge.unique_players || challenge.total_attempts} plays
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Personal Stats Section ───────────────────────────────────────────────────

function PersonalStatsSection({ stats }: { stats: PersonalStats }) {
  const statItems = [
    { label: 'Challenges Won', value: stats.challenges_completed, icon: Trophy, color: c.brand },
    { label: 'Total Attempts', value: stats.total_attempts, icon: Flame, color: 'oklch(70% 0.16 30)' },
    { label: 'Best Score', value: `${stats.best_score}%`, icon: Target, color: c.accent },
    { label: 'Perfect Runs', value: stats.total_perfect, icon: Crown, color: c.purple },
    { label: 'Hardest Cleared', value: stats.hardest_cleared ? stats.hardest_cleared.charAt(0).toUpperCase() + stats.hardest_cleared.slice(1) : '—', icon: Shield, color: 'oklch(65% 0.18 25)' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl p-6"
      style={{ background: c.card, border: `1px solid ${c.border}` }}
    >
      <h3 className="text-xs uppercase tracking-widest font-bold mb-5 flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
        <TrendingUp size={13} /> Your Challenge Stats
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
        {statItems.map((item) => (
          <div key={item.label} className="text-center">
            <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center" style={{ background: `${item.color}15` }}>
              <item.icon size={18} style={{ color: item.color }} />
            </div>
            <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{item.value}</p>
            <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{item.label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

// ─── Challenge Detail Modal ───────────────────────────────────────────────────

const SURVIVAL_RED = 'oklch(70% 0.22 25)'

function SurvivalTierCard({
  challenge,
  status,
  starting,
  onStart,
}: {
  challenge: ChallengeDetail
  status: {
    attempts_used: number
    attempts_remaining: number
    daily_limit: number
    longest_survival: number
  } | null
  starting: boolean
  onStart: () => void
}) {
  const totalPool =
    challenge.pool_stats.easy + challenge.pool_stats.medium + challenge.pool_stats.hard
  const poolReady = totalPool >= 10
  const remaining = status?.attempts_remaining ?? 0
  const used = status?.attempts_used ?? 0
  const limit = status?.daily_limit ?? 3
  const personalBest = status?.longest_survival ?? 0
  const exhausted = status !== null && remaining <= 0
  const disabled = !poolReady || exhausted || starting

  return (
    <div className="mb-8">
      <h3
        className="text-xs uppercase tracking-wider font-semibold mb-3 flex items-center gap-2"
        style={{ fontFamily: 'var(--font-space)', color: c.muted }}
      >
        <Heart size={12} style={{ color: SURVIVAL_RED }} fill={SURVIVAL_RED} />
        Survival mode
      </h3>

      <motion.button
        whileHover={!disabled ? { y: -2 } : {}}
        onClick={() => !disabled && onStart()}
        disabled={disabled}
        className="w-full text-left rounded-2xl p-5 relative overflow-hidden disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(135deg, ${c.surface} 0%, oklch(20% 0.05 25) 100%)`,
          border: `1.5px solid ${disabled ? `${SURVIVAL_RED}25` : `${SURVIVAL_RED}55`}`,
          opacity: disabled ? 0.55 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: !disabled ? `0 8px 32px ${SURVIVAL_RED}18` : 'none',
          transition: 'transform 200ms ease-out, box-shadow 200ms ease-out',
        }}
      >
        {/* Atmospheric glow */}
        <div
          className="absolute -top-8 -right-8 w-32 h-32 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${SURVIVAL_RED}20 0%, transparent 70%)`,
            filter: 'blur(8px)',
          }}
        />

        <div className="relative flex items-start gap-4">
          {/* Three hearts visual */}
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {[0, 1, 2].map((i) => (
              <Heart
                key={i}
                size={18}
                fill={SURVIVAL_RED}
                strokeWidth={2}
                style={{
                  color: SURVIVAL_RED,
                  filter: `drop-shadow(0 0 6px ${SURVIVAL_RED}66)`,
                }}
              />
            ))}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <p
                className="text-base font-extrabold"
                style={{ fontFamily: 'var(--font-space)', color: c.text }}
              >
                Endless Survival
              </p>
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{
                  background: `${SURVIVAL_RED}1a`,
                  color: SURVIVAL_RED,
                  border: `1px solid ${SURVIVAL_RED}40`,
                }}
              >
                3 hearts
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                style={{
                  background: `${SURVIVAL_RED}1a`,
                  color: SURVIVAL_RED,
                  border: `1px solid ${SURVIVAL_RED}40`,
                }}
              >
                20s/question
              </span>
            </div>

            <p
              className="text-xs leading-relaxed mb-3"
              style={{ fontFamily: 'var(--font-space)', color: c.muted, maxWidth: '40ch' }}
            >
              {!poolReady
                ? `Need at least 10 questions in the pool. Currently has ${totalPool}.`
                : exhausted
                ? `You've used all ${limit} runs today. Resets at midnight UTC.`
                : '20 seconds per question. Three wrong answers (or three timeouts) and the run is over.'}
            </p>

            <div className="flex items-center gap-4 flex-wrap text-[11px]">
              {status && (
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                >
                  <span
                    className="font-bold"
                    style={{ color: remaining > 0 ? c.text : SURVIVAL_RED }}
                  >
                    {remaining}/{limit}
                  </span>
                  runs left today
                </span>
              )}
              {personalBest > 0 && (
                <span
                  className="inline-flex items-center gap-1.5"
                  style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                >
                  <Crown size={10} style={{ color: c.brand }} />
                  Best:{' '}
                  <span className="font-bold" style={{ color: c.brand }}>
                    {personalBest}
                  </span>
                </span>
              )}
            </div>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 flex items-center">
            {starting ? (
              <Loader2 size={18} className="animate-spin" style={{ color: SURVIVAL_RED }} />
            ) : !disabled ? (
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{
                  background: SURVIVAL_RED,
                  color: c.bg,
                  boxShadow: `0 0 16px ${SURVIVAL_RED}66`,
                }}
              >
                <Play size={16} fill={c.bg} strokeWidth={0} />
              </div>
            ) : null}
          </div>
        </div>
      </motion.button>

      {/* Daily progress dots */}
      {status && (
        <div className="flex items-center gap-1.5 mt-3 px-1">
          {Array.from({ length: limit }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-1 rounded-full"
              style={{
                background: i < used ? SURVIVAL_RED : c.border,
                transition: 'background 200ms ease-out',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChallengeDetailModal({
  challenge,
  leaderboard,
  leaderboardDiff,
  starting,
  onClose,
  onStart,
  onStartSurvival,
  onSwitchLeaderboard,
  survivalStatus,
}: {
  challenge: ChallengeDetail
  leaderboard: LeaderboardEntry[]
  leaderboardDiff: string
  starting: boolean
  onClose: () => void
  onStart: (diff: string) => void
  onStartSurvival: () => void
  onSwitchLeaderboard: (materialId: string, diff: string) => void
  survivalStatus: {
    attempts_used: number
    attempts_remaining: number
    daily_limit: number
    longest_survival: number
  } | null
}) {
  return (
    <BottomSheetModal onClose={onClose} maxWidth="max-w-xl">
      <div className="p-6 md:p-8">
        <h2 className="font-bold text-2xl mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
          {challenge.title}
        </h2>
        {challenge.description && (
          <p className="text-sm mb-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {challenge.description}
          </p>
        )}

        {/* Stats banner */}
        <div className="flex flex-wrap gap-4 mb-6 p-3 rounded-xl" style={{ background: c.surface }}>
          <div className="text-center flex-1">
            <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{challenge.total_attempts.toLocaleString()}</p>
            <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Attempts</p>
          </div>
          <div className="text-center flex-1">
            <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{challenge.unique_players}</p>
            <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Players</p>
          </div>
          {challenge.avg_scores.hard !== null && (
            <div className="text-center flex-1">
              <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-space)', color: 'oklch(65% 0.18 25)' }}>{challenge.avg_scores.hard}%</p>
              <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Avg on Hard</p>
            </div>
          )}
        </div>

        {/* Rival callout */}
        {challenge.rival && (
          <div className="flex items-center gap-3 mb-6 p-3 rounded-xl" style={{ background: `${c.purple}10`, border: `1px solid ${c.purple}25` }}>
            {challenge.rival.picture ? (
              <img src={challenge.rival.picture} alt="" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: c.surface, color: c.muted }}>
                {challenge.rival.name.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                Can you beat {challenge.rival.name}?
              </p>
              <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                They scored {challenge.rival.score}% — {challenge.rival.gap}% ahead of you
              </p>
            </div>
            <Swords size={14} style={{ color: c.purple }} />
          </div>
        )}

        {/* Difficulty Tiers */}
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          Choose difficulty
        </h3>
        <div className="flex flex-col gap-3 mb-8">
          {(['easy', 'medium', 'hard'] as const).map((diff) => {
            const meta = difficultyMeta[diff]
            const available = challenge.pool_stats[diff] >= 5
            const userScore = challenge.user_scores[diff]
            const completionRate = challenge.completion_rates[diff]
            const xpReward = challenge.xp_rewards?.[diff]

            return (
              <motion.button
                key={diff}
                whileHover={available ? { x: 4 } : {}}
                onClick={() => available && onStart(diff)}
                disabled={!available || starting}
                className="flex items-center gap-4 p-4 rounded-xl text-left transition-colors disabled:cursor-not-allowed"
                style={{
                  background: available ? c.surface : `${c.surface}60`,
                  border: `1px solid ${available ? `${meta.color}30` : `${c.border}50`}`,
                  opacity: available ? 1 : 0.5,
                  cursor: available ? 'pointer' : 'not-allowed',
                }}
              >

                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${meta.color}15` }}>
                  <meta.icon size={18} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{meta.label}</p>
                    {xpReward && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${meta.color}15`, color: meta.color }}>
                        +{xpReward.per_correct * 10 + xpReward.perfect_bonus} XP max
                      </span>
                    )}
                  </div>
                  <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    {completionRate !== null
                      ? meta.emotionalLabel(completionRate)
                      : meta.desc}
                  </p>
                </div>
                {userScore !== null && (
                  <span className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ fontFamily: 'var(--font-space)', background: `${meta.color}15`, color: meta.color }}>
                    Best: {userScore}%
                  </span>
                )}
                {!available && (
                  <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Not ready</span>
                )}
                {available && userScore === null && (
                  <Play size={16} style={{ color: meta.color }} />
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Survival mode card — sits as a fourth tier with its own visual identity */}
        <SurvivalTierCard
          challenge={challenge}
          status={survivalStatus}
          starting={starting}
          onStart={onStartSurvival}
        />

        {/* Leaderboard */}
        <h3 className="text-xs uppercase tracking-wider font-semibold mb-3 flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          <Trophy size={12} /> Leaderboard
        </h3>
        <div className="flex items-center gap-2 mb-4">
          {(['easy', 'medium', 'hard'] as const).map((diff) => (
            <button
              key={diff}
              onClick={() => onSwitchLeaderboard(challenge.id, diff)}
              className="text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer"
              style={{
                fontFamily: 'var(--font-space)',
                background: leaderboardDiff === diff ? `${difficultyMeta[diff].color}18` : c.surface,
                color: leaderboardDiff === diff ? difficultyMeta[diff].color : c.muted,
                border: leaderboardDiff === diff ? `1px solid ${difficultyMeta[diff].color}` : `1px solid ${c.border}`,
              }}
            >
              {difficultyMeta[diff].label}
            </button>
          ))}
        </div>
        {leaderboard.length === 0 ? (
          <p className="text-xs py-4 text-center" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            No scores yet. Be the first!
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {leaderboard.slice(0, 10).map((entry) => (
              <div key={entry.user_id} className="flex items-center gap-3 py-2">
                <span className="text-xs font-bold w-6 text-center" style={{ fontFamily: 'var(--font-space)', color: entry.rank <= 3 ? c.brand : c.muted }}>
                  {entry.rank}
                </span>
                {entry.picture ? (
                  <img src={entry.picture} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: c.surface, color: c.muted }}>
                    {entry.name.charAt(0)}
                  </div>
                )}
                <span className="text-sm flex-1 truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{entry.name}</span>
                <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{entry.score}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </BottomSheetModal>
  )
}

function ChallengesContent() {
  const navigate = useNavigate()
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [personalStats, setPersonalStats] = useState<PersonalStats | null>(null)
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeDetail | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardDiff, setLeaderboardDiff] = useState<string>('easy')
  const [starting, setStarting] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [survivalStatus, setSurvivalStatus] = useState<{
    attempts_used: number
    attempts_remaining: number
    daily_limit: number
    longest_survival: number
  } | null>(null)

  useEscapeClose(!!selectedChallenge, () => setSelectedChallenge(null))

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [challengesRes, statsRes, survivalRes] = await Promise.all([
          api.get('/challenges/'),
          api.get('/challenges/stats'),
          api.get('/challenges/survival/status').catch(() => null),
        ])
        setChallenges(challengesRes.data)
        setPersonalStats(statsRes.data)
        if (survivalRes) setSurvivalStatus(survivalRes.data)
      } catch {
        setChallenges([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Featured challenge = most attempts (most popular)
  const featured = useMemo(() => {
    if (challenges.length === 0) return null
    return [...challenges].sort((a, b) => b.total_attempts - a.total_attempts)[0]
  }, [challenges])

  // Filter by category, then exclude featured
  const filteredChallenges = useMemo(() => {
    let filtered = challenges
    if (activeCategory !== 'all') {
      filtered = filtered.filter((ch) => ch.category === activeCategory)
    }
    return filtered
  }, [challenges, activeCategory])

  // Remaining challenges (exclude featured)
  const gridChallenges = useMemo(() => {
    if (!featured) return filteredChallenges
    return filteredChallenges.filter((ch) => ch.id !== featured.id)
  }, [filteredChallenges, featured])

  const openChallenge = async (id: string) => {
    try {
      const res = await api.get(`/challenges/${id}`)
      setSelectedChallenge(res.data)
      fetchLeaderboard(id, 'easy')
    } catch {}
  }

  const fetchLeaderboard = async (materialId: string, diff: string) => {
    setLeaderboardDiff(diff)
    try {
      const res = await api.get(`/challenges/${materialId}/leaderboard?difficulty=${diff}`)
      setLeaderboard(res.data.leaderboard || [])
    } catch {
      setLeaderboard([])
    }
  }

  const startChallenge = async (difficulty: string) => {
    if (!selectedChallenge) return
    setStarting(true)
    try {
      const res = await api.post(`/challenges/${selectedChallenge.id}/start?difficulty=${difficulty}`)
      navigate(`/quiz/${res.data.quiz_id}`, {
        state: {
          mode: 'standard',
          time_pressure: res.data.time_pressure,
          time_per_question: res.data.time_per_question,
        },
      })
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to start challenge')
    } finally {
      setStarting(false)
    }
  }

  const startSurvival = async () => {
    if (!selectedChallenge) return
    setStarting(true)
    try {
      const res = await api.post(`/challenges/${selectedChallenge.id}/start-survival`)
      navigate(`/survival/${res.data.quiz_id}`, {
        state: {
          quizId: res.data.quiz_id,
          hearts: res.data.hearts_remaining,
          survivalCount: res.data.survival_count,
          attemptsRemaining: res.data.attempts_remaining_today,
          firstQuestion: res.data.first_question,
          title: res.data.title,
        },
      })
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      const message =
        typeof detail === 'object' && detail?.message
          ? detail.message
          : typeof detail === 'string'
          ? detail
          : 'Failed to start survival run'
      alert(message)
      setStarting(false)
    }
  }

  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10 space-y-8">
        {/* Page title */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-bold text-3xl mb-2 inline-flex items-center gap-2.5" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            <Flame size={26} style={{ color: c.brand }} fill={c.brand} />
            Challenge Arena
          </h1>
          <p className="text-base" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            Compete on curated challenges. Prove your mastery. Climb the leaderboard.
          </p>
        </motion.div>

        {/* Category Filter Tabs */}
        {!loading && challenges.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {[
              { id: 'all', label: 'All', icon: Flame },
              { id: 'standard', label: 'Standard', icon: Play },
              { id: 'survival', label: 'Survival', icon: Shield },
              { id: 'timed', label: 'Timed', icon: Clock },
              { id: 'accuracy', label: 'Accuracy', icon: Crosshair },
              { id: 'boss', label: 'Boss', icon: Crown },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveCategory(id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap flex-shrink-0"
                style={{
                  fontFamily: 'var(--font-space)',
                  background: activeCategory === id ? `${c.brand}18` : c.surface,
                  border: activeCategory === id ? `1px solid ${c.brand}` : `1px solid ${c.border}`,
                  color: activeCategory === id ? c.brand : c.muted,
                  transition: 'all 150ms cubic-bezier(0.25, 1, 0.5, 1)',
                }}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: c.brand }} />
          </div>
        ) : challenges.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <FileText size={40} className="mx-auto mb-4" style={{ color: c.muted }} />
            <p className="font-bold text-lg mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>No challenges yet</p>
            <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Public challenges will appear here when admins publish materials.</p>
          </motion.div>
        ) : (
          <>
            {/* Featured Challenge Hero */}
            {featured && <FeaturedHero challenge={featured} onOpen={openChallenge} />}

            {/* Challenge Grid */}
            {gridChallenges.length > 0 && (
              <div>
                <h2 className="text-xs uppercase tracking-widest font-bold mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  <Swords size={13} /> All Challenges
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {gridChallenges.map((ch, i) => (
                    <ChallengeCard key={ch.id} challenge={ch} index={i} onOpen={openChallenge} />
                  ))}
                </div>
              </div>
            )}

            {/* Personal Stats */}
            {personalStats && personalStats.total_attempts > 0 && (
              <PersonalStatsSection stats={personalStats} />
            )}
          </>
        )}
      </div>

      {/* Challenge Detail Modal */}
      <AnimatePresence>
        {selectedChallenge && (
          <ChallengeDetailModal
            challenge={selectedChallenge}
            leaderboard={leaderboard}
            leaderboardDiff={leaderboardDiff}
            starting={starting}
            onClose={() => setSelectedChallenge(null)}
            onStart={startChallenge}
            onStartSurvival={startSurvival}
            onSwitchLeaderboard={fetchLeaderboard}
            survivalStatus={survivalStatus}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ChallengesPage() {
  return (
    <RequireAuth>
      <ChallengesContent />
    </RequireAuth>
  )
}
