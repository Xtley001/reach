/**
 * REACH — SignupPage
 * New volunteer registration: name → contact → hub → OTP → /pending
 *
 * Audit fixes applied:
 *   CRIT-01/02 — OTP visibility + hint copy (via OtpStep / OTPInput)
 *   HIGH-02    — OTP a11y labels (via OTPInput)
 *   HIGH-03    — OTP fluid width (via OTPInput + global.css)
 *   HIGH-04    — Back button tap target (via AuthTopbar)
 *   HIGH-06    — OTP error state on failed verify
 *   HIGH-07    — label htmlFor linked to input id
 *   MED-01     — shared auth components (no more duplication)
 *   MED-02     — resend cooldown (via OtpStep)
 *   MED-03     — live countdown (via OtpStep)
 *   MED-08     — Enter key via <form>
 *   MED-09     — topbar uses .topbar class (via AuthTopbar)
 *   MED-10     — step counter (via AuthProgressBar)
 *   MED-12     — hub list loaded before transitioning to step 2 (no blank flash)
 *   LOW-01     — REACH wordmark contrast (via AuthTopbar)
 *   LOW-03     — autoComplete on name / email / phone inputs
 *   LOW-09     — document.title per step
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate }                  from 'react-router-dom';
import { api }                          from '../lib/api';
import { useAuth }                      from '../hooks/useAuth';
import { toast }                        from '../lib/toast';
import AuthTopbar                       from '../components/auth/AuthTopbar';
import AuthProgressBar                  from '../components/auth/AuthProgressBar';
import ChannelToggle                    from '../components/auth/ChannelToggle';
import OtpStep                          from '../components/auth/OtpStep';
import Icon                             from '../components/ui/Icon';

const CAMERA_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

const TOTAL_STEPS = 4;

const STEP_TITLES = [
  'Create Account — REACH',
  'Contact Details — REACH',
  'Choose Hub — REACH',
  'Enter Code — REACH',
];

function AvatarPicker({ preview, onFile }) {
  const ref = useRef();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 28 }}>
      <div
        onClick={() => ref.current?.click()}
        style={{
          width: 96, height: 96, borderRadius: '50%',
          border: `2px dashed ${preview ? 'var(--accent)' : 'var(--border-2)'}`,
          background: preview ? 'transparent' : 'var(--bg-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', overflow: 'hidden', transition: 'border-color 0.2s',
          position: 'relative',
        }}
      >
        {preview ? (
          <>
            <img src={preview} alt="Your photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: 0, transition: 'opacity 0.15s',
            }} className="avatar-hover-overlay">
              <span style={{ color: 'white', fontSize: 11, fontWeight: 500 }}>Change</span>
            </div>
          </>
        ) : (
          <span style={{ color: 'var(--text-3)' }}>{CAMERA_ICON}</span>
        )}
      </div>
      <div style={{ textAlign: 'center' }}>
        <button
          onClick={() => ref.current?.click()}
          className="btn btn-ghost btn-sm"
          style={{ fontSize: 12, color: 'var(--text-2)' }}
          type="button"
        >
          {preview ? 'Change photo' : 'Add a photo'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
          Optional — helps your hub leader recognise you
        </p>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 5 * 1024 * 1024) { toast('Image must be under 5 MB', 'error'); return; }
          onFile(f);
        }}
      />
    </div>
  );
}

export default function SignupPage() {
  const [step,          setStep]          = useState(0);
  const [channel,       setChannel]       = useState('email');
  const [identifier,    setId]            = useState('');
  const [name,          setName]          = useState('');
  const [avatarFile,    setAvatarFile]    = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [hubs,          setHubs]          = useState([]);
  const [hubId,         setHubId]         = useState('');
  const [otp,           setOtp]           = useState('');
  const [otpError,      setOtpError]      = useState(false);
  const [loading,       setLoading]       = useState(false);

  const { refreshUser } = useAuth();
  const navigate        = useNavigate();

  /* LOW-09: document.title per step */
  useEffect(() => {
    document.title = STEP_TITLES[step] || 'REACH';
  }, [step]);

  function handleAvatarFile(file) {
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = e => setAvatarPreview(e.target.result);
    reader.readAsDataURL(file);
  }

  /* Step 0: Name + optional avatar */
  function stepNameDone() {
    if (!name.trim()) { toast('Enter your full name', 'error'); return; }
    setStep(1);
  }

  /* Step 1: Contact
     MED-12: Load hubs before transitioning so step 2 doesn't flash empty */
  async function stepContactDone() {
    if (!identifier.trim()) { toast(`Enter your ${channel === 'sms' ? 'phone number' : 'email address'}`, 'error'); return; }
    setLoading(true);
    try {
      const hubData = await api.listHubs();
      setHubs(hubData || []);
      setStep(2);   /* only move after data is ready */
    } catch (e) { toast(e.message || 'Failed to load hubs', 'error'); }
    setLoading(false);
  }

  /* Step 2: Hub selection */
  async function stepHubDone() {
    if (!hubId) { toast('Select your hub', 'error'); return; }
    setLoading(true);
    try {
      await api.sendOtp(channel, identifier.trim());
      setStep(3);
    } catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setLoading(false);
  }

  /* Step 3: OTP + finalize */
  async function verifyAndCreate() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setLoading(true);
    setOtpError(false);
    try {
      await api.verifyOtp(channel, identifier.trim(), otp, name.trim(), hubId);
      if (avatarFile) {
        try {
          await api.uploadAvatar(avatarFile);
        } catch {
          toast('Account created. You can add your photo later from your profile.', 'warning', 4000);
        }
      }
      await refreshUser();
      navigate('/pending', { replace: true });
    } catch (e) {
      /* HIGH-06: error state on cells, auto-clear */
      setOtpError(true);
      setOtp('');
      toast(e.message || 'Invalid code', 'error');
      setTimeout(() => setOtpError(false), 800);
    }
    setLoading(false);
  }

  function goBack() {
    if (step === 0) { navigate('/login'); return; }
    setStep(s => s - 1);
    if (step === 3) { setOtp(''); setOtpError(false); }
  }

  /* Summary card shown at top of OTP step */
  const summaryCard = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28,
      padding: '12px 14px', borderRadius: 'var(--radius)', background: 'var(--bg-2)',
      border: '1px solid var(--border)',
    }}>
      {avatarPreview ? (
        <img src={avatarPreview} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: 'var(--bg-3)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, fontWeight: 600, color: 'var(--text-2)',
        }}>
          {name?.[0]?.toUpperCase()}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {hubs.find(h => h.hub_id === hubId)?.hub_name || 'Hub'}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* AuthTopbar: tap target, contrast, dedup */}
      <AuthTopbar onBack={goBack} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          <AuthProgressBar step={step} total={TOTAL_STEPS} />

          <div style={{ animation: 'pageIn 0.18s ease-out both' }}>

            {/* ── Step 0: Name + Avatar ── */}
            {step === 0 && (
              <form onSubmit={e => { e.preventDefault(); stepNameDone(); }} noValidate>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Create your account</h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-sans)', fontWeight: 300 }}>
                  Volunteer registration
                </p>

                <AvatarPicker preview={avatarPreview} onFile={handleAvatarFile} />

                {/* HIGH-07: label htmlFor + id, LOW-03: autoComplete */}
                <div className="form-group">
                  <label htmlFor="signup-name" className="field-label">
                    Full Name <span className="required">*</span>
                  </label>
                  <input
                    id="signup-name"
                    className="field-input"
                    placeholder="e.g. Adaeze Okonkwo"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoComplete="name"
                    autoFocus
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-full" style={{ height: 44 }}>
                  Continue
                </button>
              </form>
            )}

            {/* ── Step 1: Contact ── */}
            {step === 1 && (
              <form onSubmit={e => { e.preventDefault(); stepContactDone(); }} noValidate>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>How do we reach you?</h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-sans)', fontWeight: 300 }}>
                  We'll send a verification code here
                </p>

                <ChannelToggle channel={channel} onChange={ch => { setChannel(ch); setId(''); }} />

                {/* HIGH-07 + LOW-03 */}
                <div className="form-group">
                  <label htmlFor="signup-identifier" className="field-label">
                    {channel === 'sms' ? 'Phone Number' : 'Email Address'} <span className="required">*</span>
                  </label>
                  <input
                    id="signup-identifier"
                    className="field-input"
                    type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : 'you@example.com'}
                    value={identifier}
                    onChange={e => setId(e.target.value)}
                    autoComplete={channel === 'sms' ? 'tel' : 'email'}
                    autoFocus
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-full" style={{ height: 44 }} disabled={loading}>
                  {loading ? <div className="spinner spinner-sm" /> : 'Continue'}
                </button>
              </form>
            )}

            {/* ── Step 2: Hub ── */}
            {step === 2 && (
              <form onSubmit={e => { e.preventDefault(); stepHubDone(); }} noValidate>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Choose your hub</h1>
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
                  Your hub leader will approve your request
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, maxHeight: 320, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  {hubs.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>
                      No active hubs found. Ask your hub leader to invite you directly.
                    </p>
                  ) : hubs.map(h => (
                    <div
                      key={h.hub_id}
                      onClick={() => setHubId(h.hub_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                        border: `1px solid ${hubId === h.hub_id ? 'var(--accent)' : 'var(--border)'}`,
                        background: hubId === h.hub_id ? 'var(--bg-3)' : 'var(--bg-2)',
                        borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.12s',
                      }}
                    >
                      {h.leader_avatar_url ? (
                        <img src={h.leader_avatar_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      ) : (
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                          background: 'var(--bg-3)', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 14, fontWeight: 600, color: 'var(--text-2)',
                        }}>
                          {h.hub_name?.[0]}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{h.hub_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                          {[h.hub_zone, h.leader_name && `Leader: ${h.leader_name}`].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      {hubId === h.hub_id && (
                        <div style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          <Icon name="check" size={18} strokeWidth={2.5} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button type="submit" className="btn btn-primary btn-full" style={{ height: 44 }} disabled={loading || !hubId}>
                  {loading ? <div className="spinner spinner-sm" /> : 'Send Verification Code'}
                </button>
              </form>
            )}

            {/* ── Step 3: OTP ── */}
            {step === 3 && (
              <OtpStep
                channel={channel}
                identifier={identifier}
                otp={otp}
                setOtp={setOtp}
                loading={loading}
                onSubmit={verifyAndCreate}
                onResend={stepHubDone}
                onGoBack={goBack}
                submitLabel="Create Account"
                otpError={otpError}
              >
                {/* Summary card passed as children */}
                {summaryCard}
              </OtpStep>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
