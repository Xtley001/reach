/**
 * REACH — Toast Notification System
 * Replaces all alert() calls. One implementation used everywhere.
 */

export function toast(msg, type = 'default', duration = 3500) {
  const el = document.createElement('div');
  el.className = `reach-toast${type !== 'default' ? ` reach-toast-${type}` : ''}`;
  el.textContent = msg;
  document.body.appendChild(el);
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
