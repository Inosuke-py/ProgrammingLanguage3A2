import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, FileText, Play, Plus, Copy, Check, Loader2, X,
  GraduationCap, Clock, Send, BookOpen, Zap, Target,
  TrendingUp, Crown, Upload, Flame, CircleDot, Square,
  ArrowLeftRight, ArrowUpDown, ToggleLeft,
} from 'lucide-react'
import { RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'
import { useEscapeClose } from '../hooks/useEscapeClose'
import { useWSEvent, useWS } from '../lib/ws-context'
import { BottomSheetModal } from '../components/BottomSheetModal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string
  name: string
  email: string
  picture: string | null
  xp: number
  level: number
  streak: number
  quiz_count: number
  joined_at: string | null
}

interface ClassroomMaterial {
  id: string
  title: string
  file_type: string
  page_count: number | null
  section_count: number
  pool_count: number
  assigned_at: string | null
}

interface MaterialSection {
  id: string
  title: string | null
  page_number: number | null
  order_index: number
  preview: string
}

interface ClassroomQuiz {
  id: string
  title: string
  config: any
  is_published: boolean
  expires_at: string | null
  created_at: string | null
  completion_count: number
  student_count: number
  avg_score: number | null
  my_completed?: boolean
}

interface ClassroomDetail {
  id: string
  name: string
  join_code: string | null
  invite_link_token: string | null
  teacher: { id: string; name: string; picture: string | null } | null
  role: 'teacher' | 'student'
  student_count: number
  students: Student[]
  materials: ClassroomMaterial[]
  quizzes: ClassroomQuiz[]
  stats: {
    total_xp: number
    total_completions: number
    avg_accuracy: number
    total_materials: number
    total_quizzes: number
    classroom_level: number
    classroom_xp: number
    classroom_xp_for_next: number
  }
}

type Tab = 'overview' | 'students' | 'materials' | 'quizzes'

// Inline countdown (just returns text, no wrapper)
function QuizCountdownInline({ expiresAt }: { expiresAt: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    const update = () => {
      const now = Date.now()
      const end = new Date(expiresAt).getTime()
      const diff = end - now

      if (diff <= 0) { setTimeLeft('Expired'); return }

      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)

      if (days > 0) setTimeLeft(`${days}d ${hours}h`)
      else if (hours > 0) setTimeLeft(`${hours}h ${minutes}m`)
      else setTimeLeft(`${minutes}m`)
    }

    update()
    const interval = setInterval(update, 60000)
    return () => clearInterval(interval)
  }, [expiresAt])

  return <>{timeLeft}</>
}

function ClassroomDetailContent() {
  const { classroomId } = useParams<{ classroomId: string }>()
  const navigate = useNavigate()
  const { joinRoom } = useWS()
  const [classroom, setClassroom] = useState<ClassroomDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [copiedCode, setCopiedCode] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<string | null>(null)
  const [showAddMaterial, setShowAddMaterial] = useState(false)
  const [showCreateQuiz, setShowCreateQuiz] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quizResults, setQuizResults] = useState<any | null>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [newAnnouncement, setNewAnnouncement] = useState('')
  const [postingAnnouncement, setPostingAnnouncement] = useState(false)
  const [alertMessage, setAlertMessage] = useState<string | null>(null)

  useEscapeClose(showInvite, () => setShowInvite(false))
  useEscapeClose(showAddMaterial, () => setShowAddMaterial(false))
  useEscapeClose(showCreateQuiz, () => setShowCreateQuiz(false))

  const fetchClassroom = useCallback(async () => {
    try {
      const res = await api.get(`/classrooms/${classroomId}`)
      setClassroom(res.data)
      // Fetch announcements and activity in parallel
      const [annRes, actRes] = await Promise.all([
        api.get(`/classrooms/${classroomId}/announcements`).catch(() => ({ data: [] })),
        api.get(`/classrooms/${classroomId}/activity`).catch(() => ({ data: [] })),
      ])
      setAnnouncements(annRes.data || [])
      setActivities(actRes.data || [])
    } catch {
      setError('Failed to load classroom')
    } finally {
      setLoading(false)
    }
  }, [classroomId])

  useEffect(() => { fetchClassroom() }, [fetchClassroom])

  // Explicitly join the classroom WS room to ensure real-time events work
  useEffect(() => {
    if (classroomId) {
      joinRoom(classroomId)
    }
  }, [classroomId, joinRoom])

  // Real-time updates: refresh when classroom events happen
  useWSEvent('quiz_completed', useCallback(() => { fetchClassroom() }, [fetchClassroom]))
  useWSEvent('quiz_published', useCallback(() => { fetchClassroom() }, [fetchClassroom]))
  useWSEvent('quiz_created', useCallback(() => { fetchClassroom() }, [fetchClassroom]))
  useWSEvent('material_uploaded', useCallback(() => { fetchClassroom() }, [fetchClassroom]))
  useWSEvent('announcement', useCallback(() => { fetchClassroom() }, [fetchClassroom]))

  const handleCopyCode = () => {
    if (classroom?.join_code) {
      navigator.clipboard.writeText(classroom.join_code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteMsg(null)
    try {
      const res = await api.post(`/classrooms/${classroomId}/invite`, { email: inviteEmail })
      setInviteMsg(res.data.message)
      setInviteEmail('')
      fetchClassroom()
    } catch (err: any) {
      setInviteMsg(err.response?.data?.detail || 'Failed to invite')
    }
    setInviting(false)
  }

  const handlePublishQuiz = async (quizId: string, publish: boolean) => {
    try {
      await api.put(`/classrooms/${classroomId}/quizzes/${quizId}`, { is_published: publish })
      fetchClassroom()
    } catch {}
  }

  const handlePostAnnouncement = async () => {
    if (!newAnnouncement.trim()) return
    setPostingAnnouncement(true)
    try {
      await api.post(`/classrooms/${classroomId}/announcements`, { content: newAnnouncement.trim() })
      setNewAnnouncement('')
      fetchClassroom()
    } catch {}
    setPostingAnnouncement(false)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={28} className="animate-spin" style={{ color: c.brand }} />
      </div>
    )
  }

  if (error || !classroom) {
    return (
      <div className="text-center py-20">
        <GraduationCap size={40} className="mx-auto mb-4" style={{ color: c.muted }} />
        <p className="text-lg font-bold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{error || 'Classroom not found'}</p>
      </div>
    )
  }

  const isTeacher = classroom.role === 'teacher'

  // Count published quizzes that the current student hasn't completed yet
  const pendingQuizzes = !isTeacher ? classroom.quizzes.filter((q) => q.is_published && !q.my_completed) : []
  const showQuizBadge = pendingQuizzes.length > 0

  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10 space-y-8">

        {/* ─── Hero Section ────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-6 md:p-8 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${c.surface} 0%, color-mix(in oklch, ${c.surface} 85%, ${c.brand}) 100%)` }}
        >
          <div className="absolute top-0 left-0 w-full h-1" style={{ background: `linear-gradient(90deg, ${c.brand}, ${c.accent})` }} />
          <div className="relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <GraduationCap size={24} style={{ color: c.brand }} />
                  <h1 className="font-bold text-2xl md:text-3xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{classroom.name}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-3 md:gap-4 mt-2">
                  <span className="flex items-center gap-1.5 text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    <Users size={14} /> {classroom.student_count} students
                  </span>
                  <span className="flex items-center gap-1.5 text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    <FileText size={14} /> {classroom.stats.total_materials} materials
                  </span>
                  <span className="flex items-center gap-1.5 text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    <Play size={14} /> {classroom.quizzes.filter((q) => q.is_published).length} quizzes
                  </span>
                  <span className="flex items-center gap-1.5 text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    <Target size={14} /> {classroom.stats.avg_accuracy}% accuracy
                  </span>
                  <span className="flex items-center gap-1.5 text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.purple }}>
                    <Crown size={14} /> Level {classroom.stats.classroom_level}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>
                    <Zap size={14} /> {classroom.stats.total_xp.toLocaleString()} XP
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isTeacher && classroom.join_code && (
                  <button onClick={handleCopyCode} className="flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: c.card, border: `1px solid ${c.border}`, color: c.text }}>
                    <code className="font-mono font-bold" style={{ color: c.brand }}>{classroom.join_code}</code>
                    {copiedCode ? <Check size={14} style={{ color: c.accent }} /> : <Copy size={14} style={{ color: c.muted }} />}
                  </button>
                )}
                {isTeacher && (
                  <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
                    <Send size={14} /> Invite
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Pending quiz alert for students */}
        {showQuizBadge && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => setActiveTab('quizzes')}
            className="flex items-center gap-3 p-4 rounded-xl cursor-pointer"
            style={{ background: 'oklch(25% 0.06 25)', border: '1px solid oklch(35% 0.08 25)' }}
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-lg text-sm font-black" style={{ background: 'oklch(65% 0.18 25)', color: c.bg }}>!</span>
            <div className="flex-1">
              <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: 'oklch(80% 0.12 25)' }}>
                You have {pendingQuizzes.length} pending {pendingQuizzes.length === 1 ? 'quiz' : 'quizzes'}
              </p>
              <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: 'oklch(60% 0.06 25)' }}>
                Complete them before they expire
              </p>
            </div>
            <span className="text-sm font-semibold px-5 py-2.5 rounded-xl" style={{ fontFamily: 'var(--font-space)', background: 'oklch(65% 0.18 25)', color: c.bg }}>
              Take Now
            </span>
          </motion.div>
        )}

        {/* ─── Sidebar + Content Layout ─────────────────────────────── */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left sidebar nav */}
          <nav className="md:w-56 flex-shrink-0">
            <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible scrollbar-hide rounded-2xl p-2 md:p-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', background: c.card, border: `1px solid ${c.border}` }}>
              {([
                { id: 'overview' as Tab, label: 'Overview', icon: TrendingUp },
                { id: 'students' as Tab, label: 'Students', icon: Users },
                { id: 'materials' as Tab, label: 'Materials', icon: BookOpen },
                { id: 'quizzes' as Tab, label: 'Quizzes', icon: Play },
              ]).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className="relative flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3.5 rounded-xl text-xs md:text-sm font-medium cursor-pointer whitespace-nowrap md:w-full text-left group"
                  style={{
                    fontFamily: 'var(--font-space)',
                    background: activeTab === id ? `${c.brand}15` : 'transparent',
                    color: activeTab === id ? c.brand : c.muted,
                    transition: 'all 150ms cubic-bezier(0.25, 1, 0.5, 1)',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== id) {
                      e.currentTarget.style.background = `${c.text}06`
                      e.currentTarget.style.color = c.text
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== id) {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = c.muted
                    }
                  }}
                >
                  <Icon size={16} /> {label}
                  {id === 'quizzes' && showQuizBadge && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black animate-pulse ml-auto" style={{ background: 'oklch(65% 0.18 25)', color: c.bg }}>!</span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          {/* Right content area */}
          <div className="flex-1 min-w-0">

        {/* ─── Overview Tab ────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left column: Top Students (primary) */}
            <div className="flex-1 min-w-0">
              <h3 className="text-sm uppercase tracking-widest font-bold mb-5 flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                <Crown size={15} /> Top Students
              </h3>
              <div className="space-y-3">
                {classroom.students.slice(0, 5).map((student, i) => (
                  <motion.div
                    key={student.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-4 p-5 rounded-2xl"
                    style={{ background: i === 0 ? `${c.brand}08` : c.card, border: `1px solid ${i === 0 ? `${c.brand}30` : c.border}` }}
                  >
                    <span className="text-lg font-bold w-10 text-center" style={{ fontFamily: 'var(--font-space)', color: i < 3 ? c.brand : c.muted }}>
                      #{i + 1}
                    </span>
                    {student.picture ? (
                      <img src={student.picture} alt="" className="w-12 h-12 rounded-full" />
                    ) : (
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold" style={{ background: c.surface, color: c.muted }}>
                        {student.name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{student.name}</p>
                      <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                        Lv.{student.level} · {student.streak > 0 ? `${student.streak}d streak` : 'No streak'}
                      </p>
                    </div>
                    <span className="text-base font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{student.xp.toLocaleString()} XP</span>
                  </motion.div>
                ))}
                {classroom.students.length === 0 && (
                  <p className="text-sm text-center py-12" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No students yet.</p>
                )}
              </div>
            </div>

            {/* Right column: Announcements + Activity (secondary) */}
            <div className="w-full lg:w-96 flex-shrink-0 space-y-8">
              {/* Announcements */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm uppercase tracking-widest font-bold flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    <Send size={14} /> Announcements
                  </h3>
                </div>
                {isTeacher && (
                  <div className="flex gap-2 mb-4">
                    <input
                      type="text"
                      value={newAnnouncement}
                      onChange={(e) => setNewAnnouncement(e.target.value)}
                      placeholder="Post announcement..."
                      className="flex-1 px-4 py-3 rounded-xl text-sm outline-none"
                      style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                      onKeyDown={(e) => e.key === 'Enter' && handlePostAnnouncement()}
                    />
                    <button
                      onClick={handlePostAnnouncement}
                      disabled={!newAnnouncement.trim() || postingAnnouncement}
                      className="px-4 py-3 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-40"
                      style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
                    >
                      Post
                    </button>
                  </div>
                )}
                {announcements.length > 0 ? (
                  <div className="space-y-3">
                    {announcements.slice(0, 3).map((a: any) => (
                      <div key={a.id} className="p-4 rounded-xl" style={{ background: a.is_pinned ? `${c.brand}08` : c.card, border: `1px solid ${a.is_pinned ? `${c.brand}25` : c.border}` }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-sm font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{a.author_name}</span>
                          {a.is_pinned && <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: `${c.brand}15`, color: c.brand }}>Pinned</span>}
                        </div>
                        <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{a.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No announcements yet.</p>
                )}
              </div>

              {/* Recent Activity */}
              {activities.length > 0 && (
                <div>
                  <h3 className="text-sm uppercase tracking-widest font-bold mb-4 flex items-center gap-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    <Zap size={14} /> Activity
                  </h3>
                  <div className="space-y-3">
                    {activities.slice(0, 5).map((a: any) => {
                      const verbs: Record<string, string> = { quiz_completed: 'completed', badge_earned: 'earned', streak: 'hit', joined: 'joined', material_added: 'added' }
                      const verb = verbs[a.event_type] || 'did something'
                      let detail = ''
                      if (a.event_type === 'quiz_completed') detail = a.event_data.quiz_title || 'a quiz'
                      else if (a.event_type === 'badge_earned') detail = a.event_data.badge_name || 'a badge'
                      else if (a.event_type === 'streak') detail = `a ${a.event_data.streak}-day streak`
                      return (
                        <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                          {a.user_picture ? (
                            <img src={a.user_picture} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold" style={{ background: c.surface, color: c.muted }}>{a.user_name.charAt(0)}</div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                              <span className="font-semibold">{a.user_name}</span> {verb} {detail}
                            </p>
                            <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{new Date(a.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Students Tab ────────────────────────────────────────────── */}
        {activeTab === 'students' && (
          <div className="space-y-3">
            {classroom.students.length > 0 ? (
              classroom.students.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-4 p-5 rounded-2xl"
                  style={{ background: c.card, border: `1px solid ${c.border}` }}
                >
                  <span className="text-sm font-bold w-6 text-center" style={{ fontFamily: 'var(--font-space)', color: i < 3 ? c.brand : c.muted }}>
                    {i + 1}
                  </span>
                  {s.picture ? (
                    <img src={s.picture} alt="" className="w-11 h-11 rounded-full" />
                  ) : (
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: c.surface, color: c.muted }}>
                      {s.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{s.name}</p>
                    <p className="text-xs flex items-center gap-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                      <span>Level {s.level} · {s.quiz_count} quizzes</span>
                      <span aria-hidden="true">·</span>
                      {s.streak > 0 ? (
                        <span className="inline-flex items-center gap-0.5">
                          <Flame size={11} style={{ color: c.brand }} fill={c.brand} />
                          {s.streak}d
                        </span>
                      ) : (
                        <span>No streak</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{s.xp.toLocaleString()} XP</p>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-16">
                <Users size={40} className="mx-auto mb-4" style={{ color: c.muted }} />
                <p className="text-base font-bold mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>No students yet</p>
                <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Share the join code or invite students by email.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Materials Tab ───────────────────────────────────────────── */}
        {activeTab === 'materials' && (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5 md:gap-6">
              {/* Upload card (teacher only) */}
              {isTeacher && (
                <motion.div
                  whileHover={{ y: -3 }}
                  onClick={() => setShowAddMaterial(true)}
                  className="rounded-2xl p-4 md:p-5 cursor-pointer flex flex-col items-center justify-center min-h-[180px]"
                  style={{ border: `1.5px dashed ${c.border}`, transition: 'border-color 200ms ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.brand }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${c.brand}10` }}>
                    <Plus size={18} style={{ color: c.brand }} />
                  </div>
                  <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Add Material</p>
                  <p className="text-[10px] mt-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Upload or import</p>
                </motion.div>
              )}

              {/* Material cards */}
              {classroom.materials.map((mat, i) => (
                <motion.div
                  key={mat.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileHover={{ y: -3 }}
                  onClick={() => navigate(`/viewer/${mat.id}`, { state: { from: `/classrooms/${classroomId}` } })}
                  className="rounded-2xl p-4 md:p-5 cursor-pointer"
                  style={{ background: c.card, border: `1px solid ${c.border}` }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${c.brand}10` }}>
                    <BookOpen size={18} style={{ color: c.brand }} />
                  </div>
                  <p className="text-sm font-bold mb-1 line-clamp-2 leading-tight" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{mat.title}</p>
                  <p className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    {mat.section_count} sections
                  </p>
                  <div className="mt-3 pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${c.border}` }}>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded" style={{ background: c.surface, color: c.muted }}>{mat.file_type.toUpperCase()}</span>
                    {mat.page_count && <span className="text-[10px]" style={{ color: c.muted }}>{mat.page_count} pages</span>}
                  </div>
                </motion.div>
              ))}
            </div>

            {classroom.materials.length === 0 && !isTeacher && (
              <div className="text-center py-16">
                <FileText size={40} className="mx-auto mb-4" style={{ color: c.muted }} />
                <p className="text-base font-bold mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>No materials yet</p>
                <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Your teacher hasn't added study materials yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Quizzes Tab ─────────────────────────────────────────────── */}
        {activeTab === 'quizzes' && (
          <div>
            {(() => {
              const visibleQuizzes = isTeacher ? classroom.quizzes : classroom.quizzes.filter((q) => q.is_published)
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 md:gap-6">
                  {/* Create quiz card (teacher only) */}
                  {isTeacher && (
                    <motion.div
                      whileHover={{ y: -3 }}
                      onClick={() => setShowCreateQuiz(true)}
                      className="rounded-2xl p-5 md:p-6 cursor-pointer flex flex-col items-center justify-center min-h-[200px]"
                      style={{ border: `1.5px dashed ${c.border}`, transition: 'border-color 200ms ease' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = c.brand }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.border }}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${c.brand}10` }}>
                        <Plus size={18} style={{ color: c.brand }} />
                      </div>
                      <p className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Create Quiz</p>
                    </motion.div>
                  )}

                  {/* Quiz cards */}
                  {visibleQuizzes.map((quiz, i) => (
                    <motion.div
                      key={quiz.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      whileHover={{ y: -3 }}
                      className="rounded-2xl p-5 md:p-6 relative overflow-hidden"
                      style={{ background: c.card, border: `1px solid ${c.border}` }}
                    >
                      {/* Status indicator */}
                      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: quiz.is_published ? c.accent : c.muted, opacity: 0.5 }} />

                      {/* Exclamation badge for students (top-left corner) — only for uncompleted quizzes */}
                      {!isTeacher && quiz.is_published && !quiz.my_completed && (
                        <motion.span
                          animate={{ rotate: [0, -8, 8, -8, 0] }}
                          transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
                          className="absolute top-3 right-3 flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-black"
                          style={{ background: 'oklch(65% 0.18 25)', color: c.bg }}
                        >!</motion.span>
                      )}

                      {/* Header row */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium px-2 py-1 rounded-lg" style={{ background: quiz.is_published ? `${c.accent}15` : c.surface, color: quiz.is_published ? c.accent : c.muted }}>
                            {quiz.is_published ? 'Published' : 'Draft'}
                          </span>
                          {quiz.config?.difficulty && (
                            <span className="text-xs px-2 py-1 rounded-lg" style={{ background: c.surface, color: c.muted }}>{quiz.config.difficulty}</span>
                          )}
                        </div>
                        {/* Time limit in top-right for teachers */}
                        {isTeacher && (
                          <span className="text-xs flex items-center gap-1.5" style={{ fontFamily: 'var(--font-space)', color: quiz.expires_at ? 'oklch(65% 0.18 25)' : c.muted }}>
                            <Clock size={13} />
                            {quiz.expires_at ? <QuizCountdownInline expiresAt={quiz.expires_at} /> : 'No limit'}
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <h3 className="text-lg font-bold mb-2 line-clamp-2 leading-tight" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{quiz.title}</h3>
                      <p className="text-sm mb-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                        {quiz.config?.question_count || '?'} questions
                        {quiz.config?.types && ` · ${quiz.config.types.length} types`}
                        {quiz.config?.scope_label && ` · ${quiz.config.scope_label}`}
                      </p>

                      {/* Countdown timer or no-expiry indicator (students see it below title) */}
                      {!isTeacher && (
                        <p className="text-sm mb-4 flex items-center gap-1.5 font-medium" style={{ fontFamily: 'var(--font-space)', color: quiz.expires_at ? 'oklch(65% 0.18 25)' : c.muted }}>
                          <Clock size={14} />
                          {quiz.expires_at ? <QuizCountdownInline expiresAt={quiz.expires_at} /> : 'No time limit'}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex flex-wrap gap-2 pt-4" style={{ borderTop: `1px solid ${c.border}` }}>
                        {isTeacher && (
                          <>
                            <button
                              onClick={async () => {
                                try {
                                  const res = await api.get(`/classrooms/${classroomId}/quizzes/${quiz.id}`)
                                  setQuizResults({ ...res.data, _mode: 'review' })
                                } catch {}
                              }}
                              className="text-sm font-medium px-4 py-2 rounded-xl cursor-pointer"
                              style={{ fontFamily: 'var(--font-space)', background: c.surface, color: c.text, border: `1px solid ${c.border}` }}
                            >
                              Review
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const res = await api.get(`/classrooms/${classroomId}/quizzes/${quiz.id}/results`)
                                  setQuizResults(res.data)
                                } catch {}
                              }}
                              className="text-sm font-medium px-4 py-2 rounded-xl cursor-pointer"
                              style={{ fontFamily: 'var(--font-space)', background: `${c.brand}12`, color: c.brand, border: `1px solid ${c.brand}30` }}
                            >
                              Results
                            </button>
                            <button
                              onClick={() => handlePublishQuiz(quiz.id, !quiz.is_published)}
                              className="text-sm font-medium px-4 py-2 rounded-xl cursor-pointer"
                              style={{ fontFamily: 'var(--font-space)', background: quiz.is_published ? `oklch(65% 0.18 25 / 0.08)` : `${c.accent}12`, color: quiz.is_published ? 'oklch(65% 0.18 25)' : c.accent, border: `1px solid ${quiz.is_published ? 'oklch(65% 0.18 25 / 0.25)' : `${c.accent}25`}` }}
                            >
                              {quiz.is_published ? 'Unpublish' : 'Publish'}
                            </button>
                          </>
                        )}
                        {!isTeacher && quiz.is_published && (
                          quiz.my_completed ? (
                            <div className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl w-full justify-center" style={{ fontFamily: 'var(--font-space)', background: `${c.accent}12`, color: c.accent, border: `1px solid ${c.accent}25` }}>
                              <Check size={14} /> Completed
                            </div>
                          ) : (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await api.post(`/classrooms/${classroomId}/quizzes/${quiz.id}/start`)
                                  navigate(`/quiz/${res.data.quiz_id}`, {
                                    state: { mode: 'standard', time_pressure: quiz.config?.time_pressure, time_per_question: quiz.config?.time_per_question, classroomId },
                                  })
                                } catch (err: any) {
                                  setAlertMessage(err.response?.data?.detail || 'Failed to start quiz')
                                }
                              }}
                              className="flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl cursor-pointer w-full justify-center"
                              style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
                            >
                              <Play size={14} /> Take Quiz
                            </button>
                          )
                        )}
                      </div>
                    </motion.div>
                  ))}

                  {/* Empty state (no create card for students) */}
                  {visibleQuizzes.length === 0 && !isTeacher && (
                    <div className="col-span-full text-center py-16">
                      <Play size={40} className="mx-auto mb-4" style={{ color: c.muted }} />
                      <p className="text-base font-bold mb-1" style={{ fontFamily: 'var(--font-space)', color: c.text }}>No quizzes available</p>
                      <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Your teacher hasn't published any quizzes yet.</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

          </div>
        </div>
      </div>

      {/* ─── Modals ────────────────────────────────────────────────────── */}

      {/* Invite Modal */}
      <AnimatePresence>
        {showInvite && (
          <BottomSheetModal onClose={() => setShowInvite(false)}>
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Invite Student</h2>
                <button onClick={() => setShowInvite(false)} className="p-1.5 cursor-pointer rounded-md hover:opacity-70" style={{ color: c.muted }}><X size={18} /></button>
              </div>
              {inviteMsg && <p className="text-sm mb-4 p-3 rounded-xl" style={{ fontFamily: 'var(--font-space)', background: c.surface, color: c.accent }}>{inviteMsg}</p>}
              <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Email Address</label>
              <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="student@email.com" className="w-full px-4 py-3.5 rounded-xl text-base outline-none mb-5" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }} />
              <button onClick={handleInvite} disabled={!inviteEmail.trim() || inviting} className="w-full py-3.5 rounded-xl text-base font-bold cursor-pointer disabled:opacity-40" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
                {inviting ? 'Inviting...' : 'Send Invite'}
              </button>
            </div>
          </BottomSheetModal>
        )}
      </AnimatePresence>

      {/* Add Material Modal — Upload or Import */}
      <AnimatePresence>
        {showAddMaterial && (
          <AddMaterialModal
            classroomId={classroomId!}
            onClose={() => setShowAddMaterial(false)}
            onAdded={() => { setShowAddMaterial(false); fetchClassroom() }}
          />
        )}
      </AnimatePresence>

      {/* Create Quiz Modal */}
      <AnimatePresence>
        {showCreateQuiz && (
          <CreateQuizModal classroomId={classroomId!} materials={classroom.materials} onClose={() => setShowCreateQuiz(false)} onCreated={() => { setShowCreateQuiz(false); fetchClassroom() }} />
        )}
      </AnimatePresence>

      {/* Quiz Results / Review Modal */}
      <AnimatePresence>
        {quizResults && (
          <BottomSheetModal onClose={() => setQuizResults(null)} maxWidth="max-w-3xl">
            <div className="p-6 md:p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                    {quizResults._mode === 'review' ? 'Review Questions' : quizResults.quiz_title}
                  </h2>
                  {quizResults._mode !== 'review' && (
                    <p className="text-xs mt-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                      {quizResults.submitted_count}/{quizResults.total_students} students submitted
                    </p>
                  )}
                  {quizResults._mode === 'review' && (
                    <p className="text-xs mt-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                      {quizResults.title} · {quizResults.questions?.length || 0} questions
                    </p>
                  )}
                </div>
                <button onClick={() => setQuizResults(null)} className="p-1.5 cursor-pointer rounded-md hover:opacity-70" style={{ color: c.muted }}><X size={18} /></button>
              </div>

              {/* Review mode: show questions with answers */}
              {quizResults._mode === 'review' && quizResults.questions && (
                <div className="space-y-4">
                  {quizResults.questions.map((q: any, i: number) => (
                    <div key={q.id} className="p-4 rounded-xl" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-bold w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${c.brand}12`, color: c.brand }}>{i + 1}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: c.card, color: c.muted }}>{q.type}</span>
                      </div>
                      <p className="text-sm font-medium mb-3" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{q.content}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {q.options?.map((opt: string, oi: number) => (
                          <span key={oi} className="text-[11px] px-2.5 py-1 rounded-lg" style={{ fontFamily: 'var(--font-space)', background: opt === q.correct_answer ? `${c.accent}15` : c.card, color: opt === q.correct_answer ? c.accent : c.muted, border: `1px solid ${opt === q.correct_answer ? `${c.accent}30` : c.border}` }}>
                            {opt}
                          </span>
                        ))}
                      </div>
                      {q.explanation && (
                        <p className="text-[11px] mt-2 pt-2" style={{ fontFamily: 'var(--font-space)', color: c.muted, borderTop: `1px solid ${c.border}` }}>{q.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Results mode: show student submissions */}
              {quizResults._mode !== 'review' && (
                <>
                  {quizResults.students?.length === 0 ? (
                    <p className="text-sm text-center py-10" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No submissions yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {quizResults.students?.map((student: any, idx: number) => (
                        <details key={student.student_id} className="rounded-xl overflow-hidden" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
                          <summary className="flex items-center gap-4 p-4 cursor-pointer list-none">
                            <span className="text-sm font-bold w-6 text-center" style={{ fontFamily: 'var(--font-space)', color: idx < 3 ? c.brand : c.muted }}>{idx + 1}</span>
                            {student.student_picture ? (
                              <img src={student.student_picture} alt="" className="w-9 h-9 rounded-full" />
                            ) : (
                              <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: c.card, color: c.muted }}>{student.student_name.charAt(0)}</div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{student.student_name}</p>
                              <p className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{student.correct_count}/{student.total_questions} correct</p>
                            </div>
                            <span className="text-base font-bold" style={{ fontFamily: 'var(--font-space)', color: student.score >= 70 ? c.accent : student.score >= 50 ? c.brand : 'oklch(65% 0.18 25)' }}>
                              {Math.round(student.score || 0)}%
                            </span>
                          </summary>
                          <div className="px-4 pb-4 space-y-2">
                            {student.answers?.map((ans: any, qi: number) => (
                              <div key={qi} className="flex items-start gap-3 py-2" style={{ borderTop: qi > 0 ? `1px solid ${c.border}` : 'none' }}>
                                <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: ans.is_correct ? `${c.accent}15` : 'oklch(65% 0.18 25 / 0.1)', color: ans.is_correct ? c.accent : 'oklch(65% 0.18 25)' }}>
                                  {ans.is_correct ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{ans.question_content}</p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: ans.is_correct ? c.accent : 'oklch(65% 0.18 25)' }}>{ans.student_answer || 'No answer'}</span>
                                    {!ans.is_correct && <span className="text-[10px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>(correct: {ans.correct_answer})</span>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </BottomSheetModal>
        )}
      </AnimatePresence>

      {/* Custom Alert Modal (replaces browser alert) */}
      <AnimatePresence>
        {alertMessage && (
          <BottomSheetModal onClose={() => setAlertMessage(null)} maxWidth="max-w-sm">
            <div className="p-6 md:p-8 text-center">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'oklch(65% 0.18 25 / 0.1)' }}>
                <X size={22} style={{ color: 'oklch(65% 0.18 25)' }} />
              </div>
              <p className="text-base font-medium mb-6" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{alertMessage}</p>
              <button
                onClick={() => setAlertMessage(null)}
                className="px-8 py-3 rounded-xl text-sm font-semibold cursor-pointer"
                style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
              >
                OK
              </button>
            </div>
          </BottomSheetModal>
        )}
      </AnimatePresence>
    </div>
  )
}

function AddMaterialModal({ classroomId, onClose, onAdded }: {
  classroomId: string
  onClose: () => void
  onAdded: () => void
}) {
  const [mode, setMode] = useState<'choose' | 'upload' | 'import'>('choose')
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [importList, setImportList] = useState<{ id: string; title: string; pool_count: number }[]>([])
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch personal materials for import mode
  useEffect(() => {
    if (mode === 'import') {
      api.get('/materials/').then((res) => setImportList(res.data)).catch(() => {})
    }
  }, [mode])

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      if (title.trim()) formData.append('title', title.trim())
      formData.append('classroom_id', classroomId)
      const res = await api.post('/materials/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      // Assign to classroom
      await api.post(`/classrooms/${classroomId}/materials`, { material_id: res.data.id })
      onAdded()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed')
    }
    setUploading(false)
  }

  const handleImport = async (materialId: string) => {
    setImporting(true)
    try {
      await api.post(`/classrooms/${classroomId}/materials`, { material_id: materialId })
      onAdded()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Import failed')
    }
    setImporting(false)
  }

  return (
    <BottomSheetModal onClose={onClose}>
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            {mode === 'choose' ? 'Add Material' : mode === 'upload' ? 'Upload File' : 'Import from Personal'}
          </h2>
          <button onClick={onClose} className="p-1.5 cursor-pointer rounded-md hover:opacity-70" style={{ color: c.muted }}><X size={18} /></button>
        </div>

        {error && <p className="text-sm mb-4 p-3 rounded-xl" style={{ fontFamily: 'var(--font-space)', background: 'oklch(25% 0.04 25)', color: 'oklch(75% 0.15 25)' }}>{error}</p>}

        {/* Choose mode */}
        {mode === 'choose' && (
          <div className="space-y-3">
            <button onClick={() => setMode('upload')} className="w-full flex items-center gap-4 p-5 rounded-2xl cursor-pointer text-left" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${c.brand}10` }}>
                <Upload size={18} style={{ color: c.brand }} />
              </div>
              <div>
                <p className="text-base font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Upload New File</p>
                <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>PDF, PPTX, or DOCX</p>
              </div>
            </button>
            <button onClick={() => setMode('import')} className="w-full flex items-center gap-4 p-5 rounded-2xl cursor-pointer text-left" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${c.accent}10` }}>
                <BookOpen size={18} style={{ color: c.accent }} />
              </div>
              <div>
                <p className="text-base font-semibold" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Import from Personal</p>
                <p className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Use a material you already uploaded</p>
              </div>
            </button>
          </div>
        )}

        {/* Upload mode */}
        {mode === 'upload' && (
          <div className="space-y-5">
            <div>
              <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>File</label>
              <label className="flex items-center justify-center gap-2 py-8 rounded-xl cursor-pointer" style={{ border: `1.5px dashed ${file ? c.brand : c.border}`, background: file ? `${c.brand}05` : 'transparent' }}>
                <input type="file" accept=".pdf,.pptx,.docx" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { setFile(e.target.files[0]); if (!title) setTitle(e.target.files[0].name.replace(/\.[^.]+$/, '')) } }} />
                {file ? (
                  <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{file.name}</span>
                ) : (
                  <span className="text-sm" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Click to select a file</span>
                )}
              </label>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider font-medium block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Title (optional)</label>
              <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auto-detected from filename" className="w-full px-4 py-3.5 rounded-xl text-base outline-none" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setMode('choose')} className="px-4 py-3 rounded-xl text-sm font-medium cursor-pointer" style={{ fontFamily: 'var(--font-space)', background: c.surface, color: c.muted, border: `1px solid ${c.border}` }}>Back</button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleUpload} disabled={!file || uploading} className="flex-1 py-3 rounded-xl text-base font-bold cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2" style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}>
                {uploading && <Loader2 size={14} className="animate-spin" />}
                {uploading ? 'Uploading...' : 'Upload'}
              </motion.button>
            </div>
          </div>
        )}

        {/* Import mode */}
        {mode === 'import' && (
          <div className="space-y-3">
            <button onClick={() => setMode('choose')} className="text-xs font-medium cursor-pointer mb-2" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>Back</button>
            {importList.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No personal materials to import.</p>
            ) : (
              importList.map((mat) => (
                <motion.button key={mat.id} whileHover={{ scale: 1.01 }} onClick={() => handleImport(mat.id)} disabled={importing} className="w-full text-left p-4 rounded-xl cursor-pointer disabled:opacity-50" style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}` }}>
                  <p className="text-sm font-semibold" style={{ color: c.text }}>{mat.title}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: c.muted }}>{mat.pool_count} questions</p>
                </motion.button>
              ))
            )}
          </div>
        )}
      </div>
    </BottomSheetModal>
  )
}

// ─── Create Quiz Modal ────────────────────────────────────────────────────────

function CreateQuizModal({ classroomId, materials, onClose, onCreated }: {
  classroomId: string
  materials: ClassroomMaterial[]
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [materialId, setMaterialId] = useState(materials[0]?.id || '')
  const [questionCount, setQuestionCount] = useState(10)
  const [difficulty, setDifficulty] = useState('mixed')
  const [questionTypes, setQuestionTypes] = useState<string[]>(['mcq', 'true_false'])
  const [timePressure, setTimePressure] = useState(false)
  const [timePerQuestion, setTimePerQuestion] = useState(30)
  const [expiresAt, setExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Source scope ────────────────────────────────────────────────────────
  // Three modes: 'all' (whole material), 'pages' (page range), 'sections'
  // (multi-select section picker). Switching modes resets sibling state.
  type ScopeMode = 'all' | 'pages' | 'sections'
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all')
  const [pageStart, setPageStart] = useState<number>(1)
  const [pageEnd, setPageEnd] = useState<number>(1)
  const [selectedSectionIds, setSelectedSectionIds] = useState<string[]>([])
  const [sections, setSections] = useState<MaterialSection[]>([])
  const [sectionsLoading, setSectionsLoading] = useState(false)

  const selectedMaterial = materials.find((m) => m.id === materialId)
  const pageLabel =
    selectedMaterial?.file_type === 'pptx'
      ? 'slide'
      : selectedMaterial?.file_type === 'docx'
        ? 'section'
        : 'page'

  // Fetch sections when material changes
  useEffect(() => {
    if (!materialId) {
      setSections([])
      return
    }
    setSectionsLoading(true)
    setSelectedSectionIds([])
    api
      .get(`/classrooms/${classroomId}/materials/${materialId}/sections`)
      .then((res) => {
        const list: MaterialSection[] = res.data?.sections ?? []
        setSections(list)
        // Default page range covers the whole material
        if (list.length) {
          const minPage = Math.min(...list.map((s) => s.page_number ?? 1))
          const maxPage = Math.max(...list.map((s) => s.page_number ?? 1))
          setPageStart(minPage)
          setPageEnd(maxPage)
        }
      })
      .catch(() => setSections([]))
      .finally(() => setSectionsLoading(false))
  }, [materialId, classroomId])

  const allTypes: { id: string; label: string; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }> }[] = [
    { id: 'mcq', label: 'Multiple Choice', icon: CircleDot },
    { id: 'true_false', label: 'True / False', icon: ToggleLeft },
    { id: 'fill_blank', label: 'Fill in Blank', icon: Square },
    { id: 'matching', label: 'Matching', icon: ArrowLeftRight },
    { id: 'ordering', label: 'Ordering', icon: ArrowUpDown },
  ]

  const toggleType = (typeId: string) => {
    setQuestionTypes((prev) =>
      prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId]
    )
  }

  const handleCreate = async () => {
    if (!title.trim() || !materialId || questionTypes.length === 0) return
    if (scopeMode === 'sections' && selectedSectionIds.length === 0) {
      setError('Pick at least one section, or switch to a different scope.')
      return
    }
    if (scopeMode === 'pages' && pageStart > pageEnd) {
      setError(`Start ${pageLabel} can't come after end ${pageLabel}.`)
      return
    }
    setCreating(true)
    setError(null)
    try {
      await api.post(`/classrooms/${classroomId}/quizzes`, {
        title: title.trim(),
        material_id: materialId,
        question_count: questionCount,
        difficulty,
        question_types: questionTypes,
        time_pressure: timePressure,
        time_per_question: timePressure ? timePerQuestion : null,
        generate_fresh: true,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        // Scope payload — backend treats null/undefined as "whole material"
        page_start: scopeMode === 'pages' ? pageStart : null,
        page_end: scopeMode === 'pages' ? pageEnd : null,
        section_ids: scopeMode === 'sections' ? selectedSectionIds : null,
      })
      onCreated()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create quiz. AI may be temporarily unavailable.')
    }
    setCreating(false)
  }

  return (
    <BottomSheetModal onClose={onClose} maxWidth="max-w-xl">
      <div className="px-6 md:px-8 pb-6 md:pb-8">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between pt-5 pb-4" style={{ background: c.card }}>
          <div>
            <h2 className="font-bold text-xl" style={{ fontFamily: 'var(--font-space)', color: c.text }}>Create Quiz</h2>
            <p className="text-xs mt-0.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>AI generates questions from your material</p>
          </div>
          <button onClick={onClose} className="p-2 cursor-pointer rounded-xl hover:opacity-70 transition-opacity" style={{ color: c.muted, background: c.surface }}>
            <X size={16} />
          </button>
        </div>
          {error && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="mb-5 p-4 rounded-xl" style={{ background: 'oklch(22% 0.04 25)', border: '1px solid oklch(30% 0.06 25)' }}>
              <p className="text-sm" style={{ fontFamily: 'var(--font-space)', color: 'oklch(75% 0.15 25)' }}>{error}</p>
            </motion.div>
          )}

          <div className="space-y-6">
            {/* Title */}
            <div>
              <label className="text-[11px] uppercase tracking-widest font-semibold block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Chapter 3 Review"
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none transition-colors focus:ring-1"
                style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
              />
            </div>

            {/* Material Selection */}
            <div>
              <label className="text-[11px] uppercase tracking-widest font-semibold block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Source Material</label>
              {materials.length === 0 ? (
                <p className="text-sm py-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>No materials assigned to this classroom yet.</p>
              ) : (
                <div className="space-y-2">
                  {materials.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMaterialId(m.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left cursor-pointer transition-all"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: materialId === m.id ? `${c.brand}08` : c.surface,
                        border: `1.5px solid ${materialId === m.id ? c.brand : c.border}`,
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: materialId === m.id ? `${c.brand}15` : c.card }}>
                        <FileText size={14} style={{ color: materialId === m.id ? c.brand : c.muted }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: materialId === m.id ? c.text : c.muted }}>{m.title}</p>
                        <p className="text-[10px]" style={{ color: c.muted }}>{m.section_count} sections · {m.file_type.toUpperCase()}</p>
                      </div>
                      {materialId === m.id && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: c.brand }}>
                          <Check size={11} style={{ color: c.bg }} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Source Scope — narrow the AI to a page range or specific sections */}
            {materialId && (
              <div>
                <label className="text-[11px] uppercase tracking-widest font-semibold block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Source scope
                </label>
                <div className="flex rounded-xl overflow-hidden mb-3" style={{ border: `1px solid ${c.border}` }}>
                  {([
                    { id: 'all', label: 'Whole material' },
                    { id: 'pages', label: pageLabel === 'page' ? 'Page range' : pageLabel === 'slide' ? 'Slide range' : 'Section range' },
                    { id: 'sections', label: 'Pick sections' },
                  ] as { id: ScopeMode; label: string }[]).map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setScopeMode(opt.id)}
                      className="flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer transition-all"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: scopeMode === opt.id ? c.brand : c.surface,
                        color: scopeMode === opt.id ? c.bg : c.muted,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {scopeMode === 'all' && (
                  <p className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                    AI will draw from the entire material{selectedMaterial?.section_count ? ` (${selectedMaterial.section_count} sections)` : ''}.
                  </p>
                )}

                {scopeMode === 'pages' && (
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      value={pageStart}
                      onChange={(e) => setPageStart(parseInt(e.target.value) || 1)}
                      min={1}
                      max={selectedMaterial?.page_count || 999}
                      className="w-24 px-3 py-2.5 rounded-xl text-sm outline-none text-center"
                      style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                      aria-label={`Start ${pageLabel}`}
                    />
                    <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>to</span>
                    <input
                      type="number"
                      value={pageEnd}
                      onChange={(e) => setPageEnd(parseInt(e.target.value) || 1)}
                      min={1}
                      max={selectedMaterial?.page_count || 999}
                      className="w-24 px-3 py-2.5 rounded-xl text-sm outline-none text-center"
                      style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                      aria-label={`End ${pageLabel}`}
                    />
                    <span className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                      {pageLabel}{pageStart === pageEnd ? '' : 's'}
                      {selectedMaterial?.page_count ? ` of ${selectedMaterial.page_count}` : ''}
                    </span>
                  </div>
                )}

                {scopeMode === 'sections' && (
                  <div>
                    {sectionsLoading ? (
                      <div className="flex items-center gap-2 py-3 text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                        <Loader2 size={13} className="animate-spin" />
                        Loading sections...
                      </div>
                    ) : sections.length === 0 ? (
                      <p className="text-xs py-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                        No sections detected for this material.
                      </p>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px]" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                            {selectedSectionIds.length} of {sections.length} selected
                          </span>
                          <div className="flex items-center gap-3 text-[11px]">
                            <button
                              onClick={() => setSelectedSectionIds(sections.map((s) => s.id))}
                              className="font-semibold cursor-pointer hover:opacity-80"
                              style={{ fontFamily: 'var(--font-space)', color: c.brand }}
                            >
                              Select all
                            </button>
                            <button
                              onClick={() => setSelectedSectionIds([])}
                              className="font-semibold cursor-pointer hover:opacity-80"
                              style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                          {sections.map((s) => {
                            const isSelected = selectedSectionIds.includes(s.id)
                            const sectionLabel = s.title || `${pageLabel.charAt(0).toUpperCase() + pageLabel.slice(1)} ${s.page_number ?? s.order_index + 1}`
                            return (
                              <button
                                key={s.id}
                                onClick={() => {
                                  setSelectedSectionIds((prev) =>
                                    prev.includes(s.id)
                                      ? prev.filter((id) => id !== s.id)
                                      : [...prev, s.id]
                                  )
                                }}
                                className="w-full flex items-start gap-3 px-3.5 py-2.5 rounded-lg text-left cursor-pointer transition-all"
                                style={{
                                  fontFamily: 'var(--font-space)',
                                  background: isSelected ? `${c.brand}10` : c.surface,
                                  border: `1.5px solid ${isSelected ? c.brand : c.border}`,
                                }}
                              >
                                <div
                                  className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                                  style={{
                                    background: isSelected ? c.brand : 'transparent',
                                    border: `1.5px solid ${isSelected ? c.brand : c.border}`,
                                  }}
                                >
                                  {isSelected && <Check size={11} style={{ color: c.bg }} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium truncate" style={{ color: isSelected ? c.text : c.muted }}>
                                      {sectionLabel}
                                    </p>
                                    {s.page_number != null && s.title && (
                                      <span className="text-[10px] uppercase tracking-wide" style={{ color: c.muted }}>
                                        {pageLabel} {s.page_number}
                                      </span>
                                    )}
                                  </div>
                                  {s.preview && (
                                    <p className="text-[11px] mt-0.5 truncate" style={{ color: c.muted, opacity: 0.75 }}>
                                      {s.preview}
                                    </p>
                                  )}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Question Types */}
            <div>
              <label className="text-[11px] uppercase tracking-widest font-semibold block mb-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Question Types</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {allTypes.map((type) => {
                  const selected = questionTypes.includes(type.id)
                  const TypeIcon = type.icon
                  return (
                    <button
                      key={type.id}
                      onClick={() => toggleType(type.id)}
                      className="flex items-center gap-2 px-3.5 py-3 rounded-xl text-left cursor-pointer transition-all"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: selected ? `${c.brand}10` : c.surface,
                        border: `1.5px solid ${selected ? c.brand : c.border}`,
                        color: selected ? c.brand : c.muted,
                      }}
                    >
                      <TypeIcon size={14} style={{ color: selected ? c.brand : c.muted }} />
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  )
                })}
              </div>
              {questionTypes.length === 0 && (
                <p className="text-[11px] mt-2" style={{ fontFamily: 'var(--font-space)', color: 'oklch(65% 0.18 25)' }}>Select at least one type</p>
              )}
            </div>

            {/* Config row: Questions + Difficulty */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] uppercase tracking-widest font-semibold block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Questions</label>
                <input
                  type="number"
                  value={questionCount}
                  onChange={(e) => setQuestionCount(parseInt(e.target.value) || 10)}
                  min={3}
                  max={30}
                  className="w-full px-4 py-3.5 rounded-xl text-sm outline-none"
                  style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                />
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-widest font-semibold block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Difficulty</label>
                <div className="flex rounded-xl overflow-hidden" style={{ border: `1px solid ${c.border}` }}>
                  {['easy', 'medium', 'hard', 'mixed'].map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className="flex-1 py-3.5 text-[11px] font-semibold uppercase tracking-wide cursor-pointer transition-all"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: difficulty === d ? c.brand : c.surface,
                        color: difficulty === d ? c.bg : c.muted,
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setTimePressure(!timePressure)}
                className="flex items-center gap-2.5 text-sm font-medium cursor-pointer px-4 py-3 rounded-xl transition-all"
                style={{
                  fontFamily: 'var(--font-space)',
                  background: timePressure ? `${c.brand}12` : c.surface,
                  border: `1.5px solid ${timePressure ? c.brand : c.border}`,
                  color: timePressure ? c.brand : c.muted,
                }}
              >
                <Clock size={15} />
                Timer {timePressure ? 'ON' : 'OFF'}
              </button>
              {timePressure && (
                <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2">
                  <input
                    type="number"
                    value={timePerQuestion}
                    onChange={(e) => setTimePerQuestion(parseInt(e.target.value) || 30)}
                    min={10}
                    max={120}
                    className="w-16 px-3 py-2.5 rounded-xl text-sm outline-none text-center"
                    style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text }}
                  />
                  <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>sec / question</span>
                </motion.div>
              )}
            </div>

            {/* Expiry */}
            <div>
              <label className="text-[11px] uppercase tracking-widest font-semibold block mb-2" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Deadline (optional)</label>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl text-sm outline-none"
                style={{ fontFamily: 'var(--font-space)', background: c.surface, border: `1px solid ${c.border}`, color: c.text, colorScheme: 'dark' }}
              />
              <p className="text-[10px] mt-1.5" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Students cannot start after this time</p>
            </div>
          </div>

          {/* Submit */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleCreate}
            disabled={!title.trim() || !materialId || questionTypes.length === 0 || creating}
            className="w-full mt-8 py-4 rounded-xl text-sm font-bold cursor-pointer disabled:opacity-40 flex items-center justify-center gap-2.5 transition-shadow"
            style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 4px 24px ${c.brand}33` }}
          >
            {creating && <Loader2 size={15} className="animate-spin" />}
            {creating ? 'Generating questions...' : 'Create Quiz'}
          </motion.button>
          {creating && (
            <p className="text-[11px] text-center mt-3" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>AI is generating fresh questions from {selectedMaterial?.title || 'the material'}. This may take a moment.</p>
          )}
        </div>
    </BottomSheetModal>
  )
}

export default function ClassroomDetailPage() {
  return (
    <RequireAuth>
      <ClassroomDetailContent />
    </RequireAuth>
  )
}
