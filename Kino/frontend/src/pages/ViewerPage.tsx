import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ChevronUp, ChevronDown, Loader2, FileText, Play, BookOpen, Minus, Plus, Maximize2, Minimize2, List, X, Search } from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'
import SelectionToolbar from '../components/viewer/SelectionToolbar'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface MaterialData {
  id: string
  title: string
  file_type: string
  page_count: number | null
  last_read_page?: number
  sections: { id: string; title: string | null; content: string; page_number: number | null; order_index: number }[]
}

function ViewerContent() {
  const { materialId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const backTo = (location.state as any)?.from || '/dashboard'
  const [material, setMaterial] = useState<MaterialData | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [magnifierOn, setMagnifierOn] = useState(false)
  const [magnifierPos, setMagnifierPos] = useState<{ x: number; y: number } | null>(null)
  const [difficulties, setDifficulties] = useState<Record<string, string>>({})
  const [showHint, setShowHint] = useState(() => !localStorage.getItem('kino_viewer_hint_dismissed'))
  const [highlights, setHighlights] = useState<Record<number, { text: string; rects: { left: number; top: number; width: number; height: number }[] }[]>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const [showMobileTOC, setShowMobileTOC] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768

  // Restore last read page from server
  useEffect(() => {
    if (materialId) {
      // Also check localStorage as immediate fallback
      const saved = localStorage.getItem(`kino_page_${materialId}`)
      if (saved) {
        const page = parseInt(saved, 10)
        if (!isNaN(page) && page > 0) setCurrentPage(page)
      }
    }
  }, [materialId])

  // Persist current page to both localStorage and server when it changes
  useEffect(() => {
    if (materialId && currentPage > 0 && numPages > 0) {
      localStorage.setItem(`kino_page_${materialId}`, String(currentPage))
      // Debounced save to server (only save after user stops navigating)
      const timeout = setTimeout(() => {
        api.put(`/materials/${materialId}/reading-progress`, { page: currentPage }).catch(() => {})
      }, 1000)
      return () => clearTimeout(timeout)
    }
  }, [materialId, currentPage, numPages])

  useEffect(() => {
    const fetchMaterial = async () => {
      try {
        const res = await api.get(`/materials/${materialId}`)
        setMaterial(res.data)
        // Restore reading progress from server
        if (res.data.last_read_page && res.data.last_read_page > 1) {
          setCurrentPage(res.data.last_read_page)
        }
        // All files are served as PDF (DOCX/PPTX converted at upload time)
        // Fallback to text viewer only if file_type is not pdf
        if (res.data.file_type === 'pdf') {
          const token = localStorage.getItem('kino_token')
          setPdfUrl(`/api/materials/${materialId}/file?token=${token}`)
        } else {
          // Fallback: text viewer for unconverted files
          setNumPages(res.data.sections?.length || 1)
        }

        api.post('/interactive/analyze-difficulty', { material_id: materialId })
          .then((diffRes) => {
            const diffMap: Record<string, string> = {}
            for (const s of diffRes.data.sections || []) {
              diffMap[s.section_id] = s.difficulty
            }
            setDifficulties(diffMap)
          })
          .catch(() => {})
      } catch (err) {
        console.error('Failed to load PDF:', err)
        setLoadError(true)
      } finally {
        setIsLoading(false)
      }
    }
    fetchMaterial()
  }, [materialId])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    // Auto-fit scale for mobile (PDF is ~595px wide for A4)
    if (mainRef.current) {
      const containerWidth = mainRef.current.clientWidth - 32 // subtract padding
      if (containerWidth < 580) {
        setScale(Math.max(0.45, containerWidth / 595))
      }
    }
  }

  const goToPage = (page: number) => setCurrentPage(Math.max(1, Math.min(numPages, page)))
  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1))
  const goToNextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1))
  const zoomIn = () => setScale((s) => Math.min(2.5, +(s + 0.05).toFixed(2)))
  const zoomOut = () => setScale((s) => Math.max(0.5, +(s - 0.05).toFixed(2)))

  // Swipe navigation for mobile
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const touchStartTime = useRef(0)
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    touchStartTime.current = Date.now()
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - touchStartY.current
    const dt = Date.now() - touchStartTime.current
    // Quick horizontal swipe: > 80px, dominant horizontal, within 400ms
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2 && dt < 400) {
      if (dx < 0) goToNextPage()
      else goToPrevPage()
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goToNextPage() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrevPage() }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomIn() }
      if (e.key === '-') { e.preventDefault(); zoomOut() }
      if (e.key === 'f') { e.preventDefault(); toggleFullscreen() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFsChange)
    return () => document.removeEventListener('fullscreenchange', handleFsChange)
  }, [])

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3" style={{ background: c.bg }}>
        <Loader2 size={28} className="animate-spin" style={{ color: c.brand }} />
        <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Loading document...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: c.bg }}>
        <BookOpen size={40} style={{ color: c.muted }} />
        <p className="font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Couldn't load this document</p>
        <Link to={backTo} className="mt-2 text-sm font-medium px-5 py-2.5 rounded-lg no-underline" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
          Back to dashboard
        </Link>
      </div>
    )
  }

  const progress = numPages > 0 ? (currentPage / numPages) * 100 : 0

  return (
    <div ref={containerRef} className="h-screen flex flex-col md:flex-row overflow-hidden" style={{ background: c.bg }}>
      {/* MOBILE TOP BAR (visible only on small screens) */}
      <div className="md:hidden flex items-center justify-between px-3 py-2.5 flex-shrink-0" style={{ background: c.surface, borderBottom: `1px solid ${c.border}` }}>
        <div className="flex items-center gap-1">
          <Link to={backTo} className="p-1.5 rounded-md no-underline" style={{ color: c.muted }}>
            <ArrowLeft size={18} />
          </Link>
          <button onClick={() => setShowMobileTOC(true)} className="p-1.5 rounded-md cursor-pointer" style={{ color: c.muted }}>
            <List size={18} />
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={goToPrevPage} disabled={currentPage <= 1} className="p-1.5 rounded-md cursor-pointer disabled:opacity-30" style={{ color: c.text }}>
            <ChevronUp size={16} />
          </button>
          <span className="text-xs font-bold tabular-nums min-w-[40px] text-center" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            {currentPage}/{numPages}
          </span>
          <button onClick={goToNextPage} disabled={currentPage >= numPages} className="p-1.5 rounded-md cursor-pointer disabled:opacity-30" style={{ color: c.text }}>
            <ChevronDown size={16} />
          </button>
        </div>
        <button
          onClick={() => navigate(backTo)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer text-xs font-bold"
          style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
        >
          <Play size={12} />
          Quiz
        </button>
      </div>

      {/* LEFT SIDEBAR: navigation + controls */}
      <aside className="hidden md:flex w-80 flex-shrink-0 flex-col h-full" style={{ background: c.surface, borderRight: `1px solid ${c.border}` }}>
        {/* Back + title */}
        <div className="px-5 pt-5 pb-4">
          <Link to={backTo} className="flex items-center gap-2 text-sm no-underline mb-4 hover:opacity-70 transition-opacity" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            <ArrowLeft size={16} />
            Dashboard
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <FileText size={18} style={{ color: c.brand }} />
            <h1 className="font-bold text-base leading-tight line-clamp-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {material?.title}
            </h1>
          </div>
          <p className="text-xs mt-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            {numPages} pages
          </p>
        </div>

        {/* Page navigation */}
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${c.border}` }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Page</span>
            <span className="text-base font-bold tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {currentPage} / {numPages}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={goToPrevPage} disabled={currentPage <= 1} className="flex-1 flex items-center justify-center gap-1 py-3 rounded-lg cursor-pointer transition-colors disabled:opacity-30 hover:opacity-80" style={{ background: c.card, border: `1px solid ${c.border}`, color: c.text }}>
              <ChevronUp size={16} />
            </button>
            <button onClick={goToNextPage} disabled={currentPage >= numPages} className="flex-1 flex items-center justify-center gap-1 py-3 rounded-lg cursor-pointer transition-colors disabled:opacity-30 hover:opacity-80" style={{ background: c.card, border: `1px solid ${c.border}`, color: c.text }}>
              <ChevronDown size={16} />
            </button>
          </div>
        </div>

        {/* Zoom controls */}
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${c.border}` }}>
          <span className="text-xs font-semibold uppercase tracking-wider block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Zoom</span>
          <div className="flex items-center gap-2">
            <button onClick={zoomOut} className="p-2.5 rounded-lg cursor-pointer hover:opacity-80" style={{ background: c.card, border: `1px solid ${c.border}`, color: c.text }}>
              <Minus size={16} />
            </button>
            <span className="flex-1 text-center text-base font-bold tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {Math.round(scale * 100)}%
            </span>
            <button onClick={zoomIn} className="p-2.5 rounded-lg cursor-pointer hover:opacity-80" style={{ background: c.card, border: `1px solid ${c.border}`, color: c.text }}>
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Reading progress */}
        <div className="px-5 py-4" style={{ borderTop: `1px solid ${c.border}` }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Progress</span>
            <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-2.5 rounded-full" style={{ background: c.border }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: c.brand }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Sections / TOC */}
        <div className="flex-1 overflow-y-auto px-4 py-4" style={{ borderTop: `1px solid ${c.border}` }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3 px-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Contents</p>
          <div className="space-y-0.5">
            {material?.sections?.map((section) => {
              const diff = difficulties[section.id]
              const diffColor = diff === 'easy' ? c.accent : diff === 'hard' ? 'oklch(65% 0.18 25)' : c.brand
              const isActive = section.page_number === currentPage
              return (
                <button
                  key={section.id}
                  onClick={() => section.page_number && goToPage(section.page_number)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-all flex items-center gap-2"
                  style={{
                    fontFamily: 'var(--font-space)',
                    color: isActive ? c.text : c.muted,
                    background: isActive ? `${c.brand}12` : 'transparent',
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {diff && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: diffColor }} />}
                  <span className="truncate">{section.title || `Page ${section.page_number}`}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="px-5 py-4 space-y-2.5" style={{ borderTop: `1px solid ${c.border}` }}>
          <button onClick={toggleFullscreen} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium cursor-pointer hover:opacity-80 transition-opacity" style={{ fontFamily: 'var(--font-space)', background: c.card, border: `1px solid ${c.border}`, color: c.text }}>
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
          <button onClick={() => setMagnifierOn(!magnifierOn)} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-medium cursor-pointer transition-opacity" style={{ fontFamily: 'var(--font-space)', background: magnifierOn ? `${c.brand}15` : c.card, border: `1px solid ${magnifierOn ? c.brand : c.border}`, color: magnifierOn ? c.brand : c.text }}>
            <Search size={16} />
            {magnifierOn ? 'Magnifier ON' : 'Magnifier'}
          </button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(backTo)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-bold cursor-pointer"
            style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
          >
            <Play size={16} />
            Start quiz
          </motion.button>
        </div>
      </aside>

      {/* RIGHT: PDF reading area (maximized) */}
      <main
        ref={mainRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseMove={magnifierOn ? (e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setMagnifierPos({ x: e.clientX, y: e.clientY })
        } : undefined}
        onMouseLeave={magnifierOn ? () => setMagnifierPos(null) : undefined}
        className="flex-1 overflow-auto flex flex-col items-center py-4 md:py-6 px-4 md:px-6 relative"
        style={{ background: 'oklch(12% 0.01 280)', backgroundImage: 'radial-gradient(ellipse at center, oklch(14% 0.015 280) 0%, oklch(10% 0.01 280) 100%)', cursor: magnifierOn ? 'crosshair' : undefined }}
      >
        {/* Magnifier lens - uses the rendered canvas directly */}
        {magnifierOn && magnifierPos && mainRef.current && (() => {
          const mainRect = mainRef.current.getBoundingClientRect()
          const zoom = 1.3
          const lensW = 360
          const lensH = 110
          // Find the canvas element (rendered PDF page)
          const canvas = mainRef.current.querySelector('canvas')
          if (!canvas) return null
          const canvasRect = canvas.getBoundingClientRect()
          // Cursor position relative to the canvas
          const cxOnCanvas = magnifierPos.x - canvasRect.left
          const cyOnCanvas = magnifierPos.y - canvasRect.top
          // If cursor is outside the canvas, don't show
          if (cxOnCanvas < 0 || cyOnCanvas < 0 || cxOnCanvas > canvasRect.width || cyOnCanvas > canvasRect.height) return null

          // Calculate background position to center the cursor point in the lens
          const bgWidth = canvasRect.width * zoom
          const bgHeight = canvasRect.height * zoom
          const bgX = lensW / 2 - cxOnCanvas * zoom
          const bgY = lensH / 2 - cyOnCanvas * zoom

          let dataUrl = ''
          try { dataUrl = canvas.toDataURL() } catch { return null }

          return (
            <div
              className="pointer-events-none fixed z-50"
              style={{
                left: magnifierPos.x - lensW / 2,
                top: magnifierPos.y - lensH / 2,
                width: lensW,
                height: lensH,
                borderRadius: 8,
                overflow: 'hidden',
                backgroundImage: `url(${dataUrl})`,
                backgroundSize: `${bgWidth}px ${bgHeight}px`,
                backgroundPosition: `${bgX}px ${bgY}px`,
                backgroundRepeat: 'no-repeat',
              }}
            >
              {/* Frosted white edge */}
              <div className="absolute inset-0 pointer-events-none" style={{
                borderRadius: 8,
                boxShadow: 'inset 0 0 8px 5px oklch(96% 0.005 280 / 0.6)',
              }} />
            </div>
          )
        })()}
        {/* Hint (hidden on mobile - text selection unreliable) */}
        <AnimatePresence>
          {showHint && (
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              className="mb-5 rounded-2xl px-6 py-4 hidden md:flex items-center gap-4"
              style={{ background: c.card, border: `1px solid ${c.brand}30`, boxShadow: `0 0 24px ${c.brand}15` }}
            >
              <motion.div
                animate={{ rotate: [0, -8, 8, -4, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${c.brand}15` }}
              >
                <BookOpen size={20} style={{ color: c.brand }} />
              </motion.div>
              <div>
                <p className="text-sm font-semibold mb-0.5" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  Try selecting text on the page
                </p>
                <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Get instant definitions or generate a quiz from any paragraph
                </p>
              </div>
              <button
                onClick={() => { setShowHint(false); localStorage.setItem('kino_viewer_hint_dismissed', '1') }}
                className="text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-transform hover:scale-[1.05] flex-shrink-0"
                style={{ fontFamily: 'var(--font-space)', color: c.bg, background: c.brand }}
              >
                Got it
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PDF */}
        {pdfUrl && (
          <div className="relative">
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<div className="flex items-center justify-center py-32"><Loader2 size={28} className="animate-spin" style={{ color: c.brand }} /></div>}
              error={<div className="text-center py-32"><p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Failed to render PDF.</p></div>}
            >
              <motion.div
                key={currentPage}
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="relative"
              >
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  className="shadow-2xl rounded-lg overflow-hidden"
                  renderTextLayer={!isMobile}
                  renderAnnotationLayer={!isMobile}
                />
              {/* Highlight overlays for current page */}
              {highlights[currentPage]?.map((h, hi) =>
                h.rects.map((rect, ri) => (
                  <div
                    key={`${hi}-${ri}`}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${rect.left}px`,
                      top: `${rect.top}px`,
                      width: `${rect.width}px`,
                      height: `${rect.height}px`,
                      backgroundColor: 'oklch(75% 0.18 65 / 0.25)',
                      borderRadius: '2px',
                      zIndex: 5,
                      mixBlendMode: 'multiply',
                    }}
                  />
                ))
              )}
            </motion.div>
          </Document>
            {/* Mobile tap zones for page navigation */}
            <button
              onClick={goToPrevPage}
              className="md:hidden absolute left-0 top-0 bottom-0 w-12 cursor-pointer z-10"
              style={{ background: 'transparent' }}
              aria-label="Previous page"
              disabled={currentPage <= 1}
            />
            <button
              onClick={goToNextPage}
              className="md:hidden absolute right-0 top-0 bottom-0 w-12 cursor-pointer z-10"
              style={{ background: 'transparent' }}
              aria-label="Next page"
              disabled={currentPage >= numPages}
            />
          </div>
        )}

        {/* DOCX/PPTX text-based viewer */}
        {!pdfUrl && material && material.sections.length > 0 && (
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="w-full max-w-3xl rounded-xl shadow-2xl overflow-hidden"
            style={{ background: c.card, border: `1px solid ${c.border}`, transform: `scale(${scale})`, transformOrigin: 'top center' }}
          >
            {/* Section header */}
            {material.sections[currentPage - 1] && (
              <div className="p-8">
                {material.sections[currentPage - 1].title && (
                  <h2 className="font-bold text-2xl mb-6 leading-tight" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                    {material.sections[currentPage - 1].title}
                  </h2>
                )}
                <div
                  className="text-base leading-relaxed whitespace-pre-wrap"
                  style={{ fontFamily: 'var(--font-space)', color: c.muted, maxWidth: '70ch' }}
                >
                  {material.sections[currentPage - 1].content}
                </div>
                <div className="mt-8 pt-4" style={{ borderTop: `1px solid ${c.border}` }}>
                  <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    Section {currentPage} of {material.sections.length}
                    {material.file_type === 'pptx' && ' (Slide)'}
                    {material.file_type === 'docx' && ' (Chapter)'}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* Mobile TOC Bottom Sheet */}
      <AnimatePresence>
        {showMobileTOC && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-50"
            onClick={() => setShowMobileTOC(false)}
          >
            <div className="absolute inset-0" style={{ background: `${c.bg}cc` }} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-0 left-0 right-0 rounded-t-2xl max-h-[70vh] overflow-y-auto"
              style={{ background: c.surface }}
            >
              <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: c.surface, borderBottom: `1px solid ${c.border}` }}>
                <h3 className="font-bold text-base" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Sections</h3>
                <button onClick={() => setShowMobileTOC(false)} className="p-1.5 rounded-md cursor-pointer" style={{ color: c.muted }}>
                  <X size={18} />
                </button>
              </div>
              <div className="px-4 py-3">
                {material?.sections?.map((section) => {
                  const isActive = section.page_number === currentPage
                  return (
                    <button
                      key={section.id}
                      onClick={() => { if (section.page_number) goToPage(section.page_number); setShowMobileTOC(false) }}
                      className="w-full text-left px-3 py-3 rounded-lg text-sm cursor-pointer transition-colors"
                      style={{
                        fontFamily: 'var(--font-space)',
                        color: isActive ? c.text : c.muted,
                        background: isActive ? `${c.brand}12` : 'transparent',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {section.title || `Page ${section.page_number}`}
                    </button>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selection toolbar (desktop only) */}
      {materialId && !isMobile && (
        <SelectionToolbar
          materialId={materialId}
          currentPage={currentPage}
          onHighlight={(page, rects, text) => {
            setHighlights((prev) => ({
              ...prev,
              [page]: [...(prev[page] || []), { text, rects }],
            }))
          }}
        />
      )}
    </div>
  )
}

export default function ViewerPage() {
  return (
    <RequireAuth>
      <ViewerContent />
    </RequireAuth>
  )
}
