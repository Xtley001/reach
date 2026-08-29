import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../lib/api';
import { cached, invalidate, TTL } from '../../lib/cache';
import { getCachedContacts, cacheContacts } from '../../lib/offline';
import { StatusBadge, Modal, Spinner, EmptyState, PageSkeleton, PageHeader, Icon, TagChecklist, CallTimeline } from '../../components/UI';
import { toast } from '../../lib/toast';

function buildWAUrl(phone, template, name) {
  if (!phone) return '#';
  const msg = template
    ? template.body.replace(/\{name\}/gi, name).replace(/\[Name\]/g, name)
    : '';
  const clean = phone.replace(/\D/g, '');
  return msg
    ? `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/${clean}`;
}

const FILTERS = [
  { id: '',           label: 'All' },
  { id: 'needs_call', label: 'Needs Call' },
  { id: 'confirmed',  label: 'Confirmed' },
  { id: 'undecided',  label: 'Undecided' },
  { id: 'issues',     label: 'Issues' },
  // C-34/38: surfaces mass-paste-imported contacts still missing details —
  // the volunteer's very next tap after a paste-import lands here.
  { id: 'incomplete', label: 'Incomplete' },
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
  const [filter, setFilter]     = useState(() => location.state?.initialFilter || '');
  const [contacts, setContacts] = useState([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false); // NEW-001: inline error state
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [detailLoading, setDL]  = useState(false);
  const [templates, setTemplates] = useState([]);
  const [tagDefs, setTagDefs]   = useState([]);

  // Auto-Call Disposition state
  const [callContact, setCallContact] = useState(null);
  const [callReceptivity, setCallReceptivity] = useState(null);
  const [callAvailability, setCallAvailability] = useState(null);
  const [callComment, setCallComment] = useState('');
  const [callRemindAt, setCallRemindAt] = useState('');
  const [callSaving, setCallSaving] = useState(false);
  const pendingCallRef = useRef(null);

  // Return from phone call detection
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && pendingCallRef.current) {
        const contact = pendingCallRef.current;
        pendingCallRef.current = null;
        setCallContact(contact);
        setCallReceptivity(null);
        setCallAvailability(null);
        setCallComment('');
        setCallRemindAt('');
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  function handleInitiateCall(e, c) {
    e.stopPropagation();
    pendingCallRef.current = c;
  }

  async function handleSaveCallDisposition() {
    if (!callContact || !callReceptivity) return;
    setCallSaving(true);
    try {
      await api.logCall(callContact.id, {
        receptivity_code: callReceptivity,
        availability_code: callReceptivity === 'picked_up' ? callAvailability : null,
        comment: callComment.trim() || null,
        remind_at: (callAvailability === 'needs_reminder' && callRemindAt) ? new Date(callRemindAt).toISOString() : null,
      });

      // Update contact status locally
      let newStatus = callContact.current_status;
      if (callReceptivity === 'picked_up' && callAvailability) {
        newStatus = callAvailability === 'needs_bus' ? 'needs_transport' : callAvailability === 'needs_reminder' ? 'undecided' : callAvailability;
      } else if (callReceptivity === 'no_answer') {
        newStatus = 'no_answer';
      } else if (callReceptivity === 'wrong_number' || callReceptivity === 'invalid_number') {
        newStatus = 'wrong_number';
      }

      setContacts(cs => cs.map(x => x.id === callContact.id ? { ...x, current_status: newStatus } : x));
      invalidate('contacts:mine');
      invalidate('call:queue');
      toast('Call logged ✓', 'success');
      setCallContact(null);
    } catch (err) {
      toast(err.message || 'Failed to log call', 'error');
    }
    setCallSaving(false);
  }

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
    // B-17: fetch the config-driven tag list once — every TagChecklist chip
    // set on this page renders from this, not a hardcoded list.
    api.listTagDefinitions().then(d => setTagDefs(d.tags || [])).catch(() => {});
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
      if (f.id === 'incomplete') return c.is_incomplete;
      return true;
    }).length;
  });

  const incompleteCount = contacts.filter(c => c.is_incomplete).length;

  return (
    <div className="page">
      <PageHeader
        title="My Contacts"
        filters={
          <>
            <input
              className="field-input"
              style={{ marginBottom: 10 }}
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
          </>
        }
      />

      {/* C-34/38: banner pointing straight at "Finish these {n} contacts" —
          the mass-paste-import flow's very next tap, not a dead-end screen. */}
      {filter !== 'incomplete' && incompleteCount > 0 && (
        <button
          onClick={() => setFilter('incomplete')}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            margin: '0 var(--space-4)', marginTop: -4, marginBottom: 8,
            padding: '10px 12px', border: '1px solid var(--amber, #f59e0b)',
            borderRadius: 'var(--radius)', background: 'color-mix(in srgb, var(--amber, #f59e0b) 12%, var(--bg))',
            color: 'var(--amber, #f59e0b)', fontSize: 12.5, fontWeight: 500,
            fontFamily: 'var(--font-sans)', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <Icon name="alert" size={16} />
          Finish these {incompleteCount} contact{incompleteCount === 1 ? '' : 's'} — added quickly, still need details
        </button>
      )}

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
                  <div className="contact-name">
                    {c.name}
                    {c.is_incomplete && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--amber, #f59e0b)', fontWeight: 500 }}>
                        Incomplete
                      </span>
                    )}
                  </div>
                  <div className="contact-loc">{c.location || '—'}</div>
                  {c.needs_transport && (
                    <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>Needs transport</div>
                  )}
                  {tagDefs.length > 0 && (
                    <div style={{ marginTop: 6 }} onClick={e => e.stopPropagation()}>
                      <TagChecklist
                        size="sm"
                        contactId={c.id}
                        tagDefinitions={tagDefs}
                        activeTags={c.tags || []}
                        onChange={(newTags) => setContacts(cs => cs.map(x => x.id === c.id ? { ...x, tags: newTags } : x))}
                      />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <StatusBadge status={c.current_status} />
                  {c.message_sent_count > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                      ×{c.message_sent_count} sent
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <a
                      href={buildWAUrl(c.phone, templates[0], c.name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--badge-green-bg)', color: 'var(--badge-green-text)',
                        textDecoration: 'none', fontFamily: 'var(--font-sans)', fontWeight: 500,
                      }}
                    >
                      WhatsApp
                    </a>
                    <a
                      href={`tel:${c.phone}`}
                      onClick={e => handleInitiateCall(e, c)}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg-3)', color: 'var(--text-2)',
                        textDecoration: 'none', fontFamily: 'var(--font-sans)', fontWeight: 500,
                      }}
                    >
                      Call
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-Call Disposition Modal */}
      <Modal open={!!callContact} onClose={() => setCallContact(null)} title={`Log Call: ${callContact?.name || ''}`}>
        {callContact && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 14 }}>
              How did your call with <strong>{callContact.name}</strong> go?
            </div>

            {/* Receptivity */}
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Did they pick up?
            </div>
            <div className="tag-checklist" style={{ marginBottom: 12 }}>
              {[
                { code: 'picked_up', label: 'Picked Up', icon: 'phone' },
                { code: 'no_answer', label: 'No Answer', icon: 'clock' },
                { code: 'wrong_number', label: 'Wrong No', icon: 'x' },
                { code: 'invalid_number', label: 'Invalid No', icon: 'alert' },
              ].map(r => (
                <button
                  key={r.code}
                  type="button"
                  className={`tag-chip${callReceptivity === r.code ? ' active' : ''}`}
                  onClick={() => { setCallReceptivity(r.code); if (r.code !== 'picked_up') setCallAvailability(null); }}
                >
                  <Icon name={r.icon} size={14} />
                  <span>{r.label}</span>
                </button>
              ))}
            </div>

            {/* Availability: only once picked_up */}
            {callReceptivity === 'picked_up' && (
              <div style={{ marginBottom: 12, animation: 'pageIn 0.15s ease-out' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Are they coming?
                </div>
                <div className="tag-checklist">
                  {[
                    { code: 'coming', label: 'Coming', icon: 'check' },
                    { code: 'not_coming', label: 'Not Coming', icon: 'x' },
                    { code: 'needs_reminder', label: 'Needs Reminder', icon: 'clock' },
                    { code: 'needs_bus', label: 'Needs Bus', icon: 'bus' },
                  ].map(a => (
                    <button
                      key={a.code}
                      type="button"
                      className={`tag-chip${callAvailability === a.code ? ' active' : ''}`}
                      onClick={() => setCallAvailability(a.code)}
                    >
                      <Icon name={a.icon} size={14} />
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <input
              className="field-input"
              style={{ marginTop: 8, marginBottom: 16, fontSize: 13 }}
              placeholder="Add a quick note (optional)…"
              value={callComment}
              onChange={e => setCallComment(e.target.value)}
              maxLength={280}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setCallContact(null)}>Skip</button>
              <button
                className="btn btn-primary"
                disabled={!callReceptivity || callSaving}
                onClick={handleSaveCallDisposition}
              >
                {callSaving ? 'Saving…' : 'Log Call ✓'}
              </button>
            </div>
          </div>
        )}
      </Modal>

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

            {tagDefs.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Outcome tags</div>
                <TagChecklist
                  contactId={detail.id}
                  tagDefinitions={tagDefs}
                  activeTags={detail.tags || []}
                  onChange={(newTags) => {
                    setDetail(d => d ? { ...d, tags: newTags } : d);
                    setContacts(cs => cs.map(x => x.id === detail.id ? { ...x, tags: newTags } : x));
                  }}
                />
              </div>
            )}

            {/* F-73: full call timeline — who called, when, receptivity,
                availability, comment. Not just a single status badge. */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Call history</div>
              <CallTimeline contactId={detail.id} />
            </div>

            <div className="divider" />

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Update status</div>
              {(() => {
                const STATUS_BTNS = [
                  { code: 'coming',          label: '✓ Coming',     color: 'var(--green)' },
                  { code: 'undecided',       label: '? Undecided',  color: 'var(--amber)' },
                  { code: 'not_coming',      label: '✗ Not Coming', color: 'var(--red)' },
                  { code: 'no_answer',       label: '📵 No Answer', color: 'var(--text-2)' },
                  { code: 'needs_transport', label: '🚌 Needs Bus', color: '#f97316' },
                  { code: 'wrong_number',    label: '❌ Wrong No.',  color: 'var(--red)' },
                ];
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                    {STATUS_BTNS.map(btn => (
                      <button
                        key={btn.code}
                        onClick={() => updateStatus(btn.code)}
                        style={{
                          padding: '10px 8px', borderRadius: 'var(--radius)',
                          border: `1.5px solid ${selected?.current_status === btn.code ? btn.color : 'var(--border)'}`,
                          background: selected?.current_status === btn.code ? `${btn.color}18` : 'var(--bg-2)',
                          color: selected?.current_status === btn.code ? btn.color : 'var(--text)',
                          fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                );
              })()}
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
