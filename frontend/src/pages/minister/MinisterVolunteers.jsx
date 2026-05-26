import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, invalidate, TTL } from '../../lib/cache';
import { StatusBadge, Spinner, EmptyState, PageSkeleton, Modal } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function MinisterVolunteers() {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name:'', phone:'', email:'', channel:'sms', role:'hub_leader', hub_id:'' });
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [hubs, setHubs] = useState([]);

  useEffect(() => {
    cached('minister:volunteers', () => api.getMinisterVolunteers(), TTL.VOLUNTEERS)
      .then(d => { setVolunteers(d.volunteers || []); setLoading(false); })
      .catch(() => setLoading(false));
    api.listHubs().then(d => setHubs(d || [])).catch(() => {});
  }, []);

  const FILTERS = ['all','active','pending','rejected','hub_leader'];
  const filtered = volunteers.filter(v => {
    if (filter === 'all') return true;
    if (filter === 'hub_leader') return v.role === 'hub_leader';
    return v.status === filter;
  });

  async function sendInvite() {
    setInviteLoading(true);
    try {
      const result = await api.createInvite(inviteForm);
      setInviteResult(result);
      invalidate('minister:volunteers');
      toast('Invite created', 'success');
    } catch (e) {
      toast(e.message || 'Failed to create invite', 'error');
    }
    setInviteLoading(false);
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="page-title">Volunteers</div>
          <div className="page-subtitle">{volunteers.length} total</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowInvite(true); setInviteResult(null); }}>
          + Invite Hub Leader
        </button>
      </div>

      <div className="page-body" style={{ padding: 0 }}>
        <div style={{ padding: '0 var(--space-4)' }}>
          <div className="filter-row">
            {FILTERS.map(f => (
              <button key={f} className={`filter-tag${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {loading ? <PageSkeleton /> : filtered.length === 0 ? (
          <EmptyState icon="👥" message="No volunteers match this filter." />
        ) : (
          <div>
            {filtered.map(v => (
              <div key={v.id} className="contact-row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{v.name || 'Unnamed'}</div>
                  <div className="contact-loc">{v.hub_name || 'No hub'}</div>
                  <div className="contact-meta" style={{ fontFamily: 'var(--font-mono)' }}>
                    {v.contact_count || 0} contacts · {v.role}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span className={`badge ${v.status === 'active' ? 'badge-green' : v.status === 'pending' ? 'badge-amber' : 'badge-red'}`}>
                    {v.status}
                  </span>
                  {v.phone && (
                    <a href={`https://wa.me/${v.phone.replace('+','')}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--green)', textDecoration: 'none' }}>WhatsApp</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title={inviteResult ? 'Invite Created' : 'Invite Hub Leader'}>
        {inviteResult ? (
          <div>
            <div style={{ background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', wordBreak: 'break-all', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text)' }}>
              {inviteResult.invite_url}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { navigator.clipboard.writeText(inviteResult.invite_url); toast('Copied', 'success'); }}>
                Copy Link
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`You've been invited to join REACH. Click here to create your account: ${inviteResult.invite_url}`)}`}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-outline"
                style={{ flex: 1, textDecoration: 'none' }}
              >
                Share via WhatsApp
              </a>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
              Expires in 48 hours
            </div>
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
                <label className="field-label">Hub <span className="required">*</span></label>
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
                    style={{ flex: 1, height: 40, border: `1px solid ${inviteForm.channel === ch ? 'var(--accent)' : 'var(--border)'}`, background: inviteForm.channel === ch ? 'var(--accent)' : 'transparent', color: inviteForm.channel === ch ? 'var(--accent-fg)' : 'var(--text-2)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
                    {ch === 'sms' ? 'Phone' : 'Email'}
                  </button>
                ))}
              </div>
            </div>
            {inviteForm.channel === 'sms' ? (
              <div className="form-group">
                <label className="field-label">Phone Number <span className="required">*</span></label>
                <input className="field-input" type="tel" value={inviteForm.phone} onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="+2348012345678" />
              </div>
            ) : (
              <div className="form-group">
                <label className="field-label">Email Address <span className="required">*</span></label>
                <input className="field-input" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
              </div>
            )}
            <button className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} onClick={sendInvite} disabled={inviteLoading}>
              {inviteLoading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Create Invite'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
