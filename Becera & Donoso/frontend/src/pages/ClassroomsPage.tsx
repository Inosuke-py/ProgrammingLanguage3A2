import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { GraduationCap, Plus, X, Loader2, Users, Copy, Check, Zap, Trophy, Play, FileText, Crown, BookOpen } from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import { useBadgeUnlock } from '../lib/badge-context'
import api from '../lib/api'
import { theme as c } from '../theme'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { BottomSheetModal } from '../components/BottomSheetModal'

interface Classroom {
  id: string
  name: string
  join_code: string
  student_count: number
  owner_name?: string
  is_public?: boolean
  quiz_count?: number
  material_count?: number
  level?: number
}

interface PublicClassroom {
  id: string
  name: string
  owner_name: string | null
  student_count: number
}

interface AggregateStats {
  total_classrooms: number
  total_students: number
  total_online: number
  quizzes_this_week: number
  online_per_classroom: Record<string, number>
}

function ClassroomsContent() {
  const navigate = useNavigate()
  const { showBadgeUnlock } = useBadgeUnlock()
  const [taught, setTaught] = useState<Classroom[]>([])
  const [joined, setJoined] = useState<Classroom[]>([])
  const [publicRooms, setPublicRooms] = useState<PublicClassroom[]>([])
  const [aggStats, setAggStats] = useState<AggregateStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPublic, setCreatePublic] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  useEscapeClose(showCreate, () => setShowCreate(false))
  useEscapeClose(showJoin, () => setShowJoin(false))

  const fetchClassrooms = useCallback(async () => {
    try {
      const [res, statsRes] = await Promise.all([
        api.get('/classrooms/'),
        api.get('/classrooms/aggregate-stats').catch(() => ({ data: null })),
      ])
      setTaught(res.data.taught || [])
      setJoined(res.data.joined || [])
      setPublicRooms(res.data.public || [])
      if (statsRes.data) setAggStats(statsRes.data)
    } catch {
      setTaught([])
      setJoined([])
      setPublicRooms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchClassrooms() }, [fetchClassrooms])

  const handleCreate = async () => {
    if (!createName.trim()) return
    setCreating(true)
    setError(null)
    try {
      await api.post('/classrooms/', { name: createName, is_public: createPublic })
      setCreateName('')
      setCreatePublic(false)
      setShowCreate(false)
      await fetchClassrooms()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create classroom')
    } finally {
      setCreating(false)
    }
  }

  const handleJoin = async () => {
    if (!joinCode.trim()) return
    setJoining(true)
    setError(null)
    try {
      const res = await api.post('/classrooms/join', { code: joinCode })
      setJoinCode('')
      setShowJoin(false)
      await fetchClassrooms()
      // First-time joins unlock the Team Player social badge
      const earned = res.data?.badges_earned ?? []
      if (earned.length > 0) {
        showBadgeUnlock(earned)
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Invalid code or already joined')
    } finally {
      setJoining(false)
    }
  }

  const handleCopyCode = (code: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const allRooms = [...taught, ...joined]
  const hasRooms = allRooms.length > 0

  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-8">
          <div>
            <h1 className="font-bold text-2xl md:text-3xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Classroom Lobby</h1>
            {aggStats && hasRooms && (
              <p className="text-sm mt-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                {aggStats.total_students} students · {aggStats.quizzes_this_week} quizzes this week
                {aggStats.total_online > 0 && <span style={{ color: c.accent }}> · {aggStats.total_online} online now</span>}
              </p>
            )}
          </div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: c.brand }} />
          </div>
        ) : !hasRooms && publicRooms.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
            <GraduationCap size={44} className="mx-auto mb-4" style={{ color: c.muted }} />
            <p className="font-bold text-xl mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>No classrooms yet</p>
            <p className="text-sm max-w-sm mx-auto mb-6" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Create a classroom to start teaching, or join one with a code from your instructor.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button onClick={() => setShowJoin(true)} className="text-sm font-medium px-5 py-3 rounded-xl cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: c.surface, color: c.text, border: `1px solid ${c.border}` }}>
                Join with Code
              </button>
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 text-sm font-semibold px-5 py-3 rounded-xl cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
                <Plus size={14} /> Create Classroom
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Main: Room Grid */}
            <div className="flex-1 min-w-0">
              {/* Your Rooms */}
              {hasRooms && (
                <section className="mb-10">
                  <h2 className="text-xs uppercase tracking-widest font-bold mb-5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Your Rooms</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
                    {allRooms.map((cls, i) => {
                      const isTeacher = taught.some((t) => t.id === cls.id)
                      const onlineCount = aggStats?.online_per_classroom[cls.id] || 0
                      return (
                        <motion.div
                          key={cls.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          whileHover={{ y: -3 }}
                          onClick={() => navigate(`/classrooms/${cls.id}`)}
                          className="rounded-2xl p-7 cursor-pointer relative overflow-hidden group min-h-[180px]"
                          style={{ background: c.card, border: `1px solid ${c.border}`, transition: 'border-color 200ms ease' }}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = isTeacher ? `${c.brand}50` : `${c.accent}50` }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border }}
                        >
                          {/* Top accent line */}
                          <div className="absolute top-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: isTeacher ? c.brand : c.accent }} />

                          {/* Header row */}
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              {cls.level && cls.level > 1 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${c.purple}15`, color: c.purple }}>
                                  Lv.{cls.level}
                                </span>
                              )}
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: isTeacher ? `${c.brand}12` : `${c.accent}12`, color: isTeacher ? c.brand : c.accent }}>
                                {isTeacher ? 'Teaching' : 'Student'}
                              </span>
                            </div>
                            {onlineCount > 0 && (
                              <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: c.accent }}>
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: c.accent }} />
                                {onlineCount}
                              </span>
                            )}
                          </div>

                          {/* Name */}
                          <h3 className="font-bold text-xl mb-4 line-clamp-2 leading-tight" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                            {cls.name}
                          </h3>

                          {/* Stats row */}
                          <div className="flex items-center gap-4 text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                            <span className="flex items-center gap-1.5"><Users size={14} /> {cls.student_count}</span>
                            <span className="flex items-center gap-1.5"><Play size={14} /> {cls.quiz_count || 0}</span>
                            <span className="flex items-center gap-1.5"><BookOpen size={14} /> {cls.material_count || 0}</span>
                          </div>

                          {/* Join code for teachers */}
                          {isTeacher && cls.join_code && (
                            <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: `1px solid ${c.border}` }} onClick={(e) => e.stopPropagation()}>
                              <code className="text-[11px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: c.surface, color: c.brand }}>{cls.join_code}</code>
                              <button onClick={(e) => handleCopyCode(cls.join_code, e)} className="p-0.5 cursor-pointer" style={{ color: c.muted }}>
                                {copiedCode === cls.join_code ? <Check size={11} style={{ color: c.accent }} /> : <Copy size={11} />}
                              </button>
                            </div>
                          )}

                          {/* Owner for students */}
                          {!isTeacher && cls.owner_name && (
                            <p className="text-[11px] mt-3 pt-3" style={{ fontFamily: 'var(--font-space)', color: c.muted, borderTop: `1px solid ${c.border}` }}>
                              by {cls.owner_name}
                            </p>
                          )}
                        </motion.div>
                      )
                    })}

                    {/* Create new room card */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: allRooms.length * 0.04 }}
                      whileHover={{ y: -3 }}
                      onClick={() => setShowCreate(true)}
                      className="rounded-2xl p-7 cursor-pointer flex flex-col items-center justify-center min-h-[180px]"
                      style={{ border: `1.5px dashed ${c.border}`, transition: 'border-color 200ms ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.brand }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border }}
                    >
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4" style={{ background: `${c.brand}10` }}>
                        <Plus size={22} style={{ color: c.brand }} />
                      </div>
                      <p className="text-base font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>New Classroom</p>
                    </motion.div>
                  </div>
                </section>
              )}

              {/* Discover: Public Rooms */}
              {publicRooms.length > 0 && (
                <section>
                  <h2 className="text-xs uppercase tracking-widest font-bold mb-5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Discover</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {publicRooms.map((cls, i) => (
                      <motion.div
                        key={cls.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="rounded-2xl p-5 flex flex-col justify-between"
                        style={{ background: c.surface, border: `1px solid ${c.border}` }}
                      >
                        <div>
                          <h3 className="font-semibold text-sm mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{cls.name}</h3>
                          <p className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                            {cls.owner_name && `${cls.owner_name} · `}{cls.student_count} students
                          </p>
                        </div>
                        <button
                          onClick={async () => { try { const r = await api.post('/classrooms/join', { classroom_id: cls.id }); await fetchClassrooms(); const earned = r.data?.badges_earned ?? []; if (earned.length > 0) showBadgeUnlock(earned) } catch {} }}
                          className="mt-3 text-xs font-semibold px-3 py-2 rounded-lg cursor-pointer w-full"
                          style={{ fontFamily: 'var(--font-space)', background: `${c.accent}12`, color: c.accent, border: `1px solid ${c.accent}25` }}
                        >
                          Join Room
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Sidebar: Quick Stats + Actions */}
            {hasRooms && (
              <aside className="hidden lg:block w-72 flex-shrink-0 space-y-5">
                {/* Quick stats */}
                {aggStats && (
                  <div className="rounded-2xl p-5 space-y-4" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                    <h3 className="text-xs uppercase tracking-widest font-bold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Overview</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Total Students</span>
                        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{aggStats.total_students}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Quizzes This Week</span>
                        <span className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{aggStats.quizzes_this_week}</span>
                      </div>
                      {aggStats.total_online > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Online Now</span>
                          <span className="text-sm font-bold flex items-center gap-1.5" style={{ fontFamily: 'var(--font-space)', color: c.accent }}>
                            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: c.accent }} />
                            {aggStats.total_online}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick actions */}
                <div className="rounded-2xl p-5 space-y-3" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                  <h3 className="text-xs uppercase tracking-widest font-bold" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Get Started</h3>
                  <button onClick={() => setShowCreate(true)} className="w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer text-left" style={{ background: c.surface, transition: 'background 150ms ease' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${c.brand}08` }} onMouseLeave={(e) => { e.currentTarget.style.background = c.surface }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${c.brand}12` }}>
                      <Plus size={14} style={{ color: c.brand }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Create Room</p>
                      <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Start a new classroom</p>
                    </div>
                  </button>
                  <button onClick={() => setShowJoin(true)} className="w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer text-left" style={{ background: c.surface, transition: 'background 150ms ease' }} onMouseEnter={(e) => { e.currentTarget.style.background = `${c.accent}08` }} onMouseLeave={(e) => { e.currentTarget.style.background = c.surface }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${c.accent}12` }}>
                      <GraduationCap size={14} style={{ color: c.accent }} />
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Join Room</p>
                      <p className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Enter a class code</p>
                    </div>
                  </button>
                </div>
              </aside>
            )}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <BottomSheetModal onClose={() => setShowCreate(false)}>
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Create Classroom</h2>
                <button onClick={() => setShowCreate(false)} className="p-1.5 cursor-pointer rounded-md hover:opacity-70" style={{ color: c.muted }}><X size={18} /></button>
              </div>
              {error && <p className="text-sm mb-4 p-3 rounded-xl" style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(75% 0.15 25)' }}>{error}</p>}
              <div className="space-y-5">
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Name</label>
                  <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="e.g. Biology 101" className="w-full px-4 py-3.5 rounded-xl text-base outline-none" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Visibility</label>
                  <div className="flex gap-2">
                    <button onClick={() => setCreatePublic(false)} className="flex-1 py-3 rounded-xl text-sm font-medium cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: !createPublic ? `${c.brand}15` : c.surface, border: !createPublic ? `1.5px solid ${c.brand}` : `1px solid ${c.border}`, color: !createPublic ? c.brand : c.muted }}>Private</button>
                    <button onClick={() => setCreatePublic(true)} className="flex-1 py-3 rounded-xl text-sm font-medium cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: createPublic ? `${c.accent}15` : c.surface, border: createPublic ? `1.5px solid ${c.accent}` : `1px solid ${c.border}`, color: createPublic ? c.accent : c.muted }}>Public</button>
                  </div>
                  <p className="text-[11px] mt-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{createPublic ? 'Anyone can find and join this classroom.' : 'Only people with the join code can enter.'}</p>
                </div>
              </div>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleCreate} disabled={!createName.trim() || creating} className="w-full mt-6 py-3.5 rounded-xl text-base font-bold cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
                {creating ? 'Creating...' : 'Create Classroom'}
              </motion.button>
            </div>
          </BottomSheetModal>
        )}
      </AnimatePresence>

      {/* Join Modal */}
      <AnimatePresence>
        {showJoin && (
          <BottomSheetModal onClose={() => setShowJoin(false)}>
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Join Classroom</h2>
                <button onClick={() => setShowJoin(false)} className="p-1.5 cursor-pointer rounded-md hover:opacity-70" style={{ color: c.muted }}><X size={18} /></button>
              </div>
              {error && <p className="text-sm mb-4 p-3 rounded-xl" style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(75% 0.15 25)' }}>{error}</p>}
              <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Join Code</label>
              <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Enter class code" className="w-full px-4 py-3.5 rounded-xl text-base outline-none uppercase tracking-wider" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text, letterSpacing: '0.15em' }} />
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleJoin} disabled={!joinCode.trim() || joining} className="w-full mt-5 py-3.5 rounded-xl text-base font-bold cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
                {joining ? 'Joining...' : 'Join Classroom'}
              </motion.button>
            </div>
          </BottomSheetModal>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function ClassroomsPage() {
  return (
    <RequireAuth>
      <ClassroomsContent />
    </RequireAuth>
  )
}
