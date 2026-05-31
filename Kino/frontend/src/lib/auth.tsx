import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import api from './api'
import { clearCache } from './queryCache'
import { getExplorerFlag, clearExplorerFlags } from './explorer'

interface User {
  id: string
  user_number: number | null
  email: string
  name: string
  username: string
  picture: string | null
  xp: number
  level: number
  streak: number
  role: string
}

interface BadgeAward {
  key: string
  name: string
  description: string
  icon: string
  rarity: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (credential: string) => Promise<BadgeAward | null>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Restore session from localStorage
    const savedToken = localStorage.getItem('kino_token')
    const savedUser = localStorage.getItem('kino_user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }
    setIsLoading(false)
  }, [])

  const login = async (credential: string): Promise<BadgeAward | null> => {
    const explorer_flag = getExplorerFlag()
    const response = await api.post('/auth/google', {
      credential,
      ...(explorer_flag ? { explorer_flag } : {}),
    })
    const { access_token, user: userData, badge_earned } = response.data

    localStorage.setItem('kino_token', access_token)
    localStorage.setItem('kino_user', JSON.stringify(userData))
    setToken(access_token)
    setUser(userData)

    // Clear explorer breadcrumbs so the badge can only ever be granted once
    // per browser, regardless of whether the backend awarded it (e.g. user
    // already had it from a previous session).
    if (explorer_flag) clearExplorerFlags()

    return badge_earned ?? null
  }

  const logout = () => {
    localStorage.removeItem('kino_token')
    localStorage.removeItem('kino_user')
    setToken(null)
    setUser(null)
    clearCache()
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login')
    }
  }, [user, isLoading, navigate])

  if (isLoading) return null
  if (!user) return null
  return <>{children}</>
}
