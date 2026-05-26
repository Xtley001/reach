import { Routes, Route, NavLink, Navigate, useNavigate, lazy, Suspense } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/ThemeToggle';
import { Spinner } from '../components/UI';
// P2-6.1: Lazy-load all minister pages — volunteers never pay recharts bundle cost
const MinisterDashboard    = lazy(() => import('./minister/MinisterDashboard'));
const MinisterVolunteers   = lazy(() => import('./minister/MinisterVolunteers'));
const MinisterDemographics = lazy(() => import('./minister/MinisterDemographics'));
const MinisterCampaigns    = lazy(() => import('./minister/MinisterCampaigns'));
const MinisterExports      = lazy(() => import('./minister/MinisterExports'));
const MinisterProfile      = lazy(() => import('./minister/MinisterProfile'));

function PageFallback() {
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner large /></div>;
}

const NAV = [
  { to: 'dashboard',    label: 'Dashboard',    icon: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
  { to: 'volunteers',   label: 'Volunteers',   icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' },
  { to: 'demographics', label: 'Demographics', icon: 'M18 20V10M12 20V4M6 20v-6' },
  { to: 'campaigns',    label: 'Campaigns',    icon: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01' },
  { to: 'exports',      label: 'Exports',      icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' },
  { to: 'profile',      label: 'Profile',      icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' },
];

function SidebarIcon({ d }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={`M${seg}`} />)}
    </svg>
  );
}

export default function MinisterLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout-outer">
      {/* Sidebar */}
      <div className="sidebar desktop-only">
        <div className="sidebar-header">
          <div className="sidebar-brand">REACH</div>
          <div className="sidebar-role">minister</div>
          {user?.name && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{user.name}</div>}
        </div>
        <div className="sidebar-body">
          {NAV.map(n => (
            <NavLink key={n.to} to={`/admin-panel/${n.to}`} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
              <SidebarIcon d={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </div>
        <div className="sidebar-footer">
          <ThemeToggle />
          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={logout}>Sign out</button>
        </div>
      </div>

      {/* Main */}
      <div className="layout-main">
        <div className="topbar mobile-only">
          <div className="topbar-brand">REACH</div>
          <ThemeToggle />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"    element={<MinisterDashboard />} />
            <Route path="volunteers"   element={<MinisterVolunteers />} />
            <Route path="demographics" element={<MinisterDemographics />} />
            <Route path="campaigns"    element={<MinisterCampaigns />} />
            <Route path="exports"      element={<MinisterExports />} />
            <Route path="profile"      element={<MinisterProfile />} />
          </Routes>
          </Suspense>
        </div>

        {/* Mobile bottom nav */}
        <nav className="nav-bar mobile-only">
          {NAV.slice(0, 5).map(n => (
            <NavLink key={n.to} to={`/admin-panel/${n.to}`} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {n.icon.split('M').filter(Boolean).map((seg, i) => <path key={i} d={`M${seg}`} />)}
              </svg>
              <span>{n.label.slice(0, 6)}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
