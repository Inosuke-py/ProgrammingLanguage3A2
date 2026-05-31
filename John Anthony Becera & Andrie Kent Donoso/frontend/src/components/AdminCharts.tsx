/**
 * Lightweight SVG charts for the admin dashboard.
 * No external charting library — keeps bundle small and lets us match
 * the Kino aesthetic exactly. Each chart is responsive via viewBox.
 */
import { useState } from 'react'
import { theme as c } from '../theme'

const fontStack = 'var(--font-space)'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function niceMax(v: number) {
  if (v <= 0) return 4
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / mag
  let nice
  if (norm <= 1) nice = 1
  else if (norm <= 2) nice = 2
  else if (norm <= 5) nice = 5
  else nice = 10
  return nice * mag
}

function formatDateTick(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return `${d.toLocaleString('en-US', { month: 'short' })} ${d.getDate()}`
}

// ─── Multi-Series Line Chart ──────────────────────────────────────────────────

export interface LineSeries {
  key: string
  label: string
  color: string
  data: number[]  // y-values aligned with x-labels
}

interface LineChartProps {
  xLabels: string[]      // ISO date strings
  series: LineSeries[]
  height?: number
  yLabel?: string
}

export function LineChart({ xLabels, series, height = 220, yLabel }: LineChartProps) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 800
  const H = height
  const padL = 48
  const padR = 16
  const padT = 16
  const padB = 36
  const innerW = W - padL - padR
  const innerH = H - padT - padB

  const allValues = series.flatMap(s => s.data)
  const max = niceMax(Math.max(1, ...allValues))
  const xStep = innerW / Math.max(1, xLabels.length - 1)

  const yToPx = (v: number) => padT + innerH - (v / max) * innerH
  const xToPx = (i: number) => padL + i * xStep

  // Y-axis ticks (4 lines)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => Math.round(max * t))

  // X-axis ticks: show ~6 evenly
  const xTickStep = Math.max(1, Math.ceil(xLabels.length / 6))

  return (
    <div className="w-full">
      {yLabel && (
        <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ fontFamily: fontStack, color: c.muted }}>
          {yLabel}
        </p>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        {/* Y grid lines */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yToPx(t)}
              y2={yToPx(t)}
              stroke={c.border}
              strokeDasharray={i === 0 ? '0' : '2 4'}
            />
            <text
              x={padL - 8}
              y={yToPx(t) + 4}
              textAnchor="end"
              fill={c.muted}
              fontSize="10"
              fontFamily={fontStack}
            >
              {t}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((lbl, i) =>
          i % xTickStep === 0 ? (
            <text
              key={i}
              x={xToPx(i)}
              y={H - padB + 18}
              textAnchor="middle"
              fill={c.muted}
              fontSize="10"
              fontFamily={fontStack}
            >
              {formatDateTick(lbl)}
            </text>
          ) : null
        )}

        {/* Lines + areas */}
        {series.map((s) => {
          const linePath = s.data
            .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xToPx(i)} ${yToPx(v)}`)
            .join(' ')
          const areaPath = `${linePath} L ${xToPx(s.data.length - 1)} ${yToPx(0)} L ${xToPx(0)} ${yToPx(0)} Z`
          return (
            <g key={s.key}>
              <path d={areaPath} fill={s.color} opacity="0.08" />
              <path
                d={linePath}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Points (only on hover) */}
              {hover !== null && hover < s.data.length && (
                <circle
                  cx={xToPx(hover)}
                  cy={yToPx(s.data[hover])}
                  r="4"
                  fill={s.color}
                  stroke={c.bg}
                  strokeWidth="2"
                />
              )}
            </g>
          )
        })}

        {/* Hover crosshair */}
        {hover !== null && (
          <line
            x1={xToPx(hover)}
            x2={xToPx(hover)}
            y1={padT}
            y2={H - padB}
            stroke={c.muted}
            strokeDasharray="2 3"
            opacity="0.5"
          />
        )}

        {/* Capture areas (one per x) */}
        {xLabels.map((_, i) => (
          <rect
            key={i}
            x={xToPx(i) - xStep / 2}
            y={padT}
            width={xStep}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'crosshair' }}
          />
        ))}
      </svg>

      {/* Tooltip + legend row */}
      <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1.5 mt-2">
        <div className="flex flex-wrap gap-3">
          {series.map(s => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
              <span className="text-[11px]" style={{ fontFamily: fontStack, color: c.muted }}>
                {s.label}
                {hover !== null && (
                  <>
                    : <span style={{ color: s.color, fontWeight: 600 }}>{s.data[hover]}</span>
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
        {hover !== null && xLabels[hover] && (
          <span className="text-[10px]" style={{ fontFamily: fontStack, color: c.muted }}>
            {formatDateTick(xLabels[hover])}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Bar Chart (horizontal) ───────────────────────────────────────────────────

export interface BarItem {
  label: string
  value: number
  hint?: string
  color?: string
}

interface HBarChartProps {
  items: BarItem[]
  defaultColor?: string
}

export function HBarChart({ items, defaultColor }: HBarChartProps) {
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <div className="space-y-2">
      {items.map((item, idx) => (
        <div key={idx} className="flex items-center gap-3">
          <div className="w-28 sm:w-44 truncate text-xs" style={{ fontFamily: fontStack, color: c.text }}>
            {item.label}
          </div>
          <div className="flex-1 relative h-6 rounded overflow-hidden" style={{ background: c.surface }}>
            <div
              className="absolute inset-y-0 left-0 rounded transition-all"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: item.color || defaultColor || c.brand,
                opacity: 0.8,
              }}
            />
            <span
              className="absolute inset-y-0 right-2 flex items-center text-[10px] font-bold"
              style={{ fontFamily: fontStack, color: c.text }}
            >
              {item.value.toLocaleString()}
            </span>
          </div>
          {item.hint && (
            <span className="text-[10px] hidden sm:inline" style={{ fontFamily: fontStack, color: c.muted }}>
              {item.hint}
            </span>
          )}
        </div>
      ))}
      {items.length === 0 && (
        <p className="text-xs text-center py-4" style={{ fontFamily: fontStack, color: c.muted }}>
          No data
        </p>
      )}
    </div>
  )
}

// ─── Vertical Bar Chart (compact, e.g. score histogram) ───────────────────────

interface VBarChartProps {
  items: BarItem[]
  height?: number
  defaultColor?: string
}

export function VBarChart({ items, height = 160, defaultColor }: VBarChartProps) {
  const max = Math.max(1, ...items.map(i => i.value))
  return (
    <div className="w-full">
      <div className="flex items-end gap-2 px-1" style={{ height }}>
        {items.map((item, idx) => {
          const h = (item.value / max) * (height - 24)
          return (
            <div key={idx} className="flex-1 flex flex-col items-center justify-end gap-1.5 group">
              <span className="text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontFamily: fontStack, color: c.text }}>
                {item.value}
              </span>
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: Math.max(2, h),
                  background: item.color || defaultColor || c.brand,
                  opacity: 0.85,
                }}
              />
              <span className="text-[10px] mt-0.5" style={{ fontFamily: fontStack, color: c.muted }}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Donut / Pie ──────────────────────────────────────────────────────────────

export interface DonutSlice {
  label: string
  value: number
  color: string
}

interface DonutChartProps {
  data: DonutSlice[]
  size?: number
  centerLabel?: string
  centerValue?: string | number
}

export function DonutChart({ data, size = 140, centerLabel, centerValue }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const r = size / 2 - 12
  const cx = size / 2
  const cy = size / 2
  const stroke = 18

  let cumulative = 0
  const circumference = 2 * Math.PI * r

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={c.surface} strokeWidth={stroke} />
        {data.map((slice, i) => {
          const frac = slice.value / total
          const offset = circumference * cumulative
          const length = circumference * frac
          cumulative += frac
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth={stroke}
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )
        })}
        {(centerLabel || centerValue) && (
          <>
            <text
              x={cx}
              y={cy - 2}
              textAnchor="middle"
              fontSize="18"
              fontWeight="700"
              fill={c.text}
              fontFamily={fontStack}
            >
              {centerValue}
            </text>
            <text
              x={cx}
              y={cy + 14}
              textAnchor="middle"
              fontSize="9"
              fill={c.muted}
              fontFamily={fontStack}
              style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
            >
              {centerLabel}
            </text>
          </>
        )}
      </svg>
      <div className="flex-1 min-w-0 space-y-1.5">
        {data.map((slice, i) => {
          const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0
          return (
            <div key={i} className="flex items-center gap-2 text-[11px]" style={{ fontFamily: fontStack }}>
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: slice.color }} />
              <span className="flex-1 truncate" style={{ color: c.text }}>{slice.label}</span>
              <span style={{ color: c.muted }}>{slice.value}</span>
              <span className="w-9 text-right font-semibold" style={{ color: slice.color }}>{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Hourly Heatmap (24 buckets) ──────────────────────────────────────────────

interface HourHeatmapProps {
  hours: { hour: number; count: number }[]
  color?: string
}

export function HourHeatmap({ hours, color }: HourHeatmapProps) {
  const max = Math.max(1, ...hours.map(h => h.count))
  const baseColor = color || c.brand
  return (
    <div>
      <div className="grid grid-cols-12 gap-1">
        {hours.map(h => {
          const intensity = h.count / max  // 0..1
          const opacity = 0.08 + intensity * 0.92
          return (
            <div
              key={h.hour}
              className="aspect-square rounded relative group cursor-default"
              style={{
                background: h.count === 0 ? c.surface : baseColor,
                opacity: h.count === 0 ? 1 : opacity,
              }}
              title={`${String(h.hour).padStart(2, '0')}:00 — ${h.count} answers`}
            >
              <span
                className="absolute inset-0 flex items-center justify-center text-[9px] font-bold pointer-events-none"
                style={{
                  fontFamily: fontStack,
                  color: intensity > 0.4 ? c.bg : c.muted,
                }}
              >
                {h.hour}
              </span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-2 text-[9px]" style={{ fontFamily: fontStack, color: c.muted }}>
        <span>00 (midnight)</span>
        <span>12 (noon)</span>
        <span>23</span>
      </div>
    </div>
  )
}
