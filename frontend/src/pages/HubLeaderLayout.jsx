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
  { to: 'dashboard',  label: 'Dashboard' },
  { to: 'volunteers', label: 'Volunteers' },
  { to: 'contacts',   label: 'Contacts' },
  { to: 'logistics',  label: 'Transport' },
  { to: 'templates',  label: 'Templates' },
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
              {n.label}
            </NavLink>
          ))}
          <NavLink to="/hub/profile" className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}>
            Profile
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

        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
              {n.label.slice(0, 5)}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
