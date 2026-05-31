import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Swords, ArrowLeft, Copy, Check, Loader2, Trophy, Crown } from 'lucide-react'
import { useAuth, RequireAuth } from '../lib/auth'
import api from '../lib/api'
import { theme as c } from '../theme'

interface BattleQuestion {
  id: string
  text: string
  options: string[]
  correct_index?: number
}

interface BattlePlayer {
  user_id: string
  name: string
  picture: string | null
  score: number
}

interface BattleState {
  id: string
  status: 'waiting' | 'active' | 'completed'
  players: BattlePlayer[]
  questions: BattleQuestion[]
  winner_id?: string | null
}

function BattleContent() {
  const { battleId } = useParams<{ battleId: string }>()
  const { user } = useAuth()
  const [battle, setBattle] = useState<BattleState | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentQ, setCurrentQ] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchBattle = useCallback(async () => {
    try {
      const res = await api.get(`/battles/${battleId}`)
      setBattle(res.data)
    } catch {
      setBattle(null)
    } finally {
      setLoading(false)
    }
  }, [battleId])

  useEffect(() => {
    fetchBattle()
  }, [fetchBattle])

  // Poll for updates when waiting or active
  useEffect(() => {
    if (battle && (battle.status === 'waiting' || battle.status === 'active')) {
      pollRef.current = setInterval(fetchBattle, 2000)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [battle?.status, fetchBattle])

  const handleCopy = () => {
    navigator.clipboard.writeText(battleId || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAnswer = async (optionIndex: number) => {
    if (!battle || selectedAnswer !== null) return
    const question = battle.questions[currentQ]
    setSelectedAnswer(optionIndex)
    setAnsweredQuestions((prev) => new Set(prev).add(question.id))

    try {
      await api.post(`/battles/${battleId}/answer`, {
        question_id: question.id,
        answer_index: optionIndex,
      })
    } catch {
      // silently fail
    }

    // Move to next question after brief delay
    setTimeout(() => {
      setSelectedAnswer(null)
      if (currentQ < battle.questions.length - 1) {
        setCurrentQ((prev) => prev + 1)
      }
    }, 1200)
  }

  const myPlayer = battle?.players.find((p) => p.user_id === user?.id)
  const opponent = battle?.players.find((p) => p.user_id !== user?.id)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: c.bg }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: c.border, borderTopColor: c.brand }} />
      </div>
    )
  }

  if (!battle) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: c.bg }}>
        <p style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Battle not found</p>
      </div>
    )
  }

  return (
    <div style={{ background: c.bg }}>
      <div className="mx-auto px-5 md:px-10 lg:px-16 xl:px-20 py-6 md:py-10">
        {/* WAITING STATE */}
        {battle.status === 'waiting' && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{ background: `${c.brand}15` }}
            >
              <Swords size={36} style={{ color: c.brand }} />
            </motion.div>
            <h2 className="font-bold text-3xl mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              Waiting for opponent...
            </h2>
            <p className="text-sm mb-6" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
              Share this battle ID with a friend
            </p>

            {/* Battle ID share */}
            <div className="inline-flex items-center gap-2 rounded-xl px-5 py-3" style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <code className="font-mono text-base font-bold" style={{ color: c.brand }}>{battleId}</code>
              <button onClick={handleCopy} className="p-1.5 rounded-md cursor-pointer transition-colors hover:opacity-70" style={{ color: c.muted }}>
                {copied ? <Check size={14} style={{ color: c.accent }} /> : <Copy size={14} />}
              </button>
            </div>

            <div className="flex items-center justify-center gap-2 mt-6">
              <Loader2 size={14} className="animate-spin" style={{ color: c.muted }} />
              <span className="text-xs" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>Polling for opponent...</span>
            </div>
          </motion.div>
        )}

        {/* ACTIVE STATE */}
        {battle.status === 'active' && battle.questions.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {/* Scoreboard */}
            <div className="flex items-center justify-between mb-8 rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <div className="text-center">
                <p className="text-xs mb-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>You</p>
                <p className="font-bold text-2xl" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{myPlayer?.score || 0}</p>
              </div>
              <div className="text-center">
                <Swords size={20} style={{ color: c.muted }} />
                <p className="text-[10px] mt-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
                  Q{currentQ + 1}/{battle.questions.length}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs mb-1" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{opponent?.name || 'Opponent'}</p>
                <p className="font-bold text-2xl" style={{ fontFamily: 'var(--font-space)', color: c.purple }}>{opponent?.score || 0}</p>
              </div>
            </div>

            {/* Question */}
            {currentQ < battle.questions.length && (
              <div>
                <p className="font-bold text-xl mb-6 leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
                  {battle.questions[currentQ].text}
                </p>
                <div className="space-y-3">
                  {battle.questions[currentQ].options.map((option, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: selectedAnswer === null ? 1.01 : 1 }}
                      whileTap={{ scale: selectedAnswer === null ? 0.98 : 1 }}
                      onClick={() => handleAnswer(idx)}
                      disabled={selectedAnswer !== null || answeredQuestions.has(battle.questions[currentQ].id)}
                      className="w-full text-left px-6 py-5 rounded-xl font-medium text-base cursor-pointer disabled:cursor-default transition-colors"
                      style={{
                        fontFamily: 'var(--font-space)',
                        background: selectedAnswer === idx ? `${c.brand}20` : c.card,
                        border: `1px solid ${selectedAnswer === idx ? c.brand : c.border}`,
                        color: c.text,
                      }}
                    >
                      <span className="mr-3" style={{ color: c.muted }}>{String.fromCharCode(65 + idx)}.</span>
                      {option}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* COMPLETED STATE */}
        {battle.status === 'completed' && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-16">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: `${c.brand}15` }}>
              {battle.winner_id === user?.id ? (
                <Crown size={36} style={{ color: c.brand }} />
              ) : (
                <Trophy size={36} style={{ color: c.muted }} />
              )}
            </div>

            <h2 className="font-bold text-3xl mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
              {battle.winner_id === user?.id ? 'You won!' : battle.winner_id ? 'You lost' : "It's a tie!"}
            </h2>

            {/* Final scores */}
            <div className="flex items-center justify-center gap-8 mt-6 mb-8">
              {battle.players.map((player) => (
                <div key={player.user_id} className="text-center">
                  {player.picture ? (
                    <img src={player.picture} alt="" className="w-12 h-12 rounded-full mx-auto mb-2" />
                  ) : (
                    <div className="w-12 h-12 rounded-full mx-auto mb-2 flex items-center justify-center" style={{ background: c.surface, color: c.muted }}>
                      {player.name.charAt(0)}
                    </div>
                  )}
                  <p className="font-semibold text-sm" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{player.name}</p>
                  <p className="font-bold text-2xl mt-1" style={{ fontFamily: 'var(--font-space)', color: player.user_id === battle.winner_id ? c.brand : c.muted }}>
                    {player.score}
                  </p>
                </div>
              ))}
            </div>

            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 font-semibold text-sm px-6 py-3 rounded-xl no-underline transition-transform hover:scale-[1.02]"
              style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg }}
            >
              Back to Dashboard
            </Link>
          </motion.div>
        )}
      </div>
    </div>
  )
}

export default function BattlePage() {
  return (
    <RequireAuth>
      <BattleContent />
    </RequireAuth>
  )
}
