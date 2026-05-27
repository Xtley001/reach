import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { cached, invalidate, TTL } from '../../lib/cache';
import { StatusBadge, PageSkeleton, EmptyState } from '../../components/UI';
import { toast } from '../../lib/toast';

const OUTCOMES = [
  { code: 'coming',          label: 'Confirmed' },
  { code: 'undecided',       label: 'Undecided' },
  { code: 'not_coming',      label: 'Not Coming' },
  { code: 'no_answer',       label: 'No Answer' },
  { code: 'needs_transport', label: 'Needs Bus' },
];

export default function CallQueue() {
  const [queue, setQueue]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive]   = useState(null);  // id of item being actioned
  const [undoItem, setUndoItem] = useState(null);
  const undoTimer = useRef(null);

  useEffect(() => {
    cached('call:queue', () => api.getCallQueue(), 20_000)
      .then(d => { setQueue(d.queue || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function markOutcome(item, code, notes = '') {
    setQueue(q => q.filter(i => i.id !== item.id));
    // Show undo for 3s
    setUndoItem(item);
    clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(async () => {
      setUndoItem(null);
      try {
        await api.updateStatus(item.contact_id, code);

        // FIX-BE-003: Auto-escalate to unreachable after 2 no-answer attempts
        if (code === 'no_answer') {
          try {
            const detail = await api.getContactDetail(item.contact_id);
            const noAnswerCount = (detail?.statuses || [])
              .filter(s => s.status_code === 'no_answer').length;
            if (noAnswerCount >= 2) {
              await api.updateStatus(item.contact_id, 'unreachable');
              toast('Marked unreachable after 2 no-answer attempts', 'info');
            }
          } catch {
            // Non-fatal — escalation is best-effort
          }
        }
      } catch {
        toast('Failed to save outcome', 'error');
        setQueue(q => [item, ...q]);
      }
      invalidate('call:queue');
      invalidate('contacts:mine');
    }, 3000);
    setActive(null);
  }

  function undoDone() {
    clearTimeout(undoTimer.current);
    setQueue(q => [undoItem, ...q]);
    setUndoItem(null);
    toast('Undone', 'warning');
  }

  if (loading) return (
    <div className="page">
      <div className="page-header"><div className="page-title">Call Queue</div></div>
      <div className="page-body"><PageSkeleton /></div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Call Queue</div>
        <div className="page-subtitle">{queue.length} to call</div>
      </div>

      <div className="page-body" style={{ padding: 0, position: 'relative' }}>
        {queue.length === 0 ? (
          <EmptyState
            icon="✅"
            message="You're all caught up! Every contact has been followed up."
          />
        ) : (
          <div>
            {queue.map(item => (
              <div key={item.id}>
                <div
                  className="contact-row"
                  onClick={() => setActive(active === item.id ? null : item.id)}
                  style={{ alignItems: 'flex-start' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="contact-name">{item.contact_name}</div>
                    <div className="contact-loc">{item.call_type?.replace(/_/g, ' ')}</div>
                    <div className="contact-meta">
                      Assigned by {item.assigned_by_name}
                      {item.is_past_due && <span style={{ color: 'var(--red)', marginLeft: 6 }}>· Overdue</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                    <StatusBadge status={item.contact_status} />
                    <a
                      href={`tel:${item.phone}`}
                      onClick={e => e.stopPropagation()}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 36, height: 36, borderRadius: 'var(--radius)',
                        background: 'var(--green)', color: 'white', textDecoration: 'none', fontSize: 16,
                      }}
                    >📞</a>
                  </div>
                </div>

                {active === item.id && (
                  <div style={{ padding: '0 var(--space-4) var(--space-3)', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)', animation: 'pageIn 0.1s ease-out' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Log outcome</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {OUTCOMES.map(o => (
                        <button
                          key={o.code}
                          className="btn btn-outline btn-sm"
                          onClick={() => markOutcome(item, o.code)}
                        >{o.label}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Undo snackbar */}
        {undoItem && (
          <div style={{
            position: 'fixed', bottom: 72, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-glass)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: 'var(--shadow-md)', zIndex: 500, animation: 'pageIn 0.15s ease-out',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Marked done</span>
            <button className="btn btn-ghost btn-sm" onClick={undoDone} style={{ color: 'var(--gold)' }}>Undo</button>
          </div>
        )}
      </div>
    </div>
  );
}
