import { useState } from 'react';
import { api } from '../../lib/api';
import { toast } from '../../lib/toast';

const EXPORTS = [
  { id: 'contacts',     label: 'Campaign Contacts (full)',  desc: 'All contacts, statuses, volunteer, hub, timestamps' },
  { id: 'attendance',   label: 'Attendance Report',         desc: 'All check-ins, time, gate volunteer, walk-in flag' },
  { id: 'decisions',    label: 'Decisions / Altar Call',    desc: 'All decision records, all fields, counsellor' },
  { id: 'non_attendees',label: 'Non-Attendees',             desc: 'Pre-logged contacts who did not check in' },
  { id: 'walk_ins',     label: 'Walk-Ins Only',             desc: 'All walk-in registrations' },
];

export default function MinisterExports() {
  const [downloading, setDownloading] = useState(null);
  const [lastExported, setLastExported] = useState({});

  async function download(id) {
    setDownloading(id);
    try {
      if (id === 'decisions') {
        window.open(api.exportDecisions(), '_blank');
      } else {
        const url = `${api.BASE || ''}/exports/${id}`;
        const a = document.createElement('a');
        a.href = url; a.click();
      }
      setLastExported(le => ({ ...le, [id]: new Date() }));
      toast('Export started', 'success');
    } catch (e) { toast(e.message || 'Export failed', 'error'); }
    setDownloading(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Exports</div>
        <div className="page-subtitle">All exports are CSV · DD/MM/YYYY dates · E.164 phone numbers</div>
      </div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {EXPORTS.map(e => (
          <div key={e.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{e.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{e.desc}</div>
              {lastExported[e.id] && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  Last: {lastExported[e.id].toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => download(e.id)}
              disabled={downloading === e.id}
            >
              {downloading === e.id ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '↓ CSV'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
