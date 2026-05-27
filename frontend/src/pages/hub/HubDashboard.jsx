import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, TTL } from '../../lib/cache';
import { StatusBadge, PageSkeleton } from '../../components/UI';
import { useNavigate } from 'react-router-dom';

export default function HubDashboard() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    cached('hub:dashboard', () => api.getHubDashboard(), TTL.HUB_DASH)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
    const t = setTimeout(() =>
      cached('hub:volunteers', () => api.getHubVolunteers(), TTL.VOLUNTEERS).catch(() => {}), 1500);
    return () => clearTimeout(t);
  }, []);

  if (loading) return (
    <div className="page"><div className="page-header"><div className="page-title">Dashboard</div></div>
      <div className="page-body"><PageSkeleton /></div></div>
  );

  const d = data || {};
  const daysToGo = d.programme_date
    ? Math.max(0, Math.ceil((new Date(d.programme_date) - new Date()) / 86400000))
    : null;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Hub Dashboard</div>
            {d.hub_name && <div className="page-subtitle">{d.hub_name}</div>}
          </div>
          {daysToGo !== null && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 28, color: 'var(--gold)', lineHeight: 1 }}>{daysToGo}</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>days to go</div>
            </div>
          )}
        </div>
      </div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{d.total_contacts || 0}</div>
            <div className="stat-label">Contacts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--green)' }}>{d.confirmed || 0}</div>
            <div className="stat-label">Confirmed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{d.active_volunteers || 0}</div>
            <div className="stat-label">Volunteers</div>
          </div>
          <div className="stat-card" style={{ cursor: d.pending_approvals > 0 ? 'pointer' : 'default' }}
            onClick={() => d.pending_approvals > 0 && navigate('/hub/volunteers')}>
            <div className="stat-value" style={{}}>{d.pending_approvals || 0}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'Approve Volunteers', path: '/hub/volunteers' },
            { label: 'View Transport', path: '/hub/logistics' },
            { label: 'Templates', path: '/hub/templates' },
          ].map(a => (
            <button key={a.label} className="btn btn-outline btn-sm" onClick={() => navigate(a.path)}>{a.label}</button>
          ))}
        </div>

        {d.recent_activity && d.recent_activity.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Recent Activity</div>
            {d.recent_activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < d.recent_activity.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{a.description}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>{a.time_ago}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
