/**
 * REACH — Attendance Gate
 * URL: /attend  |  Registration Team only
 * Full contacts list cached locally. Gate search is client-side — 50ms regardless of network.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { cached, TTL } from '../lib/cache';
import { toast } from '../lib/toast';
import { useAuth } from '../hooks/useAuth';
import { StatusBadge, Icon } from '../components/UI';

export default function AttendLayout() {
  const { user, logout } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [checking, setChecking] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [undoId, setUndoId]     = useState(null);
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ name:'', phone:'', area:'', how_did_you_hear:'', email:'', notes:'' });
  const [walkInLoading, setWalkInLoading] = useState(false);
  const searchRef = useRef();

  useEffect(() => {
    searchRef.current?.focus();
    cached('attendance:contacts', () => api.attendanceContacts(), TTL.ATT_STATUS)
      .then(d => { setContacts(d.contacts || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = search.length >= 2
    ? contacts.filter(c => {
        const q = search.toLowerCase();
        const nameMatch = c.name.toLowerCase().includes(q);
        const phoneMatch = c.phone_last4 && search.replace(/\D/g, '').length >= 4
          && c.phone_last4.endsWith(search.replace(/\D/g, '').slice(-4));
        return nameMatch || phoneMatch;
      })
    : [];

  async function checkIn(contact) {
    if (contact.attended) return;
    setChecking(contact.id);
    // Optimistic
    setContacts(cs => cs.map(c => c.id === contact.id
      ? { ...c, attended: true, attended_at: new Date().toISOString() }
      : c
    ));
    setExpanded(contact.id);

    // Undo window
    const timer = setTimeout(() => setUndoId(null), 10000);
    setUndoId(contact.id);

    try {
      await api.attendanceCheckIn(contact.id);
    } catch (e) {
      // Rollback
      setContacts(cs => cs.map(c => c.id === contact.id ? { ...c, attended: false } : c));
      toast('Check-in failed', 'error');
      clearTimeout(timer);
      setUndoId(null);
    }
    setChecking(null);
  }

  async function undo(contact) {
    setContacts(cs => cs.map(c => c.id === contact.id ? { ...c, attended: false, attended_at: null } : c));
    setUndoId(null);
    // P1-3.3: Persist undo to server
    try {
      await api.attendanceUndoCheckIn(contact.id);
      toast('Check-in undone', 'warning');
    } catch {
      // Rollback local state if server rejects
      setContacts(cs => cs.map(c => c.id === contact.id ? { ...c, attended: true } : c));
      toast('Undo failed', 'error');
    }
  }

  async function submitWalkIn() {
    if (!walkInForm.name || !walkInForm.phone || !walkInForm.area || !walkInForm.how_did_you_hear) {
      toast('Fill all required fields', 'error'); return;
    }
    setWalkInLoading(true);
    try {
      const res = await api.attendanceWalkIn(walkInForm);
      if (res.duplicate) {
        toast(`Matched existing contact: ${res.contact_name}`, 'warning');
      } else {
        toast('Walk-in registered', 'success');
      }
      // Refresh contact list
      const d = await api.attendanceContacts();
      setContacts(d.contacts || []);
      setShowWalkIn(false);
      setWalkInForm({ name:'', phone:'', area:'', how_did_you_hear:'', email:'', notes:'' });
    } catch (e) {
      toast(e.message || 'Registration failed', 'error');
    }
    setWalkInLoading(false);
  }

  const checkedInCount = contacts.filter(c => c.attended).length;

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* Glass top bar */}
      <div className="topbar glass" style={{ position: 'relative' }}>
        <div>
          <div className="topbar-brand">Attendance Gate</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
            {checkedInCount} checked in
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="sync-dot" />
          <button className="btn btn-ghost btn-sm" onClick={logout} style={{ fontSize: 11 }}>Sign out</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <input
          ref={searchRef}
          className="field-input"
          style={{ height: 52, fontSize: 18 }}
          placeholder="Search name or last 4 digits of phone…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          autoComplete="off"
          autoFocus
        />
      </div>

      {/* Results */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div className="spinner spinner-lg" />
          </div>
        ) : search.length < 2 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', gap: 8 }}>
            <div style={{ color: 'var(--text-3)' }}><Icon name="search" size={32} /></div>
            <div style={{ fontSize: 14 }}>Type at least 2 characters to search</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, color: 'var(--text-3)', gap: 8 }}>
            <div style={{ color: 'var(--text-3)' }}><Icon name="person" size={32} /></div>
            <div style={{ fontSize: 14 }}>No match — use Walk-In</div>
          </div>
        ) : (
          <div>
            {filtered.map(c => (
              <div key={c.id} className={`attend-row${c.attended ? ' checked-in' : ''}`}>
                <div className="attend-row-main" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="contact-name">{c.name}</div>
                    <div className="contact-loc">{c.location}</div>
                    <div className="contact-meta">···{c.phone_last4}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    {c.attended
                      ? <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="check" size={13} /> Checked In</span>
                      : <StatusBadge status={c.current_status} />
                    }
                  </div>
                </div>

                {expanded === c.id && (
                  <div className="attend-row-expanded">
                    {c.attended ? (
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--green)', marginBottom: 8 }}>
                          Checked in {c.attended_at ? new Date(c.attended_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                        {undoId === c.id && (
                          <button className="btn btn-outline btn-sm" onClick={() => undo(c)}>Undo Check-In</button>
                        )}
                      </div>
                    ) : (
                      <button
                        className="btn btn-primary btn-full"
                        style={{ height: 48, fontSize: 16, background: 'var(--green)', borderColor: 'var(--green)' }}
                        disabled={checking === c.id}
                        onClick={() => checkIn(c)}
                      >
                        {checking === c.id ? <div className="spinner" style={{ width: 18, height: 18 }} /> : 'Check In'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Walk-In FAB */}
      <button
        onClick={() => setShowWalkIn(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24,
          height: 52, borderRadius: 'var(--radius-full)',
          background: 'var(--accent)', color: 'var(--accent-fg)',
          border: 'none', padding: '0 20px', fontSize: 15, fontWeight: 600,
          cursor: 'pointer', boxShadow: 'var(--shadow-md)', zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        Walk-In +
      </button>

      {/* Walk-In Modal */}
      {showWalkIn && (
        <div className="modal-overlay" onClick={() => setShowWalkIn(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Walk-In Registration</div>
              <button className="modal-close" onClick={() => setShowWalkIn(false)}>×</button>
            </div>
            <div className="modal-body">
              {[
                { key:'name', label:'Full Name', req:true },
                { key:'phone', label:'Phone Number', req:true, type:'tel' },
                { key:'area', label:'Area / Location', req:true },
                { key:'email', label:'Email Address', req:false, type:'email' },
                { key:'notes', label:'Notes', req:false },
              ].map(({ key, label, req, type }) => (
                <div key={key} className="form-group">
                  <label className="field-label">{label}{req && <span className="required">*</span>}</label>
                  <input
                    className="field-input"
                    type={type || 'text'}
                    value={walkInForm[key]}
                    onChange={e => setWalkInForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="form-group">
                <label className="field-label">How did you hear? <span className="required">*</span></label>
                <select className="field-select" value={walkInForm.how_did_you_hear} onChange={e => setWalkInForm(f => ({ ...f, how_did_you_hear: e.target.value }))}>
                  <option value="">Select…</option>
                  {['Friend / Family','Flyer / Poster','Social media','Radio / TV','A volunteer spoke to me','Passing by / saw the crowd','Other'].map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primary btn-full btn-full-force" onClick={submitWalkIn} disabled={walkInLoading} style={{ height: 48 }}>
                {walkInLoading ? <div className="spinner" style={{ width: 16, height: 16 }} /> : 'Register Walk-In'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
