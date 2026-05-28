/**
 * REACH — AuthTopbar
 * Shared topbar for all auth flows: Back button + brand wordmark + ThemeToggle.
 * Fixes: HIGH-04 (tap target), HIGH-01/LOW-01 (brand contrast), MED-01 (dedup).
 */
import ThemeToggle from '../ThemeToggle';

const BACK_ARROW = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </svg>
);

export default function AuthTopbar({ onBack }) {
  return (
    <div className="topbar">
      {/* Back button — min 44px tap target (HIGH-04) */}
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text-2)',        /* raised from text-3 for contrast */
          cursor: 'pointer',
          fontFamily: 'var(--font-sans)',
          fontSize: 13,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minHeight: 44,
          minWidth: 44,
          padding: '0 8px',
          borderRadius: 'var(--radius)',
        }}
        aria-label="Go back"
      >
        {BACK_ARROW} Back
      </button>

      {/* REACH wordmark — var(--text) for readable brand identity (LOW-01) */}
      <span style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.22em',
        color: 'var(--text)',
        textTransform: 'uppercase',
      }}>
        REACH
      </span>

      <ThemeToggle />
    </div>
  );
}
