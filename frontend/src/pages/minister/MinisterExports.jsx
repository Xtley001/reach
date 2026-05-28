import { useState } from 'react';
import { api, BASE } from '../../lib/api';
import { toast } from '../../lib/toast';

// FIX-004: Correct backend URLs; mark unavailable exports as disabled not hidden
const EXPORTS = [
  {
    id: 'confirmed',
    label: 'Confirmed Contacts',
    desc: 'All contacts who confirmed attendance',
    path: '/minister/export/confirmed',
    available: true,
  },
  {
    id: 'logistics',
    label: 'Transport / Logistics',
    desc: 'Contacts who need transport arranged',
    path: '/minister/export/logistics',
    available: true,
  },
  {
    id: 'all_contacts',
    label: 'All Contacts',
    desc: 'Complete contact list with statuses, volunteer, and hub',
    path: '/minister/export/all',
    available: true,
  },
  {
    id: 'decisions',
    label: 'Decisions / Altar Call',
    desc: 'All decision records, counsellor, fields',
    path: null, // uses special decisions export
    available: true,
    isDecisions: true,
  },
  {
    id: 'attendance',
    label: 'Attendance Report',
    desc: 'All check-ins, walk-in flag, gate volunteer',
    path: '/minister/export/attendance',
    available: true,
  },
  {
    id: 'walk_ins',
    label: 'Walk-Ins Only',
    desc: 'All walk-in registrations',
    path: '/minister/export/walk_ins',
    available: true,
  },
];

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

export default function MinisterExports() {
  const [downloading, setDownloading] = useState(null);
  const [lastExported, setLastExported] = useState({});

  async function download(exp) {
    if (!exp.available) return;
    setDownloading(exp.id);
    try {
      if (exp.isDecisions) {
        window.open(api.exportDecisions(), '_blank');
      } else {
        await api.downloadExport(exp.path);
      }
      setLastExported(le => ({ ...le, [exp.id]: new Date() }));
      toast('Export started', 'success');
    } catch (e) {
      toast(e.message || 'Export failed', 'error');
    }
    setDownloading(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Exports</div>
        <div className="page-subtitle">Download contact data as CSV</div>
      </div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {EXPORTS.map(exp => (
          <div key={exp.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: exp.available ? 'var(--text)' : 'var(--text-3)' }}>
                {exp.label}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{exp.desc}</div>
              {lastExported[exp.id] && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  Last: {lastExported[exp.id].toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
              {!exp.available && (
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Coming soon</div>
              )}
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={() => download(exp)}
              disabled={!exp.available || downloading === exp.id}
              title={!exp.available ? 'Coming soon' : 'Download CSV'}
            >
              {downloading === exp.id ? (
                <div className="spinner" style={{ width: 14, height: 14 }} />
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <DownloadIcon /> CSV
                </span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
