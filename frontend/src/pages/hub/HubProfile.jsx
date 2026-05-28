// FIX-005: Wire avatar upload; disabled "Change photo" replaced stub toast
import { useState, useRef } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import { toast } from '../../lib/toast';
import { Avatar } from '../../components/AvatarLightbox';
import AvatarCropper from '../../components/AvatarCropper';

export default function HubProfile() {
  const { user, refreshUser, logout } = useAuth();
  const [form, setForm]           = useState({ name: user?.name || '' });
  const [saving, setSaving]       = useState(false);
  const [cropSrc, setCropSrc]     = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef              = useRef(null);
  const nameChanged = form.name !== (user?.name || '');

  async function save() {
    setSaving(true);
    try { await api.updateProfile(form); await refreshUser(); toast('Saved', 'success'); }
    catch (e) { toast(e.message || 'Failed', 'error'); }
    setSaving(false);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleCropComplete(blob) {
    setCropSrc(null);
    setUploading(true);
    try {
      await api.uploadAvatar(blob);
      await refreshUser();
      toast('Profile photo updated', 'success');
    } catch { toast('Could not upload photo. Try again.', 'error'); }
    setUploading(false);
  }

  return (
    <div className="page">
      <div className="page-header"><div className="page-title">Profile</div></div>
      <div className="page-body">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <Avatar src={user?.avatar_url} name={user?.name} size={72} />
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          <button className="btn btn-ghost btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ color: 'var(--accent)', fontSize: 12 }}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
        </div>

        {cropSrc && <AvatarCropper imageSrc={cropSrc} onCropComplete={handleCropComplete} onCancel={() => setCropSrc(null)} />}

        <div className="form-group">
          <label className="field-label">Display Name</label>
          <input className="field-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        {[['Hub', user?.hub_name], ['Phone', user?.phone], ['Role', 'Hub Leader']].filter(([,v]) => v).map(([l, v]) => (
          <div key={l} style={{ background: 'var(--bg-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{l}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: l === 'Phone' ? 'var(--font-mono)' : 'var(--font-sans)' }}>{v}</div>
          </div>
        ))}
        <button className="btn btn-primary" style={{ width: '100%', maxWidth: 320, height: 44, marginTop: 8 }} onClick={save} disabled={saving || !nameChanged}>
          {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Save Changes'}
        </button>
        <div className="divider" style={{ marginTop: 24 }} />
        <button className="btn btn-ghost" onClick={logout} style={{ color: 'var(--red)', fontSize: 13 }}>Sign out</button>
      </div>
    </div>
  );
}
