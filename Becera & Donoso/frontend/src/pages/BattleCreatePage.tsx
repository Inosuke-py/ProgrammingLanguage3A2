import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Swords, ArrowLeft, Loader2, FileText } from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'

interface Material {
  id: string
  title: string
  pool_count: number
}

function BattleCreateContent() {
  const navigate = useNavigate()
  const [materials, setMaterials] = useState<Material[]>([])
  const [selectedMaterial, setSelectedMaterial] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchMaterials = async () => {
      try {
        const res = await api.get('/materials/')
        // Only materials with questions available
        setMaterials(res.data.filter((m: Material) => m.pool_count > 0))
      } catch {
        setError('Failed to load materials')
      } finally {
        setLoading(false)
      }
    }
    fetchMaterials()
  }, [])

  const handleCreate = async () => {
    if (!selectedMaterial) return
    setCreating(true)
    setError(null)
    try {
      const res = await api.post('/battles/create', { material_id: selectedMaterial })
      navigate(`/battle/${res.data.id}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create battle')
      setCreating(false)
    }
  }

  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="font-bold text-3xl mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            Challenge a Friend
          </h1>
          <p className="text-base mb-8" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            Select a material to create a quiz battle. Share the battle code with your opponent.
          </p>

          {error && (
            <div className="rounded-lg px-4 py-3 mb-6 text-sm" style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(75% 0.15 25)', border: '1px solid oklch(30% 0.04 25)' }}>
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: c.border, borderTopColor: c.brand }} />
            </div>
          ) : materials.length === 0 ? (
            <div className="text-center py-12 rounded-2xl" style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <FileText size={28} className="mx-auto mb-3" style={{ color: c.muted }} />
              <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                No materials with questions available yet. Upload and generate questions first.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-8">
                {materials.map((mat) => (
                  <motion.button
                    key={mat.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => setSelectedMaterial(mat.id)}
                    className="w-full text-left p-5 rounded-xl cursor-pointer transition-colors"
                    style={{
                      fontFamily: 'var(--font-space)',
                      background: selectedMaterial === mat.id ? `${c.brand}12` : c.card,
                      border: `1px solid ${selectedMaterial === mat.id ? c.brand : c.border}`,
                    }}
                  >
                    <p className="font-semibold text-base" style={{ color: c.text }}>{mat.title}</p>
                    <p className="text-xs mt-1" style={{ color: c.muted }}>{mat.pool_count} questions available</p>
                  </motion.button>
                ))}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCreate}
                disabled={!selectedMaterial || creating}
                className="w-full flex items-center justify-center gap-2 font-bold text-base py-4 rounded-xl cursor-pointer disabled:opacity-40"
                style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Swords size={16} />}
                {creating ? 'Creating...' : 'Create Battle'}
              </motion.button>
            </>
          )}
        </motion.div>
      </div>
    </div>
  )
}

export default function BattleCreatePage() {
  return (
    <RequireAuth>
      <BattleCreateContent />
    </RequireAuth>
  )
}
