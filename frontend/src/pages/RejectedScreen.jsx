import { useAuth } from '../hooks/useAuth';

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
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          border: '2px solid var(--red)',
          margin: '0 auto var(--space-6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28,
        }}>✗</div>

        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12, color: 'var(--text)' }}>
          Access Not Approved
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 24 }}>
          Your request wasn't approved. Contact your hub leader to find out why or to try a different hub.
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
