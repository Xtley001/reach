import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, invalidate } from '../../lib/cache';
import { PageSkeleton, EmptyState, Icon, PageHeader } from '../../components/UI';
import { toast, toastError } from '../../lib/toast';

/**
 * REACH — CallQueue.jsx (backlog Section F redesign)
 *
 * Bug fix while rebuilding this screen: the previous version read
 * `d.queue` from api.getCallQueue(), but the backend
 * (GET /contacts/queue/to-call) has always returned `{ contacts: [...] }`
 * with fields `id/name/phone/location/current_status` — not the
 * `queue/contact_id/contact_name/call_type/assigned_by_name/is_past_due`
 * shape this screen expected. The queue has effectively always rendered
 * empty. Fixed here as part of the F redesign, not a separate item, since
 * it's the same file and the same "does the call queue actually work" bug.
 *
 * F-66/67/68/69/70/71/72: two independent, single-select questions.
 * Receptivity always shown; availability only renders once "Picked Up" is
 * tapped. One optional comment line. Two taps and back to dialing.
 */

const RECEPTIVITY = [
  { code: 'picked_up',      label: 'Picked Up',      icon: 'phone' },
  { code: 'no_answer',      label: 'No Answer',      icon: 'clock' },
  { code: 'wrong_number',   label: 'Wrong Number',   icon: 'x' },
  { code: 'invalid_number', label: 'Invalid Number', icon: 'alert' },
];

const AVAILABILITY = [
  { code: 'coming',         label: 'Coming',         icon: 'check' },
  { code: 'not_coming',     label: 'Not Coming',     icon: 'x' },
  { code: 'needs_reminder', label: 'Needs Reminder',  icon: 'clock' },
  { code: 'needs_bus',      label: 'Needs Bus',       icon: 'bus' },
];

export default function CallQueue() {
  const [queue, setQueue]     = useState([]);
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive]   = useState(null);   // contact id being logged
  const [receptivity, setReceptivity]   = useState(null);
  const [availability, setAvailability] = useState(null);
  const [comment, setComment] = useState('');
  const [remindAt, setRemindAt] = useState('');    // F-76: optional call-back time
  const [saving, setSaving]   = useState(false);

  function load() {
    setLoading(true);
    cached('call:queue', () => api.getCallQueue(), 20_000)
      .then(d => { setQueue(d.contacts || []); setLoading(false); })
      .catch(() => setLoading(false));
    // F-76: surfaced back into the volunteer's own queue — small, skippable.
    api.getMyReminders().then(d => setReminders(d.reminders || [])).catch(() => {});
  }

  useEffect(load, []);

  function openLogger(item) {
    setActive(active === item.id ? null : item.id);
    setReceptivity(null);
    setAvailability(null);
    setComment('');
    setRemindAt('');
  }

  async function submit(item) {
    if (!receptivity) return;
    setSaving(true);
    try {
      await api.logCall(item.id, {
        receptivity_code: receptivity,
        availability_code: receptivity === 'picked_up' ? availability : null,
        comment: comment.trim() || null,
        remind_at: (availability === 'needs_reminder' && remindAt) ? new Date(remindAt).toISOString() : null,
      });
      toast('Call logged', 'success');
      // F-71: auto-escalation happens server-side; a resolved/escalated
      // contact simply won't come back in the next queue fetch.
      setQueue(q => q.filter(c => c.id !== item.id));
      setActive(null);
      invalidate('call:queue');
      invalidate('contacts:mine');
    } catch (e) {
      toastError(e.message || "Couldn't save that call — try again.");
    }
    setSaving(false);
  }

  if (loading) return (
    <div className="page">
      <PageHeader title="Call Queue" />
      <div className="page-body"><PageSkeleton /></div>
    </div>
  );

  return (
    <div className="page">
      <PageHeader title="Call Queue" subtitle={`${queue.length} to call`} />

      {/* F-76: reminders surfaced back into the volunteer's own queue. */}
      {reminders.length > 0 && (
        <div style={{ padding: '0 var(--space-4)', marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Reminders
          </div>
          {reminders.map(r => (
            <div key={r.call_id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 10px', marginBottom: 4, borderRadius: 'var(--radius-sm)',
              background: 'color-mix(in srgb, var(--accent) 8%, var(--bg))', fontSize: 12,
            }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.contact_name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                  {new Date(r.remind_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              <a href={`tel:${r.contact_phone}`} style={{ color: 'var(--green)' }}>
                <Icon name="phone" size={16} />
              </a>
            </div>
          ))}
        </div>
      )}

      <div className="page-body" style={{ padding: 0 }}>
        {queue.length === 0 ? (
          <EmptyState
            icon={<Icon name="check" size={32} />}
            message="You're all caught up! Every contact has been followed up."
          />
        ) : (
          <div>
            {queue.map(item => (
              <div key={item.id}>
                <div
                  className="contact-row"
                  onClick={() => openLogger(item)}
                  style={{ alignItems: 'flex-start' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="contact-name">{item.name}</div>
                    <div className="contact-loc">{item.location || '—'}</div>
                  </div>
                  <a
                    href={`tel:${item.phone}`}
                    onClick={e => e.stopPropagation()}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      width: 40, height: 40, borderRadius: 'var(--radius)',
                      background: 'var(--green)', color: 'white', textDecoration: 'none',
                    }}
                  ><Icon name="phone" size={17} /></a>
                </div>

                {active === item.id && (
                  <div style={{
                    padding: 'var(--space-3) var(--space-4) var(--space-4)',
                    borderBottom: '1px solid var(--border)', background: 'var(--bg-2)',
                    animation: 'pageIn 0.1s ease-out',
                  }}>
                    {/* Receptivity: always shown, single-select */}
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Did they pick up?
                    </div>
                    <div className="tag-checklist" style={{ marginBottom: 4 }}>
                      {RECEPTIVITY.map(r => (
                        <button
                          key={r.code}
                          type="button"
                          className={`tag-chip${receptivity === r.code ? ' active' : ''}`}
                          onClick={() => { setReceptivity(r.code); if (r.code !== 'picked_up') setAvailability(null); }}
                        >
                          <Icon name={r.icon} size={14} />
                          <span>{r.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Availability: only once picked_up — light slide-in, no jarring re-layout */}
                    {receptivity === 'picked_up' && (
                      <div style={{ marginTop: 14, animation: 'pageIn 0.15s ease-out' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          Are they coming?
                        </div>
                        <div className="tag-checklist">
                          {AVAILABILITY.map(a => (
                            <button
                              key={a.code}
                              type="button"
                              className={`tag-chip${availability === a.code ? ' active' : ''}`}
                              onClick={() => setAvailability(a.code)}
                            >
                              <Icon name={a.icon} size={14} />
                              <span>{a.label}</span>
                            </button>
                          ))}
                        </div>

                        {/* F-76: optional call-back reminder — only shown for
                            needs_reminder, never required, easy to skip. */}
                        {availability === 'needs_reminder' && (
                          <div style={{ marginTop: 10, animation: 'pageIn 0.15s ease-out' }}>
                            <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 4 }}>
                              Remind me (optional)
                            </label>
                            <input
                              type="datetime-local"
                              className="field-input"
                              style={{ fontSize: 13 }}
                              value={remindAt}
                              onChange={e => setRemindAt(e.target.value)}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* F-70: one optional single-line comment, never required, always visible */}
                    <input
                      className="field-input"
                      style={{ marginTop: 14, fontSize: 13 }}
                      placeholder="Add a note (optional) — e.g. 'call back after the 20th'"
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      maxLength={280}
                    />

                    <button
                      className="btn btn-primary btn-full"
                      style={{ marginTop: 12, height: 44 }}
                      disabled={!receptivity || saving}
                      onClick={() => submit(item)}
                    >
                      {saving ? 'Saving…' : 'Log Call'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
