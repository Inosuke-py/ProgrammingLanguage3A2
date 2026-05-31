/**
 * Curious Explorer secret badge tracking.
 *
 * Two flags live in localStorage. We never tell the user about this — it's
 * a reward for poking around before they sign up. If both flags are set
 * by the time they Google-login, the backend awards the badge.
 *
 * - kino_explorer_landing: set when the user finishes the 10-question demo
 *   on the landing page Hero.
 * - kino_explorer_login:   set when the user picks any answer on the login
 *   page QuizTease (just one question; engagement is enough).
 */

const LANDING_KEY = 'kino_explorer_landing'
const LOGIN_KEY = 'kino_explorer_login'

export function markExplorerLanding(): void {
  try {
    localStorage.setItem(LANDING_KEY, '1')
  } catch {
    // localStorage may be blocked (private mode); silently skip
  }
}

export function markExplorerLogin(): void {
  try {
    localStorage.setItem(LOGIN_KEY, '1')
  } catch {
    // ignore
  }
}

export function getExplorerFlag(): 'both' | null {
  try {
    const landing = localStorage.getItem(LANDING_KEY) === '1'
    const login = localStorage.getItem(LOGIN_KEY) === '1'
    return landing && login ? 'both' : null
  } catch {
    return null
  }
}

export function clearExplorerFlags(): void {
  try {
    localStorage.removeItem(LANDING_KEY)
    localStorage.removeItem(LOGIN_KEY)
  } catch {
    // ignore
  }
}
