import { useState, useEffect, useMemo } from 'react';
import { api } from '../../lib/api';
import { cached, TTL } from '../../lib/cache';
import { StatusBadge, PageSkeleton, EmptyState, Modal, TagChecklist, CallTimeline } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function HubContacts() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState({});
  const [detail, setDetail]     = useState(null); // F-73/B-25: contact selected for tags + call timeline
  const [tagDefs, setTagDefs]   = useState([]);
  function toggle(id) { setExpanded(e => ({ ...e, [id]: !e[id] })); }

  useEffect(() => {
    cached('hub:contacts', () => api.getHubContacts(), TTL.HUB_DASH)
      .then(d => { setContacts(d.contacts || []); setLoading(false); })
      .catch(() => setLoading(false));
    api.listTagDefinitions().then(d => setTagDefs(d.tags || [])).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const filtered = contacts.filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return c.name.toLowerCase().includes(q) || (c.location || '').toLowerCase().includes(q);
    });
    const map = {};
    filtered.forEach(c => {
      const key = c.added_by_id || 'unknown';
      if (!map[key]) map[key] = { name: c.added_by_name || c.volunteer_name || 'Unknown', id: key, contacts: [] };
      map[key].contacts.push(c);
    });
    return Object.values(map).sort((a, b) => b.contacts.length - a.contacts.length);
  }, [contacts, search]);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Hub Contacts</div>
        <input
          className="field-input"
          style={{ marginTop: 10 }}
          placeholder="Search name or area…"
          value={search}
          onChange={e => { setSearch(e.target.value); }}
        />
      </div>
      <div className="page-body" style={{ padding: 0 }}>
        {loading ? <PageSkeleton /> : grouped.length === 0 ? (
          <EmptyState icon={<Icon name="people" size={32} />} message="No contacts found." />
        ) : (
          <div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
            {grouped.map(group => (
              <div key={group.id} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => toggle(group.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', padding: '12px 16px',
                    background: 'var(--bg-2)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius)', cursor: 'pointer',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{group.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 8 }}>
                      {group.contacts.length} contacts · {group.contacts.filter(c => c.current_status === 'coming').length} confirmed
                    </span>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)' }}>
                    <Icon name={expanded[group.id] ? 'chevronDown' : 'chevronRight'} size={16} />
                  </span>
                </button>
                {expanded[group.id] && group.contacts.map(contact => (
                  <div
                    key={contact.id}
                    className="contact-row"
                    style={{ marginLeft: 8, borderLeft: '2px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => setDetail(contact)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="contact-name">
                        {contact.name}
                        {contact.is_incomplete && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--amber, #f59e0b)', fontWeight: 500 }}>Incomplete</span>
                        )}
                      </div>
                      <div className="contact-loc">{contact.location || '—'}</div>
                    </div>
                    <StatusBadge status={contact.current_status} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 14 }}>{detail.location || 'No location yet'}</div>

            {tagDefs.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Outcome tags</div>
                <TagChecklist
                  contactId={detail.id}
                  tagDefinitions={tagDefs}
                  activeTags={detail.tags || []}
                  onChange={(newTags) => {
                    setContacts(cs => cs.map(x => x.id === detail.id ? { ...x, tags: newTags } : x));
                    setDetail(d => d ? { ...d, tags: newTags } : d);
                  }}
                />
              </div>
            )}

            <div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Call history</div>
              <CallTimeline contactId={detail.id} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
