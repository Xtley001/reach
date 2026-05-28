import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { cached, TTL } from '../../lib/cache';
import { PageSkeleton, Modal } from '../../components/UI';
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
      <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 800, fontSize: 48, color: 'var(--gold)', lineHeight: 1 }}>
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
  // FIX-006: Invite modal state — lives here so dashboard button opens it inline
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteForm, setInviteForm]   = useState({ name:'', phone:'', email:'', channel:'sms', role:'hub_leader', hub_id:'' });
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [hubs, setHubs]               = useState([]);
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

  // FIX-006: Fetch hubs for invite dropdown
  useEffect(() => {
    api.listHubs().then(d => setHubs(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  async function sendInvite() {
    setInviteLoading(true);
    try {
      const result = await api.createInvite(inviteForm);
      setInviteResult(result);
      toast('Invite created', 'success');
    } catch (e) { toast(e.message || 'Failed to create invite', 'error'); }
    setInviteLoading(false);
  }

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
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

        {/* Programme countdown */}
        {d.programme_date && <Countdown targetDate={d.programme_date} />}

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{(d.total_contacts || 0).toLocaleString()}</div>
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

        {data?.target_count > 0 && (
          <div style={{
            marginBottom: 20, padding: '16px 20px',
            background: 'var(--bg-2)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Campaign Progress</span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {(data.total_contacts || 0).toLocaleString()} / {data.target_count.toLocaleString()}
              </span>
            </div>
            <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, Math.round(((data.total_contacts || 0) / data.target_count) * 100))}%`,
                background: 'var(--green)', borderRadius: 3, transition: 'width 0.5s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              {Math.round(((data.total_contacts || 0) / data.target_count) * 100)}% of target reached
            </div>
          </div>
        )}

        {/* Top performer */}
        {d.top_volunteer && (
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 'var(--radius)', background: 'var(--bg-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6"/><path d="M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0012 0V2z"/></svg></div>
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
                  <div style={{ fontSize: 28, fontFamily: 'var(--font-sans)', fontWeight: 800, color: s.color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                    {s.value || 0}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4, fontFamily: 'var(--font-sans)' }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: '🚪 Take Attendance', path: '/attend' },
            { label: '✝️ Log Decisions', path: '/decisions' },
          ].map(a => (
            <button key={a.label} className="btn btn-outline btn-sm" onClick={() => navigate(a.path)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* FIX-006: Inline invite modal — stays on dashboard, no navigation */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title={inviteResult ? 'Invite Created' : 'Invite Hub Leader'}>
        {inviteResult ? (
          <div>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', wordBreak: 'break-all', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
              {inviteResult.invite_url}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { navigator.clipboard.writeText(inviteResult.invite_url); toast('Copied', 'success'); }}>Copy Link</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(`You've been invited to join REACH: ${inviteResult.invite_url}`)}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ flex: 1, textDecoration: 'none' }}>WhatsApp</a>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>Expires in 48 hours</div>
          </div>
        ) : (
          <div>
            <div className="form-group">
              <label className="field-label">Role</label>
              <select className="field-select" value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}>
                <option value="hub_leader">Hub Leader</option>
                <option value="registration_team">Registration Team</option>
                <option value="decisions_team">Decisions Team</option>
              </select>
            </div>
            {inviteForm.role === 'hub_leader' && (
              <div className="form-group">
                <label className="field-label">Hub</label>
                <select className="field-select" value={inviteForm.hub_id} onChange={e => setInviteForm(f => ({ ...f, hub_id: e.target.value }))}>
                  <option value="">Select hub…</option>
                  {hubs.map(h => <option key={h.hub_id} value={h.hub_id}>{h.hub_name}</option>)}
                </select>
              </div>
            )}
            <div className="form-group">
              <label className="field-label">Name (optional)</label>
              <input className="field-input" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder="Pre-fill their name" />
            </div>
            <div className="form-group">
              <label className="field-label">Channel</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['sms','email'].map(ch => (
                  <button key={ch} onClick={() => setInviteForm(f => ({ ...f, channel: ch }))}
                    style={{ flex: 1, height: 40, border: `1px solid ${inviteForm.channel === ch ? 'var(--accent)' : 'var(--border)'}`, background: inviteForm.channel === ch ? 'var(--accent)' : 'transparent', color: inviteForm.channel === ch ? '#fff' : 'var(--text-2)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                    {ch === 'sms' ? 'Phone' : 'Email'}
                  </button>
                ))}
              </div>
            </div>
            {inviteForm.channel === 'sms'
              ? <div className="form-group"><label className="field-label">Phone <span className="required">*</span></label><input className="field-input" style={{ fontFamily: 'var(--font-mono)' }} type="tel" value={inviteForm.phone} onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="+2348012345678" /></div>
              : <div className="form-group"><label className="field-label">Email <span className="required">*</span></label><input className="field-input" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" /></div>
            }
            <button className="btn btn-primary" style={{ width: '100%', height: 44 }} onClick={sendInvite} disabled={inviteLoading}>
              {inviteLoading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Create Invite'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
