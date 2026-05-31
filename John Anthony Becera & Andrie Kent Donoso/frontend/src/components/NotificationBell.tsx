import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, Check, CheckCheck, Megaphone, Play, Award, Flame, Trophy, AlertTriangle } from 'lucide-react'
import api from '../lib/api'
import { theme as c } from '../theme'
import { useWSEvent } from '../lib/ws-context'

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  meta: Record<string, any>
  is_read: boolean
  created_at: string | null
}

const typeIcons: Record<string, typeof Bell> = {
  announcement: Megaphone,
  quiz_published: Play,
  badge_earned: Award,
  challenge_new: Flame,
  leaderboard: Trophy,
  warning: AlertTriangle,
}

const typeColors: Record<string, string> = {
  announcement: 'oklch(70% 0.15 250)',
  quiz_published: 'oklch(75% 0.18 65)',
  badge_earned: 'oklch(70% 0.16 160)',
  challenge_new: 'oklch(70% 0.18 25)',
  leaderboard: 'oklch(70% 0.15 300)',
  warning: 'oklch(75% 0.18 65)',
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications/')
      setNotifications(res.data.notifications)
      setUnreadCount(res.data.unread_count)
    } catch {}
  }, [])

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await api.get('/notifications/unread-count')
      setUnreadCount(res.data.unread_count)
    } catch {}
  }, [])

  // Initial load
  useEffect(() => { fetchUnreadCount() }, [fetchUnreadCount])

  // When panel opens, fetch full list
  useEffect(() => {
    if (open) {
      setLoading(true)
      fetchNotifications().finally(() => setLoading(false))
    }
  }, [open, fetchNotifications])

  // Listen for real-time notifications
  useWSEvent('notification', useCallback((data: any) => {
    setNotifications((prev) => [data, ...prev])
    setUnreadCount((prev) => prev + 1)
  }, []))

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch {}
  }

  const handleClick = async (notif: NotificationItem) => {
    // Mark as read
    if (!notif.is_read) {
      try {
        await api.post(`/notifications/${notif.id}/read`)
        setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n))
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } catch {}
    }
    // Navigate if link exists
    if (notif.link) {
      setOpen(false)
      navigate(notif.link)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg cursor-pointer"
        style={{
          color: open ? c.text : c.muted,
          background: open ? `${c.text}08` : 'transparent',
          transition: 'all 150ms ease',
        }}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold px-1"
            style={{ background: 'oklch(65% 0.2 25)', color: c.bg }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] rounded-2xl overflow-hidden flex flex-col z-50"
            style={{ background: c.card, border: `1px solid ${c.border}`, boxShadow: `0 16px 48px ${c.bg}cc` }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${c.border}` }}>
              <h3 className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Notifications</h3>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg cursor-pointer"
                    style={{ fontFamily: 'var(--font-space)', background: `${c.accent}10`, color: c.accent }}
                    title="Mark all as read"
                  >
                    <CheckCheck size={12} /> Read all
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="p-1 cursor-pointer rounded-md" style={{ color: c.muted }}>
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Bell size={28} className="mb-3" style={{ color: c.muted }} />
                  <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No notifications yet</p>
                </div>
              ) : (
                notifications.map((notif) => {
                  const Icon = typeIcons[notif.type] || Bell
                  const color = typeColors[notif.type] || c.muted
                  return (
                    <button
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className="w-full flex items-start gap-3 px-5 py-3.5 text-left cursor-pointer transition-colors"
                      style={{
                        background: notif.is_read ? 'transparent' : `${c.brand}04`,
                        borderBottom: `1px solid ${c.border}`,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = `${c.text}04` }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = notif.is_read ? 'transparent' : `${c.brand}04` }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: `${color}15` }}>
                        <Icon size={14} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-snug" style={{ fontFamily: 'var(--font-space)', color: notif.is_read ? c.muted : c.text }}>
                          {notif.title}
                        </p>
                        {notif.body && (
                          <p className="text-xs mt-0.5 line-clamp-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                            {notif.body}
                          </p>
                        )}
                        <p className="text-[10px] mt-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                          {timeAgo(notif.created_at)}
                        </p>
                      </div>
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: c.brand }} />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
