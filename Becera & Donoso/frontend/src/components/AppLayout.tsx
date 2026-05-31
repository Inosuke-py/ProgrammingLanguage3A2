import { Link, Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Dog, Award, Trophy, GraduationCap, Flame, Plus, LogOut, Home, Crown,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { theme as c } from '../theme'
import { useState } from 'react'
import UploadModal from './UploadModal'
import LiveToast from './LiveToast'
import NotificationBell from './NotificationBell'
import UserSearch from './UserSearch'

const navItems = [
  { to: '/badges', icon: Award, label: 'Badges' },
  { to: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
  { to: '/classrooms', icon: GraduationCap, label: 'Classrooms' },
  { to: '/challenges', icon: Flame, label: 'Challenges' },
]

export default function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [showUpload, setShowUpload] = useState(false)

  // Determine active nav item
  const isActive = (to: string) => {
    return location.pathname.startsWith(to)
  }

  // Dashboard is active when on /dashboard
  const isDashboard = location.pathname === '/dashboard'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: c.bg }}>
      {/* ─── Top Nav ─────────────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 px-4 md:px-8"
        style={{ background: c.surface, borderBottom: `1px solid ${c.border}` }}
      >
        <div className="max-w-[1600px] mx-auto flex items-center justify-between h-14">
          {/* Left: Logo + Nav */}
          <div className="flex items-center gap-4 md:gap-8">
            <Link to="/dashboard" className="flex items-center gap-3 no-underline">
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

            <nav className="hidden md:flex items-center gap-0.5 h-14">
              {navItems.map(({ to, icon: Icon, label }) => {
                const active = isActive(to)
                return (
                  <Link
                    key={to}
                    to={to}
                    className="group relative flex items-center gap-2 text-sm font-medium px-3 h-14 no-underline whitespace-nowrap"
                    style={{
                      fontFamily: 'var(--font-space)',
                      color: active ? c.text : c.muted,
                      transition: 'color 150ms cubic-bezier(0.25, 1, 0.5, 1)',
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.color = c.text
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.color = c.muted
                    }}
                  >
                    {/* Hover background pill */}
                    <span
                      className="absolute inset-x-1 inset-y-3 rounded-lg opacity-0 group-hover:opacity-100"
                      style={{
                        background: active ? `${c.brand}10` : `${c.text}08`,
                        transition: 'opacity 150ms cubic-bezier(0.25, 1, 0.5, 1)',
                      }}
                    />
                    <Icon
                      size={15}
                      className="relative z-10 transition-colors"
                      style={{
                        color: active ? c.brand : c.muted,
                        transitionDuration: '150ms',
                        transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.5, 1)',
                      }}
                    />
                    <span className="relative z-10">
                      {label}
                    </span>
                    {/* Active indicator bar */}
                    {active && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
                        style={{ background: c.brand }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>

          {/* Right: Upload + Avatar + Logout */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowUpload(true)}
              className="hidden md:flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg cursor-pointer"
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
              <Plus size={14} />
              Upload
            </button>
            <div className="hidden md:block">
              <UserSearch />
            </div>
            <div className="md:hidden">
              <UserSearch compact />
            </div>
            <NotificationBell />
            {(user?.role === 'admin' || user?.role === 'moderator') && (
              <Link
                to="/admin"
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 md:px-3 py-2 rounded-lg no-underline cursor-pointer"
                style={{ fontFamily: 'var(--font-space)', background: `${c.purple}12`, color: c.purple, border: `1px solid ${c.purple}25` }}
                title="Admin Panel"
              >
                <Crown size={12} />
                <span className="hidden md:inline">Admin</span>
              </Link>
            )}
            {user?.picture && (
              <Link to={user.username ? `/u/${user.username}` : `/u/id/${user.user_number || user.id}`} className="no-underline" title="Your profile">
                <img
                  src={user.picture}
                  alt=""
                  className="w-8 h-8 rounded-full border-2 cursor-pointer transition-transform hover:scale-105"
                  style={{ borderColor: c.border }}
                />
              </Link>
            )}
            <button
              onClick={logout}
              className="p-2 rounded-lg cursor-pointer"
              style={{
                color: c.muted,
                transition: 'color 150ms cubic-bezier(0.25, 1, 0.5, 1), background 150ms cubic-bezier(0.25, 1, 0.5, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = c.text
                e.currentTarget.style.background = `${c.text}08`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = c.muted
                e.currentTarget.style.background = 'transparent'
              }}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* ─── Mobile Bottom Nav ─────────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around py-2.5 px-1"
        style={{ background: c.surface, borderTop: `1px solid ${c.border}` }}
      >
        {navItems.slice(0, 2).map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-0.5 no-underline"
            style={{ fontFamily: 'var(--font-space)' }}
          >
            <Icon size={20} style={{ color: isActive(to) ? c.brand : c.muted }} />
            <span className="text-[9px] font-medium" style={{ color: isActive(to) ? c.brand : c.muted }}>
              {label}
            </span>
          </Link>
        ))}
        {isDashboard ? (
          <button
            onClick={() => setShowUpload(true)}
            className="flex flex-col items-center gap-0.5 cursor-pointer"
            style={{ fontFamily: 'var(--font-space)' }}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: c.brand }}>
              <Plus size={18} style={{ color: c.bg }} />
            </div>
          </button>
        ) : (
          <Link
            to="/dashboard"
            className="flex flex-col items-center gap-0.5 no-underline"
            style={{ fontFamily: 'var(--font-space)' }}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: c.brand }}>
              <Home size={18} style={{ color: c.bg }} />
            </div>
          </Link>
        )}
        {navItems.slice(2).map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-col items-center gap-0.5 no-underline"
            style={{ fontFamily: 'var(--font-space)' }}
          >
            <Icon size={20} style={{ color: isActive(to) ? c.brand : c.muted }} />
            <span className="text-[9px] font-medium" style={{ color: isActive(to) ? c.brand : c.muted }}>
              {label}
            </span>
          </Link>
        ))}
      </nav>

      {/* ─── Page Content ──────────────────────────────────────────────── */}
      <main className="flex-1 pt-14 pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* ─── Upload Modal ──────────────────────────────────────────────── */}
      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onUploaded={() => setShowUpload(false)}
      />

      {/* ─── Live Notifications ────────────────────────────────────────── */}
      <LiveToast />
    </div>
  )
}
