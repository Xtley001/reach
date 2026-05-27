import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { PageSkeleton, EmptyState } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function MinisterHubs() {
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
        ) : hubs.map(h => (
          <div key={h.hub_id} className="card">
            {editing === h.hub_id ? <FormCard /> : (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{h.hub_name}</div>
                    {h.hub_zone && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{h.hub_zone}</div>}
                    {h.hub_location && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{h.hub_location}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{h.volunteer_count} volunteers</div>
                    {h.leader_name && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Leader: {h.leader_name}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(h)}>Edit</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
