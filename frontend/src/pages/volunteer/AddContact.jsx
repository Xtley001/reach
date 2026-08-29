import { useState, useRef } from 'react';
import { api } from '../../lib/api';
import { invalidateAll } from '../../lib/cache';
import { queueSync } from '../../lib/offline';
import { toast } from '../../lib/toast';
import { confettiBurst } from '../../lib/confetti';

export default function AddContact({ onDone }) {
  const [form, setForm] = useState({
    name: '', phone: '', location: '', notes: '',
    needs_transport: false, transport_location: '',
  });
  const [loading, setLoading] = useState(false);
  const [phoneConflict, setPhoneConflict] = useState(null);
  const saveBtnRef = useRef();

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'phone') setPhoneConflict(null);
  }

  async function handleSubmit() {
    if (!form.name.trim()) { toast('Name is required', 'error'); return; }
    if (!form.phone.trim()) { toast('Phone is required', 'error'); return; }
    if (!form.location.trim()) { toast('Location is required', 'error'); return; }

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      location: form.location.trim(),
      notes: form.notes.trim() || null,
      needs_transport: form.needs_transport,
      transport_location: form.needs_transport ? form.transport_location.trim() : null,
    };

    setLoading(true);

    if (!navigator.onLine) {
      try {
        await queueSync(payload);
        toast('Saved offline — will sync when connected', 'gold');
        setTimeout(onDone, 600);
      } catch (err) {
        toast('Failed to save offline: ' + err.message, 'error');
      }
      setLoading(false);
      return;
    }

    try {
      await api.addContact(payload);
      invalidateAll('contacts:');
      confettiBurst(saveBtnRef.current);
      toast('Contact saved!', 'gold');
      setTimeout(onDone, 600);
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('already been added') || msg.includes('409')) {
        setPhoneConflict(msg);
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        // Network drop during request — queue offline
        try {
          await queueSync(payload);
          toast('Saved offline — will sync when connected', 'gold');
          setTimeout(onDone, 600);
        } catch {
          toast('Network error — please retry', 'error');
        }
      } else {
        toast(msg || 'Failed to save contact', 'error');
      }
    }
    setLoading(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Add Contact</div>
      </div>

      <div className="page-body">
        <div className="form-group">
          <label className="field-label">Full Name <span className="required">*</span></label>
          <input
            className="field-input"
            placeholder="e.g. Blessing Okafor"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="field-label">Phone Number <span className="required">*</span></label>
          <input
            className={`field-input${phoneConflict ? ' error' : ''}`}
            placeholder="+2348012345678"
            value={form.phone}
            inputMode="tel"
            onChange={e => set('phone', e.target.value)}
          />
          {phoneConflict && (
            <div className="field-error">{phoneConflict}</div>
          )}
        </div>

        <div className="form-group">
          <label className="field-label">Area / Location <span className="required">*</span></label>
          <input
            className="field-input"
            placeholder="e.g. Ikeja, Lagos"
            value={form.location}
            onChange={e => set('location', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="field-label">Notes</label>
          <textarea
            className="field-textarea"
            placeholder="Any additional notes…"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.needs_transport}
              onChange={e => set('needs_transport', e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 14, color: 'var(--text)' }}>Needs a bus?</span>
          </label>
        </div>

        {form.needs_transport && (
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="field-label">Pickup Location</label>
              <input
                className="field-input"
                placeholder="Where should the bus pick them up?"
                value={form.transport_location}
                onChange={e => set('transport_location', e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="form-sticky-footer">
        <button className="btn btn-ghost" onClick={onDone} style={{ flex: 1 }}>Cancel</button>
        <button
          ref={saveBtnRef}
          className="btn btn-primary"
          style={{ flex: 2 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Save Contact'}
        </button>
      </div>
    </div>
  );
}
