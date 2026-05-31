import { motion } from 'framer-motion'
import { theme as c } from '../../theme'
import MouseGlow from './MouseGlow'
import FloatingParticles from './FloatingParticles'

const steps = [
  { num: '01', title: 'DROP YOUR PDF', desc: 'Lecture notes, textbook chapters, study guides. Kino parses the structure.' },
  { num: '02', title: 'CONFIGURE YOUR RUN', desc: 'Pick question types, difficulty, and count. Or hit "Surprise me" for a random challenge.' },
  { num: '03', title: 'PLAY & LEARN', desc: 'Answer questions, build streaks, earn XP. Every wrong answer teaches you why.' },
]

export default function HowItWorks() {
  return (
    <section className="relative py-24 px-6 overflow-hidden" style={{ background: c.bg }}>
      {/* Reactive grid glow follows cursor */}
      <MouseGlow mode="grid" />

      {/* Floating particles */}
      <FloatingParticles />

      {/* Grid overlay (matches Hero) */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `linear-gradient(${c.text} 1px, transparent 1px), linear-gradient(90deg, ${c.text} 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

      <div className="relative z-10 max-w-4xl mx-auto">
        <h2 className="font-bold text-3xl md:text-4xl tracking-tight mb-14 text-center" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
          How to play
        </h2>
        <div className="relative">
          {/* Connecting line */}
          <div className="absolute left-6 top-0 bottom-0 w-px hidden md:block" style={{ background: c.border }} />
          <div className="space-y-12">
            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15, duration: 0.5 }}
                className="flex gap-6 items-start md:pl-14 relative"
              >
                <div className="absolute left-4 top-2 w-4 h-4 rounded-full hidden md:block" style={{ background: c.brand, boxShadow: `0 0 12px ${c.brand}66` }} />
                <div>
                  <span className="text-xs font-bold tracking-widest" style={{ fontFamily: 'var(--font-space)', color: c.brand }}>{s.num}</span>
                  <h3 className="font-bold text-xl mt-1 mb-2" style={{ fontFamily: 'var(--font-space)', color: c.text }}>{s.title}</h3>
                  <p className="leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{s.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
