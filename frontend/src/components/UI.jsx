/**
 * REACH — Core UI components
 */
import { useEffect, useState, useRef } from 'react';
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

/**
 * Item 94: useFocusTrap — locks focus within open modal/dialog and restores on close
 */
export function useFocusTrap(open, onClose) {
  const ref = useRef(null);
  const prevFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement;

    const el = ref.current;
    if (!el) return;

    // Focus the first focusable element or the dialog itself
    const focusables = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusables.length > 0) {
      focusables[0].focus();
    }

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'Tab') {
        const currentFocusables = Array.from(el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
          .filter(node => !node.disabled && node.offsetParent !== null);
        if (currentFocusables.length === 0) return;
        const first = currentFocusables[0];
        const last = currentFocusables[currentFocusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (prevFocusRef.current && typeof prevFocusRef.current.focus === 'function') {
        prevFocusRef.current.focus();
      }
    };
  }, [open, onClose]);

  return ref;
}

export function Modal({ open, onClose, title, children }) {
  const modalRef = useFocusTrap(open, onClose);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">{title}</div>
          <button className="modal-close" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

/**
 * Item 23: SkeletonRow proportions match the real contact-row shape —
 * 14px name line at ~55% width, 12px subtitle line at ~35% width.
 * These percentages match the actual contact-name/contact-loc text fills.
 */
export function SkeletonRow({ lines = 2 }) {
  return (
    <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)' }}>
      <div className="skeleton" style={{ height: 14, width: '55%', marginBottom: 8 }} />
      {lines > 1 && <div className="skeleton" style={{ height: 11, width: '35%' }} />}
    </div>
  );
}

/**
 * Item 23: SkeletonCard now matches stat-card shape — large number block
 * (28px → represented as 32px tall bar) + small label below (11px → 10px bar).
 * Previous version had a 36px bar at 40% width which looked nothing like
 * the real stat card content.
 */
export function SkeletonCard() {
  return (
    <div className="card" style={{ marginBottom: 'var(--space-3)' }}>
      {/* Mimics stat-value: large number */}
      <div className="skeleton" style={{ height: 32, width: '45%', marginBottom: 8, borderRadius: 'var(--radius-sm)' }} />
      {/* Mimics stat-label: short uppercase label */}
      <div className="skeleton" style={{ height: 10, width: '60%' }} />
    </div>
  );
}

/**
 * Item 23: StatCardSkeleton — matches the 2×2 stats-grid layout with
 * large-number + label proportions, so the grid doesn't jump when data arrives.
 */
export function StatCardSkeleton() {
  return (
    <div className="stats-grid" style={{ marginBottom: 'var(--space-4)' }}>
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="stat-card">
          <div className="skeleton" style={{ height: 32, width: '55%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 10, width: '70%' }} />
        </div>
      ))}
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
  const dialogRef = useFocusTrap(open, onCancel);
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal"
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Confirm'}
        style={{ maxWidth: 360 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onCancel} aria-label="Close">×</button>
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

/**
 * Item 24: useMinLoadTime — ensures a loading state is shown for at least
 * `minMs` milliseconds even if data arrives faster, preventing a jarring
 * one-frame flash of skeleton → content on fast connections.
 *
 * Usage:
 *   const showSkeleton = useMinLoadTime(isLoading, 350);
 *   if (showSkeleton) return <PageSkeleton />;
 */
export function useMinLoadTime(isLoading, minMs = 350) {
  const [forceShow, setForceShow] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setForceShow(true);
    } else {
      // Data arrived — wait until minMs has elapsed before hiding skeleton
      const t = setTimeout(() => setForceShow(false), minMs);
      return () => clearTimeout(t);
    }
  }, [isLoading, minMs]);

  return isLoading || forceShow;
}

/**
 * Item 45: useCountUp — tweens a number from 0 to `target` over `durationMs`
 * using an ease-out cubic curve so the number feels alive when it first renders.
 *
 * Respects prefers-reduced-motion: skips the tween and returns `target` directly
 * so numbers don't animate for users who have that preference set.
 *
 * Usage: const displayed = useCountUp(stats.total_contacts, 600);
 */
export function useCountUp(target, durationMs = 600) {
  const prefersReduced = typeof window !== 'undefined'
    ? window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    : false;

  const [value, setValue] = useState(prefersReduced ? target : 0);

  useEffect(() => {
    if (prefersReduced || target === 0) { setValue(target); return; }
    setValue(0);
    const start = performance.now();
    let raf;
    function step(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // ease-out cubic: 1 - (1-t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

