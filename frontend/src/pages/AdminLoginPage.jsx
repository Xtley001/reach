/**
 * REACH — AdminLoginPage
 * Minister-only sign-in. Uses shared auth components.
 *
 * Audit fixes applied (in addition to all shared component fixes):
 *   HIGH-06 — OTP error state
 *   HIGH-07 — label/input id linkage
 *   LOW-09  — document.title per step
 */
import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../lib/api';
import { useAuth }             from '../hooks/useAuth';
import { toast }               from '../lib/toast';
import ThemeToggle             from '../components/ThemeToggle';
import AuthTopbar              from '../components/auth/AuthTopbar';
import AuthProgressBar         from '../components/auth/AuthProgressBar';
import ChannelToggle           from '../components/auth/ChannelToggle';
import OtpStep                 from '../components/auth/OtpStep';

const TOTAL_STEPS = 2;

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

export default function AdminLoginPage() {
  const [channel,    setChannel]  = useState('email');
  const [identifier, setId]       = useState('');
  const [otp,        setOtp]      = useState('');
  const [otpError,   setOtpError] = useState(false);
  const [step,       setStep]     = useState(0);
  const [loading,    setLoading]  = useState(false);
  const { refreshUser, user }     = useAuth();
  const navigate                  = useNavigate();

  /* LOW-09 */
  useEffect(() => {
    document.title = step === 0 ? 'Admin Sign In — REACH' : 'Enter Code — REACH';
  }, [step]);

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
    try {
      await api.sendOtp(channel, identifier.trim());
      setStep(1);
      setOtpError(false);
    } catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setLoading(false);
  }

  async function verify() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setLoading(true);
    setOtpError(false);
    try {
      const data = await api.verifyOtp(channel, identifier.trim(), otp);
      if (data.role !== 'minister') {
        toast('This account does not have minister access.', 'error');
        setStep(0); setOtp('');
      } else {
        await refreshUser();
        navigate('/admin-panel/dashboard', { replace: true });
      }
    } catch (e) {
      /* HIGH-06 */
      setOtpError(true);
      setOtp('');
      toast(e.message || 'Invalid code', 'error');
      setTimeout(() => setOtpError(false), 800);
    } finally {
      setLoading(false); // always reset spinner
    }
  }

  function goBack() {
    if (step === 0) { navigate('/'); return; }
    setStep(0); setOtp(''); setOtpError(false);
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <AuthTopbar onBack={goBack} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <AuthProgressBar step={step} total={TOTAL_STEPS} />
          <RoleBadge label="Minister Access" />

          <div style={{ animation: 'pageIn 0.15s ease-out both' }}>
            {step === 0 ? (
              <form onSubmit={e => { e.preventDefault(); sendOtp(); }} noValidate>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Admin Sign In</h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-sans)', fontWeight: 300 }}>
                  Restricted access
                </p>

                <ChannelToggle channel={channel} onChange={ch => { setChannel(ch); setId(''); }} />

                {/* HIGH-07 */}
                <div className="form-group">
                  <label htmlFor="admin-identifier" className="field-label">
                    {channel === 'sms' ? 'Phone Number' : 'Email Address'}
                  </label>
                  <input
                    id="admin-identifier"
                    className="field-input"
                    type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : 'minister@example.com'}
                    value={identifier}
                    onChange={e => setId(e.target.value)}
                    autoComplete={channel === 'sms' ? 'tel' : 'email'}
                    autoFocus
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} disabled={loading}>
                  {loading ? <div className="spinner spinner-sm" /> : 'Send Code'}
                </button>
              </form>
            ) : (
              <OtpStep
                channel={channel}
                identifier={identifier}
                otp={otp}
                setOtp={setOtp}
                loading={loading}
                onSubmit={verify}
                onResend={sendOtp}
                onGoBack={goBack}
                submitLabel="Sign In"
                otpError={otpError}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
