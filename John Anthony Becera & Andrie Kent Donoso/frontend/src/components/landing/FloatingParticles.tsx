import { useEffect, useRef } from 'react'

/**
 * Canvas-based rising "ember" particles with depth, sway, twinkle, and cursor-dodge.
 *
 * Visual model: warm gold sparks rising from below the section. Each particle
 * has a randomized "depth" (0 = far/small/slow, 1 = near/big/fast) which
 * drives size, opacity, base velocity, and parallax response — giving the
 * field a real sense of three-dimensional space rather than flat dots.
 *
 * Forces:
 *   - Buoyancy: each particle settles toward its base upward velocity
 *   - Sway: per-particle sine wobble simulating thermals / air currents
 *   - Wind: shared low-frequency horizontal drift across the whole field
 *   - Cursor repel: quadratic falloff inside REPEL_RADIUS
 *   - Damping: keeps accumulated forces from running away
 *
 * Mounts as an absolutely-positioned canvas inside its parent. Parent must be
 * `position: relative; overflow: hidden`.
 */

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Base size in CSS pixels. */
  baseSize: number
  /** 0..1: how "near" the camera; drives parallax + brightness + scale. */
  depth: number
  /** Initial sway phase (radians), staggered for natural look. */
  swayPhase: number
  /** Per-particle sway amplitude, scaled by depth. */
  swayAmp: number
  /** Per-particle hue shift around the gold tint, for warm variety. */
  hueShift: number
  /** Twinkle phase. */
  twinklePhase: number
  /** Twinkle frequency. */
  twinkleFreq: number
  /** Frame counter for fade-in. */
  life: number
}

const COUNT = 48
const REPEL_RADIUS = 150
const REPEL_FORCE = 0.55
// Warm gold tint with slight per-particle hue variance.
const TINT_R = 244
const TINT_G = 162
const TINT_B = 41

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min
}

function spawn(p: Particle, width: number, height: number, fromBottom = true) {
  const depth = Math.pow(Math.random(), 1.7) // bias toward smaller/farther particles
  p.depth = depth
  p.x = rand(0, width)
  p.y = fromBottom ? height + rand(0, 60) : rand(0, height)
  p.baseSize = rand(0.6, 1.6) + depth * 1.6 // 0.6..3.2
  // Near particles rise faster than far particles (parallax)
  p.vy = -(rand(0.4, 0.8) + depth * 0.7)
  p.vx = rand(-0.06, 0.06)
  p.swayPhase = rand(0, Math.PI * 2)
  p.swayAmp = 0.15 + depth * 0.45
  p.hueShift = rand(-15, 25) // small warm variance
  p.twinklePhase = rand(0, Math.PI * 2)
  p.twinkleFreq = rand(0.012, 0.025)
  p.life = 0
}

export default function FloatingParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef<{ x: number; y: number; tracking: boolean }>({ x: -9999, y: -9999, tracking: false })

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let dpr = window.devicePixelRatio || 1
    let width = 0
    let height = 0

    const sizeToParent = () => {
      const parent = container.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      dpr = window.devicePixelRatio || 1
      width = rect.width
      height = rect.height
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    sizeToParent()

    const ro = new ResizeObserver(sizeToParent)
    if (container.parentElement) ro.observe(container.parentElement)

    // Initialize particles. Stagger initial Y so the field looks lived-in
    // immediately rather than empty for the first second.
    const particles: Particle[] = []
    for (let i = 0; i < COUNT; i++) {
      const p: Particle = {
        x: 0, y: 0, vx: 0, vy: 0,
        baseSize: 0, depth: 0,
        swayPhase: 0, swayAmp: 0,
        hueShift: 0, twinklePhase: 0, twinkleFreq: 0,
        life: 0,
      }
      spawn(p, width || 1, height || 1, false)
      p.y = rand(0, height || 1)
      p.life = 30 // already faded in
      particles.push(p)
    }

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      mouseRef.current.x = x
      mouseRef.current.y = y
      const bleed = REPEL_RADIUS
      mouseRef.current.tracking =
        x >= -bleed && y >= -bleed && x <= rect.width + bleed && y <= rect.height + bleed
    }
    const handleLeave = () => { mouseRef.current.tracking = false }

    window.addEventListener('mousemove', handleMove, { passive: true })
    document.addEventListener('mouseleave', handleLeave)

    let frame = 0
    let tickCount = 0
    let windOffset = 0
    let windTarget = 0

    const tick = () => {
      tickCount++

      // Slowly evolve a shared "wind" offset that drifts the whole field
      // gently in one direction, then changes its mind every ~6 seconds.
      if (tickCount % 360 === 0) {
        windTarget = rand(-0.08, 0.08)
      }
      windOffset += (windTarget - windOffset) * 0.01

      ctx.clearRect(0, 0, width, height)
      const m = mouseRef.current

      // Sort by depth so far particles draw first (correct overlap)
      particles.sort((a, b) => a.depth - b.depth)

      for (const p of particles) {
        // Cursor repel — scaled lighter for far particles (parallax)
        if (m.tracking) {
          const dx = p.x - m.x
          const dy = p.y - m.y
          const distSq = dx * dx + dy * dy
          if (distSq < REPEL_RADIUS * REPEL_RADIUS && distSq > 0.01) {
            const dist = Math.sqrt(distSq)
            const falloff = 1 - dist / REPEL_RADIUS
            const f = falloff * falloff * REPEL_FORCE * (0.4 + p.depth * 0.6)
            p.vx += (dx / dist) * f
            p.vy += (dy / dist) * f
          }
        }

        // Sway: per-particle sine wobble (thermals / air currents)
        const swayX = Math.sin(p.swayPhase + tickCount * 0.012) * p.swayAmp

        // Damping
        p.vx *= 0.94
        // Always nudge back toward base upward velocity (per-depth)
        const baseVy = -(0.4 + p.depth * 0.7)
        p.vy = p.vy * 0.95 + baseVy * 0.05

        // Integrate
        p.x += p.vx + swayX * 0.05 + windOffset
        p.y += p.vy
        p.life++

        // Respawn when off-screen at top or way off the sides
        if (p.y < -20 || p.x < -40 || p.x > width + 40) {
          spawn(p, width, height, true)
        }

        // Fade in over the first ~30 frames
        const fadeIn = Math.min(1, p.life / 30)
        // Twinkle: gentle alpha modulation, more on near particles
        const twinkle = 1 - Math.sin(p.twinklePhase + tickCount * p.twinkleFreq) * 0.18 * (0.4 + p.depth * 0.6)
        // Depth-based base brightness (nearer = brighter)
        const depthAlpha = 0.35 + p.depth * 0.55 // 0.35..0.9
        const alpha = fadeIn * depthAlpha * twinkle
        if (alpha <= 0.01) continue

        // Per-particle warm tint shift. Negative shift -> redder, positive -> yellower.
        const r = Math.min(255, TINT_R + p.hueShift * 0.4)
        const g = Math.min(255, TINT_G + p.hueShift * 0.6)
        const b = Math.max(0, TINT_B - p.hueShift * 0.3)

        // Soft outer glow + crisp core
        const glowRadius = p.baseSize * 5
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius)
        glow.addColorStop(0, `rgba(${r|0},${g|0},${b|0},${alpha * 0.55})`)
        glow.addColorStop(0.5, `rgba(${r|0},${g|0},${b|0},${alpha * 0.15})`)
        glow.addColorStop(1, `rgba(${r|0},${g|0},${b|0},0)`)
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2)
        ctx.fill()

        // Bright core — slight stretch in motion direction for ember feel
        ctx.fillStyle = `rgba(${r|0},${g|0},${b|0},${alpha})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.baseSize, 0, Math.PI * 2)
        ctx.fill()
      }

      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseleave', handleLeave)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
