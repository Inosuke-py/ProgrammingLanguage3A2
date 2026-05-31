import { motion } from 'framer-motion'
import { Zap, BookOpen, Flame, TrendingUp, Shield, Lightbulb } from 'lucide-react'
import { theme as c } from '../../theme'
import MouseGlow from './MouseGlow'

const features = [
  { icon: Zap, title: 'Quizzes in seconds', desc: 'Upload your notes and get a full quiz instantly. Multiple choice, true/false, fill-in-the-blank, and more.' },
  { icon: BookOpen, title: 'Answers trace back to your notes', desc: 'Got one wrong? Kino shows you the exact section to revisit. No more flipping through pages.' },
  { icon: Flame, title: 'Streaks that keep you going', desc: 'Build combos, earn XP, and watch your mastery grow. Miss a few days and your score nudges you back.' },
  { icon: TrendingUp, title: 'Gets harder as you improve', desc: 'Questions adapt to your level. Already nailed a topic? Kino moves on to what you still need.' },
  { icon: Shield, title: 'Your notes stay yours', desc: 'Everything runs on your machine. No uploads, no cloud, no one else sees your study material.' },
  { icon: Lightbulb, title: 'Explains every wrong answer', desc: 'Not just "incorrect." Kino breaks down why the right answer is right, in plain language.' },
]

export default function Features() {
  return (
    <section className="relative py-24 px-6 overflow-hidden" style={{ background: c.surface }}>
      {/* Subtle blurry glow follows cursor */}
      <MouseGlow mode="blur" />

      <div className="relative z-10 max-w-5xl mx-auto">
        <h2 className="font-bold text-3xl md:text-4xl tracking-tight mb-4 text-center" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
          What to expect
        </h2>
        <p className="text-center mb-14" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          Everything you need to go from reading to actually remembering.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              whileHover={{ y: -4, borderColor: c.brand }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="rounded-xl p-4 md:p-5 cursor-default flex md:block items-start gap-3 md:gap-0"
              style={{ background: c.card, border: `1px solid ${c.border}` }}
            >
              <div className="w-9 h-9 md:w-auto md:h-auto md:mb-3 rounded-lg md:rounded-none flex items-center justify-center flex-shrink-0" style={{ background: 'transparent' }}>
                <f.icon size={20} strokeWidth={2} style={{ color: c.brand }} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm md:text-base mb-1 md:mb-1.5 leading-tight" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{f.title}</h3>
                <p className="text-xs md:text-sm leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{f.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
