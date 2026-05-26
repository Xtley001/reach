import { useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../../lib/toast';
import { Avatar, AvatarLightbox } from '../../components/AvatarLightbox';

export default function MinisterProfile() {
  const { user, refreshUser, logout } = useAuth();
  const [lightbox, setLightbox] = useState(false);
  const [form, setForm]         = useState({ name: user?.name || '' });
  const [saving, setSaving]     = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateProfile(form);
      await refreshUser();
      toast('Profile updated', 'success');
    } catch (e) { toast(e.message || 'Failed', 'error'); }
    setSaving(false);
  }

  return (
    <div className="page">
      <div className="page-header"><div className="page-title">Profile</div></div>
      <div className="page-body">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <Avatar src={user?.avatar_url} name={user?.name} size={72} onClick={() => setLightbox(true)} />
          <button className="btn btn-ghost btn-sm" onClick={() => setLightbox(true)}>Change photo</button>
        </div>

        <div className="form-group">
          <label className="field-label">Display Name</label>
          <input className="field-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>

        <div style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12, marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Role (read-only)</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>minister</div>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', maxWidth: 320, height: 44 }} onClick={save} disabled={saving}>
          {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Save Changes'}
        </button>

        <div className="divider" style={{ marginTop: 32 }} />

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--red)', marginBottom: 12 }}>Danger Zone</div>
          <button className="btn btn-danger" onClick={() => { if (confirm('Sign out from all devices?')) api.revokeAll().then(() => { toast('All sessions revoked', 'warning'); logout(); }); }}>
            Reset All Active Sessions
          </button>
        </div>

        <AvatarLightbox
          src={user?.avatar_url} name={user?.name}
          open={lightbox} onClose={() => setLightbox(false)}
          editable onEdit={() => toast('Upload coming soon', 'warning')}
        />
      </div>
    </div>
  );
}
