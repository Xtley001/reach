import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { PageSkeleton, EmptyState } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function MinisterHubs() {
  const navigate  = useNavigate();
  const [hubs, setHubs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState({ name: '', zone: '', location: '' });
  const [saving, setSaving]   = useState(false);

  function loadHubs() {
    return api.getMinisterHubs()
      .then(d => { setHubs(d.hubs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadHubs(); }, []);

  function cancelForm() {
    setShowNew(false);
    setEditing(null);
    setForm({ name: '', zone: '', location: '' });
  }

  function startEdit(h) {
    setEditing(h.hub_id);
    setForm({ name: h.hub_name || '', zone: h.hub_zone || '', location: h.hub_location || '' });
    setShowNew(false);
  }

  async function save() {
    if (!form.name.trim()) { toast('Hub name is required', 'error'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.updateHub(editing, { name: form.name, zone: form.zone || null, location: form.location || null });
        toast('Hub updated', 'success');
      } else {
        await api.createHub({ name: form.name, zone: form.zone || null, location: form.location || null });
        toast('Hub created', 'success');
      }
      cancelForm();
      loadHubs();
    } catch (e) {
      toast(e.message || 'Failed to save hub', 'error');
    }
    setSaving(false);
  }

  const FormCard = () => (
    <div className="card">
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{editing ? 'Edit Hub' : 'New Hub'}</div>
      <div className="form-group">
        <label className="field-label">Hub Name <span className="required">*</span></label>
        <input className="field-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Kuti Hall Hub" />
      </div>
      <div className="form-group">
        <label className="field-label">Zone / Area</label>
        <input className="field-input" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))} placeholder="e.g. North Campus" />
      </div>
      <div className="form-group">
        <label className="field-label">Location / Landmark</label>
        <input className="field-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Kuti Gate, UI" />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-ghost" onClick={cancelForm}>Cancel</button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (editing ? 'Save Changes' : 'Create Hub')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Hubs</div>
          <div className="page-subtitle">Manage outreach hubs for the active campaign</div>
        </div>
        {!showNew && !editing && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>+ New Hub</button>
        )}
      </div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {showNew && <FormCard />}
        {loading ? <PageSkeleton /> : hubs.length === 0 && !showNew ? (
          <EmptyState icon="🏛️" message="No hubs yet. Create a hub to start inviting hub leaders." />
        ) : hubs.map(hub => {
          const confirmedPct = hub.total_contacts > 0
            ? Math.round(((hub.confirmed_count || 0) / hub.total_contacts) * 100) : 0;
          return (
            <div key={hub.hub_id} style={{
              background: 'var(--bg-2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: '16px 20px', marginBottom: 12,
            }}>
              {editing === hub.hub_id ? <FormCard /> : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{hub.hub_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{hub.hub_zone}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(hub)}>Edit</button>
                      <button className="btn btn-outline btn-sm" onClick={() => navigate(`/admin-panel/hubs/${hub.hub_id}`)}>View →</button>
                    </div>
                  </div>
                  {hub.leader_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Leader: {hub.leader_name}</span>
                      {hub.leader_phone && (
                        <a href={`https://wa.me/${hub.leader_phone.replace(/\D/g, '')}`}
                           target="_blank" rel="noopener noreferrer"
                           style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: 'var(--badge-green-bg)', color: 'var(--badge-green-text)', textDecoration: 'none' }}>
                          WA
                        </a>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                    {[
                      { val: hub.total_contacts || 0,    label: 'contacts' },
                      { val: hub.confirmed_count || 0,   label: 'confirmed', color: 'var(--green)' },
                      { val: hub.volunteer_count || 0,   label: 'volunteers' },
                    ].map(s => (
                      <div key={s.label} style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: s.color || 'var(--text)' }}>{s.val}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${confirmedPct}%`, background: 'var(--green)', borderRadius: 2 }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{confirmedPct}% confirmed</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
