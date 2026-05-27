/**
 * REACH — AuthProgressBar
 * Shared progress bar for all auth flows.
 * Fixes: MED-05 (too thin at 2px → 4px), MED-10 (no step counter), MED-01 (dedup).
 */
export default function AuthProgressBar({ step, total }) {
  return (
    <div style={{ marginBottom: 28 }}>
      {/* Step counter text (MED-10) */}
      <p style={{
        fontSize: 11,
        color: 'var(--text-3)',
        textAlign: 'right',
        marginBottom: 6,
        fontFamily: 'var(--font-mono)',
      }}>
        Step {step + 1} of {total}
      </p>
      {/* Progress track — 4px tall for visibility (MED-05) */}
      <div style={{ height: 4, background: 'var(--bg-3)', borderRadius: 4 }}>
        <div style={{
          height: '100%',
          borderRadius: 4,
          background: 'var(--accent)',
          width: `${((step + 1) / total) * 100}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>
    </div>
  );
}
