import { motion } from 'framer-motion'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { theme as c } from '../theme'

interface BottomSheetModalProps {
  children: React.ReactNode
  onClose: () => void
  maxWidth?: string
  className?: string
}

const maxWidthMap: Record<string, string> = {
  'max-w-sm': '24rem',
  'max-w-md': '28rem',
  'max-w-lg': '32rem',
  'max-w-xl': '36rem',
  'max-w-2xl': '42rem',
  'max-w-3xl': '48rem',
}

/**
 * Responsive modal:
 * - Mobile (<md): edge-to-edge, no side gaps, rounded top corners only, sits above bottom nav
 * - Desktop (md+): centered with max-width, fully rounded corners
 */
export function BottomSheetModal({ children, onClose, maxWidth = 'max-w-md', className = '' }: BottomSheetModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const resolvedMaxWidth = maxWidthMap[maxWidth] || '28rem'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: `${c.bg}ee` }} />

      {/* Sheet (mobile) / Dialog (desktop) */}
      <motion.div
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full overflow-y-auto ${className}`}
        style={{
          maxWidth: isDesktop ? resolvedMaxWidth : 'none',
          maxHeight: isDesktop ? '85vh' : 'calc(100vh - 130px)',
          marginBottom: isDesktop ? 0 : 60,
          borderRadius: isDesktop ? 16 : '16px 16px 0 0',
          background: c.card,
          border: `1px solid ${c.border}`,
          borderBottom: isDesktop ? `1px solid ${c.border}` : 'none',
          boxShadow: `0 -8px 40px ${c.bg}88`,
        }}
      >
        {/* Drag handle indicator (mobile only) */}
        {!isDesktop && (
          <div className="flex justify-center pt-3 pb-1 sticky top-0 z-10" style={{ background: c.card, borderRadius: '16px 16px 0 0' }}>
            <div className="w-10 h-1 rounded-full" style={{ background: c.border }} />
          </div>
        )}
        {children}
      </motion.div>
    </motion.div>
  )
}
