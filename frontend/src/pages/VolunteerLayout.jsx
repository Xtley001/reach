import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/ThemeToggle';
import VolunteerHome from './volunteer/VolunteerHome';
import ContactsList from './volunteer/ContactsList';
import AddContact from './volunteer/AddContact';
import CallQueue from './volunteer/CallQueue';
import VolunteerProfile from './volunteer/VolunteerProfile';
import { getPendingSync } from '../lib/offline';

function NavIcon({ children, badge }) {
  return (
    <div style={{ position: 'relative', width: 20, height: 20 }}>
      {children}
      {badge > 0 && (
        <div style={{
          position: 'absolute', top: -4, right: -4,
          width: 14, height: 14, borderRadius: '50%',
          background: 'var(--red)', color: 'white',
          fontSize: 8, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge > 9 ? '9+' : badge}</div>
      )}
    </div>
  );
}

export default function VolunteerLayout() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();
  const [addOpen, setAddOpen] = useState(false);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    getPendingSync().then(q => setPending(q.length)).catch(() => {});
  }, []);

  if (addOpen) return (
    <div className="layout-outer">
      <div className="layout-main">
        <AddContact onDone={() => setAddOpen(false)} />
      </div>
    </div>
  );

  return (
    <div className="layout-outer">
      <div className="layout-main">
        {/* Top bar */}
        <div className="topbar">
          <div className="topbar-brand">REACH</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(pending > 0 || syncing) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span className={`sync-dot ${syncing ? '' : 'pending'}`} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
                  {syncing ? 'syncing' : pending}
                </span>
              </div>
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <Routes>
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home"     element={<VolunteerHome pending={pending} syncing={syncing} onNav={k => k === 'add' ? setAddOpen(true) : navigate(`/vol/${k}`)} />} />
            <Route path="contacts" element={<ContactsList />} />
            <Route path="queue"    element={<CallQueue />} />
            <Route path="profile"  element={<VolunteerProfile />} />
          </Routes>
        </div>

        {/* Bottom nav */}
        <nav className="nav-bar mobile-only">
          <NavLink to="/vol/home"     className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <NavIcon>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
              </svg>
            </NavIcon>
            Home
          </NavLink>

          <NavLink to="/vol/contacts" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <NavIcon>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </NavIcon>
            Contacts
          </NavLink>

          {/* Add FAB */}
          <button
            onClick={() => setAddOpen(true)}
            style={{
              width: 48, height: 48, borderRadius: 12,
              background: 'var(--accent)', color: 'var(--accent-fg)',
              border: 'none', cursor: 'pointer', fontSize: 24,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'var(--shadow)',
            }}
          >+</button>

          <NavLink to="/vol/queue" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <NavIcon badge={pending}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.79 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.9 2.17h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </NavIcon>
            Queue
          </NavLink>

          <NavLink to="/vol/profile" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <NavIcon>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </NavIcon>
            Profile
          </NavLink>
        </nav>
      </div>
    </div>
  );
}
