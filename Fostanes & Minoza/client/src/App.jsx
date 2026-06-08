import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useAuthStore from './store/useAuthStore';

import Navbar from './components/shared/Navbar';
import ScrollToTop from './components/shared/ScrollToTop';
import Home from './pages/Home';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import CreateQuiz from './pages/CreateQuiz';
import TakeQuiz from './pages/TakeQuiz';
import Results from './pages/Results';
import Modules from './pages/Modules';
import ModuleDetails from './pages/ModuleDetails';
import ModuleViewer from './pages/ModuleViewer';
import ExploreQuizzes from './pages/ExploreQuizzes';
import About from './pages/About';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';

// Game Mode pages — lazy-loaded so the Socket.IO client and the
// game UI are only fetched on /game/* routes. Users on Dashboard,
// Modules, Quiz pages, etc. never download this code.
const GameLobbyList = lazy(() => import('./pages/game/GameLobbyList'));
const GameLobby = lazy(() => import('./pages/game/GameLobby'));
const GamePlay = lazy(() => import('./pages/game/GamePlay'));
const GameStats = lazy(() => import('./pages/game/GameStats'));

// Admin pages
import AdminLayout from './pages/admin/AdminLayout';
import AdminOverview from './pages/admin/AdminOverview';
import AdminUsers from './pages/admin/AdminUsers';
import AdminQuizzes from './pages/admin/AdminQuizzes';
import AdminModules from './pages/admin/AdminModules';
import AdminAI from './pages/admin/AdminAI';
import AdminActivity from './pages/admin/AdminActivity';
import AdminGameMode from './pages/admin/AdminGameMode';

function ProtectedRoute({ children, allowGuest = false }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-surface-0)',
      }}>
        <div className="skeleton" style={{ width: 200, height: 4, borderRadius: 999 }} />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  // Guest sessions are scoped to quiz-taking + their own results.
  // Any other protected route silently redirects them home.
  if (user.role === 'guest' && !allowGuest) return <Navigate to="/" replace />;
  return children;
}

function AdminRoute({ children }) {
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-surface-0)',
      }}>
        <div className="skeleton" style={{ width: 200, height: 4, borderRadius: 999 }} />
      </div>
    );
  }

  if (!user || user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return children;
}

function AppLayout() {
  const location = useLocation();
  const isViewerPage = /^\/modules\/[^/]+\/read$/.test(location.pathname);
  const isAdminPage = location.pathname.startsWith('/admin');

  // Admin pages use their own layout (no top navbar)
  if (isAdminPage) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
          <Route index element={<AdminOverview />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="quizzes" element={<AdminQuizzes />} />
          <Route path="modules" element={<AdminModules />} />
          <Route path="ai" element={<AdminAI />} />
          <Route path="activity" element={<AdminActivity />} />
          <Route path="game" element={<AdminGameMode />} />
        </Route>
      </Routes>
    );
  }

  return (
    <>
      {!isViewerPage && <Navbar />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/about" element={<About />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/create" element={<ProtectedRoute><CreateQuiz /></ProtectedRoute>} />
          <Route path="/quiz/:id" element={<TakeQuiz />} />
          <Route path="/results/:attemptId" element={<ProtectedRoute allowGuest><Results /></ProtectedRoute>} />
          <Route path="/modules" element={<ProtectedRoute><Modules /></ProtectedRoute>} />
          <Route path="/explore" element={<ExploreQuizzes />} />
          <Route path="/modules/:id" element={<ProtectedRoute><ModuleDetails /></ProtectedRoute>} />
          <Route path="/modules/:id/read" element={<ModuleViewer />} />

          {/* Game Mode (Quiz Bowl) — desktop-only, code-split, auth-gated. */}
          <Route path="/game" element={
            <ProtectedRoute>
              <Suspense fallback={<div className="skeleton" style={{ width: 200, height: 4, margin: '40px auto' }} />}>
                <GameLobbyList />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/game/lobby/:id" element={
            <ProtectedRoute>
              <Suspense fallback={<div className="skeleton" style={{ width: 200, height: 4, margin: '40px auto' }} />}>
                <GameLobby />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/game/play/:lobbyId" element={
            <ProtectedRoute>
              <Suspense fallback={<div className="skeleton" style={{ width: 200, height: 4, margin: '40px auto' }} />}>
                <GamePlay />
              </Suspense>
            </ProtectedRoute>
          } />
          <Route path="/game/stats" element={
            <ProtectedRoute>
              <Suspense fallback={<div className="skeleton" style={{ width: 200, height: 4, margin: '40px auto' }} />}>
                <GameStats />
              </Suspense>
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppLayout />
    </BrowserRouter>
  );
}
