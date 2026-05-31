import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Share2, X, Loader2, Check, Link2, Copy } from 'lucide-react'
import api from '../lib/api'
import { theme as c } from '../theme'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { BottomSheetModal } from './BottomSheetModal'

interface ShareModalProps {
  materialId: string
  materialTitle: string
  isOpen: boolean
  onClose: () => void
}

export default function ShareModal({ materialId, materialTitle, isOpen, onClose }: ShareModalProps) {
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [permission, setPermission] = useState<'view' | 'quiz'>('view')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscapeClose(isOpen, onClose)

  const handleGenerateLink = async () => {
    setGeneratingLink(true)
    setError(null)
    try {
      const res = await api.post('/share/link', { material_id: materialId, permission })
      const baseUrl = window.location.origin
      setShareLink(`${baseUrl}${res.data.share_url}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to generate link')
    } finally {
      setGeneratingLink(false)
    }
  }

  const handleCopyLink = () => {
    if (shareLink) {
      navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <BottomSheetModal onClose={onClose} maxWidth="max-w-sm">
          <div className="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Share2 size={16} style={{ color: c.brand }} />
                <h2 className="font-bold text-lg" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Share</h2>
              </div>
              <button onClick={onClose} className="p-1.5 cursor-pointer" style={{ color: c.muted }}>
                <X size={16} />
              </button>
            </div>

            <p className="text-sm mb-5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Share "{materialTitle}" with anyone via link
            </p>

            {error && (
              <div className="rounded-lg px-3 py-2 mb-4 text-xs" style={{ background: 'oklch(25% 0.04 25)', color: 'oklch(75% 0.15 25)' }}>
                {error}
              </div>
            )}

            {shareLink ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-3 py-2.5 rounded-lg text-xs outline-none"
                    style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold cursor-pointer flex-shrink-0"
                    style={{ fontFamily: 'var(--font-space)', background: copied ? `${c.accent}15` : c.brand, color: copied ? c.accent : c.bg, border: copied ? `1px solid ${c.accent}` : 'none' }}
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Anyone with this link can {permission === 'quiz' ? 'view and take quizzes on' : 'view'} this material
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Permission selector */}
                <div>
                  <p className="text-xs font-medium mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Access level</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPermission('view')}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: permission === 'view' ? `${c.brand}15` : c.surface,
                        border: `1px solid ${permission === 'view' ? c.brand : c.border}`,
                        color: permission === 'view' ? c.brand : c.muted,
                      }}
                    >
                      View only
                    </button>
                    <button
                      onClick={() => setPermission('quiz')}
                      className="flex-1 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: permission === 'quiz' ? `${c.brand}15` : c.surface,
                        border: `1px solid ${permission === 'quiz' ? c.brand : c.border}`,
                        color: permission === 'quiz' ? c.brand : c.muted,
                      }}
                    >
                      View + Quiz
                    </button>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleGenerateLink}
                  disabled={generatingLink}
                  className="w-full flex items-center justify-center gap-2 font-bold text-sm py-3.5 rounded-xl cursor-pointer disabled:opacity-50"
                  style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
                >
                  {generatingLink ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                  {generatingLink ? 'Generating...' : 'Generate share link'}
                </motion.button>
              </div>
            )}
          </div>
        </BottomSheetModal>
      )}
    </AnimatePresence>
  )
}
