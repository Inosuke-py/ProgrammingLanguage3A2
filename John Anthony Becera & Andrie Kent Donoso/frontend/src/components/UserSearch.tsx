import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Loader2 } from 'lucide-react'
import api from '../lib/api'
import { theme as c } from '../theme'

interface SearchResult {
  id: string
  user_number: number | null
  name: string
  username: string | null
  picture: string | null
  xp: number
  level: number
  is_self: boolean
}

interface UserSearchProps {
  compact?: boolean // mobile mode: icon-only trigger that expands into a panel
}

const PANEL_TRANSITION = { duration: 0.18, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }

export default function UserSearch({ compact = false }: UserSearchProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const compactInputRef = useRef<HTMLInputElement>(null)

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const res = await api.get('/users/search', { params: { q, limit: 8 } })
      setResults(res.data.results || [])
    } catch {
      setResults([])
    }
    setLoading(false)
  }, [])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 200)
    return () => clearTimeout(t)
  }, [query, runSearch])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        // blur whichever input is active so the box doesn't immediately re-open
        inputRef.current?.blur()
        compactInputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // When the compact panel opens, focus its input
  useEffect(() => {
    if (open && compact && compactInputRef.current) {
      compactInputRef.current.focus()
    }
  }, [open, compact])

  const goToProfile = (u: SearchResult) => {
    setOpen(false)
    setQuery('')
    if (u.username) navigate(`/u/${u.username}`)
    else navigate(`/u/id/${u.user_number || u.id}`)
  }

  // Shared results list rendered inside both the desktop dropdown and the
  // mobile expanded panel, so the empty / loading / hit states are identical.
  const renderResults = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <Loader2 size={16} className="animate-spin" style={{ color: c.brand }} />
        </div>
      )
    }
    if (!query.trim()) {
      return (
        <p className="text-xs text-center py-8 px-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          Type a username or name to find someone
        </p>
      )
    }
    if (results.length === 0) {
      return (
        <p className="text-xs text-center py-8 px-4" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          No users found for "{query}"
        </p>
      )
    }
    return results.map((u) => (
      <button
        key={u.id}
        onClick={() => goToProfile(u)}
        className="w-full flex items-center gap-3 px-4 py-3 cursor-pointer text-left transition-colors"
        style={{ borderBottom: `1px solid ${c.border}`, background: 'transparent' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = `${c.text}05` }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        {u.picture ? (
          <img src={u.picture} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold" style={{ background: c.surface, color: c.muted }}>
            {u.name.charAt(0)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-1.5" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            {u.name}
            {u.is_self && <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{ background: `${c.brand}15`, color: c.brand }}>YOU</span>}
          </p>
          <p className="text-[11px] truncate" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            @{u.username || '—'} · Lv.{u.level}
          </p>
        </div>
        <span className="text-xs font-bold flex-shrink-0" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
          {u.xp.toLocaleString()} XP
        </span>
      </button>
    ))
  }

  // ─── Compact (mobile): icon button that expands into a full input panel ───
  if (compact) {
    return (
      <div ref={wrapRef} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="p-2 rounded-lg cursor-pointer"
          style={{
            color: open ? c.text : c.muted,
            background: open ? `${c.text}08` : 'transparent',
            transition: 'all 150ms ease',
          }}
          aria-label="Search users"
        >
          <Search size={18} />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={PANEL_TRANSITION}
              className="absolute top-full mt-2 rounded-2xl overflow-hidden z-50 left-1/2 -translate-x-1/2 w-[min(calc(100vw-1.5rem),360px)]"
              style={{ background: c.card, border: `1px solid ${c.border}`, boxShadow: `0 16px 48px ${c.bg}cc` }}
            >
              <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${c.border}` }}>
                <Search size={14} style={{ color: c.muted }} />
                <input
                  ref={compactInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by @username or name"
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ fontFamily: 'var(--font-space)', color: c.text }}
                />
                {query && (
                  <button onClick={() => setQuery('')} className="p-0.5 cursor-pointer" style={{ color: c.muted }} aria-label="Clear search">
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="max-h-[360px] overflow-y-auto">
                {renderResults()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  // ─── Desktop: the trigger IS the live search input ────────────────────────
  // No intermediate "click to open" button. Typing runs the search immediately
  // and the results list slides down below the same input.
  const showPanel = open || query.length > 0

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-lg"
        style={{
          fontFamily: 'var(--font-space)',
          background: c.surface,
          border: `1px solid ${open ? c.text + '40' : c.border}`,
          minWidth: 220,
          transition: 'border-color 150ms ease',
        }}
      >
        <Search size={14} style={{ color: c.muted, flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search users"
          className="flex-1 bg-transparent outline-none text-sm min-w-0"
          style={{ fontFamily: 'var(--font-space)', color: c.text }}
          aria-label="Search users"
        />
        {query && (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            className="p-0.5 cursor-pointer flex-shrink-0"
            style={{ color: c.muted }}
            aria-label="Clear search"
          >
            <X size={13} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={PANEL_TRANSITION}
            className="absolute top-full mt-2 right-0 w-[320px] md:w-[360px] rounded-2xl overflow-hidden z-50"
            style={{ background: c.card, border: `1px solid ${c.border}`, boxShadow: `0 16px 48px ${c.bg}cc` }}
          >
            <div className="max-h-[360px] overflow-y-auto">
              {renderResults()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
