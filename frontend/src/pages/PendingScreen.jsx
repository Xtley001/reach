/**
 * REACH — PendingScreen
 * MED-11: Replace fixed ThemeToggle with a proper minimal topbar for
 *         consistent brand + no z-index/notch clashes.
 */
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/ThemeToggle';

export default function PendingScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try { await refreshUser(); } catch {}
    setChecking(false);
  }

  const hubLeaderName = user?.hub_leader_name || 'your hub leader';
  const whatsappLink  = user?.hub_leader_phone
    ? `https://wa.me/${user.hub_leader_phone.replace('+', '')}`
    : null;

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Minimal topbar — brand + theme toggle (MED-11) */}
      <div className="topbar">
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.22em', color: 'var(--text)', textTransform: 'uppercase' }}>
          REACH
        </span>
        <ThemeToggle />
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: 'var(--space-6)',
      }}>
        <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '1px solid var(--border)',
            margin: '0 auto var(--space-6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
            Awaiting approval
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 8 }}>
            <strong style={{ color: 'var(--text)' }}>{hubLeaderName}</strong> will approve your request shortly.
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28 }}>
            This usually takes a few hours. You'll be able to sign in once approved.
          </p>

          <button
            className="btn btn-outline btn-full"
            onClick={check}
            disabled={checking}
            style={{ marginBottom: 12 }}
          >
            {checking ? <div className="spinner spinner-sm" /> : 'Check Again'}
          </button>

          {whatsappLink && (
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-full" style={{ display: 'inline-flex', marginBottom: 12 }}>
              Message Hub Leader on WhatsApp
            </a>
          )}

          <button className="btn btn-ghost btn-full" onClick={logout} style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
