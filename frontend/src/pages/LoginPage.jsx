/**
 * REACH — LoginPage
 * Returning volunteer sign-in only: contact → OTP → dashboard
 * First-time users are directed to /signup
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

const TOTAL_STEPS = 2;

function ProgressBar({ step }) {
  return (
    <div style={{ height: 2, background: 'var(--bg-3)', borderRadius: 2, marginBottom: 32 }}>
      <div style={{
        height: '100%', borderRadius: 2, background: 'var(--accent)',
        width: `${((step + 1) / TOTAL_STEPS) * 100}%`,
        transition: 'width 0.3s ease',
      }} />
    </div>
  );
}

export default function LoginPage() {
  const [step, setStep]         = useState(0);
  const [channel, setChannel]   = useState('email');
  const [identifier, setId]     = useState('');
  const [otp, setOtp]           = useState('');
  const [loading, setLoading]   = useState(false);

  const { refreshUser } = useAuth();
  const navigate        = useNavigate();

  async function sendOtp() {
    if (!identifier.trim()) { toast(`Enter your ${channel === 'sms' ? 'phone number' : 'email address'}`, 'error'); return; }
    setLoading(true);
    try {
      const res = await api.sendOtp(channel, identifier.trim());
      if (res?.is_returning === false) {
        // New user tried sign-in — redirect them to signup with their contact pre-filled
        navigate(`/signup?${channel === 'sms' ? 'phone' : 'email'}=${encodeURIComponent(identifier.trim())}`);
        return;
      }
      setStep(1);
    } catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setLoading(false);
  }

  async function verifyAndLogin() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setLoading(true);
    try {
      const data = await api.verifyOtp(channel, identifier.trim(), otp);
      await refreshUser();
      const dest = data.role === 'hub_leader'  ? '/hub/dashboard'
                 : data.role === 'minister'     ? '/admin-panel/dashboard'
                 : data.status === 'pending'    ? '/pending'
                 : '/vol/home';
      navigate(dest, { replace: true });
    } catch (e) { toast(e.message || 'Invalid code', 'error'); }
    setLoading(false);
  }

  function goBack() {
    if (step === 0) { navigate('/'); return; }
    setStep(0); setOtp('');
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

            {/* ── Step 0: Contact entry ── */}
            {step === 0 && (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Welcome back</h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                  Volunteer sign in
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
                    {channel === 'sms' ? 'Phone Number' : 'Email Address'}
                  </label>
                  <input
                    className="field-input"
                    type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : 'you@example.com'}
                    value={identifier}
                    onChange={e => setId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendOtp()}
                    autoFocus
                  />
                </div>

                <button className="btn btn-primary btn-full" style={{ height: 44 }} onClick={sendOtp} disabled={loading}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Send Code'}
                </button>

                {/* First time here */}
                <div style={{
                  marginTop: 24, paddingTop: 20,
                  borderTop: '1px solid var(--border)',
                  textAlign: 'center',
                }}>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
                    First time here?
                  </p>
                  <button
                    className="btn btn-outline btn-full"
                    style={{ height: 40, fontSize: 13 }}
                    onClick={() => navigate('/signup')}
                  >
                    Create an account
                  </button>
                </div>
              </>
            )}

            {/* ── Step 1: OTP ── */}
            {step === 1 && (
              <>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>
                  Check your {channel === 'sms' ? 'phone' : 'inbox'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24, fontFamily: 'var(--font-mono)' }}>
                  Sent to {identifier} · expires in 10 min
                </p>

                <OTPInput value={otp} onChange={setOtp} />

                <button
                  className="btn btn-primary btn-full"
                  style={{ height: 44 }}
                  onClick={verifyAndLogin}
                  disabled={loading || otp.length < 6}
                >
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Sign In'}
                </button>
                <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={() => { setOtp(''); sendOtp(); }}>
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
