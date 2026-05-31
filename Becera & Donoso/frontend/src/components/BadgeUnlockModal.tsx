import { useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Award, Zap, Star, Trophy, Crown, Shield, Flame, Heart, Clock,
  Target, Brain, Swords, Users, Moon, Rocket, CheckCircle2, Crosshair,
  Upload, Play, BookOpen, FolderOpen, Library, RotateCcw, Compass,
} from 'lucide-react'
import { theme as c } from '../theme'

interface UnlockedBadge {
  key: string
  name: string
  description: string
  icon: string
  rarity: string
}

interface Props {
  badge: UnlockedBadge | null
  xpEarned?: number
  onClose: () => void
}

const rarityColors: Record<string, string> = {
  common: 'oklch(60% 0.04 260)',
  rare: 'oklch(65% 0.16 250)',
  epic: 'oklch(60% 0.20 300)',
  legendary: c.brand,
  mythic: c.purple,
}

const rarityLabels: Record<string, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
  mythic: 'Mythic',
}

const rarityTier: Record<string, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
}

const iconMap: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  award: Award,
  zap: Zap,
  star: Star,
  trophy: Trophy,
  crown: Crown,
  shield: Shield,
  flame: Flame,
  heart: Heart,
  clock: Clock,
  bolt: Zap,
  target: Target,
  brain: Brain,
  swords: Swords,
  users: Users,
  moon: Moon,
  rocket: Rocket,
  'check-circle': CheckCircle2,
  crosshair: Crosshair,
  upload: Upload,
  play: Play,
  book: BookOpen,
  folder: FolderOpen,
  library: Library,
  repeat: RotateCcw,
  compass: Compass,
}

function getIcon(name: string, size: number, color: string) {
  const Icon = iconMap[name] || Award
  return <Icon size={size} style={{ color }} />
}

// ─── Keyframes (rainbow border + aura rotation + ember rise) ──────────────────

const keyframes = `
@keyframes badge-unlock-rainbow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes badge-unlock-aura {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes badge-unlock-ember {
  0% { transform: translate(var(--x, 0), 0) scale(0.6); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translate(calc(var(--x, 0) + var(--drift, 0px)), -160px) scale(1); opacity: 0; }
}
@keyframes badge-unlock-shake {
  0%, 100% { transform: translate(0, 0); }
  20% { transform: translate(-2px, 1px); }
  40% { transform: translate(2px, -1px); }
  60% { transform: translate(-1px, 2px); }
  80% { transform: translate(1px, -2px); }
}
@keyframes badge-unlock-bolt {
  0%, 100% { opacity: 0; }
  10%, 30% { opacity: 1; }
  20% { opacity: 0.4; }
}
`

// ─── Sub-components ───────────────────────────────────────────────────────────

function ParticleBurst({ color, count, distance, duration }: {
  color: string
  count: number
  distance: number
  duration: number
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        const dist = distance + Math.random() * 60
        const size = i % 4 === 0 ? 7 : i % 3 === 0 ? 5 : 3
        return (
          <motion.div
            key={i}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{
              scale: [0, 1.3, 0],
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              opacity: [1, 1, 0],
            }}
            transition={{ duration, delay: 0.15 + i * 0.02, ease: [0.16, 1, 0.3, 1] }}
            className="absolute rounded-full pointer-events-none"
            style={{
              width: size,
              height: size,
              background: color,
              boxShadow: `0 0 ${size * 2}px ${color}`,
            }}
          />
        )
      })}
    </>
  )
}

function SparkleStars({ color, count }: { color: string; count: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4
        const dist = 80 + Math.random() * 100
        return (
          <motion.div
            key={i}
            initial={{ scale: 0, rotate: 0, x: 0, y: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.4, 0],
              rotate: 180,
              x: Math.cos(angle) * dist,
              y: Math.sin(angle) * dist,
              opacity: [0, 1, 0],
            }}
            transition={{ duration: 1.6, delay: 0.4 + i * 0.05, ease: 'easeOut' }}
            className="absolute pointer-events-none"
          >
            <Star size={10} fill={color} style={{ color, filter: `drop-shadow(0 0 4px ${color})` }} />
          </motion.div>
        )
      })}
    </>
  )
}

function FireEmbers({ count }: { count: number }) {
  // Vertical-rising warm-color particles. Pure CSS keyframes so they keep
  // animating without extra framer-motion churn; perfect for legendary tier.
  const embers = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        i,
        x: (Math.random() - 0.5) * 220,
        drift: (Math.random() - 0.5) * 80,
        size: 4 + Math.random() * 6,
        color:
          i % 3 === 0 ? 'oklch(75% 0.22 30)'
          : i % 3 === 1 ? 'oklch(70% 0.20 50)'
          : c.brand,
        delay: Math.random() * 1.2,
        duration: 1.8 + Math.random() * 1.2,
      })),
    [count]
  )
  return (
    <>
      {embers.map((e) => (
        <div
          key={e.i}
          className="absolute rounded-full pointer-events-none"
          style={{
            width: e.size,
            height: e.size,
            left: '50%',
            top: '50%',
            background: e.color,
            boxShadow: `0 0 ${e.size * 2.5}px ${e.color}`,
            ['--x' as any]: `${e.x}px`,
            ['--drift' as any]: `${e.drift}px`,
            animation: `badge-unlock-ember ${e.duration}s ease-out ${e.delay}s infinite`,
            opacity: 0,
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </>
  )
}

function LightRays({ color }: { color: string }) {
  // 8 radial light rays that fade in and rotate. Used for legendary+.
  return (
    <motion.div
      initial={{ opacity: 0, rotate: 0 }}
      animate={{ opacity: [0, 0.7, 0.4], rotate: 60 }}
      transition={{ duration: 2.5, ease: 'easeOut' }}
      className="absolute pointer-events-none"
      style={{ width: 320, height: 320 }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            top: '50%',
            left: '50%',
            width: 4,
            height: 160,
            transformOrigin: '50% 0%',
            transform: `translate(-50%, 0) rotate(${(i / 12) * 360}deg)`,
            background: `linear-gradient(180deg, ${color}80 0%, transparent 100%)`,
            filter: 'blur(2px)',
          }}
        />
      ))}
    </motion.div>
  )
}

function LightningBolts({ color }: { color: string }) {
  // Two thin diagonal streaks that flash on for mythic tier.
  return (
    <>
      {[
        { x: -150, rotate: -15 },
        { x: 150, rotate: 15 },
      ].map((b, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            width: 3,
            height: 220,
            left: `calc(50% + ${b.x}px)`,
            top: '50%',
            transform: `translate(-50%, -50%) rotate(${b.rotate}deg)`,
            background: `linear-gradient(180deg, transparent 0%, ${color} 50%, transparent 100%)`,
            filter: `drop-shadow(0 0 6px ${color})`,
            animation: `badge-unlock-bolt 1.6s ease-in-out ${0.3 + i * 0.15}s 2`,
            opacity: 0,
          }}
        />
      ))}
    </>
  )
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function BadgeUnlockModal({ badge, xpEarned, onClose }: Props) {
  const [xpCount, setXpCount] = useState(0)

  const tier = badge ? rarityTier[badge.rarity] || 1 : 1

  // XP count-up animation
  useEffect(() => {
    if (!badge || !xpEarned) return
    const duration = 1200
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.min(elapsed / duration, 1)
      setXpCount(Math.round(progress * xpEarned))
      if (progress < 1) requestAnimationFrame(tick)
    }
    const timeout = setTimeout(tick, 800)
    return () => clearTimeout(timeout)
  }, [badge, xpEarned])

  // Auto-close — rarer badges linger longer so users actually see the spectacle
  useEffect(() => {
    if (!badge) return
    const autoCloseMs = tier <= 2 ? 4500 : tier === 3 ? 5500 : tier === 4 ? 6500 : 7500
    const timeout = setTimeout(onClose, autoCloseMs)
    return () => clearTimeout(timeout)
  }, [badge, onClose, tier])

  // Close on escape
  useEffect(() => {
    if (!badge) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [badge, onClose])

  if (!badge) return null

  const color = rarityColors[badge.rarity] || rarityColors.common
  const label = rarityLabels[badge.rarity] || 'Common'

  // Effects scale with tier
  const particleCount = 10 + tier * 6 // 16, 22, 28, 34, 40
  const particleDistance = 110 + tier * 18
  const particleDuration = 1.3 + tier * 0.15
  const showSparkles = tier >= 3
  const showLightRays = tier >= 4
  const showEmbers = tier >= 4
  const showShake = tier >= 4
  const showLightning = tier >= 5
  const showRainbowBorder = tier >= 5

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
        onClick={onClose}
      >
        {/* Inject keyframes */}
        <style>{keyframes}</style>

        {/* Dimmed backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, ${color}22 0%, ${c.bg}f5 50%, ${c.bg} 100%)`,
            backdropFilter: 'blur(6px)',
          }}
        />

        {/* Continuous rotating aura behind everything (epic+) */}
        {tier >= 3 && (
          <div
            className="absolute pointer-events-none"
            style={{
              width: 380,
              height: 380,
              background: `conic-gradient(from 0deg, transparent 0deg, ${color}30 90deg, transparent 180deg, ${color}30 270deg, transparent 360deg)`,
              animation: `badge-unlock-aura ${tier === 5 ? '4s' : '6s'} linear infinite`,
              filter: 'blur(20px)',
              opacity: 0.7,
            }}
          />
        )}

        {/* Light rays (legendary+) */}
        {showLightRays && <LightRays color={color} />}

        {/* Lightning bolts (mythic) */}
        {showLightning && <LightningBolts color={color} />}

        {/* Glow burst rings — multiple waves for higher tiers */}
        <motion.div
          initial={{ scale: 0, opacity: 0.85 }}
          animate={{ scale: 4 + tier * 0.5, opacity: 0 }}
          transition={{ duration: 1.6 + tier * 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="absolute w-32 h-32 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${color}60, transparent 70%)` }}
        />

        {tier >= 2 && (
          <motion.div
            initial={{ scale: 0, opacity: 0.7 }}
            animate={{ scale: 3.2, opacity: 0 }}
            transition={{ duration: 1.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute w-24 h-24 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${c.accent}55, transparent 70%)` }}
          />
        )}

        {tier >= 3 && (
          <motion.div
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 2.8, opacity: 0 }}
            transition={{ duration: 1.3, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="absolute w-20 h-20 rounded-full pointer-events-none"
            style={{ background: `radial-gradient(circle, ${color}40, transparent 70%)` }}
          />
        )}

        {/* Particle burst */}
        <ParticleBurst
          color={color}
          count={particleCount}
          distance={particleDistance}
          duration={particleDuration}
        />

        {/* Sparkle stars (epic+) */}
        {showSparkles && <SparkleStars color={tier >= 4 ? c.brand : color} count={tier * 4} />}

        {/* Fire embers (legendary+) — keep below the modal so they rise behind it */}
        {showEmbers && <FireEmbers count={tier === 5 ? 22 : 16} />}

        {/* Modal content */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            ...(showShake ? { x: [0, -2, 2, -1, 1, 0] } : {}),
          }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{
            scale: { delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] },
            opacity: { delay: 0.1, duration: 0.5 },
            x: showShake ? { delay: 0.4, duration: 0.5 } : undefined,
          }}
          onClick={(e) => e.stopPropagation()}
          className="relative flex flex-col items-center text-center px-8"
          style={{ zIndex: 10 }}
        >
          {/* Rainbow animated border halo (mythic) */}
          {showRainbowBorder && (
            <div
              className="absolute pointer-events-none rounded-3xl"
              style={{
                inset: '-30px',
                padding: 3,
                background: `linear-gradient(270deg, ${c.brand}, ${c.accent}, ${c.purple}, ${c.brand})`,
                backgroundSize: '300% 300%',
                animation: 'badge-unlock-rainbow 3s ease infinite',
                mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                maskComposite: 'exclude',
                WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                WebkitMaskComposite: 'xor',
                opacity: 0.6,
              }}
            />
          )}

          {/* Icon — spins, bounces, scales. Higher tiers spin further. */}
          <motion.div
            initial={{ scale: 0, rotate: tier >= 4 ? -540 : tier >= 3 ? -360 : -180 }}
            animate={{
              scale: [0, 1.35, 1],
              rotate: 0,
            }}
            transition={{
              delay: 0.3,
              duration: tier >= 4 ? 1.4 : 1.0,
              ease: [0.16, 1, 0.3, 1],
              scale: { times: [0, 0.6, 1] },
            }}
            className="rounded-2xl flex items-center justify-center mb-5 relative"
            style={{
              width: 96,
              height: 96,
              background: `linear-gradient(135deg, ${color}30, ${color}10)`,
              border: `2px solid ${color}`,
              boxShadow: tier >= 4
                ? `0 0 60px ${color}80, 0 0 120px ${color}40, inset 0 0 20px ${color}30`
                : tier >= 2
                  ? `0 0 40px ${color}60, inset 0 0 16px ${color}20`
                  : `0 0 28px ${color}40`,
            }}
          >
            {/* Pulsing ring inside the icon tile (rare+) */}
            {tier >= 2 && (
              <motion.div
                className="absolute inset-0 rounded-2xl pointer-events-none"
                animate={{ opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 1.2 }}
                style={{
                  border: `2px solid ${color}`,
                  boxShadow: `0 0 20px ${color}80`,
                }}
              />
            )}
            {getIcon(badge.icon, 40, color)}
          </motion.div>

          {/* Title */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="text-xs uppercase tracking-[0.25em] font-semibold mb-2"
            style={{
              fontFamily: 'var(--font-space)',
              color,
              textShadow: tier >= 4 ? `0 0 12px ${color}80` : 'none',
            }}
          >
            Achievement Unlocked
          </motion.p>

          {/* Badge name */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="font-extrabold text-2xl md:text-3xl mb-1"
            style={{
              fontFamily: 'var(--font-space)',
              color: c.text,
              textShadow: tier >= 4 ? `0 4px 24px ${color}40` : 'none',
            }}
          >
            {badge.name}
          </motion.h2>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="text-sm mb-3 max-w-xs"
            style={{ fontFamily: 'var(--font-space)', color: c.muted }}
          >
            {badge.description}
          </motion.p>

          {/* Rarity */}
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.0 }}
            className="text-[10px] uppercase tracking-wider font-bold px-3 py-1 rounded-full mb-4 inline-flex items-center gap-1.5"
            style={{
              fontFamily: 'var(--font-space)',
              color,
              background: `${color}20`,
              border: `1px solid ${color}50`,
              boxShadow: tier >= 3 ? `0 0 12px ${color}40` : 'none',
            }}
          >
            {tier >= 4 && <Flame size={10} fill={color} style={{ color }} />}
            {label}
          </motion.span>

          {/* XP earned */}
          {xpEarned && xpEarned > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
              className="flex items-center gap-2"
            >
              <Zap size={14} fill={c.brand} style={{ color: c.brand }} />
              <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
                +{xpCount} XP
              </span>
            </motion.div>
          )}

          {/* Dismiss hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8 }}
            className="text-[10px] mt-6"
            style={{ fontFamily: 'var(--font-space)', color: c.muted }}
          >
            Click anywhere to dismiss
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
