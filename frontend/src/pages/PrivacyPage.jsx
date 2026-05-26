import { useNavigate } from 'react-router-dom';

export default function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', padding: '32px 24px', maxWidth: 640, margin: '0 auto' }}>
      <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', marginBottom: 24, fontFamily: 'var(--font-sans)' }}>
        ← Back
      </button>
      <h1 style={{ fontSize: 28, fontFamily: 'var(--font-display)', fontStyle: 'italic', marginBottom: 24 }}>Privacy</h1>
      <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 16 }}>
        REACH stores the contact information you enter — name, phone number, and location — for the sole purpose of ministry follow-up. This information is only accessible to volunteers, hub leaders, and ministers within your organisation.
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 16 }}>
        Contact data is held for the duration of the campaign and is not shared with third parties.
      </p>
      <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.8 }}>
        To request deletion of your information, contact your hub leader or minister.
      </p>
    </div>
  );
}
