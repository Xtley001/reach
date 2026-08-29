/**
 * REACH — LoginPage (A-11: unified, role-aware)
 *
 * Previously three near-identical files (LoginPage/HubLoginPage/
 * AdminLoginPage) each hand-rolling the same contact->OTP->verify flow with
 * slightly different copy, a role check, and a destination route — three
 * places for the same bug (a missed role check, a stale destination, an
 * inconsistent error message) to happen independently. reach-election uses
 * a single LoginPage.jsx for every role; this does the same.
 *
 * `requiredRole` controls behavior:
 *   undefined      — general volunteer sign-in (old /login): routes by
 *                     whatever role comes back from verify, redirects
 *                     first-time contacts to /signup.
 *   'hub_leader'   — old /hub-login: rejects non-hub-leader accounts with a
 *                     clear message, routes to /hub/dashboard.
 *   'minister'     — old /admin: rejects non-minister accounts, routes to
 *                     /admin-panel/dashboard, and shows the "already signed
 *                     in as a different role" guard screen AdminLoginPage
 *                     used to have.
 */
import { useState, useEffect } from 'react';
import { useNavigate }         from 'react-router-dom';
import { api }                 from '../lib/api';
import { useAuth }             from '../hooks/useAuth';
import { toast }               from '../lib/toast';
import ThemeToggle              from '../components/ThemeToggle';
import AuthTopbar              from '../components/auth/AuthTopbar';
import AuthProgressBar         from '../components/auth/AuthProgressBar';
import ChannelToggle           from '../components/auth/ChannelToggle';
import OtpStep                 from '../components/auth/OtpStep';

const TOTAL_STEPS = 2;

const ROLE_CONFIG = {
  hub_leader: {
    badge: 'Hub Leader Access',
    title: 'Hub Leader Sign In',
    subtitle: 'Leadership access',
    placeholder: 'hub@example.com',
    noAccountMsg: 'No hub leader account found for this contact. Check with your minister.',
    wrongRoleMsg: 'This account does not have hub leader access.',
    destination: '/hub/dashboard',
    idPrefix: 'hub',
  },
  minister: {
    badge: 'Minister Access',
    title: 'Admin Sign In',
    subtitle: 'Restricted access',
    placeholder: 'minister@example.com',
    noAccountMsg: null, // AdminLoginPage never special-cased this — kept as-is
    wrongRoleMsg: 'This account does not have minister access.',
    destination: '/admin-panel/dashboard',
    idPrefix: 'admin',
  },
};

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

export default function LoginPage({ requiredRole }) {
  const cfg = requiredRole ? ROLE_CONFIG[requiredRole] : null;

  const [step,       setStep]       = useState(0);
  const [channel,    setChannel]    = useState('email');
  const [identifier, setId]         = useState('');
  const [otp,        setOtp]        = useState('');
  const [otpError,   setOtpError]   = useState(false);
  const [loading,    setLoading]    = useState(false);

  const { refreshUser, user } = useAuth();
  const navigate               = useNavigate();

  useEffect(() => {
    const label = cfg ? cfg.title : 'Sign In';
    document.title = step === 0 ? `${label} — REACH` : 'Enter Code — REACH';
  }, [step, cfg]);

  // Minister-only guard screen (was AdminLoginPage-specific): if already
  // signed in as the right role, skip straight through; if signed in as the
  // WRONG role, show a clear "restricted" screen rather than silently
  // letting a non-minister sit on the minister login form.
  if (requiredRole === 'minister' && user?.role === 'minister') {
    navigate(cfg.destination, { replace: true });
    return null;
  }
  if (requiredRole === 'minister' && user && user.role !== 'minister') {
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
    if (!identifier.trim()) {
      toast(requiredRole ? 'Enter your phone or email' : `Enter your ${channel === 'sms' ? 'phone number' : 'email address'}`, 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await api.sendOtp(channel, identifier.trim());
      if (!requiredRole && res?.is_returning === false) {
        // General login: first-time contact -> signup, not an error.
        navigate(`/signup?${channel === 'sms' ? 'phone' : 'email'}=${encodeURIComponent(identifier.trim())}`);
        return;
      }
      if (cfg?.noAccountMsg && res?.is_returning === false) {
        toast(cfg.noAccountMsg, 'warning', 6000);
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

      // A-11/MED-06: role check before navigating — carried over unchanged
      // from HubLoginPage/AdminLoginPage, now enforced in exactly one place
      // instead of two independently-maintained copies.
      if (requiredRole && data.role !== requiredRole) {
        toast(cfg.wrongRoleMsg, 'error');
        setStep(0); setOtp('');
        setLoading(false);
        return;
      }

      await refreshUser();
      const dest = requiredRole
        ? cfg.destination
        : data.role === 'hub_leader'  ? '/hub/dashboard'
        : data.role === 'minister'    ? '/admin-panel/dashboard'
        : data.status === 'pending'   ? '/pending'
        : '/vol/home';
      navigate(dest, { replace: true });
    } catch (e) {
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

  const idFieldId = `login-identifier-${cfg?.idPrefix || 'general'}`;

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <AuthTopbar onBack={goBack} />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <AuthProgressBar step={step} total={TOTAL_STEPS} />
          {cfg && <RoleBadge label={cfg.badge} />}

          <div style={{ animation: 'pageIn 0.18s ease-out both' }}>
            {step === 0 && (
              <form onSubmit={e => { e.preventDefault(); sendOtp(); }} noValidate>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>
                  {cfg ? cfg.title : 'Welcome back'}
                </h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-sans)', fontWeight: 300 }}>
                  {cfg ? cfg.subtitle : 'Volunteer sign in'}
                </p>

                <ChannelToggle channel={channel} onChange={ch => { setChannel(ch); setId(''); }} />

                <div className="form-group">
                  <label htmlFor={idFieldId} className="field-label">
                    {channel === 'sms' ? 'Phone Number' : 'Email Address'}
                  </label>
                  <input
                    id={idFieldId}
                    className="field-input"
                    type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : (cfg?.placeholder || 'you@example.com')}
                    value={identifier}
                    onChange={e => setId(e.target.value)}
                    autoComplete={channel === 'sms' ? 'tel' : 'email'}
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className={`btn btn-primary btn-full${cfg ? ' btn-full-force' : ''}`}
                  style={{ height: 44 }}
                  disabled={loading}
                >
                  {loading ? <div className="spinner spinner-sm" /> : 'Send Code'}
                </button>

                {/* General sign-in only — role-specific logins don't offer self-serve signup */}
                {!cfg && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>First time here?</p>
                    <button type="button" className="btn btn-outline btn-full" style={{ height: 40, fontSize: 13 }} onClick={() => navigate('/signup')}>
                      Create an account
                    </button>
                  </div>
                )}
              </form>
            )}

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
