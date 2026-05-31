import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, X, Loader2 } from 'lucide-react'
import { theme as c } from '../theme'
import { useEscapeClose } from '../hooks/useEscapeClose'
import api from '../lib/api'
import { BottomSheetModal } from './BottomSheetModal'

const FIELDS = [
  'Mathematics', 'Science', 'Engineering', 'Computer Science',
  'Business', 'Law', 'Medicine', 'Arts & Humanities',
  'Social Sciences', 'Education', 'Other',
]

interface Props {
  isOpen: boolean
  onClose: () => void
  onUploaded: (badgesEarned?: { key: string; name: string; description: string; icon: string; rarity: string }[]) => void
}

export default function UploadModal({ isOpen, onClose, onUploaded }: Props) {
  useEscapeClose(isOpen, onClose)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [field, setField] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) {
      if (!selected.name.toLowerCase().match(/\.(pdf|pptx|docx)$/)) {
        setError('Only PDF, PPTX, and DOCX files are supported')
        return
      }
      if (selected.size > 50 * 1024 * 1024) {
        setError('File too large. Maximum size is 50MB.')
        return
      }
      setFile(selected)
      setError(null)
      // Auto-fill title from filename if empty
      if (!title.trim()) {
        setTitle(selected.name.replace(/\.(pdf|pptx|docx)$/i, ''))
      }
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setIsUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (title.trim()) formData.append('title', title.trim())
      if (topic.trim()) formData.append('topic', topic.trim())
      if (field.trim()) formData.append('field', field.trim())

      await api.post('/materials/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(res => {
        setFile(null)
        setTitle('')
        setTopic('')
        setField('')
        onUploaded(res.data.badges_earned)
        onClose()
      })
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      if (!dropped.name.toLowerCase().match(/\.(pdf|pptx|docx)$/)) {
        setError('Only PDF, PPTX, and DOCX files are supported')
        return
      }
      if (dropped.size > 50 * 1024 * 1024) {
        setError('File too large. Maximum size is 50MB.')
        return
      }
      setFile(dropped)
      setError(null)
      if (!title.trim()) {
        setTitle(dropped.name.replace(/\.(pdf|pptx|docx)$/i, ''))
      }
    }
  }

  if (!isOpen) return null

  return (
    <BottomSheetModal onClose={onClose} maxWidth="max-w-lg">
      <div className="p-5 md:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            Upload Material
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-md cursor-pointer hover:opacity-70" style={{ color: c.muted }}>
            <X size={18} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg px-4 py-3 mb-5 text-sm" style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(75% 0.15 25)', border: '1px solid oklch(30% 0.04 25)' }}>
            {error}
          </div>
        )}

        {/* File Drop Zone */}
        {!file ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl p-5 md:p-8 flex flex-col items-center justify-center cursor-pointer transition-colors hover:opacity-90 mb-5 md:mb-6"
            style={{ background: c.surface, border: `2px dashed ${c.border}`, minHeight: '100px' }}
          >
            <Upload size={28} className="mb-3" style={{ color: c.brand }} />
            <p className="text-sm font-medium mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              Click to browse or drag file here
            </p>
            <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              PDF, PPTX, or DOCX (max 50MB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx,.docx"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          <div className="rounded-xl p-4 flex items-center gap-3 mb-6" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${c.brand}12` }}>
              <FileText size={18} style={{ color: c.brand }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                {file.name}
              </p>
              <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <button
              onClick={() => { setFile(null); setTitle('') }}
              className="p-1.5 rounded-md cursor-pointer hover:opacity-70"
              style={{ color: c.muted }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-3 md:space-y-4 mb-5 md:mb-6">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Material title"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
            />
          </div>

          {/* Topic */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Topic / Subject
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Machine Learning, Cell Biology, Contract Law"
              className="w-full px-4 py-3 rounded-xl text-sm outline-none"
              style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
            />
          </div>

          {/* Field of Knowledge */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Field
            </label>
            <div className="flex flex-wrap gap-2">
              {FIELDS.map((f) => (
                <button
                  key={f}
                  onClick={() => setField(field === f ? '' : f)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                  style={{
                    fontFamily: 'var(--font-space)',
                    background: field === f ? `${c.brand}18` : c.surface,
                    border: field === f ? `1px solid ${c.brand}` : `1px solid ${c.border}`,
                    color: field === f ? c.brand : c.muted,
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl text-sm font-medium cursor-pointer transition-colors hover:opacity-80"
            style={{ fontFamily: 'var(--font-space)', color: c.text, background: c.surface, border: `1px solid ${c.border}` }}
          >
            Cancel
          </button>
          <motion.button
            whileHover={{ scale: file ? 1.02 : 1 }}
            whileTap={{ scale: file ? 0.98 : 1 }}
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: file ? `0 0 16px ${c.brand}33` : 'none' }}
          >
            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {isUploading ? 'Uploading...' : 'Upload'}
          </motion.button>
        </div>
      </div>
    </BottomSheetModal>
  )
}
