import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { PageSkeleton, EmptyState, Icon } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function MinisterCampaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showNew, setShowNew]     = useState(false);
  const [form, setForm]           = useState({ name: '', target_count: '', programme_date: '', venue: '' });
  const [saving, setSaving]       = useState(false);
  const [editing, setEditing]     = useState(null);
  const [editForm, setEditForm]   = useState({});

  useEffect(() => {
    api.listCampaigns().then(d => { setCampaigns(d.campaigns || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function create() {
    if (!form.name.trim()) { toast('Campaign name required', 'error'); return; }
    setSaving(true);
    try {
      await api.createCampaign({ name: form.name.trim(), target_count: parseInt(form.target_count) || null, programme_date: form.programme_date || null, venue: form.venue || null });
      toast('Campaign created', 'success');
      setShowNew(false);
      setForm({ name: '', target_count: '', programme_date: '', venue: '' });
      api.listCampaigns().then(d => setCampaigns(d.campaigns || []));
    } catch (e) { toast(e.message || 'Failed', 'error'); }
    setSaving(false);
  }

  function startEdit(c) {
    setEditing(c.id);
    setEditForm({ name: c.name, target_count: c.target_count || '', programme_date: c.programme_date ? c.programme_date.slice(0, 16) : '', venue: c.venue || '' });
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.updateCampaign(editing, {
        name: editForm.name.trim(),
        target_count: parseInt(editForm.target_count) || null,
        programme_date: editForm.programme_date || null,
        venue: editForm.venue || null,
      });
      toast('Campaign updated', 'success');
      setEditing(null);
      api.listCampaigns().then(d => setCampaigns(d.campaigns || []));
    } catch (e) { toast(e.message || 'Failed', 'error'); }
    setSaving(false);
  }

  async function archiveCampaign(id) {
    if (!window.confirm('Archive this campaign?')) return;
    try {
      await api.archiveCampaign(id);
      toast('Campaign archived', 'success');
      api.listCampaigns().then(d => setCampaigns(d.campaigns || []));
    } catch (e) { toast(e.message || 'Failed to archive', 'error'); }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div className="page-title">Campaigns</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNew(!showNew)}>+ New</button>
      </div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {showNew && (
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>New Campaign</div>
            {[['name','Campaign Name',true],['target_count','Target Count'],['venue','Venue']].map(([k,l,req]) => (
              <div key={k} className="form-group">
                <label className="field-label">{l}{req && <span className="required">*</span>}</label>
                <input className="field-input" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="form-group">
              <label className="field-label">Programme Date</label>
              <input className="field-input" type="datetime-local" value={form.programme_date} onChange={e => setForm(f => ({ ...f, programme_date: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={create} disabled={saving}>
                {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Create'}
              </button>
            </div>
          </div>
        )}
        {loading ? <PageSkeleton /> : campaigns.length === 0 ? <EmptyState icon={<Icon name="document" size={32} />} message="No campaigns yet." /> : campaigns.map(c => (
          <div key={c.id} className="card">
            {editing === c.id ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Edit Campaign</div>
                {[['name','Campaign Name',true],['target_count','Target Count'],['venue','Venue']].map(([k,l,req]) => (
                  <div key={k} className="form-group">
                    <label className="field-label">{l}{req && <span className="required">*</span>}</label>
                    <input className="field-input" value={editForm[k] || ''} onChange={e => setEditForm(f => ({ ...f, [k]: e.target.value }))} />
                  </div>
                ))}
                <div className="form-group">
                  <label className="field-label">Programme Date</label>
                  <input className="field-input" type="datetime-local" value={editForm.programme_date || ''} onChange={e => setEditForm(f => ({ ...f, programme_date: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
                    {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                    {c.venue && <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.venue}</div>}
                    {c.programme_date && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>{new Date(c.programme_date).toLocaleDateString('en-NG')}</div>}
                    {c.target_count && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Target: {c.target_count.toLocaleString()}</div>}
                  </div>
                  <span className={`badge ${c.status === 'active' ? 'badge-green' : ''}`}>{c.status}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
                  {c.status === 'active' && (
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => archiveCampaign(c.id)}>Archive</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
