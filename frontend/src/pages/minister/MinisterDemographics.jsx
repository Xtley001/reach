import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { cached, TTL } from '../../lib/cache';
import { Spinner, PageSkeleton } from '../../components/UI';
import { label, STATUS_LABELS } from '../../lib/labels';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts';

const STATUS_COLORS = {
  coming:          '#22c55e',
  undecided:       '#3b82f6',
  no_answer:       '#94a3b8',
  needs_transport: '#f97316',
  not_coming:      '#ef4444',
  message_sent:    '#a855f7',
  unreachable:     '#64748b',
  wrong_number:    '#cbd5e1',
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--bg-2)', border: '1px solid var(--border)',
    borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)',
  },
};

export default function MinisterDemographics() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [hubSort, setHubSort] = useState('contacts');
  const [hubs,      setHubs]      = useState([]);
  const [hubFilter, setHubFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    api.getDemographics(hubFilter || undefined)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [hubFilter]);

  useEffect(() => {
    api.getMinisterHubs().then(d => setHubs(d.hubs || [])).catch(() => {});
  }, []);

  const statusData = data
    ? Object.entries(data.status_breakdown || {})
        .map(([k, v]) => ({
          name: label(STATUS_LABELS, k, k),
          count: v.count, pct: v.pct, key: k,
        }))
        .sort((a, b) => b.count - a.count)
    : [];

  const hubData = data
    ? [...(data.hub_breakdown || [])].sort((a, b) => b[hubSort] - a[hubSort])
    : [];

  const weeklyData = (data?.weekly_trend || []).map(w => ({
    week: w.week.slice(5), added: w.added,
  }));

  const topLocs = Object.entries(data?.top_locations || {})
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxLoc = topLocs[0]?.[1] || 1;

  if (loading) return (
    <div className="page">
      <div className="page-header"><div className="page-title">Demographics</div></div>
      <div className="page-body"><PageSkeleton rows={8} /></div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Demographics</div>
        <div className="page-subtitle">{data?.total_contacts?.toLocaleString() ?? '—'} total contacts</div>
      </div>

      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

        <div style={{ marginBottom: 16 }}>
          <select
            className="field-input"
            value={hubFilter}
            onChange={e => { setHubFilter(e.target.value); }}
            style={{ maxWidth: 280 }}
          >
            <option value="">All Hubs</option>
            {hubs.map(h => <option key={h.hub_id} value={h.hub_id}>{h.hub_name}</option>)}
          </select>
        </div>

        {/* Charts row — responsive */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>

          {/* Status donut */}
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Status Breakdown
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="count"
                  nameKey="name"
                  cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85}
                  paddingAngle={2}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[entry.key] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 8 }}>
              {statusData.map(s => (
                <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[s.key] || 'var(--border)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--text-2)' }}>{s.name}</span>
                  <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700 }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly trend area chart */}
          {weeklyData.length > 0 && (
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Weekly Trend
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="var(--gold)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--gold)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-sans)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-3)', fontFamily: 'var(--font-sans)' }} axisLine={false} tickLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="added" stroke="var(--gold)" strokeWidth={2} fill="url(#goldGrad)" name="Added" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Hub Comparison */}
        {hubData.length > 0 && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hub Breakdown</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['contacts','confirmed','volunteers'].map(k => (
                  <button key={k} className={`filter-tag${hubSort === k ? ' active' : ''}`} style={{ height: 24, fontSize: 10 }} onClick={() => setHubSort(k)}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Hub','Contacts','Confirmed','Volunteers','Progress'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-3)', fontWeight: 500, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hubData.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px', color: 'var(--text)', fontWeight: 500 }}>{h.hub_name}</td>
                      <td style={{ padding: '8px', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>{h.contacts}</td>
                      <td style={{ padding: '8px', fontFamily: 'var(--font-sans)', fontWeight: 700, color: 'var(--green)' }}>{h.confirmed}</td>
                      <td style={{ padding: '8px', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>{h.volunteers}</td>
                      <td style={{ padding: '8px', minWidth: 80 }}>
                        <div style={{ background: 'var(--bg-3)', borderRadius: 9999, height: 6, overflow: 'hidden' }}>
                          <div style={{ background: 'var(--gold)', height: '100%', width: `${Math.min(100, (h.confirmed / Math.max(h.contacts, 1)) * 100)}%`, borderRadius: 9999, transition: 'width 0.6s' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top Locations */}
        {topLocs.length > 0 && (
          <div className="card">
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Top Locations
            </div>
            {topLocs.map(([loc, count]) => (
              <div key={loc} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text)' }}>{loc}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>{count}</span>
                </div>
                <div style={{ background: 'var(--bg-3)', borderRadius: 9999, height: 5 }}>
                  <div style={{ background: 'var(--gold)', height: '100%', width: `${(count / maxLoc) * 100}%`, borderRadius: 9999, transition: 'width 0.6s' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
