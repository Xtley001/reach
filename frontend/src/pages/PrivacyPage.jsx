import { useNavigate } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

export default function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Sticky header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 52,
        background: 'var(--bg-glass)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <button onClick={() => navigate('/')} style={{
          background: 'none', border: 'none', color: 'var(--text-2)',
          cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>
        <ThemeToggle />
      </header>

      <main style={{ maxWidth: 600, margin: '0 auto', padding: '48px 24px 64px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontSize: 'clamp(28px, 4vw, 36px)',
          color: 'var(--text)', marginBottom: 32, lineHeight: 1.2,
        }}>Privacy</h1>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 20 }}>
          REACH stores the contact information you enter — name, phone number, and location — for the sole purpose of ministry follow-up. This information is only accessible to volunteers, hub leaders, and ministers within your organisation.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 20 }}>
          Contact data is held for the duration of the campaign and is not shared with third parties.
        </p>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.8 }}>
          To request deletion of your information, contact your hub leader or minister.
        </p>
      </main>
    </div>
  );
}
