import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  Award,
  Lock,
  Upload,
  Play,
  Flame,
  Target,
  Brain,
  Crown,
  Shield,
  Trophy,
  Heart,
  Clock,
  Zap,
  Star,
  Swords,
  Users,
  Moon,
  Rocket,
  CheckCircle2,
  Crosshair,
  BookOpen,
  FolderOpen,
  Library,
  RotateCcw,
  Compass,
} from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { cachedGet, invalidate } from '../lib/queryCache'
import { theme as c } from '../theme'

// --- Types ---

interface BadgeProgress {
  current: number
  target: number
  percent: number
}

interface Badge {
  key: string
  name: string
  description: string
  icon: string
  category: string
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic'
  earned: boolean
  progress: BadgeProgress | null
}

// --- Icon Map ---

const iconMap: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  upload: Upload,
  play: Play,
  flame: Flame,
  target: Target,
  brain: Brain,
  crown: Crown,
  shield: Shield,
  trophy: Trophy,
  heart: Heart,
  clock: Clock,
  bolt: Zap,
  star: Star,
  swords: Swords,
  users: Users,
  moon: Moon,
  rocket: Rocket,
  'check-circle': CheckCircle2,
  crosshair: Crosshair,
  award: Award,
  zap: Zap,
  repeat: RotateCcw,
  book: BookOpen,
  folder: FolderOpen,
  library: Library,
  compass: Compass,
}

// --- Rarity Config ---

// Rarity is the page's dominant color axis. Each tier owns one OKLCH hue at
// matched lightness/chroma so they harmonize when seen side-by-side. Locked
// states use a low-alpha tint of the same color so users can read tier at a
// glance even on badges they haven't earned yet.
const rarityConfig = {
  common: {
    color: 'oklch(60% 0.04 280)',           // tinted neutral, not pure gray
    border: 'oklch(40% 0.01 280)',
    glow: 'none',
    hoverGlow: 'none',
    label: 'Common',
  },
  rare: {
    color: 'oklch(65% 0.16 250)',           // azure
    border: 'oklch(60% 0.15 250)',
    glow: 'none',
    hoverGlow: `0 0 18px oklch(60% 0.15 250 / 0.35)`,
    label: 'Rare',
  },
  epic: {
    color: 'oklch(60% 0.20 300)',           // violet
    border: 'oklch(55% 0.18 300)',
    glow: 'none',
    hoverGlow: `0 0 20px oklch(55% 0.18 300 / 0.4)`,
    label: 'Epic',
  },
  legendary: {
    color: c.brand,                          // gold
    border: c.brand,
    glow: `0 0 12px ${c.brand}22`,
    hoverGlow: `0 0 24px ${c.brand}55`,
    label: 'Legendary',
  },
  mythic: {
    color: c.purple,                         // purple-magenta
    border: c.brand,
    glow: `0 0 16px ${c.purple}33`,
    hoverGlow: `0 0 30px ${c.purple}66, 0 0 60px ${c.brand}33`,
    label: 'Mythic',
  },
} as const

// --- Category Config ---

// Category is the secondary color axis. It only appears as a single colored
// icon at the section heading and a 6px dot on the nav pills, never as card
// background or border, so it never fights rarity for attention.
const categoryColor: Record<string, string> = {
  study: 'oklch(70% 0.12 200)',      // teal: knowledge
  accuracy: 'oklch(65% 0.15 145)',   // emerald: precision
  streaks: c.brand,                   // gold: the brand fire
  speed: 'oklch(70% 0.16 220)',      // cyan: electric
  survival: 'oklch(65% 0.20 30)',    // red-orange: heart, danger
  social: 'oklch(65% 0.16 290)',     // violet: community
  secret: 'oklch(60% 0.10 310)',     // muted lavender: mystery
}

const categoryIcon: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  study: BookOpen,
  accuracy: Crosshair,
  streaks: Flame,
  speed: Zap,
  survival: Heart,
  social: Users,
  secret: Compass,
}

// --- Category Config ---

const categoryOrder = [
  'study',
  'accuracy',
  'streaks',
  'speed',
  'survival',
  'social',
  'secret',
] as const

const categoryLabels: Record<string, string> = {
  study: 'Study Milestones',
  accuracy: 'Accuracy',
  streaks: 'Streaks',
  speed: 'Speed',
  survival: 'Survival',
  social: 'Social',
  secret: 'Secret',
}

// --- Helpers ---

function getRarityWeight(rarity: string): number {
  const weights: Record<string, number> = {
    common: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
  }
  return weights[rarity] ?? 0
}

function getBadgeIcon(iconName: string, size: number, style: React.CSSProperties) {
  const IconComponent = iconMap[iconName]
  if (IconComponent) {
    return <IconComponent size={size} style={style} />
  }
  return <Award size={size} style={style} />
}

// --- Mythic animated border via CSS keyframes ---

const mythicKeyframes = `
@keyframes mythic-border-rotate {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
`

// --- Badge Card Component ---

function BadgeCard({ badge, index, isPinned, onPin }: { badge: Badge; index: number; isPinned?: boolean; onPin?: (key: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const config = rarityConfig[badge.rarity] || rarityConfig.common
  const isSecret = badge.category === 'secret' && !badge.earned

  const displayName = isSecret ? '???' : badge.name
  const displayDescription = isSecret ? 'Earn this badge to reveal its secret.' : badge.description

  const borderStyle = badge.earned
    ? badge.rarity === 'mythic'
      ? 'none'
      : `1px solid ${config.border}`
    : `1px solid ${c.border}`

  const boxShadow = badge.earned
    ? hovered
      ? config.hoverGlow
      : config.glow
    : 'none'

  const progressPercent = badge.progress?.percent ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3 }}
      whileHover={badge.earned ? { scale: 1.03 } : { y: -3 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-2xl p-5 text-center relative overflow-hidden"
      style={{
        // Earned cards get a 4-8% surface tint of the rarity color: enough to
        // identify rarity from across the page without overpowering the icon
        // or competing with the rarity-label pill. Locked cards keep the
        // neutral surface so the page doesn't get visually noisy.
        background: badge.earned
          ? `linear-gradient(180deg, ${config.color}10 0%, ${config.color}05 60%, ${c.card} 100%)`
          : c.card,
        border: borderStyle,
        boxShadow,
        minHeight: '200px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
        ...(badge.rarity === 'mythic' && badge.earned
          ? {
              backgroundClip: 'padding-box',
              outline: '2px solid transparent',
              outlineOffset: '-2px',
            }
          : {}),
      }}
    >
      {/* Mythic animated border overlay */}
      {badge.rarity === 'mythic' && badge.earned && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            padding: '2px',
            background: `linear-gradient(270deg, ${c.brand}, ${c.accent}, ${c.purple}, ${c.brand})`,
            backgroundSize: '300% 300%',
            animation: 'mythic-border-rotate 4s ease infinite',
            mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'exclude',
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            borderRadius: '1rem',
          }}
        />
      )}

      {/* Glow radial for earned */}
      {badge.earned && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${config.border}18, transparent 70%)`,
            opacity: hovered ? 0.25 : 0.1,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* Legendary shimmer */}
      {badge.rarity === 'legendary' && badge.earned && (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl"
          style={{ opacity: hovered ? 0.15 : 0.06 }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-50%',
              left: '-50%',
              width: '200%',
              height: '200%',
              background: `linear-gradient(45deg, transparent 40%, ${c.brand}40 50%, transparent 60%)`,
              animation: 'mythic-border-rotate 3s linear infinite',
              backgroundSize: '200% 200%',
            }}
          />
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center gap-2">
        {/* Icon — locked state still hints at rarity through a faint tint of
            the rarity color, so users can scan the page and see at a glance
            that some locked badges are mythic endgame and others are warm-up. */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center"
          style={{
            background: badge.earned
              ? `${config.color}20`
              : `${config.color}10`,
            border: badge.earned
              ? 'none'
              : `1px solid ${config.color}28`,
          }}
        >
          {badge.earned ? (
            getBadgeIcon(badge.icon, 24, { color: config.color })
          ) : (
            <Lock size={18} style={{ color: `${config.color}88` }} />
          )}
        </div>

        {/* Name */}
        <h3
          className="font-bold text-sm leading-tight"
          style={{
            fontFamily: 'var(--font-space)',
            color: badge.earned ? c.text : c.muted,
          }}
        >
          {displayName}
        </h3>

        {/* Description */}
        <p
          className="text-xs leading-relaxed"
          style={{
            fontFamily: 'var(--font-space)',
            color: badge.earned ? c.muted : `${c.muted}88`,
          }}
        >
          {displayDescription}
        </p>

        {/* Rarity label. Always tinted by rarity color so the tier is legible
            even before the badge is earned; locked states just dim the alpha. */}
        <span
          className="text-[10px] font-semibold uppercase tracking-wider mt-1 px-2 py-0.5 rounded-full"
          style={{
            fontFamily: 'var(--font-space)',
            color: badge.earned ? config.color : `${config.color}aa`,
            background: badge.earned ? `${config.color}18` : `${config.color}0c`,
            border: `1px solid ${config.color}${badge.earned ? '38' : '20'}`,
          }}
        >
          {config.label}
        </span>

        {/* Pin button for earned badges */}
        {badge.earned && onPin && (
          <button
            onClick={(e) => { e.stopPropagation(); onPin(badge.key) }}
            className="text-[10px] font-medium mt-2 px-2.5 py-1 rounded-md cursor-pointer transition-colors"
            style={{
              fontFamily: 'var(--font-space)',
              color: isPinned ? c.brand : c.muted,
              background: isPinned ? `${c.brand}15` : 'transparent',
              border: `1px solid ${isPinned ? c.brand : c.border}`,
            }}
          >
            {isPinned ? 'Pinned' : 'Pin'}
          </button>
        )}

        {/* Progress bar for locked badges with progress data */}
        {!badge.earned && badge.progress && (
          <div className="w-full mt-2">
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: c.border }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPercent}%`,
                  background: progressPercent > 60 ? c.brand : c.muted,
                  opacity: progressPercent > 60 ? 1 : 0.7,
                }}
              />
            </div>
            <p
              className="text-[10px] mt-1"
              style={{
                fontFamily: 'var(--font-space)',
                color: progressPercent > 60 ? c.brand : c.muted,
              }}
            >
              {badge.progress.current}/{badge.progress.target}
            </p>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// --- Main Content ---

function BadgesContent() {
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [pinnedKey, setPinnedKey] = useState<string | null>(null)

  const handlePin = async (badgeKey: string) => {
    const newKey = pinnedKey === badgeKey ? null : badgeKey
    setPinnedKey(newKey)
    try {
      await api.put('/badges/pin', { badge_key: newKey })
      invalidate('/badges/pinned')
    } catch {
      setPinnedKey(pinnedKey) // revert on error
    }
  }

  useEffect(() => {
    let cancelled = false
    const fetchBadges = async () => {
      try {
        const [badgesData, pinnedData] = await Promise.all([
          cachedGet<Badge[]>('/badges/'),
          cachedGet<{ pinned: { key: string } | null }>('/badges/pinned'),
        ])
        if (cancelled) return
        setBadges(badgesData)
        setPinnedKey(pinnedData.pinned?.key || null)
      } catch {
        if (!cancelled) setBadges([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchBadges()
    return () => {
      cancelled = true
    }
  }, [])

  const earnedCount = useMemo(() => badges.filter((b) => b.earned).length, [badges])
  const totalCount = badges.length
  const completionPercent = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0

  // Rarest earned badge
  const rarestEarned = useMemo(() => {
    const earned = badges.filter((b) => b.earned)
    if (earned.length === 0) return null
    return earned.reduce((best, b) =>
      getRarityWeight(b.rarity) > getRarityWeight(best.rarity) ? b : best
    )
  }, [badges])

  // "Almost there" badges: >60% progress, not yet earned
  const almostThere = useMemo(
    () =>
      badges.filter(
        (b) => !b.earned && b.progress && b.progress.percent > 60
      ),
    [badges]
  )

  // Group by category
  const groupedBadges = useMemo(() => {
    const groups: Record<string, Badge[]> = {}
    for (const cat of categoryOrder) {
      const catBadges = badges.filter((b) => b.category === cat)
      if (catBadges.length > 0) {
        groups[cat] = catBadges
      }
    }
    // Any remaining categories not in our list
    const knownCats = new Set(categoryOrder as unknown as string[])
    for (const b of badges) {
      if (!knownCats.has(b.category)) {
        if (!groups[b.category]) groups[b.category] = []
        groups[b.category].push(b)
      }
    }
    return groups
  }, [badges])

  return (
    <div style={{ background: c.bg }}>
      {/* Inject keyframes */}
      <style>{mythicKeyframes}</style>

      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1
            className="font-bold text-3xl mb-2"
            style={{ fontFamily: 'var(--font-space)', color: c.text }}
          >
            Your Achievements
          </h1>

          {!loading && (
            <>
              <p
                className="text-base mb-4"
                style={{ fontFamily: 'var(--font-space)', color: c.muted }}
              >
                {earnedCount} of {totalCount} unlocked ({completionPercent}%)
                {rarestEarned && (
                  <> · Rarest: <span style={{ color: rarityConfig[rarestEarned.rarity].color, fontWeight: 700 }}>{rarestEarned.name}</span></>
                )}
              </p>

              {/* Progress bar. Track tinted toward the brand hue so it
                  reads as part of the gold axis even when empty. */}
              <div
                className="w-80 h-2.5 rounded-full mb-8 overflow-hidden"
                style={{ background: `${c.brand}14` }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${c.brand} 0%, oklch(80% 0.16 65) 100%)`,
                    boxShadow: `0 0 12px ${c.brand}55`,
                  }}
                  initial={{ width: '0%' }}
                  animate={{ width: `${completionPercent}%` }}
                  transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              {/* Category nav pills. Each pill carries a 6px dot of its
                  category color so users get a wayfinding signal without the
                  pills competing visually with the badge cards below. */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(groupedBadges).map(([cat]) => {
                  const dot = categoryColor[cat] || c.muted
                  return (
                    <a
                      key={cat}
                      href={`#cat-${cat}`}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg no-underline transition-colors hover:opacity-80 inline-flex items-center gap-2"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: c.surface,
                        border: `1px solid ${c.border}`,
                        color: c.muted,
                      }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: dot, boxShadow: `0 0 6px ${dot}88` }}
                        aria-hidden="true"
                      />
                      {categoryLabels[cat] || cat}
                    </a>
                  )
                })}
              </div>
            </>
          )}
        </motion.div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div
              className="w-6 h-6 border-2 rounded-full animate-spin"
              style={{ borderColor: c.border, borderTopColor: c.brand }}
            />
          </div>
        )}

        {/* Almost There Section — horizontal rail */}
        {!loading && almostThere.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-12 rounded-2xl p-6"
            style={{ background: c.surface }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Rocket size={16} style={{ color: c.brand }} />
              <h2
                className="font-bold text-base"
                style={{ fontFamily: 'var(--font-space)', color: c.text }}
              >
                Almost there
              </h2>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {almostThere.map((badge, i) => (
                <div key={badge.key} className="flex-shrink-0 w-56">
                  <BadgeCard badge={badge} index={i} isPinned={pinnedKey === badge.key} onPin={handlePin} />
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Categorized Badges */}
        {!loading &&
          Object.entries(groupedBadges).map(([category, catBadges], catIdx) => {
            const CatIcon = categoryIcon[category] || Award
            const catColor = categoryColor[category] || c.muted
            return (
              <motion.section
                key={category}
                id={`cat-${category}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + catIdx * 0.08 }}
                className="mb-12 scroll-mt-8"
              >
                <h2
                  className="font-bold text-base uppercase tracking-wide mb-4 inline-flex items-center gap-2.5"
                  style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                >
                  {/* Category-colored icon: the only place category color
                      lives outside the nav pills. One per heading, never
                      repeated on the cards. */}
                  <CatIcon size={14} style={{ color: catColor }} />
                  {categoryLabels[category] || category}
                </h2>
                {/* Same grid for every category so card sizing stays consistent across the whole page. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {catBadges.map((badge, i) => (
                    <BadgeCard key={badge.key} badge={badge} index={i} isPinned={pinnedKey === badge.key} onPin={handlePin} />
                  ))}
                </div>
              </motion.section>
            )
          })}

        {/* Empty state */}
        {!loading && badges.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20">
            <Trophy size={40} style={{ color: c.muted, marginBottom: 12 }} />
            <p
              className="text-base"
              style={{ fontFamily: 'var(--font-space)', color: c.muted }}
            >
              No badges available yet. Start studying to earn achievements.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function BadgesPage() {
  return (
    <RequireAuth>
      <BadgesContent />
    </RequireAuth>
  )
}
