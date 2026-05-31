import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Home, Search } from 'lucide-react'
import { theme as c } from '../theme'

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: c.bg }}>
      <div className="relative max-w-md w-full text-center">
        {/* Decorative grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.04] -z-10"
          style={{
            backgroundImage: `linear-gradient(${c.text} 1px, transparent 1px), linear-gradient(90deg, ${c.text} 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.h1
            className="font-extrabold tracking-tight leading-none mb-4"
            style={{
              fontFamily: 'var(--font-space)',
              color: c.brand,
              fontSize: 'clamp(96px, 24vw, 180px)',
            }}
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            404
          </motion.h1>

          <h2 className="font-bold text-2xl md:text-3xl mb-3" style={{ fontFamily: 'var(--font-space)', color: c.text }}>
            Page off the map
          </h2>
          <p className="text-sm md:text-base mb-8 max-w-sm mx-auto leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>
            We couldn't find what you were looking for. The page might be moved, renamed, or not built yet.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/dashboard"
              className="flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl no-underline cursor-pointer"
              style={{
                fontFamily: 'var(--font-space)',
                background: c.brand,
                color: c.bg,
                boxShadow: `0 0 20px ${c.brand}33`,
              }}
            >
              <Home size={15} />
              Back to dashboard
            </Link>
            <Link
              to="/"
              className="flex items-center gap-2 text-sm font-medium px-5 py-3 rounded-xl no-underline cursor-pointer"
              style={{
                fontFamily: 'var(--font-space)',
                background: c.surface,
                color: c.text,
                border: `1px solid ${c.border}`,
              }}
            >
              <Search size={14} />
              Landing page
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
