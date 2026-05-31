import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { theme as c } from '../../theme'
import MouseGlow from './MouseGlow'
import FloatingParticles from './FloatingParticles'

export default function FooterCTA() {
  return (
    <section className="relative py-24 px-6 overflow-hidden" style={{ background: c.bg }}>
      <MouseGlow mode="grid" />
      <FloatingParticles />

      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `linear-gradient(${c.text} 1px, transparent 1px), linear-gradient(90deg, ${c.text} 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <h2 className="font-bold text-3xl md:text-4xl tracking-tight mb-4" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
          Ready to start your run?
        </h2>
        <p className="text-lg mb-8" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
          One PDF. One browser tab. Infinite XP.
        </p>
        <Link to="/login">
          <motion.span
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
            className="inline-block font-semibold text-base px-8 py-4 rounded-xl cursor-pointer"
            style={{ fontFamily: 'var(--font-space)', background: c.brand, color: c.bg, boxShadow: `0 0 30px ${c.brand}44` }}
          >
            Play now →
          </motion.span>
        </Link>
      </div>
    </section>
  )
}
