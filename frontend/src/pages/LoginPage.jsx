/**
 * REACH — LoginPage
 * Returning volunteer sign-in only: contact → OTP → dashboard.
 * First-time users are directed to /signup.
 *
 * Audit fixes applied:
 *   CRIT-01/02 — OTP visibility + disabled button hint (via OtpStep)
 *   HIGH-01    — text-3 contrast (via global.css token fix)
 *   HIGH-02    — OTP a11y labels (via OTPInput)
 *   HIGH-03    — OTP fluid width (via OTPInput + global.css)
 *   HIGH-04    — Back button tap target (via AuthTopbar)
 *   HIGH-06    — OTP error state on failed verify
 *   HIGH-07    — label htmlFor linked to input id
 *   MED-01     — shared auth components (no more duplication)
 *   MED-02     — resend cooldown (via OtpStep)
 *   MED-03     — live countdown (via OtpStep)
 *   MED-07     — "Check your inbox" is now an <h1>
 *   MED-08     — Enter key via <form> in OtpStep
 *   MED-09     — topbar uses .topbar class (via AuthTopbar)
 *   MED-10     — step counter (via AuthProgressBar)
 *   LOW-01     — REACH wordmark contrast (via AuthTopbar)
 *   LOW-03     — autoComplete on identifier input
 *   LOW-06     — wrong-address link (via OtpStep)
 *   LOW-09     — document.title updates per step
 */
import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../lib/api';
import { useAuth }             from '../hooks/useAuth';
import { toast }               from '../lib/toast';
import AuthTopbar              from '../components/auth/AuthTopbar';
import AuthProgressBar         from '../components/auth/AuthProgressBar';
import ChannelToggle           from '../components/auth/ChannelToggle';
import OtpStep                 from '../components/auth/OtpStep';

const TOTAL_STEPS = 2;

export default function LoginPage() {
  const [step,       setStep]       = useState(0);
  const [channel,    setChannel]    = useState('email');
  const [identifier, setId]         = useState('');
  const [otp,        setOtp]        = useState('');
  const [otpError,   setOtpError]   = useState(false);
  const [loading,    setLoading]    = useState(false);

  const { refreshUser } = useAuth();
  const navigate        = useNavigate();

  /* LOW-09: Update page title per step */
  useEffect(() => {
    document.title = step === 0 ? 'Sign In — REACH' : 'Enter Code — REACH';
  }, [step]);

  async function sendOtp() {
    if (!identifier.trim()) {
      toast(`Enter your ${channel === 'sms' ? 'phone number' : 'email address'}`, 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await api.sendOtp(channel, identifier.trim());
      if (res?.is_returning === false) {
        navigate(`/signup?${channel === 'sms' ? 'phone' : 'email'}=${encodeURIComponent(identifier.trim())}`);
        return;
      }
      setStep(1);
      setOtpError(false);
    } catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setLoading(false);
  }

  async function verifyAndLogin() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setLoading(true);
    setOtpError(false);
    try {
      const data = await api.verifyOtp(channel, identifier.trim(), otp);
      await refreshUser();
      const dest = data.role === 'hub_leader'  ? '/hub/dashboard'
                 : data.role === 'minister'     ? '/admin-panel/dashboard'
                 : data.status === 'pending'    ? '/pending'
                 : '/vol/home';
      navigate(dest, { replace: true });
    } catch (e) {
      /* HIGH-06: trigger error state on OTP cells, auto-clear */
      setOtpError(true);
      setOtp('');
      toast(e.message || 'Invalid code', 'error');
      setTimeout(() => setOtpError(false), 800);
    }
    setLoading(false);
  }

  function goBack() {
    if (step === 0) { navigate('/'); return; }
    setStep(0); setOtp(''); setOtpError(false);
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* AuthTopbar fixes tap target, contrast, dedup (HIGH-04, LOW-01, MED-01) */}
      <AuthTopbar onBack={goBack} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* AuthProgressBar fixes height + step counter (MED-05, MED-10) */}
          <AuthProgressBar step={step} total={TOTAL_STEPS} />

          <div style={{ animation: 'pageIn 0.18s ease-out both' }}>

            {/* ── Step 0: Contact entry ── */}
            {step === 0 && (
              <form onSubmit={e => { e.preventDefault(); sendOtp(); }} noValidate>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Welcome back</h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                  Volunteer sign in
                </p>

                {/* ChannelToggle shared component (MED-01) */}
                <ChannelToggle channel={channel} onChange={ch => { setChannel(ch); setId(''); }} />

                {/* HIGH-07: label htmlFor linked to input id */}
                <div className="form-group">
                  <label htmlFor="login-identifier" className="field-label">
                    {channel === 'sms' ? 'Phone Number' : 'Email Address'}
                  </label>
                  <input
                    id="login-identifier"
                    className="field-input"
                    type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : 'you@example.com'}
                    value={identifier}
                    onChange={e => setId(e.target.value)}
                    autoComplete={channel === 'sms' ? 'tel' : 'email'}  /* LOW-03 */
                    autoFocus
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-full" style={{ height: 44 }} disabled={loading}>
                  {loading ? <div className="spinner spinner-sm" /> : 'Send Code'}
                </button>

                <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>First time here?</p>
                  <button type="button" className="btn btn-outline btn-full" style={{ height: 40, fontSize: 13 }} onClick={() => navigate('/signup')}>
                    Create an account
                  </button>
                </div>
              </form>
            )}

            {/* ── Step 1: OTP ── OtpStep handles all MED/LOW fixes */}
            {step === 1 && (
              <OtpStep
                channel={channel}
                identifier={identifier}
                otp={otp}
                setOtp={setOtp}
                loading={loading}
                onSubmit={verifyAndLogin}
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
