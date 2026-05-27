import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, TTL } from '../../lib/cache';
import { StatusBadge, PageSkeleton, EmptyState } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function HubContacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(0);
  const PAGE_SIZE = 25;

  useEffect(() => {
    cached('hub:contacts', () => api.getHubContacts(), TTL.HUB_DASH)
      .then(d => { setContacts(d.contacts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.location || '').toLowerCase().includes(q);
  });

  const paged      = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Hub Contacts</div>
        <input
          className="field-input"
          style={{ marginTop: 10 }}
          placeholder="Search name or area…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
        />
      </div>
      <div className="page-body" style={{ padding: 0 }}>
        {loading ? <PageSkeleton /> : paged.length === 0 ? (
          <EmptyState icon="👥" message="No contacts found." />
        ) : (
          <>
            {paged.map(c => (
              <div key={c.id} className="contact-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{c.name}</div>
                  <div className="contact-loc">{c.location}</div>
                  {c.volunteer_name && (
                    <div className="contact-meta">Added by {c.volunteer_name}</div>
                  )}
                </div>
                <StatusBadge status={c.current_status} />
              </div>
            ))}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                  ← Prev
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-2)', alignSelf: 'center' }}>
                  {page + 1} / {totalPages}
                </span>
                <button className="btn btn-outline btn-sm" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
