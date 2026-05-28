import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, invalidate, TTL } from '../../lib/cache';
import { Spinner, EmptyState, PageSkeleton } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function HubLogistics() {
  const [logistics, setLogistics] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    cached('hub:logistics', () => api.getLogistics(), 30_000)
      .then(d => { setLogistics(d.logistics || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function updateStatus(item, newStatus) {
    const old = item.transport_status;
    // Optimistic
    setLogistics(ls => ls.map(l => l.contact_id === item.contact_id ? { ...l, transport_status: newStatus } : l));
    try {
      await api.updateLogistics(item.contact_id, { transport_status: newStatus, coordinator_note: item.coordinator_note });
      invalidate('hub:logistics');
      toast('Transport status updated', 'success');
    } catch {
      setLogistics(ls => ls.map(l => l.contact_id === item.contact_id ? { ...l, transport_status: old } : l));
      toast('Update failed', 'error');
    }
  }

  const pending  = logistics.filter(l => l.transport_status === 'pending');
  const arranged = logistics.filter(l => l.transport_status === 'arranged');

  function copyLocations() {
    const pendingItems = logistics.filter(c => c.transport_status === 'pending');
    const lines = pendingItems.map((c, i) =>
      `${i + 1}. ${c.contact_name} — ${c.transport_location || c.location || 'Location not set'}`
    ).join('\n');
    const text = `Transport Pickups\n${'─'.repeat(28)}\n${lines}`;
    navigator.clipboard.writeText(text)
      .then(() => toast('Pickup list copied!', 'success'))
      .catch(() => toast('Copy failed', 'error'));
  }

  if (loading) return (
    <div className="page">
      <div className="page-header"><div className="page-title">Transport</div></div>
      <div className="page-body"><PageSkeleton /></div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Transport</div>
        <div className="page-subtitle">{logistics.length} contacts need a bus</div>
      </div>
      <div className="page-body" style={{ padding: 0 }}>
        {logistics.length === 0 ? (
          <EmptyState icon="🚌" message="No transport requests yet." />
        ) : (
          <>
            {pending.length > 0 && (
              <div>
                <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-1)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Pending ({pending.length})</span>
                  <button className="btn btn-outline btn-sm" onClick={copyLocations}>
                    Copy pickup list
                  </button>
                </div>
                {pending.map(item => <LogisticsRow key={item.contact_id} item={item} onUpdate={updateStatus} />)}
              </div>
            )}
            {arranged.length > 0 && (
              <div>
                <div style={{ padding: 'var(--space-3) var(--space-4) var(--space-1)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Arranged ({arranged.length})
                </div>
                {arranged.map(item => <LogisticsRow key={item.contact_id} item={item} onUpdate={updateStatus} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LogisticsRow({ item, onUpdate }) {
  return (
    <div className="contact-row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="contact-name">{item.contact_name}</div>
        <div className="contact-loc">{item.transport_location || 'Location not set'}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
          Added by: {item.added_by_name || 'Unknown'}
        </div>
        <div style={{ marginTop: 4 }}>
          <a href={`tel:${item.phone}`} style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{item.phone}</a>
        </div>
      </div>
      <div>
        <button
          onClick={() => onUpdate(item, item.transport_status === 'pending' ? 'arranged' : 'pending')}
          className={`badge ${item.transport_status === 'arranged' ? 'badge-green' : 'badge-amber'}`}
          style={{ cursor: 'pointer', border: 'none', background: undefined }}
        >
          {item.transport_status === 'arranged' ? 'Arranged ✓' : 'Mark Arranged'}
        </button>
      </div>
    </div>
  );
}
