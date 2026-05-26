import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { PageSkeleton, EmptyState } from '../../components/UI';
import { toast } from '../../lib/toast';

export default function HubTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [expanded, setExpanded]   = useState(null);

  useEffect(() => {
    api.getActiveTemplates().then(d => { setTemplates(d.templates || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  function copy(body) {
    navigator.clipboard.writeText(body).then(() => toast('Copied to clipboard', 'success'));
  }

  return (
    <div className="page">
      <div className="page-header"><div className="page-title">Message Templates</div></div>
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {loading ? <PageSkeleton /> : templates.length === 0 ? (
          <EmptyState icon="💬" message="No templates yet. Ask your minister to create some." />
        ) : templates.map(t => {
          const isOpen = expanded === t.id;
          const preview = t.body.split('\n').slice(0, 2).join('\n');
          return (
            <div key={t.id} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {isOpen ? t.body : preview + (t.body.split('\n').length > 2 ? '…' : '')}
                  </div>
                  {t.body.split('\n').length > 2 && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, fontSize: 11 }} onClick={() => setExpanded(isOpen ? null : t.id)}>
                      {isOpen ? 'Show less' : 'Show full'}
                    </button>
                  )}
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => copy(t.body)} style={{ flexShrink: 0 }}>Copy</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
