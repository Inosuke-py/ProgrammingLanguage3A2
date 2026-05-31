import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, ArrowLeft, Plus, X, Loader2, BookOpen } from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'
import { useEscapeClose } from '../hooks/useEscapeClose'

interface Room {
  id: string
  name: string
  material_title?: string
  participant_count: number
  created_at: string
}

interface RoomDetail {
  id: string
  name: string
  material_title?: string
  participants: { user_id: string; name: string; picture: string | null }[]
}

function RoomsContent() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<RoomDetail | null>(null)
  const [createName, setCreateName] = useState('')
  const [createMaterial, setCreateMaterial] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close modals on Escape
  useEscapeClose(showCreate, () => setShowCreate(false))
  useEscapeClose(!!selectedRoom, () => setSelectedRoom(null))

  const fetchRooms = useCallback(async () => {
    try {
      const res = await api.get('/rooms/')
      setRooms(res.data)
    } catch {
      setRooms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  const handleCreate = async () => {
    if (!createName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await api.post('/rooms/create', { name: createName, material_id: createMaterial || undefined })
      setCreateName('')
      setCreateMaterial('')
      setShowCreate(false)
      await fetchRooms()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create room')
    } finally {
      setCreating(false)
    }
  }

  const handleRoomClick = async (roomId: string) => {
    try {
      const res = await api.get(`/rooms/${roomId}`)
      setSelectedRoom(res.data)
    } catch {
      setError('Failed to load room details')
    }
  }

  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-bold text-3xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Active Rooms</h1>
            <p className="text-base mt-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Join a study session or create your own</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer transition-transform hover:scale-[1.03]"
            style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
          >
            <Plus size={12} />
            Create Room
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: c.border, borderTopColor: c.brand }} />
          </div>
        ) : rooms.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
            <Users size={40} className="mx-auto mb-3" style={{ color: c.muted }} />
            <p className="font-bold text-lg mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>No active rooms</p>
            <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Create one to start studying with friends</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rooms.map((room, i) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -2, borderColor: c.brand }}
                onClick={() => handleRoomClick(room.id)}
                className="rounded-2xl p-6 cursor-pointer transition-colors"
                style={{ background: c.card, border: `1px solid ${c.border}` }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-base" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{room.name}</h3>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: `${c.accent}15` }}>
                    <Users size={10} style={{ color: c.accent }} />
                    <span className="text-xs font-medium" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>{room.participant_count}</span>
                  </div>
                </div>
                {room.material_title && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <BookOpen size={11} style={{ color: c.muted }} />
                    <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{room.material_title}</span>
                  </div>
                )}
                <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Created {new Date(room.created_at).toLocaleDateString()}
                </p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            onClick={() => setShowCreate(false)}
          >
            <div className="absolute inset-0" style={{ background: `${c.bg}dd` }} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl p-6"
              style={{ background: c.card, border: `1px solid ${c.border}` }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Create Room</h2>
                <button onClick={() => setShowCreate(false)} className="p-1 cursor-pointer" style={{ color: c.muted }}>
                  <X size={16} />
                </button>
              </div>

              {error && (
                <div className="rounded-lg px-3 py-2 mb-4 text-xs" style={{ background: 'oklch(25% 0.04 25)', color: 'oklch(75% 0.15 25)' }}>
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Room Name</label>
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="e.g. Bio 101 Study Group"
                    className="w-full px-4 py-3.5 rounded-xl text-base outline-none"
                    style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Material ID (optional)</label>
                  <input
                    type="text"
                    value={createMaterial}
                    onChange={(e) => setCreateMaterial(e.target.value)}
                    placeholder="Paste material ID"
                    className="w-full px-4 py-3.5 rounded-xl text-base outline-none"
                    style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleCreate}
                disabled={!createName.trim() || creating}
                className="w-full mt-5 flex items-center justify-center gap-2 font-bold text-base py-3.5 rounded-xl cursor-pointer disabled:opacity-40"
                style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {creating ? 'Creating...' : 'Create Room'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Room Detail Modal */}
      <AnimatePresence>
        {selectedRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            onClick={() => setSelectedRoom(null)}
          >
            <div className="absolute inset-0" style={{ background: `${c.bg}dd` }} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md rounded-2xl p-6"
              style={{ background: c.card, border: `1px solid ${c.border}` }}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{selectedRoom.name}</h2>
                <button onClick={() => setSelectedRoom(null)} className="p-1 cursor-pointer" style={{ color: c.muted }}>
                  <X size={16} />
                </button>
              </div>

              {selectedRoom.material_title && (
                <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg" style={{ background: c.surface }}>
                  <BookOpen size={13} style={{ color: c.brand }} />
                  <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{selectedRoom.material_title}</span>
                </div>
              )}

              <p className="text-xs font-medium mb-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                Participants ({selectedRoom.participants.length})
              </p>
              <div className="space-y-2">
                {selectedRoom.participants.map((p) => (
                  <div key={p.user_id} className="flex items-center gap-3 py-2">
                    {p.picture ? (
                      <img src={p.picture} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: c.surface, color: c.muted }}>
                        {p.name.charAt(0)}
                      </div>
                    )}
                    <span className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function RoomsPage() {
  return (
    <RequireAuth>
      <RoomsContent />
    </RequireAuth>
  )
}
