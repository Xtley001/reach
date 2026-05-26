import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { toast } from '../lib/toast';
import { OTPInput } from '../components/ui/OTPInput';
import ThemeToggle from '../components/ThemeToggle';

const STEPS = ['channel', 'otp', 'hub'];

const BACK_ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>
);

export default function LoginPage() {
  const [step, setStep]         = useState(0);
  const [channel, setChannel]   = useState('email');
  const [identifier, setId]     = useState('');
  const [otp, setOtp]           = useState('');
  const [hubs, setHubs]         = useState([]);
  const [hubId, setHubId]       = useState('');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [setupToken, setSetupToken] = useState(null);
  const { refreshUser }         = useAuth();
  const navigate                = useNavigate();

  async function sendOtp() {
    if (!identifier.trim()) { toast('Enter your phone or email', 'error'); return; }
    setLoading(true);
    try {
      await api.sendOtp(channel, identifier.trim());
      const hubData = await api.listHubs();
      setHubs(hubData || []);
      setStep(1);
    } catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setLoading(false);
  }

  async function verifyAndLogin() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setLoading(true);
    try {
      const data = await api.verifyOtp(channel, identifier.trim(), otp);
      if (data.status === 'active' && !data.is_new_user) {
        await refreshUser();
        const dest = data.role === 'hub_leader' ? '/hub/dashboard'
                   : data.role === 'minister'   ? '/admin-panel/dashboard'
                   : '/vol/home';
        navigate(dest, { replace: true });
      } else if (data.is_new_user && data.setup_token) {
        setSetupToken(data.setup_token);
        setStep(2);
      } else if (data.is_new_user) {
        setStep(2);
      } else {
        await refreshUser();
        navigate('/pending', { replace: true });
      }
    } catch (e) { toast(e.message || 'Invalid code', 'error'); }
    setLoading(false);
  }

  async function selectHub() {
    if (!hubId) { toast('Choose your hub', 'error'); return; }
    setLoading(true);
    try {
      if (setupToken) {
        await api.completeSetup({ setup_token: setupToken, hub_id: hubId, name: name || undefined });
      } else {
        await api.updateProfile({ hub_id: hubId, name: name || undefined });
      }
      await refreshUser();
      navigate('/pending', { replace: true });
    } catch (e) { toast(e.message || 'Failed', 'error'); }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px', borderBottom: '1px solid var(--border)',
      }}>
        <button onClick={() => navigate('/')} style={{
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
          <div className="step-dots" style={{ marginBottom: 32 }}>
            {STEPS.map((_, i) => <div key={i} className={`step-dot${i <= step ? ' done' : ''}`} />)}
          </div>

          <div style={{ animation: 'pageIn 0.18s ease-out both' }}>
            {step === 0 && (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Sign in</h1>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 28, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>Volunteer access</p>
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
                  <input className="field-input" type={channel === 'sms' ? 'tel' : 'email'}
                    placeholder={channel === 'sms' ? '+2348012345678' : 'you@example.com'}
                    value={identifier} onChange={e => setId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendOtp()} autoFocus />
                </div>
                <button className="btn btn-primary btn-full" style={{ height: 44 }} onClick={sendOtp} disabled={loading}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Send Code'}
                </button>
              </>
            )}

            {step === 1 && (
              <>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Check your {channel === 'sms' ? 'phone' : 'inbox'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24, fontFamily: 'var(--font-mono)' }}>
                  Sent to {identifier} · expires in 10 min
                </p>
                <OTPInput value={otp} onChange={setOtp} />
                <button className="btn btn-primary btn-full" style={{ height: 44 }} onClick={verifyAndLogin} disabled={loading || otp.length < 6}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Verify'}
                </button>
                <button className="btn btn-ghost btn-full" style={{ marginTop: 8 }} onClick={() => { setStep(0); setOtp(''); }}>
                  Change {channel === 'sms' ? 'number' : 'email'}
                </button>
              </>
            )}

            {step === 2 && (
              <>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Your hub</h1>
                <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>Select the hub you're volunteering with</p>
                <div className="form-group">
                  <label className="field-label">Your Name</label>
                  <input className="field-input" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24, maxHeight: 280, overflowY: 'auto' }}>
                  {hubs.map(h => (
                    <div key={h.hub_id} onClick={() => setHubId(h.hub_id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, height: 52, padding: '0 14px',
                        border: `1px solid ${hubId === h.hub_id ? 'var(--accent)' : 'var(--border)'}`,
                        background: hubId === h.hub_id ? 'var(--bg-3)' : 'var(--bg-2)',
                        borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all 0.12s',
                      }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                        {h.hub_name?.[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{h.hub_name}</div>
                        {h.zone && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{h.zone}</div>}
                      </div>
                      {hubId === h.hub_id && <div style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 18 }}>✓</div>}
                    </div>
                  ))}
                </div>
                <button className="btn btn-primary btn-full" style={{ height: 44 }} onClick={selectHub} disabled={loading || !hubId}>
                  {loading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Join Hub'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
