import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy, Flame, Crown, Target, Award, Calendar, Loader2, User as UserIcon,
  Zap, Shield, FileText, X, Check, Lock, Settings, Hash,
} from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'
import { Tooltip } from '../components/Tooltip'
import { getBadgeIcon, rarityWeight } from '../lib/badge-icons'

interface BadgeItem {
  key: string
  name: string
  description: string
  icon: string | null
  rarity: string
  category: string
  earned_at: string | null
  rarity_pct: number
}

interface ActivityItem {
  type: 'quiz_completed' | 'badge_earned' | 'material_uploaded'
  title: string
  score?: number
  rarity?: string
  classroom_quiz?: boolean
  at: string | null
}

interface Profile {
  id: string
  user_number: number | null
  name: string
  username: string | null
  picture: string | null
  motto: string | null
  xp: number
  level: number
  streak: number
  longest_survival: number
  total_questions_answered: number
  quiz_count: number
  avg_score: number
  global_rank: number
  better_than_pct: number
  aura_tier: 'bronze' | 'silver' | 'gold' | 'diamond' | 'legendary'
  online: boolean
  presence: { status: 'online' | 'idle' | 'offline'; last_active_at: string | null; seconds_ago: number | null }
  badges: BadgeItem[]
  badge_count: number
  pinned_badge: { key: string; name: string; description: string; icon: string | null; rarity: string } | null
  equipped_title: { key: string; name: string; rarity: string } | null
  title_count: number
  activity: ActivityItem[]
  joined_at: string | null
  is_self: boolean
}

interface TitleItem {
  key: string
  name: string
  description: string
  rarity: string
  earned: boolean
  equipped: boolean
}

const auraConfig: Record<string, { ring: string; label: string; threshold: string; pulse: boolean }> = {
  bronze:    { ring: 'oklch(58% 0.10 50)',  label: 'Bronze',    threshold: 'Lv. 1-7',   pulse: false },
  silver:    { ring: 'oklch(72% 0.02 250)', label: 'Silver',    threshold: 'Lv. 8-14',  pulse: false },
  gold:      { ring: 'oklch(75% 0.18 65)',  label: 'Gold',      threshold: 'Lv. 15-24', pulse: false },
  diamond:   { ring: 'oklch(72% 0.16 220)', label: 'Diamond',   threshold: 'Lv. 25-49', pulse: true },
  legendary: { ring: 'oklch(72% 0.20 320)', label: 'Legendary', threshold: 'Lv. 50+',   pulse: true },
}

const rarityConfig: Record<string, { color: string; border: boolean }> = {
  common:    { color: 'oklch(60% 0.02 280)', border: false },
  rare:      { color: 'oklch(70% 0.15 250)', border: false },
  epic:      { color: 'oklch(72% 0.18 300)', border: true },
  legendary: { color: 'oklch(75% 0.18 65)',  border: true },
  mythic:    { color: 'oklch(72% 0.18 25)',  border: true },
}

function timeAgo(at: string | null): string {
  if (!at) return ''
  const diff = Date.now() - new Date(at).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(at).toLocaleDateString()
}

function presenceLabel(status: string, at: string | null): string {
  if (status === 'online') return 'Online'
  if (status === 'idle')   return `Idle, last seen ${timeAgo(at)}`
  if (status === 'offline' && at) return `Last seen ${timeAgo(at)}`
  return 'Offline'
}

function ProfileContent() {
  const { username, id } = useParams<{ username?: string; id?: string }>()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editPanelOpen, setEditPanelOpen] = useState(false)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = username ? `/users/by-username/${username}` : `/users/${id}`
      const res = await api.get(url)
      setProfile(res.data)
    } catch {
      setError('User not found')
    }
    setLoading(false)
  }, [username, id])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  const targetIdRef = useRef<string | number | null>(null)
  useEffect(() => {
    if (!profile) return
    targetIdRef.current = username || profile.user_number || profile.id

    let cancelled = false
    const tick = async () => {
      if (cancelled || document.visibilityState !== 'visible') return
      try {
        const res = await api.get(`/users/${targetIdRef.current}/presence`)
        setProfile((prev) => prev ? { ...prev, presence: res.data.presence, online: res.data.online } : prev)
      } catch {}
    }
    const interval = setInterval(tick, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, username])

  if (loading) return <ProfileSkeleton />

  if (error || !profile) {
    return (
      <div className="text-center py-20">
        <UserIcon size={40} className="mx-auto mb-4" style={{ color: c.muted }} />
        <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{error || 'User not found'}</p>
      </div>
    )
  }

  const aura = auraConfig[profile.aura_tier] || auraConfig.bronze
  const presenceStatusColor =
    profile.presence?.status === 'online' ? c.accent :
    profile.presence?.status === 'idle' ? 'oklch(75% 0.18 65)' :
    'oklch(50% 0.01 280)'

  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10 space-y-10 md:space-y-12">
        <Hero
          profile={profile}
          aura={aura}
          presenceStatusColor={presenceStatusColor}
          onEdit={() => setEditPanelOpen(true)}
        />
        <BadgeShowcase badges={profile.badges} />
        <StatsStrip profile={profile} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
          <ActivityColumn activity={profile.activity} isSelf={profile.is_self} />
          <BadgesColumn badges={profile.badges} isSelf={profile.is_self} titleCount={profile.title_count} />
        </div>
      </div>

      <AnimatePresence>
        {editPanelOpen && profile.is_self && (
          <EditPanel
            profile={profile}
            onClose={() => setEditPanelOpen(false)}
            onSaved={fetchProfile}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Hero({ profile, aura, presenceStatusColor, onEdit }: {
  profile: Profile
  aura: typeof auraConfig[keyof typeof auraConfig]
  presenceStatusColor: string
  onEdit: () => void
}) {
  return (
    <section className="relative">
      <div
        className="absolute inset-0 rounded-3xl pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 30% 0%, ${aura.ring}1c 0%, transparent 60%)` }}
      />

      <div className="relative grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-6 md:gap-10 items-center md:items-start py-2">
        <div className="relative flex-shrink-0 mx-auto md:mx-0">
          {aura.pulse ? (
            <motion.div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{ background: `radial-gradient(circle, ${aura.ring}55 0%, transparent 70%)`, transform: 'scale(1.4)' }}
              animate={{ opacity: [0.5, 0.9, 0.5] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : (
            <div
              className="absolute inset-0 rounded-full pointer-events-none blur-xl"
              style={{ background: `radial-gradient(circle, ${aura.ring}3a 0%, transparent 70%)`, transform: 'scale(1.2)' }}
            />
          )}

          <div
            className="relative w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: c.card, border: `3px solid ${aura.ring}` }}
          >
            {profile.picture ? (
              <img src={profile.picture} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-5xl font-bold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                {profile.name.charAt(0)}
              </span>
            )}
          </div>

          {profile.presence && (
            <span className="absolute bottom-2 right-2">
              <Tooltip content={presenceLabel(profile.presence.status, profile.presence.last_active_at)}>
                <span
                  className="block w-5 h-5 rounded-full"
                  style={{
                    background: presenceStatusColor,
                    border: `3px solid ${c.bg}`,
                    boxShadow: profile.presence.status === 'online' ? `0 0 10px ${presenceStatusColor}` : 'none',
                  }}
                />
              </Tooltip>
            </span>
          )}

          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full font-bold text-xs whitespace-nowrap"
            style={{
              fontFamily: 'var(--font-space)',
              background: c.bg,
              color: aura.ring,
              border: `2px solid ${aura.ring}`,
              boxShadow: `0 4px 12px ${c.bg}`,
            }}
          >
            LV {profile.level}
          </div>
        </div>

        <div className="text-center md:text-left min-w-0 md:pt-2">
          <div className="flex items-center justify-center md:justify-start gap-2.5 mb-1.5 flex-wrap">
            <h1 className="font-extrabold text-3xl md:text-5xl tracking-tight leading-none" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {profile.name}
            </h1>
            {profile.is_self && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider" style={{ fontFamily: 'var(--font-space)', background: `${c.brand}15`, color: c.brand }}>
                You
              </span>
            )}
          </div>

          <div className="flex items-center justify-center md:justify-start gap-2 md:gap-3 mb-3 flex-wrap text-sm" style={{ fontFamily: 'var(--font-space)' }}>
            {profile.username ? (
              <span style={{ color: c.muted }}>@{profile.username}</span>
            ) : (
              profile.is_self && <span style={{ color: c.muted, fontStyle: 'italic' }}>no username yet</span>
            )}
            <span style={{ color: c.border }}>·</span>
            <Tooltip content={aura.threshold}>
              <span className="font-bold uppercase tracking-widest text-xs cursor-help" style={{ color: aura.ring }}>
                <Crown size={11} className="inline mr-1 -mt-0.5" />{aura.label}
              </span>
            </Tooltip>
            {profile.equipped_title && (
              <>
                <span style={{ color: c.border }}>·</span>
                <span className="font-semibold text-xs" style={{ color: rarityConfig[profile.equipped_title.rarity]?.color || c.text }}>
                  <Award size={11} className="inline mr-1 -mt-0.5" />{profile.equipped_title.name}
                </span>
              </>
            )}
          </div>

          {profile.motto && (
            <p className="text-sm md:text-base italic max-w-2xl mx-auto md:mx-0 mb-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              &ldquo;{profile.motto}&rdquo;
            </p>
          )}

          <div className="flex items-center justify-center md:justify-start gap-3 flex-wrap text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            <span>{presenceLabel(profile.presence?.status || 'offline', profile.presence?.last_active_at || null)}</span>
            {profile.better_than_pct > 0 && (
              <>
                <span style={{ color: c.border }}>·</span>
                <span>Above <span style={{ color: aura.ring, fontWeight: 700 }}>{profile.better_than_pct}%</span> of players</span>
              </>
            )}
            {profile.joined_at && (
              <>
                <span style={{ color: c.border }}>·</span>
                <span className="flex items-center gap-1">
                  <Calendar size={10} /> Since {new Date(profile.joined_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                </span>
              </>
            )}
          </div>
        </div>

        {profile.is_self && (
          <div className="flex justify-center md:justify-end md:pt-2">
            <button
              onClick={onEdit}
              className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer transition-all"
              style={{
                fontFamily: 'var(--font-space)',
                background: c.surface,
                color: c.text,
                border: `1px solid ${c.border}`,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = aura.ring }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border }}
            >
              <Settings size={14} /> Edit profile
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

// ─── Badge Showcase: Top 5 best badges ────────────────────────────────────────

function BadgeShowcase({ badges }: { badges: BadgeItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (openIdx === null) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpenIdx(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openIdx])

  if (badges.length === 0) return null

  // Top 4 best badges by rarity tier (then ownership rarity)
  const ranked = [...badges].sort((a, b) => {
    const w = rarityWeight(b.rarity) - rarityWeight(a.rarity)
    if (w !== 0) return w
    return a.rarity_pct - b.rarity_pct
  })
  const topBest = ranked.slice(0, 4)
  const topKeys = new Set(topBest.map(b => b.key))

  // Latest acquired badge that isn't already in the top 4
  const latest = [...badges]
    .filter(b => !topKeys.has(b.key) && b.earned_at)
    .sort((a, b) => (b.earned_at || '').localeCompare(a.earned_at || ''))[0]

  const display = latest ? [...topBest, latest] : topBest.slice(0, 5)

  return (
    <section ref={wrapRef}>
      {/* Mobile: 5 icon-only buttons, left-aligned with empty-slot placeholders */}
      <div className="md:hidden flex justify-start gap-3 flex-wrap">
        {display.map((b, i) => {
          const r = rarityConfig[b.rarity] || rarityConfig.common
          const isOpen = openIdx === i
          const isLatest = latest && b.key === latest.key
          return (
            <div key={b.key} className="relative">
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 * i, duration: 0.3 }}
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-12 h-12 rounded-xl flex items-center justify-center cursor-pointer relative"
                style={{
                  background: isOpen ? `${r.color}25` : `${r.color}14`,
                  border: r.border ? `1.5px solid ${r.color}55` : `1px solid ${c.border}`,
                  transition: 'background 150ms ease',
                }}
              >
                {getBadgeIcon(b.icon, 18, { color: r.color })}
                {isLatest && (
                  <span
                    className="absolute -top-1 -right-1 text-[7px] font-bold uppercase tracking-wider px-1 py-0.5 rounded"
                    style={{ background: c.accent, color: c.bg, fontFamily: 'var(--font-space)' }}
                  >
                    New
                  </span>
                )}
              </motion.button>

              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-[200px] z-30 rounded-xl px-3 py-3"
                  style={{
                    background: c.card,
                    border: `1.5px solid ${r.color}55`,
                    boxShadow: `0 12px 32px ${c.bg}cc`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
                    style={{ background: c.card, borderTop: `1.5px solid ${r.color}55`, borderLeft: `1.5px solid ${r.color}55` }}
                  />
                  <p className="text-sm font-bold mb-1 text-center" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{b.name}</p>
                  <p className="text-[10px] uppercase tracking-widest font-semibold mb-2 text-center" style={{ fontFamily: 'var(--font-space)', color: r.color }}>
                    {b.rarity} · {b.rarity_pct.toFixed(1)}% own
                  </p>
                  <p className="text-[11px] leading-snug text-center" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    {b.description}
                  </p>
                </motion.div>
              )}
            </div>
          )
        })}

        {/* Empty slots on mobile */}
        {Array.from({ length: Math.max(0, 5 - display.length) }).map((_, i) => (
          <motion.div
            key={`empty-m-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 * (display.length + i), duration: 0.3 }}
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{
              background: 'transparent',
              border: `1.5px dashed ${c.border}`,
              opacity: 0.55,
            }}
          >
            <Lock size={14} style={{ color: c.muted }} />
          </motion.div>
        ))}
      </div>

      {/* Desktop: fixed-size cards in a row, left-aligned with slot placeholders */}
      <div className="hidden md:flex items-stretch gap-3 justify-start flex-wrap">
        {display.map((b, i) => {
          const r = rarityConfig[b.rarity] || rarityConfig.common
          const isLatest = latest && b.key === latest.key
          return (
            <motion.div
              key={b.key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * i, duration: 0.3 }}
              whileHover={{ y: -3 }}
              className="w-[164px] rounded-xl px-4 py-4 flex flex-col items-center gap-2 cursor-default relative"
              style={{
                background: c.card,
                border: r.border ? `1.5px solid ${r.color}55` : `1px solid ${c.border}`,
              }}
            >
              {isLatest && (
                <span
                  className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ background: c.accent, color: c.bg, fontFamily: 'var(--font-space)' }}
                >
                  Latest
                </span>
              )}
              <Tooltip content={b.description}>
                <span
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${r.color}14` }}
                >
                  {getBadgeIcon(b.icon, 20, { color: r.color })}
                </span>
              </Tooltip>
              <div className="text-center min-w-0">
                <p className="text-sm font-bold leading-tight" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  {b.name}
                </p>
                <p className="text-[10px] uppercase tracking-widest font-semibold mt-0.5" style={{ fontFamily: 'var(--font-space)', color: r.color }}>
                  {b.rarity}
                </p>
                <p className="text-[10px] mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  {b.rarity_pct.toFixed(1)}% own
                </p>
              </div>
            </motion.div>
          )
        })}

        {/* Empty slot placeholders so it always reads as "5 spots, X filled" */}
        {Array.from({ length: Math.max(0, 5 - display.length) }).map((_, i) => (
          <motion.div
            key={`empty-${i}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 * (display.length + i), duration: 0.3 }}
            className="w-[164px] rounded-xl px-4 py-4 flex flex-col items-center gap-2 relative"
            style={{
              background: 'transparent',
              border: `1.5px dashed ${c.border}`,
              opacity: 0.55,
            }}
          >
            <span
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: c.surface, opacity: 0.5 }}
            >
              <Lock size={16} style={{ color: c.muted }} />
            </span>
            <div className="text-center">
              <p className="text-[11px] font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Locked
              </p>
              <p className="text-[10px] mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted, opacity: 0.7 }}>
                Earn to fill
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────

function StatsStrip({ profile }: { profile: Profile }) {
  const items = [
    { label: 'Rank', value: `#${profile.global_rank}`, icon: Hash, primary: true },
    { label: 'XP', value: profile.xp.toLocaleString(), icon: Zap },
    { label: 'Streak', value: `${profile.streak}d`, icon: Flame },
    { label: 'Quizzes', value: profile.quiz_count, icon: Target },
    { label: 'Accuracy', value: `${profile.avg_score}%`, icon: Trophy },
    { label: 'Survival', value: profile.longest_survival, icon: Shield },
    { label: 'Questions', value: profile.total_questions_answered.toLocaleString(), icon: FileText },
  ]

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: c.card, border: `1px solid ${c.border}` }}
    >
      {/* Mobile: Rank banner on top, rest in 3-col compact grid */}
      <div className="lg:hidden">
        {/* Rank hero row */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: `1px solid ${c.border}` }}
        >
          <div className="flex items-center gap-2">
            <Hash size={14} style={{ color: c.brand }} />
            <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Global Rank</span>
          </div>
          <p className="font-bold text-2xl tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
            #{profile.global_rank}
          </p>
        </motion.div>

        {/* Other stats in compact 3-col grid */}
        <div className="grid grid-cols-3">
          {items.slice(1).map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * (i + 1) }}
              className="px-3 py-3.5 flex flex-col gap-1"
              style={{
                borderRight: (i + 1) % 3 !== 0 && i < items.length - 2 ? `1px solid ${c.border}` : 'none',
                borderBottom: i < items.length - 4 ? `1px solid ${c.border}` : 'none',
              }}
            >
              <div className="flex items-center gap-1">
                <item.icon size={9} style={{ color: c.muted }} />
                <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{item.label}</span>
              </div>
              <p className="font-bold text-base tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                {item.value}
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Desktop: 7-column strip */}
      <div className="hidden lg:grid lg:grid-cols-7">
        {items.map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * i }}
            className="px-4 py-5 flex flex-col gap-1"
            style={{ borderRight: i < items.length - 1 ? `1px solid ${c.border}` : 'none' }}
          >
            <div className="flex items-center gap-1.5">
              <item.icon size={11} style={{ color: item.primary ? c.brand : c.muted }} />
              <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{item.label}</span>
            </div>
            <p className={`font-bold tabular-nums ${item.primary ? 'text-3xl' : 'text-xl'}`} style={{ fontFamily: 'var(--font-space)', color: item.primary ? c.brand : c.text }}>
              {item.value}
            </p>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function ActivityColumn({ activity, isSelf }: { activity: ActivityItem[]; isSelf: boolean }) {
  const visible = activity.filter(a => !(a.type === 'quiz_completed' && a.classroom_quiz && !isSelf))

  return (
    <div className="lg:col-span-1">
      <h2 className="text-xs uppercase tracking-widest font-bold mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
        <Zap size={12} /> Recent
      </h2>
      {visible.length === 0 ? (
        <div className="rounded-xl px-5 py-10 text-center" style={{ background: c.card, border: `1px solid ${c.border}` }}>
          <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No activity yet</p>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {visible.map((a, i) => {
            const Icon = a.type === 'quiz_completed' ? Target : a.type === 'badge_earned' ? Award : FileText
            const tone =
              a.type === 'quiz_completed' ? c.brand :
              a.type === 'badge_earned' ? (rarityConfig[a.rarity || 'common']?.color || c.accent) :
              c.muted

            return (
              <li key={i} className="flex items-start gap-3 px-3.5 py-3 rounded-lg" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                <Icon size={13} className="mt-0.5 flex-shrink-0" style={{ color: tone }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-snug" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                    {a.type === 'quiz_completed' && (
                      <>Completed <span style={{ fontWeight: 600 }}>{a.title}</span>{a.score != null && (
                        <span style={{ color: a.score >= 80 ? c.accent : a.score >= 50 ? c.brand : 'oklch(65% 0.15 25)' }}>
                          {' · '}{Math.round(a.score)}%
                        </span>
                      )}</>
                    )}
                    {a.type === 'badge_earned' && <>Earned <span style={{ color: tone, fontWeight: 700 }}>{a.title}</span></>}
                    {a.type === 'material_uploaded' && <>Uploaded <span style={{ fontWeight: 600 }}>{a.title}</span></>}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{timeAgo(a.at)}</p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

const LOCKED_PREVIEWS = [
  { name: 'First Quiz', hint: 'Complete your first quiz' },
  { name: 'Perfectionist', hint: 'Score 100% on a quiz' },
  { name: 'Streak Starter', hint: 'Maintain a 3-day streak' },
  { name: 'Century', hint: 'Answer 100 questions' },
]

function BadgesColumn({ badges, isSelf, titleCount }: { badges: BadgeItem[]; isSelf: boolean; titleCount: number }) {
  return (
    <div className="lg:col-span-2">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-widest font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          <Award size={12} /> Badges <span style={{ color: c.text }}>{badges.length}</span>
        </h2>
        {isSelf && titleCount > 0 && (
          <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {titleCount} title{titleCount === 1 ? '' : 's'} earned
          </span>
        )}
      </div>

      {badges.length === 0 ? (
        <div className="rounded-xl px-5 py-8" style={{ background: c.card, border: `1px solid ${c.border}` }}>
          {isSelf ? (
            <>
              <p className="text-sm font-semibold mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                Your trophy case is empty
              </p>
              <p className="text-xs mb-5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Take your first quiz to start unlocking these:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {LOCKED_PREVIEWS.map((b) => (
                  <div key={b.name} className="rounded-lg p-3 text-center opacity-60" style={{ background: c.surface, border: `1px dashed ${c.border}` }}>
                    <Lock size={16} className="mx-auto mb-2" style={{ color: c.muted }} />
                    <p className="text-[11px] font-bold mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{b.name}</p>
                    <p className="text-[9px] leading-tight" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{b.hint}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-center" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              No badges yet
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 md:gap-3">
          {badges.map((b, i) => {
            const r = rarityConfig[b.rarity] || rarityConfig.common
            return (
              <motion.div
                key={b.key}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.025 * i }}
                whileHover={{ y: -3 }}
                className="rounded-xl p-2.5 md:p-3 text-center cursor-default"
                style={{
                  background: c.card,
                  border: r.border ? `1.5px solid ${r.color}55` : `1px solid ${c.border}`,
                }}
              >
                <Tooltip content={b.description}>
                  <div
                    className="w-9 h-9 md:w-10 md:h-10 mx-auto mb-1.5 rounded-lg flex items-center justify-center"
                    style={{ background: `${r.color}12` }}
                  >
                    {getBadgeIcon(b.icon, 16, { color: r.color })}
                  </div>
                </Tooltip>
                <p className="text-[11px] font-bold leading-tight mb-0.5 truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{b.name}</p>
                <p className="text-[8px] uppercase tracking-widest" style={{ fontFamily: 'var(--font-space)', color: r.color }}>
                  {b.rarity}
                </p>
                <p className="text-[9px] mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  {b.rarity_pct.toFixed(1)}%
                </p>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EditPanel({ profile, onClose, onSaved }: {
  profile: Profile
  onClose: () => void
  onSaved: () => void
}) {
  const [usernameDraft, setUsernameDraft] = useState(profile.username || '')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [mottoDraft, setMottoDraft] = useState(profile.motto || '')
  const [titles, setTitles] = useState<TitleItem[]>([])
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    api.get('/profile/titles').then((res) => setTitles(res.data.titles)).catch(() => {})
  }, [])

  const handleSaveAll = async () => {
    setSaving(true)
    setUsernameError(null)
    try {
      if (usernameDraft.trim() && usernameDraft.trim() !== profile.username) {
        try {
          const res = await api.post('/profile/username', { username: usernameDraft.trim() })
          const cached = localStorage.getItem('kino_user')
          if (cached) {
            try {
              const parsed = JSON.parse(cached)
              parsed.username = res.data.username
              localStorage.setItem('kino_user', JSON.stringify(parsed))
            } catch {}
          }
          window.history.replaceState(null, '', `/u/${res.data.username}`)
        } catch (err: any) {
          setUsernameError(err.response?.data?.detail || 'Failed to update username')
          setSaving(false)
          return
        }
      }

      if (mottoDraft.trim() !== (profile.motto || '')) {
        await api.post('/profile/motto', { motto: mottoDraft.trim() || null })
      }

      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
      onSaved()
    } catch {} finally {
      setSaving(false)
    }
  }

  const handleEquipTitle = async (key: string | null) => {
    try {
      await api.post('/profile/equip-title', { title_key: key })
      onSaved()
    } catch {}
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0" style={{ background: `${c.bg}ee` }} />
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl mb-[60px] md:mb-0 max-h-[calc(100vh-130px)] md:max-h-[85vh] overflow-y-auto"
        style={{ background: c.card, border: `1px solid ${c.border}`, boxShadow: `0 -8px 40px ${c.bg}88` }}
      >
        <div className="md:hidden flex justify-center pt-3 pb-1 sticky top-0 z-10" style={{ background: c.card }}>
          <div className="w-10 h-1 rounded-full" style={{ background: c.border }} />
        </div>

        <div className="p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Edit profile</h2>
            <button onClick={onClose} className="p-2 rounded-lg cursor-pointer" style={{ color: c.muted, background: c.surface }}>
              <X size={16} />
            </button>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-widest font-semibold block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Username</label>
            <div className="flex items-center gap-2">
              <span className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>@</span>
              <input
                type="text"
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(e.target.value)}
                placeholder="username"
                maxLength={24}
                className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
              />
            </div>
            <p className="text-[10px] mt-1.5" style={{ fontFamily: 'var(--font-space)', color: usernameError ? 'oklch(70% 0.15 25)' : c.muted }}>
              {usernameError || '3-24 characters. Letters, numbers, and . _ - ! ?'}
            </p>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-widest font-semibold block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Motto</label>
            <input
              type="text"
              value={mottoDraft}
              onChange={(e) => setMottoDraft(e.target.value)}
              placeholder="Consistency beats talent"
              maxLength={80}
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
            />
            <p className="text-[10px] mt-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              {mottoDraft.length}/80
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40"
              style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Saving' : savedFlash ? 'Saved' : 'Save'}
            </button>
            {savedFlash && <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>Updated</span>}
          </div>

          <div className="pt-2" style={{ borderTop: `1px solid ${c.border}` }}>
            <div className="flex items-center justify-between mb-3 mt-5">
              <label className="text-[11px] uppercase tracking-widest font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Title</label>
              <span className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                {titles.filter(t => t.earned).length} earned of {titles.length}
              </span>
            </div>

            <div className="space-y-1.5">
              <button
                onClick={() => handleEquipTitle(null)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-lg cursor-pointer text-left"
                style={{
                  background: !profile.equipped_title ? `${c.brand}10` : c.surface,
                  border: `1.5px solid ${!profile.equipped_title ? c.brand : c.border}`,
                }}
              >
                <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>None</span>
                {!profile.equipped_title && <Check size={14} style={{ color: c.brand }} />}
              </button>

              {titles.map((t) => {
                const r = rarityConfig[t.rarity] || rarityConfig.common
                return (
                  <button
                    key={t.key}
                    onClick={() => t.earned && handleEquipTitle(t.key)}
                    disabled={!t.earned}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-left ${t.earned ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                    style={{
                      background: t.equipped ? `${r.color}10` : c.surface,
                      border: `1.5px solid ${t.equipped ? r.color : c.border}`,
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {t.earned ? <Award size={16} style={{ color: r.color }} /> : <Lock size={14} style={{ color: c.muted }} />}
                      <div className="min-w-0">
                        <p className="text-sm font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: t.earned ? c.text : c.muted }}>
                          {t.name}
                          <span className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: r.color }}>{t.rarity}</span>
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{t.description}</p>
                      </div>
                    </div>
                    {t.equipped && <Check size={14} style={{ color: r.color, flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

function ProfileSkeleton() {
  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-center animate-pulse">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full" style={{ background: c.card }} />
          <div className="space-y-3">
            <div className="h-10 w-64 rounded" style={{ background: c.card }} />
            <div className="h-4 w-48 rounded" style={{ background: c.card }} />
            <div className="h-3 w-32 rounded" style={{ background: c.card }} />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 animate-pulse">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl" style={{ background: c.card }} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function UserProfilePage() {
  return (
    <RequireAuth>
      <ProfileContent />
    </RequireAuth>
  )
}
