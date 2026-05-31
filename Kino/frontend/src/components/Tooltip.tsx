import { useState, useRef, useEffect, type ReactNode } from 'react'
import { theme as c } from '../theme'

interface TooltipProps {
  content: ReactNode
  children: ReactNode
  delay?: number
}

export function Tooltip({ content, children, delay = 250 }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }, [])

  return (
    <span
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        timeoutRef.current = setTimeout(() => setOpen(true), delay)
      }}
      onMouseLeave={() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        setOpen(false)
      }}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap z-50 pointer-events-none"
          style={{
            fontFamily: 'var(--font-space)',
            background: c.surface,
            color: c.text,
            border: `1px solid ${c.border}`,
            boxShadow: `0 8px 24px ${c.bg}cc`,
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}
