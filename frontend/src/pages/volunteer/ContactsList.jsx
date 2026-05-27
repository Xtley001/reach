import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../lib/api';
import { cached, invalidate, TTL } from '../../lib/cache';
import { getCachedContacts, cacheContacts } from '../../lib/offline';
import { StatusBadge, Modal, Spinner, EmptyState, PageSkeleton } from '../../components/UI';
import { toast } from '../../lib/toast';

const FILTERS = [
  { id: '',           label: 'All' },
  { id: 'needs_call', label: 'Needs Call' },
  { id: 'confirmed',  label: 'Confirmed' },
  { id: 'undecided',  label: 'Undecided' },
  { id: 'issues',     label: 'Issues' },
];

const STATUS_OPTIONS = [
  { code: 'coming',          label: 'Coming' },
  { code: 'undecided',       label: 'Undecided' },
  { code: 'not_coming',      label: 'Not Coming' },
  { code: 'no_answer',       label: 'No Answer' },
  { code: 'wrong_number',    label: 'Wrong No.' },
  { code: 'needs_transport', label: 'Needs Bus' },
  { code: 'unreachable',     label: 'Unreachable' },
];

export default function ContactsList() {
  const location = useLocation();
  const [filter, setFilter]     = useState('');
  const [contacts, setContacts] = useState([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false); // NEW-001: inline error state
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [detailLoading, setDL]  = useState(false);
  const [templates, setTemplates] = useState([]);

  async function load(f = filter) {
    setLoading(true);
    setLoadError(false); // NEW-001: reset inline error on retry
    if (!navigator.onLine) {
      try { setContacts((await getCachedContacts()) || []); } catch {}
      setLoading(false); return;
    }
    try {
      const data = await cached(`contacts:mine:${f}`, () => api.listContacts(f || undefined), TTL.CONTACTS);
      const list = data.contacts || [];
      setContacts(list);
      if (!f) cacheContacts(list).catch(() => {});
    } catch (e) {
      // NEW-001: set inline error state instead of floating toast that looked like a button
      setLoadError(true);
    }
    setLoading(false);
  }

  useEffect(() => { load(filter); }, [filter]);

  // FIX-009: If navigated here with a pre-selected contact ID (from home recent list), open it
  useEffect(() => {
    const preSelectId = location.state?.openContactId;
    if (preSelectId && contacts.length > 0) {
      const c = contacts.find(x => x.id === preSelectId);
      if (c) openContact(c);
    }
  }, [contacts, location.state?.openContactId]);

  useEffect(() => {
    api.getActiveTemplates().then(d => setTemplates(d.templates || [])).catch(() => {});
  }, []);

  async function openContact(c) {
    setSelected(c); setDetail(null); setDL(true);
    try { setDetail(await api.getContact(c.id)); } catch {}
    setDL(false);
  }

  async function updateStatus(code) {
    if (!selected) return;
    const old = selected.current_status;
    // Optimistic update
    setContacts(cs => cs.map(c => c.id === selected.id ? { ...c, current_status: code } : c));
    setSelected(s => s ? { ...s, current_status: code } : s);
    setDetail(d => d ? { ...d, current_status: code } : d);
    try {
      await api.updateStatus(selected.id, code);
      invalidate(`contacts:mine:${filter}`);
      toast('Status updated', 'success');
    } catch {
      // Rollback
      setContacts(cs => cs.map(c => c.id === selected.id ? { ...c, current_status: old } : c));
      setSelected(s => s ? { ...s, current_status: old } : s);
      toast('Update failed — reverted', 'error');
    }
  }

  function buildWALink(contact, template) {
    let msg = template.body
      .replaceAll('[Name]', contact.name)
      .replaceAll('[Location]', contact.location);
    const phone = detail?.phone?.replace('+', '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  async function sendViaWA(template) {
    if (!detail) return;
    window.open(buildWALink(selected, template), '_blank');
    try { await api.logMessageSend(selected.id, template.id); } catch {}
    setDetail(d => d ? { ...d, message_sent_count: (d.message_sent_count || 0) + 1, current_status: 'message_sent' } : d);
    setContacts(cs => cs.map(c => c.id === selected.id ? { ...c, current_status: 'message_sent' } : c));
  }

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.location || '').toLowerCase().includes(q);
  });

  const filterCounts = {};
  FILTERS.forEach(f => {
    if (!f.id) { filterCounts[''] = contacts.length; return; }
    filterCounts[f.id] = contacts.filter(c => {
      if (f.id === 'confirmed')  return c.current_status === 'coming';
      if (f.id === 'needs_call') return ['no_answer','message_sent','undecided'].includes(c.current_status);
      if (f.id === 'undecided')  return c.current_status === 'undecided';
      if (f.id === 'issues')     return ['not_coming','wrong_number','unreachable'].includes(c.current_status);
      return true;
    }).length;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">My Contacts</div>
        <input
          className="field-input"
          style={{ marginTop: 10 }}
          placeholder="Search name or area…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="filter-row">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`filter-tag${filter === f.id ? ' active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
              {filterCounts[f.id] > 0 && (
                <span style={{ marginLeft: 4, opacity: 0.7 }}>({filterCounts[f.id]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body" style={{ padding: 0 }}>
        {loading ? (
          <PageSkeleton />
        ) : loadError ? (
          /* NEW-001: inline error — no more floating box that looks like a button */
          <div style={{ padding: 'var(--space-8) var(--space-5)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)', textAlign: 'center' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-3)' }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>Couldn't load contacts</div>
            <button
              onClick={() => load(filter)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 500 }}
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="👥" message={search ? 'No contacts match.' : 'No contacts yet. Add your first!'} />
        ) : (
          <div>
            {filtered.map(c => (
              <div key={c.id} className="contact-row" onClick={() => openContact(c)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{c.name}</div>
                  <div className="contact-loc">{c.location}</div>
                  {c.needs_transport && (
                    <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>Needs transport</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <StatusBadge status={c.current_status} />
                  {c.message_sent_count > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                      ×{c.message_sent_count} sent
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={!!selected} onClose={() => { setSelected(null); setDetail(null); }} title={selected?.name || ''}>
        {detailLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
        ) : detail ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Phone</div>
                <a href={`tel:${detail.phone}`} style={{ color: 'var(--accent)', fontSize: 13 }}>{detail.phone}</a>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Location</div>
                <div style={{ fontSize: 13 }}>{detail.location}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Status</div>
                <StatusBadge status={detail.current_status} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Msgs sent</div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 700 }}>{detail.message_sent_count}</div>
              </div>
            </div>

            {detail.notes && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Notes</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, background: 'var(--bg-3)', padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
                  {detail.notes}
                </div>
              </div>
            )}

            <div className="divider" />

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Update status</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.code}
                    onClick={() => updateStatus(s.code)}
                    style={{
                      padding: '6px 11px', borderRadius: 'var(--radius)',
                      border: `1px solid ${detail.current_status === s.code ? 'var(--accent)' : 'var(--border)'}`,
                      background: detail.current_status === s.code ? 'var(--bg-3)' : 'transparent',
                      color: detail.current_status === s.code ? 'var(--accent)' : 'var(--text-2)',
                      fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)',
                    }}
                  >{s.label}</button>
                ))}
              </div>
            </div>

            {detail.phone && (
              <a
                href={`https://wa.me/${detail.phone.replace('+', '')}`}
                target="_blank" rel="noopener noreferrer"
                className="btn btn-outline btn-full"
                style={{ marginBottom: 12 }}
              >
                WhatsApp
              </a>
            )}

            {templates.filter(t => !t.is_expired).length > 0 && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Send Template</div>
                {templates.filter(t => !t.is_expired).map(t => (
                  <button
                    key={t.id} onClick={() => sendViaWA(t)}
                    style={{
                      width: '100%', background: 'var(--bg-3)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', padding: '10px 12px', cursor: 'pointer',
                      textAlign: 'left', marginBottom: 8, fontFamily: 'var(--font-sans)',
                    }}
                  >
                    <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 2 }}>{t.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{t.body.slice(0, 60)}…</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
