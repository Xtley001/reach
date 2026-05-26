/**
 * REACH — Core UI components
 */
import { StatusBadge, DecisionBadge, Badge } from './ui/Badge';
export { StatusBadge, DecisionBadge, Badge };

export function Spinner({ large }) {
  return <div className={`spinner${large ? ' spinner-lg' : ''}`} />;
}

export function EmptyState({ icon = '📭', message = 'Nothing here yet.' }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-msg">{message}</div>
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
