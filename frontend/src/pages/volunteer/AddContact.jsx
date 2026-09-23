import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '../../lib/api';
import { invalidateAll } from '../../lib/cache';
import { queueSync } from '../../lib/offline';
import { toast } from '../../lib/toast';
import { confettiBurst } from '../../lib/confetti';

/* ── Item 13: lightweight phone formatter ────────────────────────────────────
   Formats Nigerian numbers as "0801 234 5678" or "+234 801 234 5678" while
   the user types. Only formats visually; the raw digits are submitted.
   Works for any numeric input (digits, +, spaces, dashes, parens) — anything
   else passes through unchanged so international numbers aren't mangled.
   ----------------------------------------------------------------------- */
function formatPhoneDisplay(raw) {
  // Strip everything except digits and leading +
  const digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return raw;

  // Nigerian local: 080... → "0801 234 5678"
  if (/^0[789]\d{0,9}$/.test(digits)) {
    const d = digits.replace(/^0/, '');
    if (d.length <= 3)  return '0' + d;
    if (d.length <= 6)  return '0' + d.slice(0, 3) + ' ' + d.slice(3);
    if (d.length <= 10) return '0' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
    return '0' + d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6, 10);
  }

  // International with +: "+234 801 234 5678"
  if (digits.startsWith('+')) {
    const rest = digits.slice(1);
    // Nigerian +234: country code = 234, then 3+3+4
    if (rest.startsWith('234') && rest.length > 3) {
      const local = rest.slice(3);
      const parts = ['+234'];
      if (local.length > 0) parts.push(local.slice(0, 3));
      if (local.length > 3) { parts[1] = local.slice(0, 3); parts.push(local.slice(3, 6)); }
      if (local.length > 6) parts.push(local.slice(6, 10));
      return parts.join(' ');
    }
    return digits;
  }

  return raw;
}

const EMPTY_FORM = {
  name: '', phone: '', location: '', notes: '',
  needs_transport: false, transport_location: '',
};

/* ── Item 18: UndoBar ────────────────────────────────────────────────────────
   Shown for 4 seconds immediately after a contact is saved. Tapping Undo
   calls deleteContact(id) and keeps the filled form data so the volunteer
   can review and re-save without re-typing.
   ----------------------------------------------------------------------- */
function UndoBar({ contactId, contactName, onUndo, onExpire }) {
  const [visible, setVisible] = useState(true);
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval);
          setVisible(false);
          onExpire?.();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onExpire]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: 'calc(var(--space-4) + env(safe-area-inset-bottom, 0px) + 64px)',
        left: 'var(--space-4)',
        right: 'var(--space-4)',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid var(--green)',
        borderRadius: 'var(--radius)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        zIndex: 9998,
        boxShadow: 'var(--shadow-md)',
        animation: 'slideUp 0.2s ease',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        ✓ {contactName} saved
      </span>
      <button
        className="btn btn-ghost btn-sm"
        style={{ color: 'var(--amber)', fontWeight: 600, flexShrink: 0 }}
        onClick={() => { setVisible(false); onUndo(contactId); }}
      >
        Undo ({countdown}s)
      </button>
    </div>
  );
}

export default function AddContact({ onDone }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [phoneConflict, setPhoneConflict] = useState(null);
  // Item 18: undo state — holds { id, name } of last saved contact
  const [undoPending, setUndoPending] = useState(null);
  const saveBtnRef = useRef();
  // Item 15: ref to name input so we can refocus after Save & Add Another
  const nameRef = useRef();

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }));
    if (k === 'phone') setPhoneConflict(null);
  }

  // Item 13: format on change but keep raw digits for submission
  function handlePhoneChange(e) {
    const raw = e.target.value;
    setPhoneConflict(null);
    set('phone', formatPhoneDisplay(raw));
  }

  // Strip formatting to get raw phone for the API
  function rawPhone() {
    return form.phone.replace(/\s/g, '');
  }

  function validate() {
    if (!form.name.trim()) { toast('Name is required', 'error'); return false; }
    if (!rawPhone().trim()) { toast('Phone is required', 'error'); return false; }
    if (!form.location.trim()) { toast('Location is required', 'error'); return false; }
    return true;
  }

  // Item 18: handle undo — delete the contact, keep form data for re-save
  async function handleUndo(contactId, savedForm) {
    try {
      await api.deleteContact(contactId);
      invalidateAll('contacts:');
      toast('Undone — contact removed', 'gold');
      // Restore form so volunteer can review/re-save
      setForm(savedForm);
      setTimeout(() => nameRef.current?.focus(), 50);
    } catch {
      toast("Couldn't undo — contact was already saved", 'error');
    }
    setUndoPending(null);
  }

  async function save(andAddAnother = false) {
    if (!validate()) return;
    // Item 19: guard against double-taps — loading state + disabled
    if (loading) return;

    const submittedForm = { ...form }; // snapshot for undo
    const payload = {
      name: form.name.trim(),
      phone: rawPhone().trim(),
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
        if (andAddAnother) {
          setForm(EMPTY_FORM);
          setTimeout(() => nameRef.current?.focus(), 50);
        } else {
          setTimeout(onDone, 600);
        }
      } catch (err) {
        toast('Failed to save offline: ' + err.message, 'error');
      }
      setLoading(false);
      return;
    }

    try {
      const result = await api.addContact(payload);
      invalidateAll('contacts:');
      confettiBurst(saveBtnRef.current);

      if (andAddAnother) {
        // Item 15: clear + refocus immediately — no navigation, no extra tap needed
        // Item 18: show undo bar for the saved contact
        setUndoPending({ id: result.id, name: payload.name, savedForm: submittedForm });
        setForm(EMPTY_FORM);
        setPhoneConflict(null);
        setTimeout(() => nameRef.current?.focus(), 50);
      } else {
        // Item 18: show undo bar, then close after it expires
        setUndoPending({ id: result.id, name: payload.name, savedForm: submittedForm, closeOnExpire: true });
      }
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('already been added') || msg.includes('409')) {
        setPhoneConflict(msg);
      } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        try {
          await queueSync(payload);
          toast('Saved offline — will sync when connected', 'gold');
          if (andAddAnother) {
            setForm(EMPTY_FORM);
            setTimeout(() => nameRef.current?.focus(), 50);
          } else {
            setTimeout(onDone, 600);
          }
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
        {/* Item 12: autoCapitalize="words" for proper-name casing, autoComplete="name" */}
        <div className="form-group">
          <label className="field-label">Full Name <span className="required">*</span></label>
          <input
            ref={nameRef}
            className="field-input"
            placeholder="e.g. Blessing Okafor"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoCapitalize="words"
            autoComplete="name"
            autoFocus
          />
        </div>

        {/* Item 13: type="tel" surfaces numeric keypad; live formatter adds spacing */}
        <div className="form-group">
          <label className="field-label">Phone Number <span className="required">*</span></label>
          <input
            className={`field-input${phoneConflict ? ' error' : ''}`}
            placeholder="+2348012345678"
            value={form.phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            onChange={handlePhoneChange}
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', minHeight: 'var(--tap-min)' }}>
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

      {/* Item 14: 48px button height meets tap-target; item 15: Save & Add Another */}
      <div className="form-sticky-footer">
        <button className="btn btn-ghost" onClick={onDone} style={{ flex: 1, height: 48 }}>
          Cancel
        </button>
        {/* Item 15: Save & Add Another resets form + refocuses name field */}
        <button
          className="btn btn-outline"
          style={{ flex: 1.5, height: 48 }}
          onClick={() => save(true)}
          disabled={loading}
        >
          {loading ? <div className="spinner spinner-sm" /> : '+ Another'}
        </button>
        {/* Item 19: disabled during inflight to block duplicate submissions */}
        <button
          ref={saveBtnRef}
          className="btn btn-primary"
          style={{ flex: 2, height: 48 }}
          onClick={() => save(false)}
          disabled={loading}
        >
          {loading
            ? <div className="spinner spinner-sm" style={{ borderTopColor: 'var(--accent-fg)' }} />
            : 'Save Contact'}
        </button>
      </div>

      {/* Item 18: timed undo bar */}
      {undoPending && (
        <UndoBar
          contactId={undoPending.id}
          contactName={undoPending.name}
          onUndo={(id) => handleUndo(id, undoPending.savedForm)}
          onExpire={() => {
            const closeAfter = undoPending.closeOnExpire;
            setUndoPending(null);
            if (closeAfter) setTimeout(onDone, 100);
          }}
        />
      )}
    </div>
  );
}
