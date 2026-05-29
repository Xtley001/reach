import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, invalidate, TTL } from '../../lib/cache';
import { StatusBadge, Spinner, PageSkeleton, Modal } from '../../components/UI';
import { toast } from '../../lib/toast';
// FIX-002: Import MinisterVolunteerDetail
import MinisterVolunteerDetail from './MinisterVolunteerDetail';

export default function MinisterVolunteers() {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('all');
  const [hubFilter, setHubFilter]   = useState('');
  const [hubs,      setHubs]        = useState([]);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name:'', phone:'', email:'', channel:'sms', role:'hub_leader', hub_id:'' });
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  // FIX-002: selectedId drives MinisterVolunteerDetail drilldown
  const [selectedId, setSelectedId] = useState(null);

  function reload() {
    invalidate('minister:volunteers');
    cached('minister:volunteers', () => api.getMinisterVolunteers(), TTL.VOLUNTEERS)
      .then(d => setVolunteers(d.volunteers || []))
      .catch(() => {});
  }

  useEffect(() => {
    cached('minister:volunteers', () => api.getMinisterVolunteers(), TTL.VOLUNTEERS)
      .then(d => { setVolunteers(d.volunteers || []); setLoading(false); })
      .catch(() => setLoading(false));
    api.listHubs().then(d => setHubs(d || [])).catch(() => {});
  }, []);

  useEffect(() => {
  }, []);

  // FIX-002: Render MinisterVolunteerDetail when a volunteer is selected
  if (selectedId) {
    return (
      <MinisterVolunteerDetail
        volunteerId={selectedId}
        onBack={() => setSelectedId(null)}
        backLabel="← Volunteers"
      />
    );
  }

  const FILTERS = ['all','active','pending','rejected','hub_leader'];
  const filteredVolunteers = (hubFilter
    ? volunteers.filter(v => v.hub_id === hubFilter)
    : volunteers
  ).filter(v => {
    if (filter === 'all') return true;
    if (filter === 'hub_leader') return v.role === 'hub_leader';
    return v.status === filter;
  });

  async function sendInvite() {
    setInviteLoading(true);
    try {
      const result = await api.createInvite(inviteForm);
      setInviteResult(result);
      reload();
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select
              className="field-input"
              value={hubFilter}
              onChange={e => setHubFilter(e.target.value)}
              style={{ maxWidth: 220 }}
            >
              <option value="">All Hubs</option>
              {hubs.map(h => <option key={h.hub_id} value={h.hub_id}>{h.hub_name}</option>)}
            </select>
          </div>
          <div className="filter-row">
            {FILTERS.map(f => (
              <button key={f} className={`filter-tag${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1).replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {loading ? <PageSkeleton /> : filteredVolunteers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-msg">No volunteers match this filter.</div>
          </div>
        ) : (
          <div>
            {filteredVolunteers.map(v => (
              // FIX-002: onClick opens MinisterVolunteerDetail
              <div
                key={v.id}
                className="contact-row"
                style={{ alignItems: 'flex-start', cursor: 'pointer' }}
                onClick={() => setSelectedId(v.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{v.name || 'Unnamed'}</div>
                  {/* FIX-011 display: suppress trailing bullet when count is 0 */}
                  <div className="contact-loc">
                    {[v.hub_name || 'No hub', v.contact_count > 0 ? `${v.contact_count} contacts` : null]
                      .filter(Boolean).join(' · ')}
                  </div>
                  {v.role === 'hub_leader' && (
                    <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 2 }}>Hub Leader</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span className={`badge ${v.status === 'active' ? 'badge-green' : v.status === 'pending' ? 'badge-amber' : 'badge-red'}`}>
                    {v.status}
                  </span>
                  {v.phone && (
                    <a
                      href={`https://wa.me/${v.phone.replace('+','')}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
                      onClick={e => e.stopPropagation()}
                    >WhatsApp</a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite Modal — FIX-006 pattern applied here too */}
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
                <input className="field-input" style={{ fontFamily: 'var(--font-mono)' }} type="tel" value={inviteForm.phone} onChange={e => setInviteForm(f => ({ ...f, phone: e.target.value }))} placeholder="+2348012345678" />
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

