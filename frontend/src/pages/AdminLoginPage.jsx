/**
 * /admin — minister login. No public links; known directly by ministers.
 */
import { useState } from 'react';
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

function RoleBadge({ label }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 20,
      background: 'var(--bg-3)', border: '1px solid var(--border)',
      fontSize: 11, fontWeight: 500, color: 'var(--text-3)',
      letterSpacing: '0.06em', textTransform: 'uppercase',
      marginBottom: 28,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--highlight)' }} />
      {label}
    </div>
  );
}

function ProgressBar({ step, total }) {
  return (
    <div style={{ height: 2, background: 'var(--bg-3)', borderRadius: 2, marginBottom: 32 }}>
      <div style={{
        height: '100%', borderRadius: 2, background: 'var(--accent)',
        width: `${((step + 1) / total) * 100}%`,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

export default function AdminLoginPage() {
  const [channel, setChannel] = useState('email');
  const [identifier, setId]   = useState('');
  const [otp, setOtp]         = useState('');
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const { refreshUser, user } = useAuth();
  const navigate              = useNavigate();

  if (user?.role === 'minister') {
    navigate('/admin-panel/dashboard', { replace: true });
    return null;
  }
  if (user && user.role !== 'minister') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, textAlign: 'center' }}>
        <div style={{ position: 'fixed', top: 16, right: 16 }}><ThemeToggle /></div>
        <div>
          <div style={{ width: 40, height: 40, border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/>
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Minister access required</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24 }}>This area is for ministers only.</div>
          <button className="btn btn-outline" onClick={() => navigate(-1)}>Go back</button>
        </div>
      </div>
    );
  }

  async function sendOtp() {
    if (!identifier.trim()) { toast('Enter your login', 'error'); return; }
    setLoading(true);
    try { await api.sendOtp(channel, identifier.trim()); setStep(1); }
    catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setLoading(false);
  }

  async function verify() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setLoading(true);
    try {
      const data = await api.verifyOtp(channel, identifier.trim(), otp);
      if (data.role !== 'minister') {
        toast('This account does not have minister access.', 'error');
        setStep(0); setOtp('');
      } else {
        await refreshUser();
        navigate('/admin-panel/dashboard', { replace: true });
      }
    } catch (e) { toast(e.message || 'Invalid code', 'error'); }
    setLoading(false);
  }

  function goBack() {
    if (step === 0) { navigate('/'); return; }
    setStep(0); setOtp('');
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
      }}>
        <button onClick={goBack} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {BACK_ARROW} Back
        </button>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.22em', color: 'var(--text-3)', textTransform: 'uppercase' }}>REACH</span>
        <ThemeToggle />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <ProgressBar step={step} total={2} />

          <RoleBadge label="Minister Access" />

          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>
            {step === 0 ? 'Admin Sign In' : 'Check your ' + (channel === 'sms' ? 'phone' : 'inbox')}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
            {step === 0 ? 'Restricted access' : `Sent to ${identifier} · expires in 10 min`}
          </p>

          <div style={{ animation: 'pageIn 0.15s ease-out both' }}>
            {step === 0 ? (
              <>
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
                  <label className="field-label">{channel === 'sms' ? 'Phone Number' : 'Email Address'}</label>
                  <input className="field-input" type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : 'minister@example.com'}
                    value={identifier} onChange={e => setId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendOtp()} autoFocus />
                </div>
                <button className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} onClick={sendOtp} disabled={loading}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Send Code'}
                </button>
              </>
            ) : (
              <>
                <OTPInput value={otp} onChange={setOtp} />
                <button className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} onClick={verify} disabled={loading || otp.length < 6}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Sign In'}
                </button>
                <button className="btn btn-ghost btn-full btn-full-force" style={{ marginTop: 8 }} onClick={() => { setOtp(''); sendOtp(); }}>
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
