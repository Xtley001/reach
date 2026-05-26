/**
 * REACH — SignupPage
 * New volunteer registration: name → avatar (optional) → hub → OTP → /pending
 *
 * Avatar is uploaded immediately after OTP verify so the hub leader
 * can identify the volunteer in the approval queue.
 */
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { toast } from '../lib/toast';
import { OTPInput } from '../components/ui/OTPInput';
import ThemeToggle from '../components/ThemeToggle';

const BACK_ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>
);

const CAMERA_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

// 4 steps for new volunteer
const TOTAL_STEPS = 4;

function ProgressBar({ step }) {
  return (
    <div style={{ height: 2, background: 'var(--bg-3)', borderRadius: 2, marginBottom: 32 }}>
      <div style={{
        height: '100%', borderRadius: 2,
        background: 'var(--accent)',
        width: `${((step + 1) / TOTAL_STEPS) * 100}%`,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

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
  const [step, setStep]           = useState(0);
  const [channel, setChannel]     = useState('email');
  const [identifier, setId]       = useState('');
  const [name, setName]           = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [hubs, setHubs]           = useState([]);
  const [hubId, setHubId]         = useState('');
  const [otp, setOtp]             = useState('');
  const [loading, setLoading]     = useState(false);

  const { refreshUser } = useAuth();
  const navigate        = useNavigate();

  function handleAvatarFile(file) {
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = e => setAvatarPreview(e.target.result);
    reader.readAsDataURL(file);
  }

  // Step 0: Name + optional avatar
  function stepNameDone() {
    if (!name.trim()) { toast('Enter your full name', 'error'); return; }
    setStep(1);
  }

  // Step 1: Contact (email or phone)
  async function stepContactDone() {
    if (!identifier.trim()) { toast(`Enter your ${channel === 'sms' ? 'phone number' : 'email address'}`, 'error'); return; }
    setLoading(true);
    try {
      const hubData = await api.listHubs();
      setHubs(hubData || []);
      setStep(2);
    } catch (e) { toast(e.message || 'Failed to load hubs', 'error'); }
    setLoading(false);
  }

  // Step 2: Hub selection
  async function stepHubDone() {
    if (!hubId) { toast('Select your hub', 'error'); return; }
    setLoading(true);
    try {
      await api.sendOtp(channel, identifier.trim());
      setStep(3);
    } catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setLoading(false);
  }

  // Step 3: OTP + finalize
  async function verifyAndCreate() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setLoading(true);
    try {
      // Verify OTP — creates user atomically with name + hub
      await api.verifyOtp(channel, identifier.trim(), otp, name.trim(), hubId);

      // Upload avatar right after account creation (user is now pending but authenticated)
      if (avatarFile) {
        try {
          await api.uploadAvatar(avatarFile);
        } catch {
          // Non-fatal — user can add photo later from profile
          toast('Account created. You can add your photo later from your profile.', 'warning', 4000);
        }
      }

      await refreshUser();
      navigate('/pending', { replace: true });
    } catch (e) { toast(e.message || 'Invalid code', 'error'); }
    setLoading(false);
  }

  function goBack() {
    if (step === 0) { navigate('/login'); return; }
    setStep(s => s - 1);
    if (step === 3) setOtp('');
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
      }}>
        <button onClick={goBack} style={{
          background: 'none', border: 'none', color: 'var(--text-3)',
          cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {BACK_ARROW} Back
        </button>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.22em', color: 'var(--text-3)', textTransform: 'uppercase' }}>REACH</span>
        <ThemeToggle />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          <ProgressBar step={step} />

          <div style={{ animation: 'pageIn 0.18s ease-out both' }}>

            {/* ── Step 0: Name + Avatar ── */}
            {step === 0 && (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Create your account</h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                  Volunteer registration
                </p>

                <AvatarPicker preview={avatarPreview} onFile={handleAvatarFile} />

                <div className="form-group">
                  <label className="field-label">
                    Full Name <span className="required">*</span>
                  </label>
                  <input
                    className="field-input"
                    placeholder="e.g. Adaeze Okonkwo"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && stepNameDone()}
                    autoFocus
                  />
                </div>

                <button className="btn btn-primary btn-full" style={{ height: 44 }} onClick={stepNameDone}>
                  Continue
                </button>
              </>
            )}

            {/* ── Step 1: Contact ── */}
            {step === 1 && (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>How do we reach you?</h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                  We'll send a verification code here
                </p>

                <div style={{ display: 'flex', background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: 3, marginBottom: 20 }}>
                  {['email', 'sms'].map(ch => (
                    <button key={ch} onClick={() => { setChannel(ch); setId(''); }} style={{
                      flex: 1, height: 36, borderRadius: 'calc(var(--radius) - 2px)', border: 'none', cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 500,
                      background: channel === ch ? 'var(--accent)' : 'transparent',
                      color: channel === ch ? 'var(--accent-fg)' : 'var(--text-2)', transition: 'all 0.15s',
                    }}>
                      {ch === 'sms' ? 'Phone' : 'Email'}
                    </button>
                  ))}
                </div>

                <div className="form-group">
                  <label className="field-label">
                    {channel === 'sms' ? 'Phone Number' : 'Email Address'} <span className="required">*</span>
                  </label>
                  <input
                    className="field-input"
                    type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : 'you@example.com'}
                    value={identifier}
                    onChange={e => setId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && stepContactDone()}
                    autoFocus
                  />
                </div>

                <button className="btn btn-primary btn-full" style={{ height: 44 }} onClick={stepContactDone} disabled={loading}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Continue'}
                </button>
              </>
            )}

            {/* ── Step 2: Hub ── */}
            {step === 2 && (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Choose your hub</h1>
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
                  Your hub leader will approve your request
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, maxHeight: 320, overflowY: 'auto' }}>
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
                      {/* Hub leader avatar */}
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
                        <div style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>✓</div>
                      )}
                    </div>
                  ))}
                </div>

                <button className="btn btn-primary btn-full" style={{ height: 44 }} onClick={stepHubDone} disabled={loading || !hubId}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Send Verification Code'}
                </button>
              </>
            )}

            {/* ── Step 3: OTP ── */}
            {step === 3 && (
              <>
                {/* Summary card */}
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

                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
                  Check your {channel === 'sms' ? 'phone' : 'inbox'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                  Sent to {identifier} · expires in 10 min
                </p>

                <OTPInput value={otp} onChange={setOtp} />

                <button
                  className="btn btn-primary btn-full"
                  style={{ height: 44 }}
                  onClick={verifyAndCreate}
                  disabled={loading || otp.length < 6}
                >
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Create Account'}
                </button>
                <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={() => { setOtp(''); stepHubDone(); }}>
                  Resend code
                </button>
              </>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
