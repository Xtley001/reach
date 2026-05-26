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

export default function HubLoginPage() {
  const [channel, setChannel] = useState('email');
  const [identifier, setId]   = useState('');
  const [otp, setOtp]         = useState('');
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const { refreshUser }       = useAuth();
  const navigate              = useNavigate();

  async function sendOtp() {
    if (!identifier.trim()) { toast('Enter your phone or email', 'error'); return; }
    setLoading(true);
    try {
      const res = await api.sendOtp(channel, identifier.trim());
      if (res?.is_returning === false) {
        toast('No account found. Check you\'re using your registered contact, or ask your minister for a new invite.', 'warning', 6000);
      }
      setStep(1);
    } catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setLoading(false);
  }

  async function verify() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setLoading(true);
    try {
      await api.verifyOtp(channel, identifier.trim(), otp);
      await refreshUser();
      navigate('/hub/dashboard', { replace: true });
    } catch (e) { toast(e.message || 'Invalid code', 'error'); }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
      }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          {BACK_ARROW} Back
        </button>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.22em', color: 'var(--text-3)', textTransform: 'uppercase' }}>REACH</span>
        <ThemeToggle />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
        <div style={{ width: '100%', maxWidth: 360 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Hub Leader Login</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>Leadership access</p>
          </div>

          {/* Gold left-border — signals leadership role */}
          <div className="card hub-card-leader-border" style={{ animation: 'pageIn 0.15s ease-out both' }}>
            {step === 0 ? (
              <>
                <div style={{ display: 'flex', background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: 3, marginBottom: 20 }}>
                  {['email','sms'].map(ch => (
                    <button key={ch} onClick={() => setChannel(ch)} style={{
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
                  <input
                    className="field-input" type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : 'hub@example.com'}
                    value={identifier} onChange={e => setId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendOtp()} autoFocus
                  />
                </div>
                <button className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} onClick={sendOtp} disabled={loading}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Send Code'}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Check your {channel === 'sms' ? 'phone' : 'inbox'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24, fontFamily: 'var(--font-mono)' }}>Sent to {identifier} · expires in 10 min</p>
                <OTPInput value={otp} onChange={setOtp} />
                <button className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} onClick={verify} disabled={loading || otp.length < 6}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Verify'}
                </button>
                <button className="btn btn-ghost btn-full btn-full-force" style={{ marginTop: 8 }} onClick={() => { setStep(0); setOtp(''); }}>
                  Change login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
