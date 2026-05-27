/**
 * REACH — OtpStep
 * Step 1 of all auth flows: OTP entry + Submit + Resend.
 * Fixes:
 *   CRIT-02 — hint copy explaining why Submit is disabled
 *   MED-02  — resend cooldown (30s)
 *   MED-03  — live OTP expiry countdown
 *   MED-08  — Enter key submits via <form>
 *   LOW-06  — "wrong address?" inline back link
 */
import { useState, useEffect } from 'react';
import { OTPInput } from '../ui/OTPInput';

export default function OtpStep({
  channel,
  identifier,
  otp,
  setOtp,
  loading,
  onSubmit,
  onResend,
  onGoBack,
  submitLabel = 'Sign In',
  otpError = false,
  /* optional extra content above the OTP (e.g. signup profile preview) */
  children,
}) {
  /* Live countdown — 10 min = 600s (MED-03) */
  const [remaining, setRemaining] = useState(600);
  useEffect(() => {
    const t = setInterval(() => setRemaining(r => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const mins = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');
  const expired = remaining === 0;
  const timerColor = remaining < 60 ? 'var(--red)' : remaining < 120 ? 'var(--amber)' : 'var(--text-3)';

  /* Resend cooldown (MED-02) */
  const [cooldown, setCooldown] = useState(0);
  function handleResend() {
    setOtp('');
    onResend();
    setCooldown(30);
    const t = setInterval(() => setCooldown(c => {
      if (c <= 1) { clearInterval(t); return 0; }
      return c - 1;
    }), 1000);
    // reset expiry timer
    setRemaining(600);
  }

  /* Handle Enter key in the form (MED-08) */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!loading && otp.length === 6 && !expired) {
      try {
        await onSubmit();
      } catch (err) {
        setOtp(''); // clear for retry on error
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {children}

      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
        Check your {channel === 'sms' ? 'phone' : 'inbox'}
      </h1>

      {/* Identifier — clickable to go back (LOW-06) */}
      <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
        Sent to{' '}
        <button
          type="button"
          onClick={onGoBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            cursor: 'pointer',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            padding: 0,
            textDecoration: 'underline',
          }}
          title="Wrong address? Go back"
        >
          {identifier}
        </button>
      </p>

      {/* Live expiry timer (MED-03) */}
      <p style={{ fontSize: 12, color: timerColor, marginBottom: 24, fontFamily: 'var(--font-mono)', transition: 'color 0.3s' }}>
        {expired ? 'Code expired — resend to get a new one' : `Expires in ${mins}:${secs}`}
      </p>

      <OTPInput value={otp} onChange={setOtp} error={otpError} />

      {/* Hint copy when button would be disabled (CRIT-02) */}
      {otp.length > 0 && otp.length < 6 && (
        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: -8, marginBottom: 12 }}>
          Enter all 6 digits to continue
        </p>
      )}
      {expired && otp.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--red)', textAlign: 'center', marginTop: -8, marginBottom: 12 }}>
          Your code has expired — tap Resend below
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primary btn-full btn-full-force"
        style={{ height: 44 }}
        disabled={loading || otp.length < 6 || expired}
      >
        {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : submitLabel}
      </button>

      {/* Resend with cooldown (MED-02) */}
      <button
        type="button"
        className="btn btn-ghost btn-full btn-full-force"
        style={{ marginTop: 8 }}
        disabled={cooldown > 0}
        onClick={handleResend}
      >
        {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
      </button>
    </form>
  );
}
