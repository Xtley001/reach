/**
 * REACH — PageHeader.jsx
 *
 * A-4: several pages hand-roll <div className="page-header"> with slightly
 * different inline flex styles for the title+action layout (compare
 * MinisterCampaigns.jsx / MinisterHubs.jsx / HubTemplates.jsx — same intent,
 * three different `style={{ display:'flex', ... }}` blocks). This wraps the
 * existing `.page-header` / `.page-title` CSS classes (unchanged, so no
 * visual regression) in one component so title/subtitle/action layout can't
 * drift page to page again.
 *
 * Usage:
 *   <PageHeader title="Volunteers" />
 *   <PageHeader title="Campaigns" subtitle="3 active" action={<button .../>} />
 *   <PageHeader title="Contacts" filters={<FilterChips .../>} />
 */
export default function PageHeader({ title, subtitle, action, filters, children }) {
  return (
    <div className="page-header">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div className="page-title">{title}</div>
          {subtitle && <div className="page-subtitle">{subtitle}</div>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      {filters && <div style={{ marginTop: 12 }}>{filters}</div>}
      {children}
    </div>
  );
}
