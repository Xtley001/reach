import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 24px',
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(16px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, letterSpacing: '0.25em', color: 'var(--text)' }}>
          REACH
        </div>
        <ThemeToggle />
      </header>

      {/* Hero */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', maxWidth: 640, margin: '0 auto', width: '100%', textAlign: 'center' }}>
        {/* Noise grain background */}
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.02'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          opacity: 0.5,
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontStyle: 'italic',
            fontSize: 'clamp(40px, 5.5vw, 64px)',
            lineHeight: 1.15, letterSpacing: '-0.01em',
            color: 'var(--text)', marginBottom: 24,
          }}>
            Every soul you meet,<br />followed up.
          </h1>

          <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 40, maxWidth: 480, margin: '0 auto 40px' }}>
            REACH helps ministry teams log outreach contacts in 30 seconds — then follow up on every single one before the programme.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: '100%', maxWidth: 320, margin: '0 auto 64px' }}>
            <button className="btn btn-primary btn-full btn-lg" onClick={() => navigate('/login')}>
              Join as a Volunteer
            </button>
            <button className="btn btn-outline btn-full btn-lg" onClick={() => navigate('/hub-login')}>
              Hub Leader Login
            </button>
          </div>

          {/* How it works */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, width: '100%' }}>
            {[
              { n: '01', title: 'Log the contact', body: 'Name, phone, location — done in 30 seconds while you\'re still with them.' },
              { n: '02', title: 'Hub leader assigns', body: 'Hub leaders assign follow-up calls to the right volunteers.' },
              { n: '03', title: 'Nobody falls through', body: 'Every contact gets a status. Every status is visible. Nothing is lost.' },
            ].map(s => (
              <div key={s.n} style={{
                background: 'var(--bg-glass)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(200,195,186,0.5)', borderRadius: 'var(--radius-md)',
                padding: 20, textAlign: 'left',
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gold)', marginBottom: 8, letterSpacing: '0.15em' }}>{s.n}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{s.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>REACH · Ministry Outreach Platform</span>
      </footer>
    </div>
  );
}
