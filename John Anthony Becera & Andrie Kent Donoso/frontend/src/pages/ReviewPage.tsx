import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Document, Page, pdfjs } from 'react-pdf'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronLeft, ChevronRight, XCircle, BookOpen, Lightbulb, Loader2 } from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

interface ReviewQuestion {
  question_id: string
  content: string
  user_answer: string
  correct_answer: string
  is_correct: boolean
  explanation: string
  source_text: string
}

interface ReviewState {
  material_id: string
  results: ReviewQuestion[]
}

function ReviewContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as ReviewState | null

  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  const [simpleExplanations, setSimpleExplanations] = useState<Record<string, string>>({})
  const [loadingEli12, setLoadingEli12] = useState<string | null>(null)

  const wrongResults = state?.results.filter((r) => !r.is_correct) || []

  useEffect(() => {
    if (!state?.material_id) return
    const fetchPdf = async () => {
      try {
        const fileRes = await api.get(`/materials/${state.material_id}/file`, { responseType: 'blob' })
        setPdfUrl(URL.createObjectURL(fileRes.data))
      } catch {
        // PDF not available
      }
    }
    fetchPdf()
  }, [state?.material_id])

  if (!state || wrongResults.length === 0) {
    navigate('/dashboard')
    return null
  }

  const currentQ = wrongResults[currentQuestionIdx]

  const handleELI12 = async (questionId: string) => {
    if (simpleExplanations[questionId]) return
    setLoadingEli12(questionId)
    try {
      const res = await api.post('/explain/eli12', { question_id: questionId })
      setSimpleExplanations((prev) => ({ ...prev, [questionId]: res.data.simple_explanation }))
    } catch {
      setSimpleExplanations((prev) => ({ ...prev, [questionId]: 'Could not generate explanation.' }))
    } finally {
      setLoadingEli12(null)
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: c.bg }}>
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-2.5 flex items-center justify-between" style={{ background: c.surface, borderBottom: `1px solid ${c.border}` }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-md cursor-pointer hover:opacity-70" style={{ color: c.muted }}>
            <ArrowLeft size={16} />
          </button>
          <span className="font-medium text-sm" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            Review: Why did I get this wrong?
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentQuestionIdx(Math.max(0, currentQuestionIdx - 1))}
            disabled={currentQuestionIdx <= 0}
            className="p-1.5 rounded-md cursor-pointer hover:opacity-70 disabled:opacity-30"
            style={{ color: c.muted }}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-[11px] font-medium tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            {currentQuestionIdx + 1} / {wrongResults.length}
          </span>
          <button
            onClick={() => setCurrentQuestionIdx(Math.min(wrongResults.length - 1, currentQuestionIdx + 1))}
            disabled={currentQuestionIdx >= wrongResults.length - 1}
            className="p-1.5 rounded-md cursor-pointer hover:opacity-70 disabled:opacity-30"
            style={{ color: c.muted }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </header>

      {/* Split view */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Question review */}
        <div className="w-full md:w-1/2 overflow-y-auto p-6" style={{ borderRight: `1px solid ${c.border}` }}>
          <motion.div
            key={currentQ.question_id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Question */}
            <div className="flex items-start gap-3 mb-6">
              <XCircle size={18} className="mt-0.5 flex-shrink-0" style={{ color: 'oklch(65% 0.18 25)' }} />
              <h2 className="font-bold text-lg leading-snug" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                {currentQ.content}
              </h2>
            </div>

            {/* Answers comparison */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-lg px-4 py-3" style={{ background: 'oklch(20% 0.03 25)' }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-space)', color: 'oklch(55% 0.1 25)' }}>Your answer</p>
                <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: 'oklch(70% 0.14 25)' }}>{currentQ.user_answer}</p>
              </div>
              <div className="rounded-lg px-4 py-3" style={{ background: `${c.accent}10` }}>
                <p className="text-[10px] uppercase tracking-wider mb-1" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>Correct answer</p>
                <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>{currentQ.correct_answer}</p>
              </div>
            </div>

            {/* Explanation */}
            {currentQ.explanation && (
              <div className="rounded-lg px-4 py-3 mb-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                <p className="text-[10px] uppercase tracking-wider mb-2 font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Explanation</p>
                <p className="text-sm leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  {currentQ.explanation}
                </p>
              </div>
            )}

            {/* ELI12 */}
            {!simpleExplanations[currentQ.question_id] ? (
              <button
                onClick={() => handleELI12(currentQ.question_id)}
                disabled={loadingEli12 === currentQ.question_id}
                className="flex items-center gap-2 text-xs font-medium px-4 py-2.5 rounded-lg cursor-pointer transition-colors hover:opacity-80 disabled:opacity-50 mb-6"
                style={{ fontFamily: 'var(--font-space)', background: `${c.accent}12`, color: c.accent, border: `1px solid ${c.accent}25` }}
              >
                {loadingEli12 === currentQ.question_id ? <Loader2 size={12} className="animate-spin" /> : <Lightbulb size={12} />}
                Explain like I'm 12
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg px-4 py-3 mb-6"
                style={{ background: `${c.accent}08`, border: `1px solid ${c.accent}20` }}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <Lightbulb size={12} style={{ color: c.accent }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>Simple explanation</span>
                </div>
                <p className="text-sm leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  {simpleExplanations[currentQ.question_id]}
                </p>
              </motion.div>
            )}

            {/* Source text */}
            {currentQ.source_text && (
              <div className="rounded-lg px-4 py-3" style={{ background: `${c.brand}06`, border: `1px solid ${c.brand}15` }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <BookOpen size={12} style={{ color: c.brand }} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>From your notes</span>
                </div>
                <p className="text-sm leading-relaxed italic" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  "{currentQ.source_text}"
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right: PDF viewer */}
        <div className="hidden md:flex flex-1 flex-col overflow-hidden" style={{ background: c.bg }}>
          {pdfUrl ? (
            <>
              <div className="flex-shrink-0 px-4 py-2 flex items-center justify-center gap-2" style={{ borderBottom: `1px solid ${c.border}` }}>
                <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage <= 1} className="p-1 rounded cursor-pointer hover:opacity-70 disabled:opacity-30" style={{ color: c.muted }}>
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] font-medium tabular-nums" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  {currentPage} / {numPages}
                </span>
                <button onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))} disabled={currentPage >= numPages} className="p-1 rounded cursor-pointer hover:opacity-70 disabled:opacity-30" style={{ color: c.muted }}>
                  <ChevronRight size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-auto flex justify-center py-4" style={{ perspective: '1500px' }}>
                <Document file={pdfUrl} onLoadSuccess={({ numPages }) => setNumPages(numPages)}>
                  <Page pageNumber={currentPage} scale={0.8} className="shadow-lg rounded-md overflow-hidden" renderTextLayer={true} renderAnnotationLayer={true} />
                </Document>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>PDF preview unavailable</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReviewPage() {
  return (
    <RequireAuth>
      <ReviewContent />
    </RequireAuth>
  )
}
