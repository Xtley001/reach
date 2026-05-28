/**
 * REACH — App Router
 * Volunteer: /vol/*  |  Hub Leader: /hub/*  |  Minister: /admin-panel/*
 * Registration Team: /attend  |  Decisions Team: /decisions
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense, useState, useEffect } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth, AuthProvider } from './hooks/useAuth';
import { Spinner } from './components/UI';

import PrivacyPage    from './pages/PrivacyPage';
import LandingPage    from './pages/LandingPage';
import LoginPage      from './pages/LoginPage';
import SignupPage     from './pages/SignupPage';
import HubLoginPage   from './pages/HubLoginPage';
import AdminLoginPage from './pages/AdminLoginPage';
import JoinPage       from './pages/JoinPage';
import PendingScreen  from './pages/PendingScreen';
import RejectedScreen from './pages/RejectedScreen';
import VolunteerLayout from './pages/VolunteerLayout';
import HubLeaderLayout from './pages/HubLeaderLayout';
import MinisterLayout  from './pages/MinisterLayout';

const AttendLayout  = lazy(() => import('./pages/AttendLayout'));
const DecisionsLayout = lazy(() => import('./pages/DecisionsLayout'));

function LoadingScreen({ slowStart = false }) {
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', gap: 20,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Animated volunteer heads converging */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <svg width="400" height="400" viewBox="0 0 400 400" style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.08))' }}>
          <defs>
            <style>{`
              @keyframes converge {
                0% { opacity: 0; transform: translate(var(--x), var(--y)); }
                20% { opacity: 1; }
                100% { opacity: 1; transform: translate(0, 0); }
              }
              @keyframes fadeOut {
                0% { opacity: 1; }
                100% { opacity: 0; }
              }
              .volunteer-head {
                animation: converge 2.5s ease-in-out infinite;
              }
              .volunteer-head:nth-child(1) { --x: -120px; --y: -140px; animation-delay: 0s; }
              .volunteer-head:nth-child(2) { --x: 140px; --y: -130px; animation-delay: 0.15s; }
              .volunteer-head:nth-child(3) { --x: -150px; --y: 100px; animation-delay: 0.3s; }
              .volunteer-head:nth-child(4) { --x: 160px; --y: 110px; animation-delay: 0.45s; }
              .volunteer-head:nth-child(5) { --x: -80px; --y: 150px; animation-delay: 0.6s; }
              .volunteer-head:nth-child(6) { --x: 100px; --y: -160px; animation-delay: 0.75s; }
              .volunteer-head:nth-child(7) { --x: 130px; --y: 60px; animation-delay: 0.9s; }
              .volunteer-head:nth-child(8) { --x: -140px; --y: -60px; animation-delay: 1.05s; }
            `}</style>
          </defs>
          {/* Animated converging volunteer heads */}
          {[...Array(8)].map((_, i) => (
            <g key={i} className="volunteer-head" transform="translate(200, 200)">
              {/* Head circle */}
              <circle cx="0" cy="0" r="18" fill="var(--accent)" opacity="0.8" />
              {/* Dot on top representing person */}
              <circle cx="0" cy="-22" r="3" fill="var(--accent)" opacity="0.9" />
              {/* Simple face */}
              <circle cx="-6" cy="-2" r="2" fill="var(--accent-fg)" opacity="0.7" />
              <circle cx="6" cy="-2" r="2" fill="var(--accent-fg)" opacity="0.7" />
            </g>
          ))}
          {/* Central REACH glow */}
          <circle cx="200" cy="200" r="50" fill="none" stroke="var(--accent)" strokeWidth="2" opacity="0.3" />
          <circle cx="200" cy="200" r="45" fill="var(--accent)" opacity="0.1" />
        </svg>
      </div>

      {/* Center content */}
      <div style={{ position: 'relative', zIndex: 10, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 20, fontWeight: 600, letterSpacing: '0.25em', color: 'var(--text)' }}>
          REACH
        </div>
        {/* P2-5.4: Cold start message after 2.5s */}
        {slowStart && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-sans)', fontWeight: 300, marginTop: 12, animation: 'pageIn 0.3s ease-out' }}>
            Starting up…
          </div>
        )}
      </div>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  const [slowStart, setSlowStart] = useState(false);
  useEffect(() => {
    const handler = () => setSlowStart(true);
    window.addEventListener('reach:slow-start', handler);
    return () => window.removeEventListener('reach:slow-start', handler);
  }, []);

  if (loading) return <LoadingScreen slowStart={slowStart} />;

  if (!user) return (
    <Routes>
      <Route path="/"          element={<LandingPage />} />
      <Route path="/login"     element={<LoginPage />} />
      <Route path="/signup"    element={<SignupPage />} />
      <Route path="/hub-login" element={<HubLoginPage />} />
      <Route path="/admin"     element={<AdminLoginPage />} />
      <Route path="/privacy"   element={<PrivacyPage />} />
      <Route path="/join"      element={<JoinPage />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );

  if (user.status === 'rejected') return (
    <Routes>
      <Route path="/rejected" element={<RejectedScreen />} />
      <Route path="*"         element={<Navigate to="/rejected" replace />} />
    </Routes>
  );

  if (user.status === 'pending') return (
    <Routes>
      <Route path="/pending" element={<PendingScreen />} />
      <Route path="*"        element={<Navigate to="/pending" replace />} />
    </Routes>
  );

  if (user.role === 'minister') return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/admin-panel/*" element={<MinisterLayout />} />
        <Route path="/admin"         element={<AdminLoginPage />} />
        <Route path="/attend"        element={<AttendLayout />} />
        <Route path="/decisions"     element={<DecisionsLayout />} />
        <Route path="*"              element={<Navigate to="/admin-panel/dashboard" replace />} />
      </Routes>
    </Suspense>
  );

  if (user.role === 'hub_leader') return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/hub/*" element={<HubLeaderLayout />} />
        <Route path="*"      element={<Navigate to="/hub/dashboard" replace />} />
      </Routes>
    </Suspense>
  );

  if (user.role === 'registration_team') return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/attend" element={<AttendLayout />} />
        <Route path="*"       element={<Navigate to="/attend" replace />} />
      </Routes>
    </Suspense>
  );

  if (user.role === 'decisions_team') return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/decisions" element={<DecisionsLayout />} />
        <Route path="*"          element={<Navigate to="/decisions" replace />} />
      </Routes>
    </Suspense>
  );

  // Volunteer
  return (
    <Routes>
      <Route path="/vol/*"   element={<VolunteerLayout />} />
      <Route path="/login"   element={<LoginPage />} />
      <Route path="/pending" element={<PendingScreen />} />
      <Route path="*"        element={<Navigate to="/vol/home" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}
