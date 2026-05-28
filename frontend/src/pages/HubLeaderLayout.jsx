import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/ThemeToggle';
import HubDashboard  from './hub/HubDashboard';
import HubVolunteers from './hub/HubVolunteers';
import HubContacts   from './hub/HubContacts';
import HubLogistics  from './hub/HubLogistics';
import HubTemplates  from './hub/HubTemplates';
import HubProfile    from './hub/HubProfile';

const NAV = [
  {
    to: 'dashboard',
    label: 'Dashboard',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/></svg>,
  },
  {
    to: 'volunteers',
    label: 'Volunteers',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  },
  {
    to: 'contacts',
    label: 'Contacts',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>,
  },
  {
    to: 'logistics',
    label: 'Transport',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  },
  {
    to: 'templates',
    label: 'Templates',
    icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  },
];

export default function HubLeaderLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout-outer">
      <div className="sidebar desktop-only">
        <div className="sidebar-header">
          <div className="sidebar-brand">REACH</div>
          <div className="sidebar-role">hub leader</div>
          {user?.name && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{user.name}</div>}
        </div>
        <div className="sidebar-body">
          {NAV.map(n => (
            <NavLink key={n.to} to={`/hub/${n.to}`} className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
              {n.icon}
              <span>{n.label}</span>
            </NavLink>
          ))}
          <NavLink to="/hub/profile" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>Profile</span>
          </NavLink>
        </div>
        <div className="sidebar-footer">
          <ThemeToggle />
          <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={logout}>Sign out</button>
        </div>
      </div>

      <div className="layout-main">
        <div className="topbar mobile-only">
          <div className="topbar-brand">REACH</div>
          <ThemeToggle />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard"  element={<HubDashboard />} />
            <Route path="volunteers" element={<HubVolunteers />} />
            <Route path="contacts"   element={<HubContacts />} />
            <Route path="logistics"  element={<HubLogistics />} />
            <Route path="templates"  element={<HubTemplates />} />
            <Route path="profile"    element={<HubProfile />} />
          </Routes>
        </div>

        <nav className="nav-bar mobile-only">
          {NAV.map(n => (
            <NavLink key={n.to} to={`/hub/${n.to}`} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              {n.icon}
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
