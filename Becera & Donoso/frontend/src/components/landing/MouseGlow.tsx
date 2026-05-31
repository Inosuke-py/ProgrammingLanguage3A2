import { useEffect, useRef } from 'react'

type Mode = 'grid' | 'blur'

interface MouseGlowProps {
  mode?: Mode
}

/**
 * Section-scoped reactive glow.
 *
 * - `mode="grid"` (default): Tiles in a 60px grid light up softly with a warm trail.
 *   Use this on sections that already paint a CSS grid background (Hero, HowItWorks).
 *
 * - `mode="blur"`: A soft blurry warm radial spot follows the cursor. No grid.
 *   Use this on sections without a grid (Features panel, FAQ).
 *
 * Mounts as an absolutely-positioned canvas inside its parent. The parent must be
 * `position: relative` (or any non-static). Sits at z-index 0; content should be
 * placed at z-1 or higher.
 */
export default function MouseGlow({ mode = 'grid' }: MouseGlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseRef = useRef<{ x: number; y: number; inside: boolean }>({ x: -9999, y: -9999, inside: false })
  const energyRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const tint = { r: 244, g: 162, b: 41 }

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

    const handleMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      mouseRef.current.x = x
      mouseRef.current.y = y
      // The glow should still appear when the cursor is just outside the section
      // but its radius would reach into it. Use a generous bleed so the glow
      // visibly spills across section boundaries.
      const bleed = mode === 'grid' ? 240 : 320
      mouseRef.current.inside =
        x >= -bleed &&
        y >= -bleed &&
        x <= rect.width + bleed &&
        y <= rect.height + bleed
    }

    const handleLeave = () => {
      mouseRef.current.inside = false
    }

    // Attach to window so we keep tracking even when the cursor is briefly
    // outside the parent section's box (avoids "dead zones" at the edges).
    window.addEventListener('mousemove', handleMove, { passive: true })
    document.addEventListener('mouseleave', handleLeave)

    let frame = 0

    const renderGrid = () => {
      const CELL = 60
      const RADIUS = 4
      const PEAK_ALPHA = 0.10
      const DECAY = 0.92
      const SPAWN = 0.55

      // Full clear every frame, then redraw only living cells.
      // This guarantees no residual pixels stay behind once a cell's
      // energy fully decays out of the Map.
      ctx.clearRect(0, 0, width, height)

      const m = mouseRef.current
      const energy = energyRef.current

      if (m.inside) {
        const cx = Math.floor(m.x / CELL)
        const cy = Math.floor(m.y / CELL)
        for (let dy = -RADIUS; dy <= RADIUS; dy++) {
          for (let dx = -RADIUS; dx <= RADIUS; dx++) {
            const gx = cx + dx
            const gy = cy + dy
            const sx = gx * CELL + CELL / 2
            const sy = gy * CELL + CELL / 2
            const ddx = sx - m.x
            const ddy = sy - m.y
            const dist = Math.sqrt(ddx * ddx + ddy * ddy)
            const maxDist = RADIUS * CELL
            if (dist > maxDist) continue
            const falloff = Math.pow(1 - dist / maxDist, 2.4)
            const key = `${gx},${gy}`
            const prev = energy.get(key) || 0
            const next = Math.min(1, prev + falloff * SPAWN)
            energy.set(key, next)
          }
        }
      }

      const toDelete: string[] = []
      energy.forEach((value, key) => {
        const decayed = value * DECAY
        if (decayed < 0.01) {
          toDelete.push(key)
          return
        }
        energy.set(key, decayed)
        const [gxStr, gyStr] = key.split(',')
        const gx = parseInt(gxStr, 10)
        const gy = parseInt(gyStr, 10)
        const x = gx * CELL
        const y = gy * CELL
        if (x + CELL < 0 || y + CELL < 0 || x > width || y > height) return
        const a = decayed * PEAK_ALPHA
        ctx.fillStyle = `rgba(${tint.r},${tint.g},${tint.b},${a})`
        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2)
      })
      toDelete.forEach((k) => energy.delete(k))
    }

    const renderBlur = () => {
      // Full clear, redraw a single soft radial spot at cursor.
      ctx.clearRect(0, 0, width, height)
      const m = mouseRef.current
      if (!m.inside) return

      const radius = 320
      const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, radius)
      grad.addColorStop(0, `rgba(${tint.r},${tint.g},${tint.b},0.16)`)
      grad.addColorStop(0.45, `rgba(${tint.r},${tint.g},${tint.b},0.06)`)
      grad.addColorStop(1, `rgba(${tint.r},${tint.g},${tint.b},0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(m.x, m.y, radius, 0, Math.PI * 2)
      ctx.fill()
    }

    const tick = () => {
      if (mode === 'grid') renderGrid()
      else renderBlur()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseleave', handleLeave)
    }
  }, [mode])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0, filter: mode === 'blur' ? 'blur(20px)' : undefined }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  )
}
