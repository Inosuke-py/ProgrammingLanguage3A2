import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Play, Highlighter, Loader2, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../lib/api'
import { theme as c } from '../../theme'

interface Props {
  materialId: string
  containerSelector?: string
  currentPage: number
  onHighlight?: (page: number, rects: { left: number; top: number; width: number; height: number }[], text: string) => void
}

export default function SelectionToolbar({ materialId, containerSelector = '.react-pdf__Page__textContent', currentPage, onHighlight }: Props) {
  const navigate = useNavigate()
  const [selectedText, setSelectedText] = useState('')
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(null)
  const [definitionPanel, setDefinitionPanel] = useState<{ term: string; definition: string } | null>(null)
  const [isDefining, setIsDefining] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleMouseUp = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    // Allow selections from 3 chars (single short word) up to 6000 chars
    // (matches the backend MAX_SELECTION_CHARS cap on /interactive/generate-from-selection).
    if (text && text.length > 2 && text.length < 6000) {
      // Only show toolbar if selection is within the PDF text layer
      const range = selection?.getRangeAt(0)
      const container = range?.commonAncestorContainer
      const pdfTextLayer = container?.parentElement?.closest(containerSelector)

      if (range && pdfTextLayer) {
        const rect = range.getBoundingClientRect()
        // Clamp position within viewport
        const x = Math.max(120, Math.min(window.innerWidth - 120, rect.left + rect.width / 2))
        const y = rect.top - 10
        // If too close to top, show below selection instead
        if (y < 60) {
          setToolbarPos({ x, y: rect.bottom + 10 })
        } else {
          setToolbarPos({ x, y })
        }
        setSelectedText(text)
      } else {
        setToolbarPos(null)
        setSelectedText('')
      }
    } else {
      setTimeout(() => {
        if (!isDefining && !isGenerating) {
          setToolbarPos(null)
          setSelectedText('')
        }
      }, 200)
    }
  }, [isDefining, isGenerating, containerSelector])

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const handleDefine = async () => {
    if (!selectedText) return
    setIsDefining(true)
    try {
      const res = await api.post('/interactive/define', {
        term: selectedText,
        context: '',
      })
      setDefinitionPanel({ term: res.data.term, definition: res.data.definition })
    } catch {
      setDefinitionPanel({ term: selectedText, definition: 'Could not generate a definition right now.' })
    } finally {
      setIsDefining(false)
      setToolbarPos(null)
    }
  }

  const handleGenerateQuiz = async () => {
    if (!selectedText) return
    setIsGenerating(true)
    try {
      const res = await api.post('/interactive/generate-from-selection', {
        material_id: materialId,
        selected_text: selectedText,
        question_count: 3,
      })
      navigate(`/quiz/${res.data.quiz_id}`)
    } catch {
      setIsGenerating(false)
      setToolbarPos(null)
    }
  }

  const handleHighlight = async () => {
    if (!selectedText) return

    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0)
      const rects = range.getClientRects()
      const container = document.querySelector('.react-pdf__Page')

      if (container && rects.length > 0) {
        const containerRect = container.getBoundingClientRect()
        const rectData: { left: number; top: number; width: number; height: number }[] = []
        for (let i = 0; i < rects.length; i++) {
          const rect = rects[i]
          rectData.push({
            left: rect.left - containerRect.left,
            top: rect.top - containerRect.top,
            width: rect.width,
            height: rect.height,
          })
        }
        onHighlight?.(currentPage, rectData, selectedText)
      }
      selection.removeAllRanges()
    }

    // Save to backend
    try {
      await api.post('/annotations/', {
        material_id: materialId,
        page_number: currentPage,
        type: 'highlight',
        selected_text: selectedText,
        color: 'brand',
      })
    } catch {
      // silently fail
    }

    setToolbarPos(null)
    setSelectedText('')
  }

  return (
    <>
      {/* Floating toolbar on text selection */}
      <AnimatePresence>
        {toolbarPos && selectedText && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 flex items-center gap-1.5 rounded-xl px-3 py-2 shadow-2xl"
            style={{
              left: `${toolbarPos.x}px`,
              top: `${toolbarPos.y}px`,
              transform: toolbarPos.y < 60 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              background: c.card,
              border: `1px solid ${c.border}`,
            }}
          >
            <button
              onClick={handleDefine}
              disabled={isDefining}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer transition-colors hover:opacity-80 disabled:opacity-50"
              style={{ fontFamily: 'var(--font-space)', color: c.accent, background: `${c.accent}15` }}
            >
              {isDefining ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
              Define
            </button>
            <button
              onClick={handleGenerateQuiz}
              disabled={isGenerating}
              className="flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-lg cursor-pointer transition-colors hover:opacity-80 disabled:opacity-50"
              style={{ fontFamily: 'var(--font-space)', color: c.brand, background: `${c.brand}15` }}
            >
              {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Quiz this
            </button>
            <button
              onClick={handleHighlight}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-2.5 rounded-lg cursor-pointer transition-colors hover:opacity-80"
              style={{ fontFamily: 'var(--font-space)', color: c.brand, background: `${c.brand}08` }}
            >
              <Highlighter size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Definition panel */}
      <AnimatePresence>
        {definitionPanel && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="fixed bottom-4 right-4 z-50 w-80 rounded-xl p-4 shadow-2xl"
            style={{ background: c.card, border: `1px solid ${c.border}` }}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen size={13} style={{ color: c.accent }} />
                <span className="text-xs font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  {definitionPanel.term}
                </span>
              </div>
              <button
                onClick={() => setDefinitionPanel(null)}
                className="p-1 rounded cursor-pointer hover:opacity-70"
                style={{ color: c.muted }}
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              {definitionPanel.definition}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
