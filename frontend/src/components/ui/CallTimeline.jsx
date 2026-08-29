import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import Icon from './Icon';

const RECEPTIVITY_LABELS = {
  picked_up: 'Picked Up', no_answer: 'No Answer',
  wrong_number: 'Wrong Number', invalid_number: 'Invalid Number',
};
const AVAILABILITY_LABELS = {
  coming: 'Coming', not_coming: 'Not Coming',
  needs_reminder: 'Needs Reminder', needs_bus: 'Needs Bus',
};
const RECEPTIVITY_ICON = {
  picked_up: 'phone', no_answer: 'clock', wrong_number: 'x', invalid_number: 'alert',
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * REACH — CallTimeline.jsx
 *
 * F-73: "every call_logs row for that contact, newest first, showing who
 * called, when, receptivity, availability, and comment." This is the
 * actual leader-facing "data about the call," not just a single current
 * status badge.
 */
export default function CallTimeline({ contactId }) {
  const [calls, setCalls]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getCallTimeline(contactId)
      .then(d => { if (!cancelled) setCalls(d.calls || []); })
      .catch(() => { if (!cancelled) setCalls([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contactId]);

  if (loading) {
    return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading call history…</div>;
  }
  if (!calls || calls.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No calls logged yet.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {calls.map(c => (
        <div key={c.id} style={{
          display: 'flex', gap: 10, padding: '8px 10px',
          background: 'var(--bg-3)', borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{ flexShrink: 0, color: 'var(--text-3)', marginTop: 2 }}>
            <Icon name={RECEPTIVITY_ICON[c.receptivity_code] || 'phone'} size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>
                {RECEPTIVITY_LABELS[c.receptivity_code] || c.receptivity_code}
                {c.availability_code && ` · ${AVAILABILITY_LABELS[c.availability_code] || c.availability_code}`}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>{timeAgo(c.called_at)}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {c.called_by_name || 'A volunteer'}
            </div>
            {c.comment && (
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, fontStyle: 'italic' }}>
                "{c.comment}"
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
