import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

const ROLE_LABELS = { hub_leader: 'Hub Leader', registration_team: 'Registration Team', decisions_team: 'Decisions Team' };

export default function JoinPage() {
  const [params]    = useSearchParams();
  const token       = params.get('invite') || '';
  const navigate    = useNavigate();
  const { refreshUser } = useAuth();

  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [step, setStep]         = useState(0);
  const [phone, setPhone]       = useState('');
  const [name, setName]         = useState('');
  const [otp, setOtp]           = useState('');
  const [sending, setSending]   = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api.previewInvite(token)
      .then(d => { setPreview(d); setLoading(false); })
      .catch(() => { setPreview({ valid: false, error: 'Failed to load invite.' }); setLoading(false); });
  }, [token]);

  async function sendOtp() {
    if (!phone.trim()) { toast('Enter your phone number', 'error'); return; }
    setSending(true);
    try {
      await api.sendInviteOtp(token, phone.trim());
      setStep(1);
    } catch (e) { toast(e.message || 'Failed to send code', 'error'); }
    setSending(false);
  }

  async function claim() {
    if (otp.length < 6) { toast('Enter the full 6-digit code', 'error'); return; }
    setVerifying(true);
    try {
      await api.claimInvite({ token, phone: phone.trim(), otp, name: name.trim() || undefined });
      await refreshUser();
      toast('Account created!', 'success');
      navigate('/', { replace: true });
    } catch (e) { toast(e.message || 'Failed to claim invite', 'error'); }
    setVerifying(false);
  }

  const TopBar = () => (
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
  );

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner spinner-lg" />
      </div>
    </div>
  );

  if (!token || !preview?.valid) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <TopBar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Invalid invite link</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 24, lineHeight: 1.6 }}>{preview?.error || 'This invite link is not valid or has expired.'}</div>
          <button className="btn btn-outline" onClick={() => navigate('/')}>Go to homepage</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <TopBar />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>You've been invited</h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16, lineHeight: 1.6 }}>
              You've been invited to join REACH as part of a ministry outreach team.
            </p>
            <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge badge-gold">{ROLE_LABELS[preview.role] || preview.role}</span>
              {preview.hub_name && <span className="badge">{preview.hub_name}{preview.hub_zone ? ` · ${preview.hub_zone}` : ''}</span>}
            </div>
          </div>

          <div className="card" style={{ animation: 'pageIn 0.15s ease-out both' }}>
            {step === 0 ? (
              <>
                <div className="form-group">
                  <label className="field-label">Your Name</label>
                  <input className="field-input" placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="field-label">Phone Number <span className="required">*</span></label>
                  <input
                    className="field-input" type="tel"
                    placeholder="+2348012345678"
                    value={phone} onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendOtp()}
                    autoFocus
                  />
                  {preview.phone_hint && (
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                      Invite issued for number ending in {preview.phone_hint}
                    </div>
                  )}
                </div>
                <button className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} onClick={sendOtp} disabled={sending}>
                  {sending ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Send Verification Code'}
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>Check your phone</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24, fontFamily: 'var(--font-mono)' }}>Sent to {phone} · expires in 10 min</p>
                <OTPInput value={otp} onChange={setOtp} />
                <button className="btn btn-primary btn-full btn-full-force" style={{ height: 44 }} onClick={claim} disabled={verifying || otp.length < 6}>
                  {verifying ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Create Account'}
                </button>
                <button className="btn btn-ghost btn-full btn-full-force" style={{ marginTop: 8 }} onClick={() => { setStep(0); setOtp(''); }}>
                  Change number
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
