import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Lightbulb, Menu, X, LogIn, LogOut, Plus, LayoutDashboard, BookOpen, Shield, Sun, Moon } from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import useThemeStore from '../../store/useThemeStore';
import Avatar from './Avatar';
import './Navbar.css';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, loginWithGoogle, logout } = useAuthStore();
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const navigate = useNavigate();
  const location = useLocation();

  // Some surfaces are intentionally dark-locked (homepage hero, module reader),
  // so a theme toggle there is misleading — clicking it changes nothing visible.
  // Hide the toggle on those routes.
  const themeToggleHidden =
    location.pathname === '/' ||
    /^\/modules\/[^/]+\/read$/.test(location.pathname);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
    setMobileOpen(false);
  };

  const navLinks = user ? (
    <>
      {user.role === 'admin' && (
        <Link to="/admin" className="navbar__link" onClick={() => setMobileOpen(false)} style={{ color: 'var(--color-accent)' }}>
          <Shield size={15} /> Admin Panel
        </Link>
      )}
      {user.role !== 'guest' && (
        <>
          <Link to="/dashboard" className="navbar__link" onClick={() => setMobileOpen(false)}>
            <LayoutDashboard size={15} /> Dashboard
          </Link>
          <Link to="/create" className="navbar__link" onClick={() => setMobileOpen(false)}>
            <Plus size={15} /> Create Quiz
          </Link>
          <Link to="/modules" className="navbar__link" onClick={() => setMobileOpen(false)}>
            <BookOpen size={15} /> Modules
          </Link>
        </>
      )}
    </>
  ) : null;

  // Right-side cluster (profile + logout / sign-in). Rendered separately
  // so the navbar can use a 3-column layout: brand | links | user.
  const userCluster = user ? (
    <>
      {!themeToggleHidden && (
        <button
          className="navbar__theme-toggle"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </button>
      )}
      <div className="navbar__user">
        <Avatar
          src={user.avatar_url}
          name={user.display_name}
          size={28}
          className="navbar__avatar"
        />
        <span className="navbar__user-name" title={user.display_name}>
          {user.display_name?.split(' ')[0]}
        </span>
      </div>
      <button className="btn btn--ghost navbar__logout" id="nav-logout" onClick={handleLogout}>
        <LogOut size={15} /> Logout
      </button>
    </>
  ) : (
    <button className="btn btn--primary" id="nav-signin" onClick={loginWithGoogle}>
      <LogIn size={15} /> Sign In with Google
    </button>
  );

  // Mobile slide-out rendered via portal so backdrop-filter on navbar doesn't break position:fixed
  const mobileMenu = mobileOpen ? createPortal(
    <>
      <div className="navbar__overlay" onClick={() => setMobileOpen(false)} />
      <div className="navbar__mobile-panel navbar__mobile-panel--open">
        <button className="navbar__mobile-close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={22} />
        </button>
        {navLinks}
        <div className="navbar__divider" />
        {userCluster}
      </div>
    </>,
    document.body
  ) : null;

  return (
    <>
      <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''} ${themeToggleHidden ? 'navbar--dark-locked' : ''}`} id="main-navbar">
        <div className="container navbar__inner">
          {/* LEFT — brand */}
          <Link to="/" className="navbar__brand" id="navbar-logo">
            <Lightbulb size={28} strokeWidth={1.5} />
            <span className="navbar__brand-text text-serif">Lexara</span>
          </Link>

          {/* CENTER — primary nav (desktop only) */}
          <div className="navbar__links navbar__links--desktop navbar__links--center">
            {navLinks}
          </div>

          {/* RIGHT — user / auth (desktop only) */}
          <div className="navbar__user-cluster navbar__user-cluster--desktop">
            {userCluster}
          </div>

          <button className="navbar__toggle" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            <Menu size={22} />
          </button>
        </div>
      </nav>

      {mobileMenu}
    </>
  );
}
