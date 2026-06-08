import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Lightbulb, LayoutDashboard, Users, BookOpen, Brain, Activity,
  FileText, Menu, X, LogOut, ChevronLeft, Gamepad2
} from 'lucide-react';
import useAuthStore from '../../store/useAuthStore';
import Avatar from '../../components/shared/Avatar';
import './AdminLayout.css';

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll when mobile sidebar is open
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
  };

  const navItems = [
    { to: '/admin', icon: LayoutDashboard, label: 'Overview', end: true },
    { to: '/admin/users', icon: Users, label: 'Users' },
    { to: '/admin/quizzes', icon: BookOpen, label: 'Quizzes' },
    { to: '/admin/modules', icon: FileText, label: 'Modules' },
    { to: '/admin/ai', icon: Brain, label: 'AI Usage' },
    { to: '/admin/game', icon: Gamepad2, label: 'Game Mode' },
    { to: '/admin/activity', icon: Activity, label: 'Activity' },
  ];

  const sidebar = (
    <>
      <div className="admin-sidebar__header">
        <Lightbulb size={24} strokeWidth={1.5} className="admin-sidebar__logo-icon" />
        {!collapsed && <span className="admin-sidebar__logo-text text-serif">Lexara</span>}
        {!collapsed && <span className="admin-sidebar__badge">Admin</span>}
        <button
          className="admin-sidebar__collapse-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label="Toggle sidebar"
        >
          <ChevronLeft size={16} className={collapsed ? 'rotated' : ''} />
        </button>
      </div>

      <nav className="admin-sidebar__nav">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
            }
            onClick={() => setMobileOpen(false)}
          >
            <item.icon size={18} />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="admin-sidebar__footer">
        {/* Identity first — passive info, sits above the action group */}
        {user && (
          <div className="admin-sidebar__user">
            <Avatar
              src={user.avatar_url}
              name={user.display_name}
              size={36}
              className="admin-sidebar__avatar"
            />
            {!collapsed && (
              <div className="admin-sidebar__user-info">
                <span className="admin-sidebar__user-name">{user.display_name}</span>
                <span className="admin-sidebar__user-role">Administrator</span>
              </div>
            )}
          </div>
        )}

        {/* Action group — both leave the admin panel, kept together. */}
        <NavLink to="/dashboard" className="admin-sidebar__link" onClick={() => setMobileOpen(false)}>
          <ChevronLeft size={18} />
          {!collapsed && <span>Back to App</span>}
        </NavLink>
        <button className="admin-sidebar__link" onClick={handleLogout}>
          <LogOut size={18} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </>
  );

  return (
    <div className={`admin-layout ${collapsed ? 'admin-layout--collapsed' : ''}`}>
      {/* Desktop sidebar */}
      <aside className="admin-sidebar admin-sidebar--desktop">
        {sidebar}
      </aside>

      {/* Mobile hamburger */}
      <button className="admin-mobile-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={22} />
      </button>

      {/* Mobile sidebar portal */}
      {mobileOpen && (
        <>
          <div className="admin-overlay" onClick={() => setMobileOpen(false)} />
          <aside className="admin-sidebar admin-sidebar--mobile admin-sidebar--mobile-open">
            <button className="admin-sidebar__close" onClick={() => setMobileOpen(false)}>
              <X size={22} />
            </button>
            {sidebar}
          </aside>
        </>
      )}

      {/* Main content */}
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
