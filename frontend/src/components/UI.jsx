/**
 * REACH — Core UI components
 */
import { StatusBadge, DecisionBadge, Badge } from './ui/Badge';
import Icon from './ui/Icon';
import PageHeader from './ui/PageHeader';
import TagChecklist from './ui/TagChecklist';
import CallTimeline from './ui/CallTimeline';
import { TagCountsChart, ReceptivityChart, AvailabilityChart } from './ui/RollupChart';
import WhatsNextPanel from './ui/WhatsNextPanel';
export { StatusBadge, DecisionBadge, Badge, Icon, PageHeader, TagChecklist, CallTimeline, TagCountsChart, ReceptivityChart, AvailabilityChart, WhatsNextPanel };

export function Spinner({ large }) {
  return <div className={`spinner${large ? ' spinner-lg' : ''}`} />;
}

export function EmptyState({ icon, message = 'Nothing here yet.', hint }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {icon ?? (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="var(--text-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 8l1.5 9A2 2 0 006.47 19h11.06A2 2 0 0019.5 17L21 8H3z"/>
            <path d="M8 8V6a4 4 0 018 0v2"/>
          </svg>
        )}
      </div>
      <div className="empty-state-msg">{message}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function SkeletonRow({ lines = 2 }) {
  return (
    <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
      <div className="skeleton" style={{ height: 14, width: '55%', marginBottom: 8 }} />
      {lines > 1 && <div className="skeleton" style={{ height: 11, width: '35%' }} />}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card" style={{ marginBottom: 'var(--space-3)' }}>
      <div className="skeleton" style={{ height: 36, width: '40%', marginBottom: 12 }} />
      <div className="skeleton" style={{ height: 12, width: '70%' }} />
    </div>
  );
}

export function PageSkeleton({ rows = 5 }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 20 }}>{message}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-full" onClick={onCancel}>Cancel</button>
            <button
              className={`btn btn-full ${danger ? 'btn-danger' : 'btn-primary'}`}
              onClick={onConfirm}
            >{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
