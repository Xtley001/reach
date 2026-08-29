/**
 * REACH — RollupChart.jsx
 *
 * B-26/F-74: "two small, clean rollups instead of one messy 8-category
 * chart." Renders a horizontal bar list for either the per-tag counts or
 * the call receptivity/availability rollups returned by
 * GET /dashboard/minister and GET /dashboard/hub.
 */
export default function RollupChart({ title, entries, emptyLabel = 'No data yet' }) {
  const max = Math.max(1, ...entries.map(e => e.count));
  const hasData = entries.some(e => e.count > 0);

  return (
    <div className="card">
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--text-2)' }}>{title}</div>
      {!hasData ? (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{emptyLabel}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map(e => (
            <div key={e.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 90, fontSize: 11, color: 'var(--text-2)', flexShrink: 0 }}>{e.label}</div>
              <div style={{ flex: 1, height: 8, background: 'var(--bg-3)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${(e.count / max) * 100}%`,
                  background: e.color || 'var(--accent)', borderRadius: 4,
                  transition: 'width 0.4s ease',
                }} />
              </div>
              <div style={{ width: 24, fontSize: 12, fontWeight: 600, textAlign: 'right', flexShrink: 0 }}>{e.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const RECEPTIVITY_LABELS = {
  picked_up: 'Picked Up', no_answer: 'No Answer',
  wrong_number: 'Wrong #', invalid_number: 'Invalid #',
};
const AVAILABILITY_LABELS = {
  coming: 'Coming', not_coming: 'Not Coming',
  needs_reminder: 'Reminder', needs_bus: 'Needs Bus',
};

export function TagCountsChart({ tagCounts }) {
  if (!tagCounts) return null;
  const entries = Object.values(tagCounts).map(t => ({ label: t.label, count: t.count }));
  return <RollupChart title="Outcome Tags" entries={entries} emptyLabel="No tags applied yet" />;
}

export function ReceptivityChart({ callRollups }) {
  if (!callRollups) return null;
  const entries = Object.entries(callRollups.receptivity || {}).map(([code, count]) => ({
    label: RECEPTIVITY_LABELS[code] || code, count,
  }));
  return <RollupChart title="Call Receptivity (7d)" entries={entries} emptyLabel="No calls logged yet" />;
}

export function AvailabilityChart({ callRollups }) {
  if (!callRollups) return null;
  const entries = Object.entries(callRollups.availability || {}).map(([code, count]) => ({
    label: AVAILABILITY_LABELS[code] || code, count,
  }));
  return <RollupChart title="Availability (7d)" entries={entries} emptyLabel="No answers logged yet" />;
}
