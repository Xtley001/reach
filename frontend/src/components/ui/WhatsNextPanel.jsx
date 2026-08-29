import Icon from './Icon';

/**
 * REACH — WhatsNextPanel.jsx
 *
 * E-65: "more updates are coming" — set that expectation inside the app
 * itself, visible only to internal admins (minister settings/profile page),
 * not end users, not just in this backlog doc.
 *
 * Deliberately a hardcoded list, not a CMS/API-driven changelog — this is a
 * lightweight expectation-setter, not a product feature. Update this list
 * by hand as work actually ships.
 */
const ITEMS = [
  { label: 'Call-back reminders', detail: 'Set a "remind me" time when someone needs a follow-up call — now live in the call queue.' },
  { label: 'One login for all roles', detail: 'Hub leader and minister sign-in now share the same screen as volunteer sign-in — fewer places for bugs to hide.' },
  { label: 'Outcome tags on the roadmap', detail: 'The tag system (saved / healed / form filled / etc.) is live — leadership can rename or add tags without a developer, from Settings.' },
  { label: 'Feature flags — not yet built', detail: 'Rolling a change out to one hub before everyone is on the roadmap but not built yet — every update currently ships to the whole church at once.' },
];

export default function WhatsNextPanel() {
  return (
    <div style={{
      background: 'var(--bg-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: 16, marginTop: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Icon name="clock" size={14} style={{ color: 'var(--text-3)' }} />
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-3)' }}>
          What's Next
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 14 }}>
        Visible to admins only. More updates are coming — here's what's shipped recently and what's still ahead.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ITEMS.map(item => (
          <div key={item.label}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.label}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2, lineHeight: 1.5 }}>{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
