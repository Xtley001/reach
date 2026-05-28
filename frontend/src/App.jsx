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
      alignItems: 'center', justifyContent: 'center', background: 'var(--bg)',
    }}>
      <style>{`
        @keyframes reach-pulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50%       { transform: scale(1.18); opacity: 0.28; }
        }
        @keyframes reach-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 24 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '1.5px solid var(--accent)',
          animation: 'reach-pulse 1.8s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 12, borderRadius: '50%',
          background: 'var(--accent)', opacity: 0.08,
        }} />
      </div>
      <div style={{
        fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700,
        letterSpacing: '0.22em', color: 'var(--text)',
        animation: 'reach-fade-in 0.4s ease-out both',
      }}>
        REACH
      </div>
      {slowStart && (
        <div style={{
          fontSize: 11, color: 'var(--text-3)', marginTop: 12,
          fontFamily: 'var(--font-sans)', fontWeight: 400,
          animation: 'reach-fade-in 0.3s ease-out 0.3s both',
        }}>
          Starting up…
        </div>
      )}
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
