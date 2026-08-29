import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { PageSkeleton, EmptyState, Icon } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function HubTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showNew, setShowNew]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState({ label: '', body: '' });
  const [saving, setSaving]       = useState(false);
  const [expanded, setExpanded]   = useState(null);

  function loadTemplates() {
    return api.getActiveTemplates()
      .then(d => { setTemplates(d.templates || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadTemplates(); }, []);

  function copy(body) {
    navigator.clipboard.writeText(body).then(() => toast('Copied to clipboard', 'success'));
  }

  function startEdit(t) {
    setEditingId(t.id);
    setForm({ label: t.label, body: t.body });
    setShowNew(true);
  }

  function cancelForm() {
    setShowNew(false);
    setEditingId(null);
    setForm({ label: '', body: '' });
  }

  async function save() {
    if (!form.label.trim() || !form.body.trim()) {
      toast('Title and message body are required', 'error'); return;
    }

  function previewBody(body) {
    return (body || '')
      .replace(/\{name\}/gi, 'Adaeze')
      .replace(/\[Name\]/g, 'Adaeze')
      .replace(/\{location\}/gi, 'Lekki Phase 1')
      .replace(/\[Location\]/g, 'Lekki Phase 1');
  }

    setSaving(true);
    try {
      if (editingId) {
        await api.updateTemplate(editingId, form);
        toast('Template updated', 'success');
      } else {
        await api.createTemplate(form);
        toast('Template created', 'success');
      }
      cancelForm();
      loadTemplates();
    } catch (e) {
      toast(e.message || 'Failed to save', 'error');
    }
    setSaving(false);
  }

  async function remove(id) {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.deleteTemplate(id);
      toast('Template deleted', 'success');
      setTemplates(ts => ts.filter(t => t.id !== id));
    } catch (e) {
      toast(e.message || 'Failed to delete', 'error');
    }
  }

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div className="page-title">Message Templates</div>
        {!showNew && templates.length < 3 && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowNew(true)}>+ New</button>
        )}
      </div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

        {/* Create / Edit form */}
        {showNew && (
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
              {editingId ? 'Edit Template' : 'New Template'}
            </div>
            <div className="form-group">
              <label className="field-label">Title <span className="required">*</span></label>
              <input
                className="field-input"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Follow-up Message"
              />
            </div>
            <div className="form-group">
              <label className="field-label">Message Body <span className="required">*</span></label>
              <textarea
                className="field-input"
                style={{ height: 'auto', minHeight: 100, padding: '10px 14px', resize: 'vertical' }}
                value={form.body}
                onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                placeholder="Write your template message here…"
              />
            </div>
            {form.body?.trim() && (
              <div style={{
                marginTop: 8, padding: '12px 14px',
                background: 'var(--bg-3)', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.1em' }}>
                  PREVIEW
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {previewBody(form.body)}
                </div>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
              Use <code style={{ background: 'var(--bg-3)', padding: '1px 4px', borderRadius: 3 }}>{'{name}'}</code> and <code style={{ background: 'var(--bg-3)', padding: '1px 4px', borderRadius: 3 }}>{'{location}'}</code> as variables — they are replaced with the contact's real details when sending.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={cancelForm}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? <div className="spinner" style={{ width: 16, height: 16 }} /> : (editingId ? 'Save Changes' : 'Create')}
              </button>
            </div>
          </div>
        )}

        {loading ? <PageSkeleton /> : templates.length === 0 ? (
          <EmptyState icon={<Icon name="message" size={32} />} message="No templates yet. Create your first one — up to 3 active at a time." />
        ) : templates.map(t => {
          const isOpen = expanded === t.id;
          const lines = t.body.split('\n');
          const preview = lines.slice(0, 2).join('\n');
          return (
            <div key={t.id} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {isOpen ? t.body : preview + (lines.length > 2 ? '…' : '')}
                  </div>
                  {lines.length > 2 && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={() => setExpanded(isOpen ? null : t.id)}>
                      {isOpen ? 'Show less' : 'Show full'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => copy(t.body)}>Copy</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)}>Edit</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(t.id)}>Delete</button>
                </div>
              </div>
            </div>
          );
        })}

        {templates.length >= 3 && !showNew && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>
            Maximum of 3 active templates reached. Delete one to create a new template.
          </div>
        )}
      </div>
    </div>
  );
}
