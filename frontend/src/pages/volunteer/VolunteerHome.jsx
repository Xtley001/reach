import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, TTL } from '../../lib/cache';
import { SkeletonCard, StatusBadge } from '../../components/UI';

const VERSES = [
  { ref: 'Luke 15:4', text: 'What man of you, having a hundred sheep, if he has lost one of them, does not leave the ninety-nine in the open country, and go after the one that is lost?' },
  { ref: 'Matthew 28:19', text: 'Go therefore and make disciples of all nations.' },
  { ref: 'Mark 16:15', text: 'Go into all the world and proclaim the gospel to the whole creation.' },
  { ref: 'Isaiah 6:8', text: 'And I heard the voice of the Lord saying, "Whom shall I send?" And I said, "Here I am. Send me."' },
  { ref: 'Romans 10:14', text: 'How then will they call on him in whom they have not believed?' },
  { ref: 'Acts 1:8', text: 'You will receive power when the Holy Spirit has come upon you, and you will be my witnesses.' },
  { ref: 'Proverbs 11:30', text: 'He who wins souls is wise.' },
];

function FlameIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--gold)" stroke="none">
      <path d="M12 2c0 0-5 4.5-5 9a5 5 0 0010 0C17 6.5 12 2 12 2zm0 13a2 2 0 110-4 2 2 0 010 4z"/>
    </svg>
  );
}

export default function VolunteerHome({ pending, syncing, onSync, onNav, onOpenContact }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent]   = useState([]);

  const verse = VERSES[new Date().getDay() % VERSES.length];

  useEffect(() => {
    cached('vol:dashboard', () => api.getVolunteerDashboard(), TTL.HUB_DASH)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    cached('contacts:mine', () => api.listContacts(), TTL.CONTACTS)
      .then(d => setRecent((d.contacts || []).slice(0, 5)))
      .catch(() => {});

    // Prefetch contacts after 1.5s idle
    const t = setTimeout(() =>
      cached('contacts:mine', () => api.listContacts(), TTL.CONTACTS).catch(() => {}),
    1500);
    return () => clearTimeout(t);
  }, []);

  const stats = data || { total_contacts: 0, confirmed: 0, awaiting: 0, unreached: 0, streak_days: 0 };

  if (loading) return (
    <div className="page-body">
      <SkeletonCard /><SkeletonCard /><SkeletonCard />
    </div>
  );

  return (
    <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Sync badge */}
      {(pending > 0 || syncing) && (
        <div
          onClick={onSync}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '8px 12px', cursor: 'pointer',
          }}
        >
          <span className={`sync-dot ${syncing ? '' : 'pending'}`} />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {syncing ? 'Syncing…' : `${pending} pending`}
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.total_contacts}</div>
          <div className="stat-label">Total Contacts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.confirmed}</div>
          <div className="stat-label">Confirmed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.awaiting}</div>
          <div className="stat-label">Msg Sent</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.unreached}</div>
          <div className="stat-label">Unreached</div>
        </div>
      </div>

      {/* Streak */}
      {stats.streak_days > 0 && (
        <div className="streak-card">
          <FlameIcon />
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="streak-number">{stats.streak_days}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-2)' }}>day streak</span>
            </div>
            <div className="streak-label">Keep adding contacts daily!</div>
          </div>
        </div>
      )}

      {/* Add Contact CTA */}
      <button
        className="btn btn-primary btn-full"
        onClick={() => onNav('add')}
        style={{ height: 48, fontSize: 15 }}
      >
        + Add Contact
      </button>

      {/* Recent contacts */}
      {recent.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Recent
          </div>
          <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {recent.map(c => (
              <div key={c.id} className="contact-row" onClick={() => onOpenContact ? onOpenContact(c.id) : onNav('contacts')}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="contact-name">{c.name}</div>
                  <div className="contact-loc">{c.location}</div>
                </div>
                <StatusBadge status={c.current_status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verse */}
      <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-2)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 8 }}>
          "{verse.text}"
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>{verse.ref}</div>
      </div>
    </div>
  );
}
