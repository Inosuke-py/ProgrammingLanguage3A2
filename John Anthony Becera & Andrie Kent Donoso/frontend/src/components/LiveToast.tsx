/**
 * Live toast notifications powered by WebSocket events.
 * Shows brief notifications when classmates complete quizzes, earn badges, etc.
 */
import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, Trophy, Flame } from 'lucide-react'
import { theme as c } from '../theme'
import { useWSEvent } from '../lib/ws-context'

interface Toast {
  id: number
  icon: 'quiz' | 'badge' | 'streak'
  message: string
}

let toastId = 0

export default function LiveToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((icon: Toast['icon'], message: string) => {
    const id = ++toastId
    setToasts((prev) => [...prev.slice(-2), { id, icon, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  useWSEvent('quiz_completed', useCallback((data: any) => {
    addToast('quiz', `${data.user_name} scored ${data.score}% on ${data.quiz_title}`)
  }, [addToast]))

  useWSEvent('badge_earned', useCallback((data: any) => {
    addToast('badge', `${data.user_name} earned ${data.badge_name}`)
  }, [addToast]))

  useWSEvent('streak_milestone', useCallback((data: any) => {
    addToast('streak', `${data.user_name} hit a ${data.streak}-day streak`)
  }, [addToast]))

  const icons = {
    quiz: Zap,
    badge: Trophy,
    streak: Flame,
  }

  return (
    <div className="fixed top-16 right-4 z-40 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => {
          const Icon = icons[toast.icon]
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 60, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
              className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl pointer-events-auto"
              style={{ background: c.card, border: `1px solid ${c.border}`, boxShadow: `0 4px 16px ${c.bg}80` }}
            >
              <Icon size={14} style={{ color: c.brand }} />
              <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                {toast.message}
              </span>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
