import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { theme as c } from '../theme'

interface Section {
  title: string
  body: string | string[]
}

interface LegalContent {
  kind: 'terms' | 'privacy'
  title: string
  effectiveDate: string
  intro: string
  sections: Section[]
}

const TERMS: LegalContent = {
  kind: 'terms',
  title: 'Terms of Service',
  effectiveDate: 'May 2026',
  intro:
    "These terms cover the small print of using Kino. They're written plainly because trust beats lawyering when you're studying.",
  sections: [
    {
      title: '1. What Kino is',
      body: 'Kino turns study materials you upload into quizzes. It is run by John Anthony Becera and Andrie Kent Donoso as part of an educational project. The service is offered for free with no premium tier or paid features at this time.',
    },
    {
      title: '2. Your account',
      body: [
        'You sign in with Google. We never see your Google password.',
        'You are responsible for what happens under your account. Pick a username you stand by, and keep your Google account secure.',
        'You must be at least 13 years old to use Kino. If you are between 13 and 18, you confirm that a parent or guardian is comfortable with you using the service.',
      ],
    },
    {
      title: '3. Your content',
      body: [
        'When you upload a PDF, PPTX, or DOCX, you keep the rights to it. You give Kino a limited right to store the file, parse it into sections, and generate questions from it so the service can work.',
        'Do not upload material you do not have the right to use. That includes copyrighted textbooks you did not buy or share rights for, leaked exam content, and content that breaks the rules in section 5.',
      ],
    },
    {
      title: '4. Material sharing',
      body: 'You can share materials with a link or with another user. Anyone with a valid share link can read the material until you revoke it or it expires (default 7 days). You are responsible for who you share with.',
    },
    {
      title: '5. Acceptable use',
      body: [
        "Don't upload anything illegal, hateful, or built to harass.",
        "Don't try to break the platform, scrape it, abuse rate limits, or evade moderation actions.",
        "Don't impersonate anyone. Reserved usernames stay reserved.",
        "Don't use Kino to cheat on exams that prohibit outside tools. We won't police your study habits, but we can't help you misuse the platform either.",
      ],
    },
    {
      title: '6. Moderation',
      body: 'Admins and moderators can warn, restrict, or remove accounts that break the rules in section 5. You will receive a notification with a reason for any moderation action.',
    },
    {
      title: '7. Service changes',
      body: 'Kino is actively developed. Features may change, be added, or be removed. We will give reasonable notice for changes that affect you in a meaningful way.',
    },
    {
      title: '8. Termination',
      body: 'You can stop using Kino at any time. We can terminate accounts that repeatedly violate these terms. If your account is terminated for cause, your uploaded materials are deleted.',
    },
    {
      title: '9. Disclaimers',
      body: 'Kino is provided as is, without warranty. AI-generated questions may be incorrect or incomplete. Always verify important answers against the source material. Kino is not a substitute for a teacher, a textbook, or your own judgment.',
    },
    {
      title: '10. Liability',
      body: 'To the extent permitted by law, the developers of Kino are not liable for indirect or consequential damages arising from your use of the service. Our total liability is limited to what you paid for the service in the past twelve months, which is currently zero.',
    },
    {
      title: '11. Contact',
      body: 'Questions about these terms? Email becera.johnanthony00@gmail.com.',
    },
  ],
}

const PRIVACY: LegalContent = {
  kind: 'privacy',
  title: 'Privacy Policy',
  effectiveDate: 'May 2026',
  intro:
    "Kino runs in a way that keeps your study materials private. This page explains exactly what we collect, why, and how to get it deleted.",
  sections: [
    {
      title: '1. What we collect',
      body: [
        "Account info from Google sign-in: your name, email, profile picture, and Google's stable user ID. Nothing else.",
        'Your study materials: the files you upload, the sections we parse from them, and the questions we generate.',
        'Activity data: quizzes you take, answers you give, badges you earn, classrooms you join, and time spent. We use this for streaks, leaderboards, and progress tracking.',
        'Technical data: rough IP-based location (for rate limiting) and last-seen timestamps for the online presence indicator.',
      ],
    },
    {
      title: '2. What we do not collect',
      body: [
        "Your Google password. We never see it.",
        'Your contacts, your other Google services, your browsing history, anything outside Kino.',
        'No third-party advertising trackers. No Facebook pixel. No Google Analytics. The page does not load anything from a marketing surveillance vendor.',
      ],
    },
    {
      title: '3. Where data lives',
      body: [
        'A PostgreSQL database hosted on Supabase, which stores your account record, activity, and references to your files.',
        'Uploaded files live on the server filesystem (currently a single AWS EC2 instance in the Asia-Pacific region).',
        "AI processing for question generation runs through Mistral's hosted API. The selected text from your materials is sent to Mistral to generate questions and definitions, then discarded by Mistral after the response is returned. Mistral does not retain it for training.",
      ],
    },
    {
      title: '4. Who sees your data',
      body: [
        'You always see your own data.',
        'Admins can view account moderation logs and aggregate platform stats. They cannot read your private materials, your quiz answers, or your messages.',
        'Materials you mark as public, share with a link, or assign to a classroom can be seen by anyone with appropriate access.',
        'We do not sell, rent, or share your data with marketers or data brokers.',
      ],
    },
    {
      title: '5. Cookies',
      body: 'Kino uses one cookie-equivalent: a JWT stored in localStorage to keep you signed in. There are no analytics cookies, ad cookies, or tracking pixels.',
    },
    {
      title: '6. Your rights',
      body: [
        'Export: ask us for a JSON dump of your account, materials, and activity. We will deliver it within 30 days.',
        'Delete: delete materials inside the app any time. To delete your full account, email the address in section 9. Account deletion is permanent and removes all your data within 7 days.',
        'Correct: edit your username, motto, equipped title, and profile picture in your profile settings.',
      ],
    },
    {
      title: '7. Children',
      body: 'Kino is not designed for children under 13. We do not knowingly collect data from children under 13. If you believe a child under 13 has signed up, contact us so we can remove the account.',
    },
    {
      title: '8. Security',
      body: [
        'All traffic is HTTPS-only. HTTP requests are redirected with HSTS.',
        'Your JWT signing key is server-side only. We rate-limit auth, upload, and AI endpoints to limit abuse.',
        'No system is perfectly secure. If you spot a vulnerability, please email us privately before disclosing publicly.',
      ],
    },
    {
      title: '9. Contact',
      body: 'Privacy questions, deletion requests, security disclosures: becera.johnanthony00@gmail.com. Real human, not a queue.',
    },
  ],
}

interface Props {
  kind: 'terms' | 'privacy'
}

export default function LegalPage({ kind }: Props) {
  const content = kind === 'terms' ? TERMS : PRIVACY

  return (
    <div className="min-h-screen flex flex-col" style={{ background: c.bg }}>
      {/* Header bar with back link */}
      <header className="px-6 md:px-10 py-5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm no-underline transition-opacity hover:opacity-80"
          style={{ fontFamily: 'var(--font-space)', color: c.muted }}
        >
          <ArrowLeft size={14} />
          Back
        </Link>
      </header>

      <main className="flex-1 px-6 md:px-10 pb-20">
        <div className="mx-auto max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          >
            <p
              className="text-[11px] uppercase tracking-[0.22em] font-semibold mb-4"
              style={{ fontFamily: 'var(--font-space)', color: c.brand }}
            >
              Effective {content.effectiveDate}
            </p>
            <h1
              className="font-bold text-4xl md:text-5xl tracking-tight mb-6"
              style={{ fontFamily: 'var(--font-space)', color: c.text }}
            >
              {content.title}
            </h1>
            <p
              className="text-base leading-relaxed mb-12"
              style={{ fontFamily: 'var(--font-space)', color: c.muted, maxWidth: '60ch' }}
            >
              {content.intro}
            </p>
          </motion.div>

          <div className="space-y-10">
            {content.sections.map((section, i) => (
              <motion.section
                key={section.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  ease: [0.16, 1, 0.3, 1],
                  delay: 0.1 + i * 0.04,
                }}
              >
                <h2
                  className="font-bold text-lg md:text-xl mb-3"
                  style={{ fontFamily: 'var(--font-space)', color: c.text }}
                >
                  {section.title}
                </h2>
                {Array.isArray(section.body) ? (
                  <ul className="space-y-2.5" style={{ maxWidth: '65ch' }}>
                    {section.body.map((item, j) => (
                      <li
                        key={j}
                        className="text-[15px] leading-relaxed pl-5 relative"
                        style={{ fontFamily: 'var(--font-space)', color: c.muted }}
                      >
                        <span
                          className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full"
                          style={{ background: c.brand, opacity: 0.6 }}
                          aria-hidden="true"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p
                    className="text-[15px] leading-relaxed"
                    style={{
                      fontFamily: 'var(--font-space)',
                      color: c.muted,
                      maxWidth: '65ch',
                    }}
                  >
                    {section.body}
                  </p>
                )}
              </motion.section>
            ))}
          </div>

          {/* Cross-link footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
            className="mt-16 pt-8 flex items-center justify-between"
            style={{ borderTop: `1px solid ${c.border}` }}
          >
            <Link
              to={kind === 'terms' ? '/privacy' : '/terms'}
              className="text-sm no-underline transition-opacity hover:opacity-80"
              style={{ fontFamily: 'var(--font-space)', color: c.brand }}
            >
              Read the {kind === 'terms' ? 'Privacy Policy' : 'Terms'}
            </Link>
            <Link
              to="/"
              className="text-sm no-underline transition-opacity hover:opacity-80"
              style={{ fontFamily: 'var(--font-space)', color: c.muted }}
            >
              Back to Kino
            </Link>
          </motion.div>
        </div>
      </main>
    </div>
  )
}
