import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import { Suspense, lazy } from 'react'
import { AuthProvider } from './lib/auth'
import { BadgeProvider } from './lib/badge-context'
import { WSProvider } from './lib/ws-context'
import AppLayout from './components/AppLayout'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import { usePageTitle } from './hooks/usePageTitle'
import { theme as c } from './theme'

// Lazy-loaded routes — each page becomes its own JS chunk that the browser
// only fetches when the user navigates there. Drops first-load size by ~80%.
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const QuizPage = lazy(() => import('./pages/QuizPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))
const ViewerPage = lazy(() => import('./pages/ViewerPage'))
const ReviewPage = lazy(() => import('./pages/ReviewPage'))
const BadgesPage = lazy(() => import('./pages/BadgesPage'))
const LeaderboardPage = lazy(() => import('./pages/LeaderboardPage'))
const RoomsPage = lazy(() => import('./pages/RoomsPage'))
const ClassroomsPage = lazy(() => import('./pages/ClassroomsPage'))
const ClassroomDetailPage = lazy(() => import('./pages/ClassroomDetailPage'))
const ChallengesPage = lazy(() => import('./pages/ChallengesPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const SharedViewPage = lazy(() => import('./pages/SharedViewPage'))
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const LegalPage = lazy(() => import('./pages/LegalPage'))
const SurvivalPage = lazy(() => import('./pages/SurvivalPage'))

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

function PageTitleSync() {
  usePageTitle()
  return null
}

// Tiny inline fallback while a chunk is downloading. Keeps perceived latency
// minimal — just a centered spinner with brand color.
function ChunkFallback() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ minHeight: '60vh', background: c.bg }}
    >
      <div
        className="w-6 h-6 border-2 rounded-full animate-spin"
        style={{ borderColor: c.border, borderTopColor: c.brand }}
        aria-label="Loading"
      />
    </div>
  )
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <BrowserRouter>
        <AuthProvider>
          <WSProvider>
          <BadgeProvider>
          <PageTitleSync />
          <Suspense fallback={<ChunkFallback />}>
            <Routes>
              {/* Pages without the top nav */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/quiz/:quizId" element={<QuizPage />} />
              <Route path="/survival/:quizId" element={<SurvivalPage />} />
              <Route path="/results/:attemptId" element={<ResultsPage />} />
              <Route path="/shared/:shareToken" element={<SharedViewPage />} />
              <Route path="/viewer/:materialId" element={<ViewerPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/terms" element={<LegalPage kind="terms" />} />
              <Route path="/privacy" element={<LegalPage kind="privacy" />} />

              {/* Pages with persistent top nav */}
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/badges" element={<BadgesPage />} />
                <Route path="/leaderboard" element={<LeaderboardPage />} />
                <Route path="/battle/create" element={<NotFoundPage />} />
                <Route path="/battle/:battleId" element={<NotFoundPage />} />
                <Route path="/rooms" element={<RoomsPage />} />
                <Route path="/classrooms" element={<ClassroomsPage />} />
                <Route path="/classrooms/:classroomId" element={<ClassroomDetailPage />} />
                <Route path="/challenges" element={<ChallengesPage />} />
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/u/:username" element={<UserProfilePage />} />
                <Route path="/u/id/:id" element={<UserProfilePage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* Top-level catch-all (matches paths above this Route block) */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          </BadgeProvider>
          </WSProvider>
        </AuthProvider>
      </BrowserRouter>
    </GoogleOAuthProvider>
  )
}

export default App
