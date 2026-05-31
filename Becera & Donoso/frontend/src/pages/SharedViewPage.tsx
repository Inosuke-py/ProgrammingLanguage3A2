import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import { motion } from 'framer-motion'
import { ChevronUp, ChevronDown, Loader2, FileText, Dog, Minus, Plus, BookmarkPlus, Check } from 'lucide-react'
import api from '../lib/api'
import { theme as c } from '../theme'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface SharedMaterial {
  id: string
  title: string
  page_count: number | null
  permission: string
  owner_name: string
  sections: { id: string; title: string | null; content: string; page_number: number | null }[]
}

export default function SharedViewPage() {
  const { shareToken } = useParams()
  const navigate = useNavigate()
  const [material, setMaterial] = useState<SharedMaterial | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [scale, setScale] = useState(1.0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const mainRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchShared = async () => {
      try {
        const res = await api.get(`/share/public/${shareToken}`)
        setMaterial(res.data)
        setPdfUrl(`/api/share/public/${shareToken}/file`)
      } catch {
        setError('This link is invalid or has expired.')
      } finally {
        setLoading(false)
      }
    }
    if (shareToken) fetchShared()
  }, [shareToken])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    if (mainRef.current) {
      const containerWidth = mainRef.current.clientWidth - 32
      if (containerWidth < 580) {
        setScale(Math.max(0.45, containerWidth / 595))
      }
    }
  }

  const goToPrevPage = () => setCurrentPage((p) => Math.max(1, p - 1))
  const goToNextPage = () => setCurrentPage((p) => Math.min(numPages, p + 1))

  const handleSave = async () => {
    const token = localStorage.getItem('kino_token')
    if (!token) {
      navigate('/login')
      return
    }
    setSaving(true)
    try {
      await api.post('/shared-with-me/save', { share_token: shareToken })
      setSaved(true)
    } catch {
      // Already saved or own material
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const isLoggedIn = !!localStorage.getItem('kino_token')

  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3" style={{ background: c.bg }}>
        <Loader2 size={28} className="animate-spin" style={{ color: c.brand }} />
        <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Loading shared material...</p>
      </div>
    )
  }

  if (error || !material) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 px-6" style={{ background: c.bg }}>
        <FileText size={40} style={{ color: c.muted }} />
        <p className="font-medium text-center" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
          {error || 'Material not found'}
        </p>
        <Link to="/" className="text-sm font-medium px-5 py-2.5 rounded-lg no-underline" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
          Go to Kino
        </Link>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: c.bg }}>
      {/* Header */}
      <header className="px-4 md:px-8 py-3 flex items-center justify-between flex-shrink-0" style={{ background: c.surface, borderBottom: `1px solid ${c.border}` }}>
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.brand, color: c.bg }}>
              <Dog size={16} strokeWidth={2.5} />
            </span>
            <span className="font-bold text-base tracking-tight hidden sm:inline" style={{ fontFamily: 'var(--font-space)', color: c.text }}>KINO</span>
          </Link>
          <div className="hidden sm:block h-5 w-px mx-2" style={{ background: c.border }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate max-w-[200px] md:max-w-none" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {material.title}
            </p>
            <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Shared by {material.owner_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToPrevPage} disabled={currentPage <= 1} className="p-1.5 rounded-md cursor-pointer disabled:opacity-30" style={{ color: c.text }}>
            <ChevronUp size={16} />
          </button>
          <span className="text-xs font-bold tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            {currentPage}/{numPages}
          </span>
          <button onClick={goToNextPage} disabled={currentPage >= numPages} className="p-1.5 rounded-md cursor-pointer disabled:opacity-30" style={{ color: c.text }}>
            <ChevronDown size={16} />
          </button>
          <div className="hidden sm:flex items-center gap-1 ml-3">
            <button onClick={() => setScale(s => Math.max(0.5, s - 0.1))} className="p-1.5 rounded-md cursor-pointer" style={{ color: c.muted }}>
              <Minus size={14} />
            </button>
            <span className="text-xs tabular-nums w-10 text-center" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              {Math.round(scale * 100)}%
            </span>
            <button onClick={() => setScale(s => Math.min(2.5, s + 0.1))} className="p-1.5 rounded-md cursor-pointer" style={{ color: c.muted }}>
              <Plus size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* PDF View */}
      <main ref={mainRef} className="flex-1 overflow-auto flex flex-col items-center py-4 md:py-6 px-4 md:px-6" style={{ background: 'oklch(12% 0.01 280)' }}>
        {pdfUrl && (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={<div className="flex items-center justify-center py-32"><Loader2 size={28} className="animate-spin" style={{ color: c.brand }} /></div>}
            error={<div className="text-center py-32"><p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Failed to load document.</p></div>}
          >
            <motion.div
              key={currentPage}
              initial={{ opacity: 0.7 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Page
                pageNumber={currentPage}
                scale={scale}
                className="shadow-2xl rounded-lg overflow-hidden"
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </motion.div>
          </Document>
        )}
      </main>

      {/* Footer CTA */}
      <div className="px-4 py-3 flex items-center justify-between flex-shrink-0" style={{ background: c.surface, borderTop: `1px solid ${c.border}` }}>
        <div className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          {material.permission === 'quiz' ? 'View + Quiz access' : 'View only'}
        </div>
        {isLoggedIn ? (
          <button
            onClick={handleSave}
            disabled={saved || saving}
            className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer disabled:opacity-60"
            style={{ fontFamily: 'var(--font-space)', background: saved ? `${c.accent}15` : c.brand, color: saved ? c.accent : c.bg }}
          >
            {saved ? <Check size={12} /> : saving ? <Loader2 size={12} className="animate-spin" /> : <BookmarkPlus size={12} />}
            {saved ? 'Saved' : saving ? 'Saving...' : 'Save to library'}
          </button>
        ) : (
          <Link
            to="/login"
            className="text-xs font-semibold no-underline px-4 py-2 rounded-lg"
            style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
          >
            Sign in to save
          </Link>
        )}
      </div>
    </div>
  )
}
