import { theme as c } from '../../theme'
import { Code2 } from 'lucide-react'

export default function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer
      className="px-6 pt-12 pb-6"
      style={{ borderTop: `1px solid ${c.border}`, background: c.surface }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Top row: brand + tagline */}
        <div className="flex flex-col items-center text-center gap-3 mb-10">
          <span
            className="font-bold text-2xl tracking-tight"
            style={{ fontFamily: 'var(--font-space)', color: c.text }}
          >
            KINO
          </span>
          <p
            className="text-sm max-w-md"
            style={{ fontFamily: 'var(--font-space)', color: c.muted }}
          >
            Study like you're gaming. Built locally, runs locally, learns with you.
          </p>
        </div>

        {/* Built by */}
        <div className="flex flex-col items-center gap-3 mb-10">
          <div
            className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] font-semibold"
            style={{ fontFamily: 'var(--font-space)', color: c.muted }}
          >
            <Code2 size={12} style={{ color: c.brand }} />
            Built by
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6">
            <DevName name="John Anthony Becera" />
            <span
              className="hidden sm:block w-1 h-1 rounded-full"
              style={{ background: c.border }}
            />
            <DevName name="Andrie Kent Donoso" />
          </div>
        </div>

        {/* Bottom row: copyright */}
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6"
          style={{ borderTop: `1px solid ${c.border}` }}
        >
          <p
            className="text-xs"
            style={{ fontFamily: 'var(--font-space)', color: c.muted }}
          >
            &copy; {year} Kino. All rights reserved.
          </p>
          <p
            className="text-xs"
            style={{ fontFamily: 'var(--font-space)', color: c.muted }}
          >
            Made with care, run on Mistral.
          </p>
        </div>
      </div>
    </footer>
  )
}

function DevName({ name }: { name: string }) {
  return (
    <span
      className="text-sm font-semibold"
      style={{ fontFamily: 'var(--font-space)', color: c.text }}
    >
      {name}
    </span>
  )
}
