import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';

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
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 'var(--space-6)',
    }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          border: '3px solid var(--gold)',
          margin: '0 auto var(--space-6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>⏳</div>

        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
          Waiting for Approval
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
          Waiting for <strong>{hubLeaderName}</strong> to approve you. Hub leaders typically approve within a few hours.
        </p>

        <button
          className="btn btn-outline btn-full"
          onClick={check}
          disabled={checking}
          style={{ marginBottom: 12 }}
        >
          {checking ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Check Again'}
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
  );
}
