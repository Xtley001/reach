import { useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../../lib/toast';
import { Avatar, AvatarLightbox } from '../../components/AvatarLightbox';

export default function HubProfile() {
  const { user, refreshUser, logout } = useAuth();
  const [lightbox, setLightbox] = useState(false);
  const [form, setForm]         = useState({ name: user?.name || '' });
  const [saving, setSaving]     = useState(false);

  async function save() {
    setSaving(true);
    try { await api.updateProfile(form); await refreshUser(); toast('Saved', 'success'); }
    catch (e) { toast(e.message || 'Failed', 'error'); }
    setSaving(false);
  }

  return (
    <div className="page">
      <div className="page-header"><div className="page-title">Profile</div></div>
      <div className="page-body">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <Avatar src={user?.avatar_url} name={user?.name} size={72} onClick={() => setLightbox(true)} />
          <button className="btn btn-ghost btn-sm" onClick={() => setLightbox(true)}>Change photo</button>
        </div>
        <div className="form-group">
          <label className="field-label">Display Name</label>
          <input className="field-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        {[['Phone', user?.phone], ['Role', 'Hub Leader'], ['Hub', user?.hub_name]].filter(([,v]) => v).map(([l, v]) => (
          <div key={l} style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{v}</div>
          </div>
        ))}
        <button className="btn btn-primary" style={{ width: '100%', maxWidth: 320, height: 44, marginTop: 8 }} onClick={save} disabled={saving}>
          {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Save Changes'}
        </button>
        <div className="divider" style={{ marginTop: 24 }} />
        <button className="btn btn-ghost" onClick={logout} style={{ color: 'var(--text-3)' }}>Sign out</button>
        <AvatarLightbox src={user?.avatar_url} name={user?.name} open={lightbox} onClose={() => setLightbox(false)} editable onEdit={() => toast('Upload coming soon', 'warning')} />
      </div>
    </div>
  );
}
