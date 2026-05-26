import { useAuth } from '../hooks/useAuth';
import ThemeToggle from '../components/ThemeToggle';

export default function RejectedScreen() {
  const { user, logout } = useAuth();

  const whatsappLink = user?.hub_leader_phone
    ? `https://wa.me/${user.hub_leader_phone.replace('+', '')}`
    : null;

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 'var(--space-6)',
    }}>
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>

      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'var(--font-sans)', fontSize: 11, fontWeight: 600,
          letterSpacing: '0.25em', color: 'var(--text-3)', textTransform: 'uppercase',
          marginBottom: 32, textAlign: 'center',
        }}>REACH</div>

        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          border: '1px solid var(--border)',
          margin: '0 auto var(--space-6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 10, color: 'var(--text)' }}>
          Request not approved
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 28 }}>
          Your hub leader wasn't able to approve this request. Contact them directly to find out more, or try joining a different hub.
        </p>

        {whatsappLink && (
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer"
            className="btn btn-outline btn-full" style={{ display: 'inline-flex', marginBottom: 12 }}>
            Contact Hub Leader
          </a>
        )}

        <button className="btn btn-ghost btn-full" onClick={logout} style={{ fontSize: 12 }}>
          Sign out and try again
        </button>
      </div>
    </div>
  );
}
