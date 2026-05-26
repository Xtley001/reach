import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { toast } from '../lib/toast';
import { OTPInput } from '../components/ui/OTPInput';

/**
 * /admin — minister login only.
 * No links, no hints, no keyboard shortcuts.
 */
export default function AdminLoginPage() {
  const [channel, setChannel] = useState('sms');
  const [identifier, setId]   = useState('');
  const [otp, setOtp]         = useState('');
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(false);
  const { refreshUser, user } = useAuth();
  const navigate              = useNavigate();

  // Already logged in as minister
  if (user?.role === 'minister') {
    navigate('/admin-panel/dashboard', { replace: true });
    return null;
  }
  // Already logged in as someone else
  if (user && user.role !== 'minister') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 32, marginBottom: 16 }}>🚫</div>
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

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.25em', color: 'var(--text)', textTransform: 'uppercase', marginBottom: 4 }}>REACH</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>Admin Access</h1>
        </div>

        {/* Gold left-border card for leadership */}
        <div className="card hub-card-leader-border" style={{ animation: 'pageIn 0.15s ease-out both' }}>
          {step === 0 ? (
            <>
              <div style={{ display: 'flex', background: 'var(--bg-3)', borderRadius: 'var(--radius)', padding: 3, marginBottom: 20 }}>
                {['sms','email'].map(ch => (
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
                  className="field-input"
                  type={channel === 'sms' ? 'tel' : 'email'}
                  placeholder={channel === 'sms' ? '+2348012345678' : 'minister@example.com'}
                  value={identifier}
                  onChange={e => setId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendOtp()}
                  autoFocus
                />
              </div>
              <button className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} onClick={sendOtp} disabled={loading}>
                {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Send Code'}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>Code valid for 10 minutes</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontFamily: 'var(--font-mono)' }}>Sent to {identifier}</p>
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
  );
}
