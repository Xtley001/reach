import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, invalidate, TTL } from '../../lib/cache';
import { PageSkeleton, EmptyState } from '../../components/UI';
import { toast } from '../../lib/toast';

const FILTERS = ['All', 'Pending', 'Active', 'Rejected'];

export default function HubVolunteers() {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('All');

  useEffect(() => {
    cached('hub:volunteers', () => api.getHubVolunteers(), TTL.VOLUNTEERS)
      .then(d => { setVolunteers(d.volunteers || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function approve(id) {
    setVolunteers(vs => vs.map(v => v.id === id ? { ...v, status: 'active', _saving: true } : v));
    try {
      await api.approveVolunteer(id);
      invalidate('hub:volunteers');
      toast('Volunteer approved', 'success');
    } catch {
      setVolunteers(vs => vs.map(v => v.id === id ? { ...v, status: 'pending', _saving: false } : v));
      toast('Failed to approve', 'error');
    }
    setVolunteers(vs => vs.map(v => v.id === id ? { ...v, _saving: false } : v));
  }

  async function reject(id) {
    setVolunteers(vs => vs.map(v => v.id === id ? { ...v, status: 'rejected', _saving: true } : v));
    try {
      await api.rejectVolunteer(id);
      invalidate('hub:volunteers');
      toast('Volunteer rejected', 'warning');
    } catch {
      setVolunteers(vs => vs.map(v => v.id === id ? { ...v, status: 'pending', _saving: false } : v));
      toast('Failed to reject', 'error');
    }
    setVolunteers(vs => vs.map(v => v.id === id ? { ...v, _saving: false } : v));
  }

  const filtered = volunteers.filter(v => {
    if (filter === 'All') return true;
    return v.status === filter.toLowerCase();
  });

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Volunteers</div>
        <div className="filter-row">
          {FILTERS.map(f => (
            <button key={f} className={`filter-tag${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="page-body" style={{ padding: 0 }}>
        {loading ? <PageSkeleton /> : filtered.length === 0 ? (
          <EmptyState icon="👥" message="No volunteers." />
        ) : (
          <div>
            {filtered.map(v => (
              <div key={v.id} className="contact-row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{v.name || 'Unnamed'}</div>
                  <div className="contact-loc">{v.contact_count || 0} contacts</div>
                  {v.phone && (
                    <a href={`https://wa.me/${v.phone.replace('+', '')}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--green)' }}>WhatsApp</a>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span className={`badge ${v.status === 'active' ? 'badge-green' : v.status === 'pending' ? 'badge-amber' : 'badge-red'}`}>
                    {v.status}
                  </span>
                  {v.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-outline btn-sm" style={{ color: 'var(--green)', borderColor: 'var(--green)' }} onClick={() => approve(v.id)} disabled={v._saving}>
                        Approve
                      </button>
                      <button className="btn btn-outline btn-sm" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={() => reject(v.id)} disabled={v._saving}>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
