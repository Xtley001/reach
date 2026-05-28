import { label, STATUS_LABELS, STATUS_CLASSES, DECISION_LABELS, DECISION_CLASSES } from '../../lib/labels';

export function StatusBadge({ status }) {
  if (!status) return null;
  const key = String(status).split('.').pop();
  return (
    <span className={`badge ${STATUS_CLASSES[key] || ''}`}>
      {label(STATUS_LABELS, key, key)}
    </span>
  );
}

export function DecisionBadge({ type }) {
  if (!type) return null;
  return (
    <span className={`badge ${DECISION_CLASSES[type] || ''}`}>
      {label(DECISION_LABELS, type, type)}
    </span>
  );
}

export function Badge({ variant = 'neutral', className = '', children, ...props }) {
  const cls = {
    neutral: '',
    green:   'badge-green',
    red:     'badge-red',
    amber:   'badge-amber',
    blue:    'badge-blue',
    gold:    'badge-gold',
  }[variant] || '';
  return (
    <span className={`badge ${cls} ${className}`} {...props}>
      {children}
    </span>
  );
}
