import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Trophy, Flame, Crosshair, Shield, Crown, Sparkles } from 'lucide-react'
import { useAuth, RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { cachedGet } from '../lib/queryCache'
import { theme as c } from '../theme'
import FloatingParticles from '../components/landing/FloatingParticles'

interface LeaderboardEntry {
  rank: number
  user_id: string
  username?: string | null
  user_number?: number | null
  name: string
  picture: string | null
  xp: number
  level: number
  streak: number
  pinned_badge_key: string | null
  weekly_xp?: number
  accuracy?: number
  longest_survival?: number
}

interface Rival {
  name: string
  xp_gap: number
  behind?: boolean
}

type BoardType = 'global' | 'weekly' | 'accuracy' | 'survival'

const boardConfig: Record<BoardType, { label: string; icon: typeof Trophy; color: string; stat: (e: LeaderboardEntry) => string }> = {
  global: { label: 'Global', icon: Trophy, color: c.brand, stat: (e) => `${e.xp.toLocaleString()} XP` },
  weekly: { label: 'Weekly', icon: Flame, color: 'oklch(70% 0.18 25)', stat: (e) => `${e.weekly_xp || 0} XP` },
  accuracy: { label: 'Accuracy', icon: Crosshair, color: c.accent, stat: (e) => `${e.accuracy || 0}%` },
  survival: { label: 'Survival', icon: Shield, color: 'oklch(70% 0.15 300)', stat: (e) => `${e.longest_survival || 0} streak` },
}

// Build the most stable URL we can to a user's profile.
function profilePath(entry: LeaderboardEntry): string {
  if (entry.username) return `/u/${entry.username}`
  if (entry.user_number != null) return `/u/id/${entry.user_number}`
  return `/u/id/${entry.user_id}`
}

function LeaderboardList({ type, currentUserId }: { type: BoardType; currentUserId?: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const config = boardConfig[type]

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await cachedGet<{ entries?: LeaderboardEntry[] } | LeaderboardEntry[]>(
          `/leaderboard/${type}`
        )
        const entries = Array.isArray(data) ? data : data.entries || []
        setEntries(entries)
      } catch {
        setEntries([])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [type])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: c.border, borderTopColor: config.color }} />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <Sparkles size={20} style={{ color: c.muted }} className="mb-2 opacity-60" />
        <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No data yet</p>
        <p className="text-[10px] mt-1" style={{ fontFamily: 'var(--font-space)', color: c.muted, opacity: 0.6 }}>
          Take a quiz to climb this board
        </p>
      </div>
    )
  }

  return (
    <div>
      {entries.map((entry, i) => {
        const isCurrentUser = entry.user_id === currentUserId
        const isTop3 = i < 3
        const medalColors = [config.color, 'oklch(60% 0.02 250)', 'oklch(55% 0.08 50)']

        return (
          <motion.button
            key={entry.user_id}
            onClick={() => navigate(profilePath(entry))}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ x: 3 }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer text-left group"
            style={{
              background: isCurrentUser ? `${config.color}10` : 'transparent',
              borderBottom: `1px solid ${c.border}`,
              transition: 'background 200ms ease',
            }}
            onMouseEnter={(e) => {
              if (!isCurrentUser) e.currentTarget.style.background = `${config.color}06`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isCurrentUser ? `${config.color}10` : 'transparent'
            }}
          >
            {/* Rank with crown for #1 */}
            <span
              className="w-6 text-center text-xs font-bold flex-shrink-0 flex items-center justify-center"
              style={{ fontFamily: 'var(--font-space)', color: isTop3 ? medalColors[i] : c.muted }}
            >
              {i === 0 ? <Crown size={14} style={{ color: medalColors[0] }} /> : entry.rank}
            </span>

            {/* Avatar with subtle ring on top 3 */}
            <div className="relative flex-shrink-0">
              {entry.picture ? (
                <img
                  src={entry.picture}
                  alt=""
                  className="w-7 h-7 rounded-full transition-transform duration-200 group-hover:scale-110"
                  style={{
                    border: isTop3 ? `2px solid ${medalColors[i]}` : `1px solid ${c.border}`,
                    boxShadow: isTop3 ? `0 0 12px ${medalColors[i]}40` : 'none',
                  }}
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-transform duration-200 group-hover:scale-110"
                  style={{
                    background: c.surface,
                    color: c.muted,
                    border: isTop3 ? `2px solid ${medalColors[i]}` : `1px solid ${c.border}`,
                    boxShadow: isTop3 ? `0 0 12px ${medalColors[i]}40` : 'none',
                  }}
                >
                  {entry.name.charAt(0)}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p
                className="text-xs font-medium truncate"
                style={{ fontFamily: 'var(--font-space)', color: isCurrentUser ? config.color : c.text }}
              >
                {entry.name}
                {isCurrentUser && <span className="opacity-60"> (you)</span>}
              </p>
              {entry.username && (
                <p className="text-[10px] truncate" style={{ fontFamily: 'var(--font-space)', color: c.muted, opacity: 0.7 }}>
                  @{entry.username}
                </p>
              )}
            </div>

            <span
              className="text-xs font-bold flex-shrink-0 tabular-nums"
              style={{ fontFamily: 'var(--font-space)', color: isTop3 ? medalColors[i] : c.muted }}
            >
              {config.stat(entry)}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}

function DesktopPanel({ type, delay, currentUserId }: { type: BoardType; delay: number; currentUserId?: string }) {
  const config = boardConfig[type]
  const Icon = config.icon
  const [hovered, setHovered] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Panel header — animated underline glow */}
      <div
        className="relative rounded-t-xl px-4 py-3 flex items-center gap-2.5 overflow-hidden"
        style={{
          background: `${config.color}12`,
          borderTop: `2px solid ${config.color}`,
          borderLeft: `1px solid ${c.border}`,
          borderRight: `1px solid ${c.border}`,
        }}
      >
        {/* Glow sweep on hover */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          initial={{ x: '-100%' }}
          animate={hovered ? { x: '100%' } : { x: '-100%' }}
          transition={{ duration: 1.2, ease: 'easeInOut' }}
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${config.color}20 50%, transparent 100%)`,
          }}
        />
        <Icon size={16} style={{ color: config.color }} />
        <span className="text-sm font-bold relative z-10" style={{ fontFamily: 'var(--font-space)', color: config.color }}>
          {config.label}
        </span>
      </div>

      {/* Panel body — fixed height for 10 rows, scrollable beyond */}
      <div
        className="rounded-b-xl overflow-y-auto transition-shadow duration-300"
        style={{
          background: c.card,
          border: `1px solid ${c.border}`,
          borderTop: 'none',
          height: '480px',
          boxShadow: hovered ? `0 8px 32px ${config.color}25` : 'none',
        }}
      >
        <LeaderboardList type={type} currentUserId={currentUserId} />
      </div>
    </motion.div>
  )
}

function LeaderboardContent() {
  const { user } = useAuth()
  const [bestRank, setBestRank] = useState<number | null>(null)
  const [bestBoards, setBestBoards] = useState<BoardType[]>([])
  const [rival, setRival] = useState<Rival | null>(null)
  const [mobileTab, setMobileTab] = useState<BoardType>('global')

  useEffect(() => {
    const fetchAll = async () => {
      const types: BoardType[] = ['global', 'weekly', 'accuracy', 'survival']
      try {
        const responses = await Promise.all(
          types.map(t => api.get(`/leaderboard/${t}`).catch(() => null))
        )
        let best: number | null = null
        const boardsAtBest: BoardType[] = []
        let bestRival: Rival | null = null
        responses.forEach((res, i) => {
          if (!res) return
          const rank = res.data.your_rank
          if (rank == null) return
          if (best == null || rank < best) {
            best = rank
            boardsAtBest.length = 0
            boardsAtBest.push(types[i])
            bestRival = res.data.rival || null
          } else if (rank === best) {
            boardsAtBest.push(types[i])
          }
        })
        setBestRank(best)
        setBestBoards(boardsAtBest)
        setRival(bestRival)
      } catch {}
    }
    fetchAll()
  }, [])

  useEffect(() => {
    const fetchTabRival = async () => {
      try {
        const res = await api.get(`/leaderboard/${mobileTab}`)
        if (res.data.rival) setRival(res.data.rival)
      } catch {}
    }
    fetchTabRival()
  }, [mobileTab])

  const mobileConfig = boardConfig[mobileTab]
  const MobileIcon = mobileConfig.icon
  const bestBoardsLabel = bestBoards.map(b => boardConfig[b].label).join(', ')

  return (
    <div className="relative overflow-hidden" style={{ background: c.bg }}>
      {/* Particle field spans the WHOLE leaderboard section. Particles spawn at
          the bottom of the page and drift upward past the panels. zIndex 0 keeps
          them behind everything; the panels (zIndex auto) cover them naturally. */}
      <div className="absolute inset-0" style={{ zIndex: 0 }}>
        <FloatingParticles />
      </div>

      {/* Soft radial gold spotlight at the top — purely cosmetic */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: '60vh',
          background: `radial-gradient(ellipse at top, ${c.brand}10 0%, transparent 60%)`,
          zIndex: 0,
        }}
      />

      {/* Hero region */}
      <div className="relative" style={{ zIndex: 1 }}>
        <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 pt-6 pb-10 md:pt-10 md:pb-14">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="flex items-center justify-center gap-3 mb-3">
              <motion.div
                animate={{
                  rotate: [0, -5, 5, -3, 3, 0],
                  y: [0, -2, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  repeatType: 'loop',
                  ease: 'easeInOut',
                }}
              >
                <Crown size={28} style={{ color: c.brand, filter: `drop-shadow(0 0 12px ${c.brand}80)` }} />
              </motion.div>
              <h1
                className="font-bold text-3xl md:text-4xl"
                style={{
                  fontFamily: 'var(--font-space)',
                  color: c.text,
                  textShadow: `0 0 24px ${c.brand}30`,
                }}
              >
                Leaderboards
              </h1>
            </div>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {bestRank && bestBoards.length > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-sm"
                  style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                >
                  Your best rank:{' '}
                  <span className="font-bold" style={{ color: c.brand }}>
                    #{bestRank}
                  </span>{' '}
                  in <span className="font-semibold" style={{ color: c.text }}>{bestBoardsLabel}</span>
                </motion.span>
              )}
              {rival && !rival.behind && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm"
                  style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                >
                  Rival: <span className="font-semibold" style={{ color: c.text }}>{rival.name}</span> ·{' '}
                  <span style={{ color: c.brand }}>{rival.xp_gap} ahead</span>
                </motion.span>
              )}
              {rival && rival.behind && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm"
                  style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                >
                  <span className="font-semibold" style={{ color: c.text }}>{rival.name}</span> is{' '}
                  <span style={{ color: c.accent }}>{rival.xp_gap} behind you</span>
                </motion.span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Panels region — zIndex 1 puts them above particles */}
      <div className="relative mx-auto px-5 md:px-10 lg:px-16 xl:px-20 pb-12 md:pb-16" style={{ zIndex: 1 }}>
        {/* DESKTOP: 4-column arena */}
        <div
          className="hidden xl:block"
          style={{ perspective: '1500px', perspectiveOrigin: '50% 30%' }}
        >
          <div className="grid grid-cols-4 gap-6 items-end" style={{ transformStyle: 'preserve-3d' }}>
            <div
              className="pt-12"
              style={{
                transform: 'rotateY(28deg) translateZ(-40px) scale(0.92)',
                transformOrigin: 'right center',
              }}
            >
              <DesktopPanel type="accuracy" delay={0.3} currentUserId={user?.id} />
            </div>
            <div style={{ transform: 'translateZ(0)' }}>
              <DesktopPanel type="global" delay={0.1} currentUserId={user?.id} />
            </div>
            <div style={{ transform: 'translateZ(0)' }}>
              <DesktopPanel type="weekly" delay={0.2} currentUserId={user?.id} />
            </div>
            <div
              className="pt-12"
              style={{
                transform: 'rotateY(-28deg) translateZ(-40px) scale(0.92)',
                transformOrigin: 'left center',
              }}
            >
              <DesktopPanel type="survival" delay={0.4} currentUserId={user?.id} />
            </div>
          </div>
        </div>

        {/* MOBILE/TABLET tabs + panel */}
        <div className="xl:hidden">
          <div className="rounded-2xl p-2 mb-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <div className="flex gap-1 relative">
              {(Object.keys(boardConfig) as BoardType[]).map((id) => {
                const { label, icon: Icon, color } = boardConfig[id]
                const active = mobileTab === id
                return (
                  <button
                    key={id}
                    onClick={() => setMobileTab(id)}
                    className="relative flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-xs font-medium cursor-pointer whitespace-nowrap z-10"
                    style={{
                      fontFamily: 'var(--font-space)',
                      color: active ? color : c.muted,
                      transition: 'color 200ms ease',
                    }}
                  >
                    {active && (
                      <motion.div
                        layoutId="mobileTabHighlight"
                        className="absolute inset-0 rounded-xl"
                        style={{ background: `${color}18`, border: `1px solid ${color}30` }}
                        transition={{ type: 'spring', bounce: 0.18, duration: 0.5 }}
                      />
                    )}
                    <Icon size={14} className="relative z-10" />
                    <span className="relative z-10">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={mobileTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="rounded-xl overflow-hidden"
              style={{ background: c.card, border: `1px solid ${c.border}` }}
            >
              <div
                className="px-4 py-3 flex items-center gap-2.5"
                style={{ borderBottom: `1px solid ${c.border}`, background: `${mobileConfig.color}08` }}
              >
                <MobileIcon size={16} style={{ color: mobileConfig.color }} />
                <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: mobileConfig.color }}>
                  {mobileConfig.label}
                </span>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                <LeaderboardList type={mobileTab} currentUserId={user?.id} />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

export default function LeaderboardPage() {
  return (
    <RequireAuth>
      <LeaderboardContent />
    </RequireAuth>
  )
}
