/**
 * REACH — Decisions Entry
 * URL: /decisions  |  Decisions Team only
 */
import { useState } from 'react';
import { api } from '../lib/api';
import { toast } from '../lib/toast';
import { useAuth } from '../hooks/useAuth';
import { DECISION_TYPE_OPTIONS, HOW_HEARD_OPTIONS, AGE_RANGE_OPTIONS } from '../lib/labels';

const EMPTY_FORM = {
  name:'', phone_1:'', phone_2:'', whatsapp_number:'', email:'',
  area:'', nearest_landmark:'',
  decision_type:'', decision_type_other:'', first_time:'', currently_attending:'',
  current_church:'', wants_church_referral:'', referral_area:'',
  age_range:'', gender:'', occupation:'', how_did_you_hear:'', brought_by:'', notes:'',
};

export default function DecisionsLayout() {
  const { user, logout } = useAuth();
  const [form, setForm]     = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [bgOpen, setBgOpen]   = useState(false);
  const [count, setCount]     = useState(0);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit() {
    if (!form.name || !form.phone_1 || !form.decision_type) {
      toast('Name, phone and decision type are required', 'error'); return;
    }
    setLoading(true);
    try {
      await api.createDecision({
        ...form,
        first_time: form.first_time === 'true' ? true : form.first_time === 'false' ? false : null,
        wants_church_referral: form.wants_church_referral === 'true' ? true : form.wants_church_referral === 'false' ? false : null,
        source: 'real_time',
      });
      toast('Saved ✓', 'success');
      setForm(EMPTY_FORM);
      setCount(n => n + 1);
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
              height: 40, flex: 1, border: `1px solid ${form[k] === v ? 'var(--accent)' : 'var(--border)'}`,
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
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
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

        {/* Section 2: Decision */}
        <div className="form-section">
          <div className="form-section-title">Decision</div>
          <SelectField label="Decision Type" k="decision_type" req options={DECISION_TYPE_OPTIONS} />
          {form.decision_type === 'other' && (
            <Field label="Specify" k="decision_type_other" req />
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
          <div className="form-section-title" onClick={() => setBgOpen(o => !o)}>
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
        {/* P2-3.6: Also reset collapsible state on clear */}
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setForm(EMPTY_FORM); setBgOpen(false); }}>Clear</button>
        <button
          className="btn btn-primary"
          style={{ flex: 2, height: 48 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Save Decision'}
        </button>
      </div>
    </div>
  );
}
