import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, invalidate, TTL } from '../../lib/cache';
import { PageSkeleton } from '../../components/UI';
import { toast } from '../../lib/toast';
import VolunteerDetail from './VolunteerDetail';

const FILTERS = ['All', 'Pending', 'Active', 'Rejected'];

function PeopleIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-3)' }}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

export default function HubVolunteers() {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [filter, setFilter]         = useState('All');
  // FIX-001: selectedId drives VolunteerDetail drilldown
  const [selectedId, setSelectedId] = useState(null);

  function reload() {
    invalidate('hub:volunteers');
    cached('hub:volunteers', () => api.getHubVolunteers(), TTL.VOLUNTEERS)
      .then(d => setVolunteers(d.volunteers || []))
      .catch(() => {});
  }

  useEffect(() => {
    cached('hub:volunteers', () => api.getHubVolunteers(), TTL.VOLUNTEERS)
      .then(d => { setVolunteers(d.volunteers || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // FIX-001: Render VolunteerDetail when a volunteer is selected
  if (selectedId) {
    return (
      <VolunteerDetail
        volunteerId={selectedId}
        onBack={() => setSelectedId(null)}
        onReload={reload}
      />
    );
  }

  async function approve(e, id) {
    e.stopPropagation();
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

  async function reject(e, id) {
    e.stopPropagation();
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
          <div className="empty-state">
            <div className="empty-state-icon"><PeopleIcon /></div>
            <div className="empty-state-msg">No volunteers yet.</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Volunteers join via an invite link.</div>
          </div>
        ) : (
          <div>
            {filtered.map(v => (
              // FIX-001: onClick opens VolunteerDetail
              <div
                key={v.id}
                className="contact-row"
                style={{ alignItems: 'flex-start', cursor: 'pointer' }}
                onClick={() => setSelectedId(v.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{v.name || 'Unnamed'}</div>
                  {/* FIX-010: contact_count now populated from backend */}
                  <div className="contact-loc">
                    {v.contact_count > 0 ? `${v.contact_count} contact${v.contact_count !== 1 ? 's' : ''}` : 'No contacts yet'}
                  </div>
                  {v.phone && (
                    <a
                      href={`https://wa.me/${v.phone.replace('+', '')}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: 'var(--accent)' }}
                      onClick={e => e.stopPropagation()}
                    >WhatsApp</a>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span className={`badge ${v.status === 'active' ? 'badge-green' : v.status === 'pending' ? 'badge-amber' : 'badge-red'}`}>
                    {v.status}
                  </span>
                  {v.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: 'var(--green)', borderColor: 'var(--green)' }}
                        onClick={(e) => approve(e, v.id)}
                        disabled={v._saving}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        style={{ color: 'var(--red)', borderColor: 'var(--red)' }}
                        onClick={(e) => reject(e, v.id)}
                        disabled={v._saving}
                      >
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
