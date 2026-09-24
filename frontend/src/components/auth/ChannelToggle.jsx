/**
 * REACH — ChannelToggle
 * Email / SMS segmented control reused across all login flows.
 * Fixes: MED-01 (dedup).
 */
export default function ChannelToggle({ channel, onChange }) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-3)',
      borderRadius: 'var(--radius)',
      padding: 3,
      marginBottom: 20,
    }}>
      {['email', 'sms'].map(ch => (
        <button
          key={ch}
          type="button"
          aria-pressed={channel === ch}
          onClick={() => onChange(ch)}
          style={{
            flex: 1,
            height: 36,
            borderRadius: 'calc(var(--radius) - 2px)',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 500,
            background: channel === ch ? 'var(--accent)' : 'transparent',
            color: channel === ch ? 'var(--accent-fg)' : 'var(--text-2)',
            transition: 'all 0.15s',
            // Item 9: box-shadow makes selection obvious beyond colour alone
            boxShadow: channel === ch ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
          }}
        >
          {ch === 'sms' ? 'Phone' : 'Email'}
        </button>
      ))}
    </div>
  );
}
