/**
 * REACH — MinisterVolunteerDetail
 * Minister's read-only deep view of any volunteer.
 * Same data as hub leader view but with no approve/reject controls.
 */
import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { Spinner, StatusBadge } from '../../components/UI';

const STATUS_LABELS = {
  message_sent:'Message Sent', coming:'Coming ✓', undecided:'Undecided',
  not_coming:'Not Coming', no_answer:'No Answer', wrong_number:'Wrong Number',
  needs_transport:'Needs Transport', unreachable:'Unreachable',
};
const STATUS_COLORS = {
  coming:'#4ade80', message_sent:'#60a5fa', undecided:'#fbbf24',
  not_coming:'#f87171', no_answer:'#a78bfa', needs_transport:'#fb923c',
  wrong_number:'#94a3b8', unreachable:'#64748b',
};

export default function MinisterVolunteerDetail({ volunteerId, onBack, backLabel = '← Back' }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState('all');

  useEffect(() => {
    api.getMinisterVolunteerDetail(volunteerId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [volunteerId]);

  if (loading) return <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></div>;
  if (!data) return <div className="page"><button onClick={onBack} className="btn btn-outline" style={{ marginBottom:24 }}>← Back</button><p style={{ color:'var(--td)', fontSize:13 }}>Volunteer not found.</p></div>;

  const contacts = data.contacts || [];
  const shown = filter === 'all' ? contacts : contacts.filter(c => c.current_status === filter || (!c.current_status && filter === 'none'));
  const lastActive = data.last_active_at ? new Date(data.last_active_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }) : 'Never';

  return (
    <div className="page">
      <div className="page-header" style={{ paddingBottom:0 }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:'var(--td)', fontSize:12, cursor:'pointer', fontFamily:'var(--font-sans)', padding:0, marginBottom:20 }}>
          {backLabel}
        </button>
      </div>

      <div className="page-body">
        {/* Profile */}
        <div style={{ background:'var(--sf)', border:'1px solid var(--bd)', borderRadius:12, padding:'20px 22px', marginBottom:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
            <div style={{ width:60, height:60, borderRadius:'50%', flexShrink:0, background:'var(--bg)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, border:'2px solid var(--bd)' }}>
              {data.avatar_url ? <img src={data.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '👤'}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:17, fontWeight:700, marginBottom:3 }}>{data.name || <span style={{ color:'var(--tf)' }}>Unnamed</span>}</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                <StatusBadge status={data.status} />
                {data.hub_name && <span style={{ fontSize:10, color:'var(--tf)', background:'var(--bg)', border:'1px solid var(--bd)', borderRadius:4, padding:'2px 7px' }}>Hub: {data.hub_name}</span>}
              </div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 16px', fontSize:12 }}>
            {data.phone && <div><div style={{ color:'var(--tf)', fontSize:10, marginBottom:2 }}>PHONE</div><span>{data.phone}</span></div>}
            {data.email && <div><div style={{ color:'var(--tf)', fontSize:10, marginBottom:2 }}>EMAIL</div><span style={{ wordBreak:'break-all' }}>{data.email}</span></div>}
            <div><div style={{ color:'var(--tf)', fontSize:10, marginBottom:2 }}>JOINED</div><span>{new Date(data.created_at).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })}</span></div>
            <div><div style={{ color:'var(--tf)', fontSize:10, marginBottom:2 }}>LAST ACTIVE</div><span>{lastActive}</span></div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10, marginBottom:20 }}>
          {[
            { label:'Contacts',  value:data.total_contacts, color:'var(--accent)' },
            { label:'Confirmed', value:data.confirmed,       color:'var(--green)' },
            { label:'Msg Sent',  value:data.messages_sent,   color:'var(--text)' },
            { label:'Pending',   value:data.pending_calls,   color:'var(--text)' },
          ].map(s => (
            <div key={s.label} style={{ background:'var(--sf)', border:'1px solid var(--bd)', borderRadius:8, padding:'12px 10px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:'var(--font-sans)' }}>{s.value ?? 0}</div>
              <div style={{ fontSize:10, color:'var(--tf)', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Contacts */}
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
                    <div style={{ fontSize:11, color:'var(--td)' }}>{c.location}</div>
                    {c.needs_transport && <div style={{ fontSize:10, color:'var(--amber)', marginTop:2 }}>🚌 Needs transport</div>}
                  </div>
                  <div style={{ flexShrink:0, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                    {c.current_status && (
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:`${STATUS_COLORS[c.current_status]||'#666'}20`, color:STATUS_COLORS[c.current_status]||'var(--td)', border:`1px solid ${STATUS_COLORS[c.current_status]||'#666'}40` }}>
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
      </div>
    </div>
  );
}
