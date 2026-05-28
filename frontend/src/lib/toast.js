/**
 * REACH — Toast Notification System
 * LOW-08: toast container has aria-live="assertive" so screen readers announce it.
 */

function getOrCreateContainer() {
  let container = document.getElementById('reach-toast-root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'reach-toast-root';
    container.setAttribute('aria-live', 'assertive');
    container.setAttribute('aria-atomic', 'true');
    container.style.cssText = 'position:fixed;bottom:72px;left:50%;transform:translateX(-50%);z-index:9999;pointer-events:none;';
    document.body.appendChild(container);
  }
  return container;
}

export function toast(msg, type = 'default', duration = 3500) {
  const container = getOrCreateContainer();
  const el = document.createElement('div');
  el.className = `reach-toast${type !== 'default' ? ` reach-toast-${type}` : ''}`;
  el.textContent = msg;
  /* aria-label on each toast for assertive live region */
  el.setAttribute('role', 'status');
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, duration);
}

export const toastSuccess = (msg) => toast(msg, 'success');
export const toastError   = (msg) => toast(msg, 'error');
export const toastWarning = (msg) => toast(msg, 'warning');
export const toastGold    = (msg) => toast(msg, 'gold');
