/**
 * REACH — HubDetail (Minister view)
 * Full hub profile: leader info + all volunteers with stats.
 * Each volunteer card is clickable → MinisterVolunteerDetail.
 */
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { Spinner, StatusBadge } from '../../components/UI';

export default function HubDetail({ hubId: propHubId, onBack, onSelectVolunteer }) {
  const { hubId: paramHubId } = useParams();
  const navigate = useNavigate();
  const hubId = propHubId || paramHubId;
  const handleBack = onBack || (() => navigate(-1));
  const handleSelectVolunteer = onSelectVolunteer || ((volId) => navigate(`/minister/volunteers/${volId}`));
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getHubDetail(hubId)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [hubId]);

  if (loading) return <div className="page" style={{ display:'flex', alignItems:'center', justifyContent:'center' }}><Spinner /></div>;
  if (!data)   return (
    <div className="page">
      <button onClick={handleBack} className="btn btn-outline" style={{ marginBottom:24 }}>← Back</button>
      <p style={{ color:'var(--td)', fontSize:13 }}>Hub not found.</p>
    </div>
  );

  const confirmedPct = data.total_contacts > 0 ? Math.round(data.confirmed / data.total_contacts * 100) : 0;

  return (
    <div className="page">
      <div className="page-header" style={{ paddingBottom:0 }}>
        <button onClick={handleBack} style={{ background:'none', border:'none', color:'var(--td)', fontSize:12, cursor:'pointer', fontFamily:'var(--font-sans)', padding:0, marginBottom:20 }}>
          ← All Hubs
        </button>
      </div>

      <div className="page-body">
        {/* Hub header card */}
        <div style={{ background:'var(--sf)', border:'1px solid var(--bd)', borderRadius:12, padding:'20px 22px', marginBottom:16 }}>
          <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:16 }}>
            {/* Leader avatar */}
            <div style={{ width:56, height:56, borderRadius:'50%', flexShrink:0, background:'var(--bg)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, border:'2px solid var(--bd)' }}>
              {data.leader_avatar ? <img src={data.leader_avatar} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '👤'}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:2 }}>{data.hub_name}</div>
              <div style={{ fontSize:12, color:'var(--td)' }}>{data.hub_zone && `${data.hub_zone} · `}{data.leader_name || 'No leader'}</div>
              {data.leader_phone && (
                <div style={{ display:'flex', gap:8, marginTop:6 }}>
                  <a href={`https://wa.me/${data.leader_phone.replace('+','')}`} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize:10, padding:'3px 10px', borderRadius:4, background:'var(--bg-3)', border:'1px solid var(--border)', color:'var(--green)', textDecoration:'none', fontFamily:'var(--font-sans)' }}>
                    WhatsApp
                  </a>
                  <a href={`tel:${data.leader_phone}`}
                    style={{ fontSize:10, padding:'3px 10px', borderRadius:4, background:'var(--bg-3)', border:'1px solid var(--border)', color:'var(--text)', textDecoration:'none', fontFamily:'var(--font-sans)' }}>
                    Call
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Hub stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, marginBottom:14 }}>
            {[
              { label:'Volunteers', value: data.volunteers?.length ?? 0, color:'var(--accent)' },
              { label:'Contacts',   value: data.total_contacts,           color:'var(--text)' },
              { label:'Confirmed',  value: data.confirmed,                 color:'var(--green)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', padding:'10px 8px', background:'var(--bg)', borderRadius:8, border:'1px solid var(--bd)' }}>
                <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:'var(--font-sans)' }}>{s.value ?? 0}</div>
                <div style={{ fontSize:10, color:'var(--tf)', marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div style={{ height:4, background:'var(--border)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${confirmedPct}%`, background:'#4ade80', borderRadius:2, transition:'width .4s' }} />
          </div>
          <div style={{ fontSize:10, color:'var(--tf)', marginTop:4 }}>{confirmedPct}% confirmed of all contacts</div>
        </div>

        {/* Volunteer list */}
        <div style={{ fontWeight:600, fontSize:13, marginBottom:12 }}>Volunteers in this Hub</div>

        {!data.volunteers?.length
          ? <p style={{ fontSize:12, color:'var(--tf)', textAlign:'center', padding:32 }}>No volunteers yet in this hub.</p>
          : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {data.volunteers.map(v => (
                <VolunteerMiniCard key={v.id} v={v} onClick={() => handleSelectVolunteer(v.id)} />
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

function VolunteerMiniCard({ v, onClick }) {
  const pct = v.total_contacts > 0 ? Math.round(v.confirmed / v.total_contacts * 100) : 0;
  const lastActive = v.last_active_at ? new Date(v.last_active_at).toLocaleDateString('en-GB', { day:'numeric', month:'short' }) : 'Never';

  return (
    <div style={{
      background:'var(--sf)', border:'1px solid var(--bd)', borderRadius:10,
      padding:'13px 16px', display:'flex', alignItems:'center', gap:12,
      cursor:'pointer', transition:'border-color .15s',
    }}
      onClick={onClick}
      onMouseOver={e => e.currentTarget.style.borderColor='var(--acd)'}
      onMouseOut={e  => e.currentTarget.style.borderColor='var(--border)'}
    >
      <div style={{ width:38, height:38, borderRadius:'50%', flexShrink:0, background:'var(--bg)', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, border:'1px solid var(--bd)' }}>
        {v.avatar_url ? <img src={v.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} /> : '👤'}
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {v.name || <span style={{ color:'var(--tf)' }}>Unnamed</span>}
        </div>
        <div style={{ fontSize:11, color:'var(--td)', display:'flex', gap:8 }}>
          <span>{v.total_contacts ?? 0} contacts</span>
          {v.confirmed > 0 && <span style={{ color:'var(--green)' }}>✓ {v.confirmed}</span>}
          <span style={{ color:'var(--tf)' }}>Active {lastActive}</span>
        </div>
        <div style={{ marginTop:5, height:2, background:'var(--border)', borderRadius:1, overflow:'hidden', maxWidth:160 }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'#4ade80', borderRadius:1 }} />
        </div>
      </div>
      <div style={{ flexShrink:0, display:'flex', alignItems:'center', gap:8 }}>
        <StatusBadge status={v.status} />
        <span style={{ color:'var(--tf)', fontSize:14 }}>›</span>
      </div>
    </div>
  );
}
