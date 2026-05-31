import { Dog } from 'lucide-react'
import { Link } from 'react-router-dom'
import { theme as c } from '../../theme'

export default function Navbar() {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8"
      style={{ background: c.surface, borderBottom: `1px solid ${c.border}` }}
    >
      <div className="max-w-[1600px] mx-auto flex items-center justify-between h-14">
        {/* Left: Logo */}
        <Link to="/" className="flex items-center gap-3 no-underline">
          <span
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: c.brand, color: c.bg }}
          >
            <Dog size={18} strokeWidth={2.5} />
          </span>
          <span
            className="font-bold text-xl tracking-tight"
            style={{ fontFamily: 'var(--font-space)', color: c.text }}
          >
            KINO
          </span>
        </Link>

        {/* Right: Play now */}
        <Link
          to="/login"
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer no-underline"
          style={{
            fontFamily: 'var(--font-space)',
            background: c.brand,
            color: c.bg,
            transition: 'transform 150ms cubic-bezier(0.25, 1, 0.5, 1), box-shadow 150ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = `0 4px 12px ${c.brand}40`
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          Play now
        </Link>
      </div>
    </header>
  )
}
