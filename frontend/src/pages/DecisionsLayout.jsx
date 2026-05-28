/**
 * REACH — Decisions Entry
 * URL: /decisions  |  Decisions Team, Hub Leader, Minister
 *
 * Decision Type is now MULTI-SELECT:
 *   Someone can give their life to Christ AND receive the Holy Spirit in the
 *   same encounter. Each checked type creates its own Decision record so that
 *   stats, exports, and queries stay clean.
 */
import { useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { useAuth } from '../hooks/useAuth';
import { HOW_HEARD_OPTIONS, AGE_RANGE_OPTIONS, DECISION_TYPE_OPTIONS } from '../lib/labels';

const EMPTY_FORM = {
  name:'', phone_1:'', phone_2:'', whatsapp_number:'', email:'',
  area:'', nearest_landmark:'',
  decision_types: [],          // ← array now, replaces decision_type
  decision_type_other:'',
  first_time:'', currently_attending:'', current_church:'',
  wants_church_referral:'', referral_area:'',
  age_range:'', gender:'', occupation:'', how_did_you_hear:'', brought_by:'', notes:'',
};

export default function DecisionsLayout() {
  const { user, logout } = useAuth();
  const [form, setForm]       = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [bgOpen, setBgOpen]   = useState(false);
  const [count, setCount]     = useState(0);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Toggle a decision type in/out of the array
  function toggleType(value) {
    setForm(f => {
      const types = f.decision_types.includes(value)
        ? f.decision_types.filter(t => t !== value)
        : [...f.decision_types, value];
      return { ...f, decision_types: types };
    });
  }

  async function handleSubmit() {
    if (!form.name.trim()) { toast('Full name is required', 'error'); return; }
    if (!form.phone_1.trim()) { toast('Phone number is required', 'error'); return; }
    if (form.decision_types.length === 0) {
      toast('Select at least one decision type', 'error'); return;
    }
    if (form.decision_types.includes('other') && !form.decision_type_other.trim()) {
      toast('Please specify the "other" decision', 'error'); return;
    }

    setLoading(true);
    try {
      // Submit one decision record per selected type
      const shared = {
        name:             form.name.trim(),
        phone_1:          form.phone_1.trim(),
        phone_2:          form.phone_2.trim() || undefined,
        whatsapp_number:  form.whatsapp_number.trim() || undefined,
        email:            form.email.trim() || undefined,
        area:             form.area.trim() || undefined,
        nearest_landmark: form.nearest_landmark.trim() || undefined,
        first_time:       form.first_time === 'true' ? true : form.first_time === 'false' ? false : null,
        currently_attending: form.currently_attending || null,
        current_church:   form.current_church.trim() || undefined,
        wants_church_referral: form.wants_church_referral === 'true' ? true : form.wants_church_referral === 'false' ? false : null,
        referral_area:    form.referral_area.trim() || undefined,
        age_range:        form.age_range || undefined,
        gender:           form.gender || undefined,
        occupation:       form.occupation.trim() || undefined,
        how_did_you_hear: form.how_did_you_hear || undefined,
        brought_by:       form.brought_by.trim() || undefined,
        notes:            form.notes.trim() || undefined,
        source:           'real_time',
      };

      // Fan out — one record per decision type
      await Promise.all(
        form.decision_types.map(dt =>
          api.createDecision({
            ...shared,
            decision_type: dt,
            decision_type_other: dt === 'other' ? form.decision_type_other.trim() : undefined,
          })
        )
      );

      const plural = form.decision_types.length > 1
        ? `${form.decision_types.length} decisions`
        : '1 decision';
      toast(`Saved — ${plural} recorded ✓`, 'success');
      setForm(EMPTY_FORM);
      setBgOpen(false);
      setCount(n => n + form.decision_types.length);
    } catch (e) {
      toast(e.message || 'Failed to save', 'error');
    }
    setLoading(false);
  }

  const Field = ({ label, k, req, type = 'text', hint }) => (
    <div className="form-group">
      <label className="field-label">{label}{req && <span className="required">*</span>}</label>
      <input className="field-input" type={type} value={form[k]} onChange={e => set(k, e.target.value)} placeholder={hint} />
    </div>
  );

  const SelectField = ({ label, k, req, options }) => (
    <div className="form-group">
      <label className="field-label">{label}{req && <span className="required">*</span>}</label>
      <select className="field-select" value={form[k]} onChange={e => set(k, e.target.value)}>
        <option value="">Select…</option>
        {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
      </select>
    </div>
  );

  const YesNoField = ({ label, k, req, options = [['true','Yes'],['false','No']] }) => (
    <div className="form-group">
      <label className="field-label">{label}{req && <span className="required">*</span>}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {options.map(([v, l]) => (
          <button
            key={v}
            onClick={() => set(k, v)}
            style={{
              height: 40, flex: 1,
              border: `1px solid ${form[k] === v ? 'var(--accent)' : 'var(--border)'}`,
              background: form[k] === v ? 'var(--accent)' : 'transparent',
              color: form[k] === v ? 'var(--accent-fg)' : 'var(--text-2)',
              borderRadius: 'var(--radius)', fontFamily: 'var(--font-sans)', fontSize: 13, cursor: 'pointer',
            }}
          >{l}</button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div className="topbar glass">
        <div>
          <div className="topbar-brand">Decisions</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-sans)' }}>
            {count} entered this session
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={logout} style={{ fontSize: 11 }}>Sign out</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 'var(--space-4)' }}>

        {/* Section 1: Identity */}
        <div className="form-section">
          <div className="form-section-title">Identity</div>
          <Field label="Full Name" k="name" req />
          <Field label="Phone Number" k="phone_1" req type="tel" hint="+2348012345678" />
          <Field label="Second Phone" k="phone_2" type="tel" />
          <Field label="WhatsApp (if different)" k="whatsapp_number" type="tel" />
          <Field label="Email Address" k="email" type="email" />
          <Field label="Home Area / Estate" k="area" />
          <Field label="Nearest Landmark" k="nearest_landmark" hint="e.g. By Access Bank, Surulere" />
        </div>

        {/* Section 2: Decision — MULTI-SELECT CHECKBOXES */}
        <div className="form-section">
          <div className="form-section-title">Decision</div>

          {/* Helper note */}
          <div style={{
            fontSize: 11, color: 'var(--text-3)', marginBottom: 12,
            background: 'var(--bg-3)', borderRadius: 'var(--radius-sm)',
            padding: '8px 12px', lineHeight: 1.5,
          }}>
            Select all that apply — someone can give their life to Christ <em>and</em> receive the Holy Spirit in the same encounter.
          </div>

          {/* Checkbox grid */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {DECISION_TYPE_OPTIONS.map(opt => {
              const checked = form.decision_types.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggleType(opt.value)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px',
                    background: checked ? 'var(--accent)' : 'var(--bg-2)',
                    border: `1.5px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    transition: 'background 0.15s, border-color 0.15s',
                    textAlign: 'left',
                    width: '100%',
                  }}
                >
                  {/* Checkbox indicator */}
                  <div style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    background: checked ? 'var(--accent-fg)' : 'transparent',
                    border: `2px solid ${checked ? 'var(--accent-fg)' : 'var(--border-2)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && (
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke={checked ? 'var(--accent)' : 'transparent'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span style={{
                    fontSize: 13, fontWeight: checked ? 600 : 400,
                    color: checked ? 'var(--accent-fg)' : 'var(--text)',
                    fontFamily: 'var(--font-sans)',
                  }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Show "Other — specify" field only when Other is checked */}
          {form.decision_types.includes('other') && (
            <Field label="Specify (Other)" k="decision_type_other" req />
          )}

          {/* Summary of selection */}
          {form.decision_types.length > 0 && (
            <div style={{
              fontSize: 11, color: 'var(--green)', fontWeight: 600,
              padding: '6px 12px', background: 'var(--badge-green-bg)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 8,
            }}>
              {form.decision_types.length} decision type{form.decision_types.length > 1 ? 's' : ''} selected →{' '}
              {form.decision_types.length} record{form.decision_types.length > 1 ? 's' : ''} will be saved
            </div>
          )}

          <YesNoField label="First time making this decision?" k="first_time" req />
          <YesNoField
            label="Currently attending a church?"
            k="currently_attending"
            req
            options={[['yes','Yes'],['no','No'],['used_to','Used To']]}
          />
          {form.currently_attending === 'yes' && (
            <Field label="Which church / denomination?" k="current_church" />
          )}
          <YesNoField
            label="Wants church connection near them?"
            k="wants_church_referral"
            req
            options={[['true','Yes'],['false','No'],['','Not Sure']]}
          />
          {form.wants_church_referral === 'true' && (
            <Field label="Preferred area for church" k="referral_area" />
          )}
        </div>

        {/* Section 3: Background — collapsible */}
        <div className="form-section collapsible-section">
          <div className="form-section-title" onClick={() => setBgOpen(o => !o)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Background</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{bgOpen ? '▲ hide' : '▼ fill if time allows'}</span>
          </div>
          {bgOpen && (
            <div>
              <SelectField label="Age Range" k="age_range" options={AGE_RANGE_OPTIONS} />
              <SelectField label="Gender" k="gender" options={['Male','Female','Prefer not to say']} />
              <Field label="Occupation" k="occupation" />
              <SelectField label="How did you hear about the event?" k="how_did_you_hear" options={HOW_HEARD_OPTIONS} />
              <Field label="Brought by someone?" k="brought_by" hint="Who brought them?" />
              <div className="form-group">
                <label className="field-label">Counsellor Notes</label>
                <textarea className="field-textarea" value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="form-sticky-footer">
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setForm(EMPTY_FORM); setBgOpen(false); }}>Clear</button>
        <button
          className="btn btn-primary"
          style={{ flex: 2, height: 48 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <div className="spinner" style={{ width: 16, height: 16 }} />
            : form.decision_types.length > 1
              ? `Save ${form.decision_types.length} Decisions`
              : 'Save Decision'
          }
        </button>
      </div>
    </div>
  );
}
