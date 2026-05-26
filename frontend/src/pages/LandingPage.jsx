import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

export default function LandingPage() {
  const navigate = useNavigate();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteInput, setInviteInput] = useState('');

  function handleInvite() {
    const raw = inviteInput.trim();
    if (!raw) return;
    let token = raw;
    try {
      const url = new URL(raw);
      const fromParam = url.searchParams.get('invite');
      if (fromParam) token = fromParam;
    } catch {
      // raw is just a token string, not a URL — use as-is
    }
    navigate(`/join?invite=${encodeURIComponent(token)}`);
  }

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
          opacity: 1,
        }} />

        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          {/* Label above heading */}
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-3)', letterSpacing: '0.18em', textTransform: 'uppercase',
            }}>Ministry Outreach Platform</span>
          </div>

          <h1 style={{
            fontFamily: 'var(--font-display)', fontStyle: 'italic',
            fontSize: 'clamp(40px, 5.5vw, 64px)',
            lineHeight: 1.15, letterSpacing: '-0.01em',
            color: 'var(--text)', marginBottom: 24,
          }}>
            Every soul you meet,<br />followed up.
          </h1>

          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 40, maxWidth: 480, margin: '0 auto 40px' }}>
            REACH helps ministry teams log outreach contacts in 30 seconds — then follow up on every single one before the programme.
          </p>

          {/* CTA buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', width: '100%', maxWidth: 320, margin: '0 auto 8px' }}>
            <button className="btn btn-primary btn-full btn-lg" onClick={() => navigate('/login')}>
              Sign In
            </button>
            <button
              className="btn btn-ghost btn-full"
              style={{ fontSize: 12, color: 'var(--text-3)' }}
              onClick={() => navigate('/hub-login')}
            >
              Hub Leader Sign In →
            </button>
          </div>

          {/* Invite entry */}
          <div style={{ width: '100%', maxWidth: 320, margin: '0 auto' }}>
            {!showInvite ? (
              <button
                className="btn btn-ghost btn-full"
                style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}
                onClick={() => setShowInvite(true)}
              >
                I have an invite link
              </button>
            ) : (
              <div style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 16,
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <p style={{
                  fontSize: 11,
                  color: 'var(--text-3)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.04em',
                  marginBottom: 4,
                }}>
                  Paste your invite link or code
                </p>
                <input
                  className="field-input"
                  placeholder="https://... or token"
                  value={inviteInput}
                  onChange={e => setInviteInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  autoFocus
                  style={{ fontSize: 13 }}
                />
                <button
                  className="btn btn-primary btn-full btn-full-force"
                  style={{ height: 40 }}
                  onClick={handleInvite}
                  disabled={!inviteInput.trim()}
                >
                  Continue
                </button>
                <button
                  className="btn btn-ghost btn-full btn-full-force"
                  style={{ fontSize: 12, color: 'var(--text-3)' }}
                  onClick={() => { setShowInvite(false); setInviteInput(''); }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* New volunteer hint */}
          <p style={{
            fontSize: 11,
            color: 'var(--text-3)',
            textAlign: 'center',
            marginTop: 16,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
            lineHeight: 1.6,
          }}>
            New volunteer? Your hub leader will send you an invite link.
          </p>

          {/* How it works — numbered list */}
          <div style={{
            width: '100%',
            borderTop: '1px solid var(--border)',
            paddingTop: 32,
            marginTop: 40,
            display: 'flex', flexDirection: 'column', gap: 0,
          }}>
            {[
              { n: '01', title: 'Log the contact', body: 'Name, phone, location — done in 30 seconds.' },
              { n: '02', title: 'Hub leader assigns', body: 'Follow-up calls go to the right volunteers.' },
              { n: '03', title: 'Nobody falls through', body: 'Every contact has a status. Nothing is lost.' },
            ].map((s, i) => (
              <div key={s.n} style={{
                display: 'flex', gap: 20, padding: '20px 0',
                borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
                textAlign: 'left',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--highlight)', letterSpacing: '0.12em',
                  flexShrink: 0, paddingTop: 3,
                }}>{s.n}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.65 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>REACH · Ministry Outreach Platform</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate('/privacy')} style={{ background: 'none', border: 'none', fontSize: 11, color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Privacy</button>
          <span style={{ fontSize: 10, color: 'var(--text-3)', opacity: 0.4 }}>v2.0</span>
        </div>
      </footer>
    </div>
  );
}
