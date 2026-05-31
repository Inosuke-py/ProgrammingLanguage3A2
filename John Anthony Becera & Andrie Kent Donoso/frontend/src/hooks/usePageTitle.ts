import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const titleMap: { match: (path: string) => boolean; title: string }[] = [
  { match: (p) => p.startsWith('/admin'), title: 'Kino — Admin Panel' },
  { match: (p) => p.startsWith('/u/'), title: 'Kino — User Profile' },
  { match: (p) => p.startsWith('/challenges'), title: 'Kino — Finding Challenges' },
  { match: (p) => p.startsWith('/badges'), title: 'Kino — Analyzing Badges' },
  { match: (p) => p.startsWith('/leaderboard'), title: 'Kino — Viewing Leaderboards' },
  { match: (p) => p.startsWith('/classrooms'), title: 'Kino — Classroom' },
  { match: (p) => p.startsWith('/viewer'), title: 'Kino — Study' },
  { match: (p) => p.startsWith('/quiz'), title: 'Kino — Answering Quiz' },
  { match: (p) => p.startsWith('/results'), title: 'Kino — Quiz Results' },
  { match: (p) => p.startsWith('/review'), title: 'Kino — Reviewing Mistakes' },
  { match: (p) => p.startsWith('/battle'), title: 'Kino — Page Not Found' },
  { match: (p) => p.startsWith('/rooms'), title: 'Kino — Study Rooms' },
  { match: (p) => p.startsWith('/dashboard'), title: 'Kino — Dashboard' },
  { match: (p) => p.startsWith('/login'), title: 'Kino — Sign In' },
  { match: (p) => p.startsWith('/terms'), title: 'Kino — Terms of Service' },
  { match: (p) => p.startsWith('/privacy'), title: 'Kino — Privacy Policy' },
  { match: (p) => p === '/', title: 'Kino — Study Like You\'re Gaming' },
]

const DEFAULT_TITLE = 'Kino — Study Like You\'re Gaming'

export function usePageTitle() {
  const location = useLocation()

  useEffect(() => {
    const match = titleMap.find((t) => t.match(location.pathname))
    document.title = match ? match.title : DEFAULT_TITLE
  }, [location.pathname])
}
