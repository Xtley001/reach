/**
 * REACH — VolunteerDetail (Hub Leader view)
 * Full volunteer profile: avatar, contacts, stats, all contact data.
 * Opened when hub leader clicks a volunteer card.
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Spinner, StatusBadge, ConfirmDialog } from '../../components/UI';

const STATUS_LABELS = {
  message_sent:    'Message Sent',
  coming:          'Coming ✓',
  undecided:       'Undecided',
  not_coming:      'Not Coming',
  no_answer:       'No Answer',
  wrong_number:    'Wrong Number',
  needs_transport: 'Needs Transport',
  unreachable:     'Unreachable',
};
const STATUS_COLORS = {
  coming:          '#4ade80',
  message_sent:    '#60a5fa',
  undecided:       '#fbbf24',
  not_coming:      '#f87171',
  no_answer:       '#a78bfa',
  needs_transport: '#fb923c',
  wrong_number:    '#94a3b8',
  unreachable:     '#64748b',
};

export default function VolunteerDetail({ volunteerId, onBack, onReload }) {
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [confirming, setConfirming] = useState(null);
  const [acting,     setActing]     = useState(false);
  const [filter,     setFilter]     = useState('all');

  useEffect(() => {
    api.getVolunteerDetail(volunteerId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [volunteerId]);

  async function handleAction(action) {
    setActing(true);
    try {
      if (action === 'approve')      await api.approveVolunteer(volunteerId);
      else if (action === 'reject')  await api.rejectVolunteer(volunteerId);
      else if (action === 'logout')  await api.forceLogout(volunteerId);
      if (onReload) onReload();
      onBack();
    } catch {}
    setActing(false);
    setConfirming(null);
  }

  if (loading) return (
    <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
      <Spinner />
    </div>
  );

  if (!data) return (
    <div className="page">
      <button onClick={onBack} className="btn btn-outline" style={{ marginBottom:24 }}>← Back</button>
      <p style={{ color:'var(--td)', fontSize:13 }}>Volunteer not found.</p>
    </div>
  );

  const contacts = data.contacts || [];
  const shown = filter === 'all' ? contacts : contacts.filter(c => c.current_status === filter || (!c.current_status && filter === 'none'));
  const lastActive = data.last_active_at ? new Date(data.last_active_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Never';

  return (
    <div className="page">
      {/* Back */}
      <div className="page-header" style={{ paddingBottom:0 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'var(--td)', fontSize:12, cursor:'pointer', fontFamily:'var(--font-sans)', padding:0, marginBottom:20, display:'flex', alignItems:'center', gap:6 }}>
          ← All Volunteers
        </button>
      </div>

      <div className="page-body">
        {/* ── Profile card ─────────────────────────────────── */}
        <div style={{ background:'var(--sf)', border:'1px solid var(--bd)', borderRadius:12, padding:'20px 22px', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
            {/* Avatar */}
            <div style={{ width:64, height:64, borderRadius:'50%', flexShrink:0, background:'var(--bg)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, border:'2px solid var(--bd)' }}>
              {data.avatar_url ? <img src={data.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '👤'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:17, fontWeight:700, marginBottom:3 }}>{data.name || <span style={{ color:'var(--tf)' }}>Unnamed</span>}</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <StatusBadge status={data.status} />
                {data.hub_name && <span style={{ fontSize:10, color:'var(--tf)', background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:4, padding:'2px 7px' }}>Hub: {data.hub_name}</span>}
              </div>
            </div>
          </div>

          {/* Contact info */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px', fontSize:12 }}>
            {data.phone && (
              <div>
                <div style={{ color:'var(--tf)', fontSize:10, marginBottom:2 }}>PHONE</div>
                <a href={`tel:${data.phone}`} style={{ color:'var(--tx)', textDecoration:'none' }}>{data.phone}</a>
              </div>
            )}
            {data.email && (
              <div>
                <div style={{ color:'var(--tf)', fontSize:10, marginBottom:2 }}>EMAIL</div>
                <a href={`mailto:${data.email}`} style={{ color:'var(--tx)', textDecoration:'none', wordBreak:'break-all' }}>{data.email}</a>
              </div>
            )}
            <div>
              <div style={{ color:'var(--tf)', fontSize:10, marginBottom:2 }}>JOINED</div>
              <span>{new Date(data.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span>
            </div>
            <div>
              <div style={{ color:'var(--tf)', fontSize:10, marginBottom:2 }}>LAST ACTIVE</div>
              <span>{lastActive}</span>
            </div>
          </div>

          {/* Quick actions */}
          {data.phone && (
            <div style={{ display:'flex', gap:8, marginTop:14, paddingTop:14, borderTop:'1px solid var(--bd)' }}>
              <a href={`https://wa.me/${data.phone.replace('+','')}`} target="_blank" rel="noopener noreferrer"
                style={{ flex:1, padding:'8px 0', borderRadius:6, background:'var(--bg-3)', border:'1px solid var(--border)', color:'var(--green)', fontSize:11, textAlign:'center', textDecoration:'none', fontFamily:'var(--font-sans)' }}>
                WhatsApp
              </a>
              <a href={`tel:${data.phone}`}
                style={{ flex:1, padding:'8px 0', borderRadius:6, background:'var(--bg-3)', border:'1px solid var(--border)', color:'var(--text)', fontSize:11, textAlign:'center', textDecoration:'none', fontFamily:'var(--font-sans)' }}>
                Call
              </a>
              {data.status === 'pending' && (
                <button onClick={() => setConfirming({ action:'approve' })}
                  style={{ flex:1, padding:'8px 0', borderRadius:6, background:'rgba(200,184,154,.1)', border:'1px solid var(--acd)', color:'var(--accent)', fontSize:11, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                  Approve
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Stats row ─────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:20 }}>
          {[
            { label:'Contacts',     value: data.total_contacts,  color:'var(--text)' },
            { label:'Confirmed',    value: data.confirmed,        color:'var(--green)' },
            { label:'Msg Sent',     value: data.messages_sent,    color:'var(--text)' },
            { label:'Pending Call', value: data.pending_calls,    color:'var(--text)' },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--sf)', border:'1px solid var(--bd)', borderRadius:8, padding:'12px 10px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:'var(--font-sans)' }}>{s.value ?? 0}</div>
              <div style={{ fontSize:10, color:'var(--tf)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Contact list ──────────────────────────────────── */}
        <div style={{ marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:600, fontSize:13 }}>Contact List</div>
          <select value={filter} onChange={e => setFilter(e.target.value)}
            style={{ background:'var(--sf)', border:'1px solid var(--bd)', color:'var(--td)', borderRadius:6, padding:'5px 10px', fontSize:11, fontFamily:'var(--font-sans)', cursor:'pointer' }}>
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            <option value="none">No status</option>
          </select>
        </div>

        {shown.length === 0
          ? <p style={{ fontSize:12, color:'var(--tf)', textAlign:'center', padding:40 }}>No contacts for this filter.</p>
          : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {shown.map(c => (
                <div key={c.id} style={{ background:'var(--sf)', border:'1px solid var(--bd)', borderRadius:8, padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{c.name}</div>
                    <div style={{ fontSize:11, color:'var(--td)' }}>{c.location || c.phone || '—'}</div>
                    {c.phone && c.location && <div style={{ fontSize:10, color:'var(--tf)', fontFamily:'var(--font-mono)' }}>{c.phone}</div>}
                    {c.needs_transport && <div style={{ fontSize:10, color:'var(--amber)', marginTop:2 }}>🚌 Needs transport</div>}
                  </div>
                  <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                    {c.current_status && (
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:`${STATUS_COLORS[c.current_status] || '#666'}20`, color: STATUS_COLORS[c.current_status] || 'var(--td)', border:`1px solid ${STATUS_COLORS[c.current_status] || '#666'}40` }}>
                        {STATUS_LABELS[c.current_status] || c.current_status}
                      </span>
                    )}
                    <span style={{ fontSize:10, color:'var(--tf)' }}>{new Date(c.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        }

        {/* Danger zone */}
        {data.status === 'active' && (
          <div style={{ marginTop:32, paddingTop:20, borderTop:'1px solid var(--bd)' }}>
            <div style={{ fontSize:11, color:'var(--tf)', marginBottom:12, textTransform:'uppercase', letterSpacing:'.1em' }}>Actions</div>
            <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
              <button onClick={() => setConfirming({ action:'logout' })}
                style={{ padding:'8px 16px', borderRadius:6, background:'transparent', border:'1px solid rgba(var(--red-rgb, 176,58,46),.25)', color:'var(--red)', fontSize:11, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                Force Sign Out
              </button>
              <button onClick={() => setConfirming({ action:'reject' })}
                style={{ padding:'8px 16px', borderRadius:6, background:'transparent', border:'1px solid rgba(var(--red-rgb, 176,58,46),.25)', color:'var(--red)', fontSize:11, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                Suspend Account
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirming}
        title={confirming?.action === 'approve' ? 'Approve volunteer?' : confirming?.action === 'logout' ? 'Force sign out?' : 'Suspend account?'}
        message={confirming?.action === 'approve' ? 'They will be able to log in and add contacts.' : confirming?.action === 'logout' ? 'All their active sessions will be terminated immediately.' : 'Their account will be suspended. They will lose access immediately.'}
        confirmLabel={confirming?.action === 'approve' ? 'Approve' : confirming?.action === 'logout' ? 'Sign Out' : 'Suspend'}
        danger={confirming?.action !== 'approve'}
        loading={acting}
        onConfirm={() => handleAction(confirming.action)}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

