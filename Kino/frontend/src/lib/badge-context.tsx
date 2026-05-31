import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import BadgeUnlockModal from '../components/BadgeUnlockModal'

interface UnlockedBadge {
  key: string
  name: string
  description: string
  icon: string
  rarity: string
}

interface BadgeContextType {
  showBadgeUnlock: (badges: UnlockedBadge[], xpEarned?: number) => void
}

const BadgeContext = createContext<BadgeContextType | null>(null)

export function BadgeProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<{ badge: UnlockedBadge; xp?: number }[]>([])
  const [current, setCurrent] = useState<{ badge: UnlockedBadge; xp?: number } | null>(null)

  const showBadgeUnlock = useCallback((badges: UnlockedBadge[], xpEarned?: number) => {
    if (!badges || badges.length === 0) return
    // Queue all badges, show first immediately
    const items = badges.map((badge, i) => ({ badge, xp: i === 0 ? xpEarned : undefined }))
    setCurrent(items[0])
    if (items.length > 1) {
      setQueue(items.slice(1))
    }
  }, [])

  const handleClose = useCallback(() => {
    setCurrent(null)
    // Show next in queue after a brief delay
    setTimeout(() => {
      setQueue((prev) => {
        if (prev.length > 0) {
          setCurrent(prev[0])
          return prev.slice(1)
        }
        return prev
      })
    }, 300)
  }, [])

  return (
    <BadgeContext.Provider value={{ showBadgeUnlock }}>
      {children}
      <BadgeUnlockModal
        badge={current?.badge || null}
        xpEarned={current?.xp}
        onClose={handleClose}
      />
    </BadgeContext.Provider>
  )
}

export function useBadgeUnlock() {
  const context = useContext(BadgeContext)
  if (!context) throw new Error('useBadgeUnlock must be used within BadgeProvider')
  return context
}
