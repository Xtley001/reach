import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { cached, TTL } from '../../lib/cache';
import { PageSkeleton } from '../../components/UI';
import { toast } from '../../lib/toast';

function Countdown({ targetDate }) {
  const [diff, setDiff] = useState(null);
  useEffect(() => {
    function update() {
      const ms = new Date(targetDate) - new Date();
      if (ms <= 0) { setDiff(null); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      setDiff({ d, h });
    }
    update();
    const t = setInterval(update, 60000);
    return () => clearInterval(t);
  }, [targetDate]);
  if (!diff) return null;
  return (
    <div style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 48, color: 'var(--gold)', lineHeight: 1 }}>
        {diff.d}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
        day{diff.d !== 1 ? 's' : ''} {diff.h}h to go
      </div>
    </div>
  );
}

export default function MinisterDashboard() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [attendance, setAttendance] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const navigate = useNavigate();
  const refreshRef = useRef();

  async function load() {
    try {
      const d = await cached('minister:dashboard', () => api.getMinisterDashboard(), TTL.MIN_DASH);
      setData(d);
      setLastUpdated(new Date());
    } catch {}
    setLoading(false);
  }

  async function loadAttendance() {
    try {
      const d = await api.attendanceStatus();
      setAttendance(d);
    } catch {}
  }

  useEffect(() => {
    load();
    refreshRef.current = setInterval(() => { load(); if (data?.attendance_mode_open) loadAttendance(); }, 60000);
    return () => clearInterval(refreshRef.current);
  }, []);

  useEffect(() => {
    if (data?.attendance_mode_open) loadAttendance();
  }, [data?.attendance_mode_open]);

  async function toggleAttendanceMode() {
    if (!data?.active_campaign_id) { toast('No active campaign', 'error'); return; }
    const open = !data?.attendance_mode_open;
    try {
      await api.setAttendanceMode(data.active_campaign_id, open);
      toast(open ? 'Attendance mode opened' : 'Attendance mode closed', 'success');
      load();
    } catch (e) { toast(e.message || 'Failed', 'error'); }
  }

  if (loading) return (
    <div className="page">
      <div className="page-header"><div className="page-title">Dashboard</div></div>
      <div className="page-body"><PageSkeleton /></div>
    </div>
  );

  const d = data || {};

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Dashboard</div>
          {lastUpdated && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              Updated {lastUpdated.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
        </div>
        {/* P2-3.5: Navigate to volunteers page where invite modal lives */}
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin-panel/volunteers')}>
          + Invite Hub Leader
        </button>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

        {/* Programme countdown */}
        {d.programme_date && <Countdown targetDate={d.programme_date} />}

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value serif">{(d.total_contacts || 0).toLocaleString()}</div>
            <div className="stat-label">Total Contacts</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--green)' }}>{d.confirmed || 0}</div>
            <div className="stat-label">Confirmed</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{d.total_volunteers || 0}</div>
            <div className="stat-label">Volunteers</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--amber)' }}>{d.pending_approvals || 0}</div>
            <div className="stat-label">Pending</div>
          </div>
        </div>

        {/* Top performer */}
        {d.top_volunteer && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--gold-glow)', border: '1px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🏆</div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Top this week</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{d.top_volunteer.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)' }}>{d.top_volunteer.count} contacts</div>
            </div>
            <span className="badge badge-gold" style={{ marginLeft: 'auto' }}>⭐ Leader</span>
          </div>
        )}

        {/* Attendance mode panel */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Attendance Mode</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                {d.attendance_mode_open ? 'Open — gate is active' : 'Closed'}
              </div>
            </div>
            <button
              onClick={toggleAttendanceMode}
              className={`btn btn-sm ${d.attendance_mode_open ? 'btn-danger' : 'btn-outline'}`}
              style={{ minWidth: 80 }}
            >
              {d.attendance_mode_open ? 'Close Gate' : 'Open Gate'}
            </button>
          </div>

          {d.attendance_mode_open && attendance && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: 'Checked In', value: attendance.checked_in, color: 'var(--green)' },
                { label: 'Walk-Ins', value: attendance.walk_ins, color: 'var(--gold)' },
                { label: 'Not Yet', value: attendance.not_yet_arrived, color: 'var(--text-2)' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontStyle: 'italic', color: s.color, lineHeight: 1 }}>
                    {s.value || 0}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
