import { useState } from 'react'
import { theme as c } from '../../theme'
import MouseGlow from './MouseGlow'

const faqs = [
  { q: 'Is Kino free to use?', a: 'Yes, completely free. No subscriptions, no hidden fees, no credit card required.' },
  { q: 'What kind of quizzes can Kino generate?', a: 'Multiple choice, true/false, fill-in-the-blank, matching, sequencing, and more. You can mix and match or let Kino pick for you.' },
  { q: 'How does Kino know what to quiz me on?', a: 'It reads the structure of your uploaded material and generates questions based on the actual content, not random trivia.' },
  { q: 'What happens when I get an answer wrong?', a: 'Kino shows you the correct answer, explains why in plain language, and points you to the exact section in your notes to review.' },
  { q: 'Can I control the difficulty?', a: 'Yes. Set it yourself with a slider, or let Kino adapt automatically based on how you perform.' },
  { q: 'Will there be multiplayer or group study?', a: 'Battle Mode and Study Rooms are on the roadmap. For now, Kino focuses on individual mastery.' },
  { q: 'What file types can I upload?', a: 'PDF is supported now. PowerPoint and Word document support is coming soon.' },
]

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="relative py-24 px-6 overflow-hidden" style={{ background: c.surface }}>
      <MouseGlow mode="blur" />
      <div className="relative z-10 max-w-2xl mx-auto">
        <h2 className="font-bold text-3xl tracking-tight mb-12 text-center" style={{ fontFamily: 'var(--font-space)', color: c.text }}>FAQ</h2>
        {faqs.map((faq, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between py-5 text-left cursor-pointer">
              <span className="font-medium pr-4" style={{ fontFamily: 'var(--font-space)', color: open === i ? c.brand : c.text }}>{faq.q}</span>
              <span className="text-xl flex-shrink-0 transition-transform duration-200" style={{ color: c.muted, transform: open === i ? 'rotate(45deg)' : 'none' }}>+</span>
            </button>
            <div className={`overflow-hidden transition-all duration-300 ${open === i ? 'max-h-40 pb-5' : 'max-h-0'}`}>
              <p className="text-[15px] leading-relaxed" style={{ fontFamily: 'var(--font-space)', color: c.muted }}>{faq.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
