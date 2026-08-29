/**
 * REACH — theme-init.js
 *
 * A-6: previously an inline <script> block in index.html. Moved to an
 * external file so it loads under a real Content-Security-Policy
 * (`script-src 'self'`) without needing 'unsafe-inline' — see vercel.json /
 * frontend/vercel.json headers and backend/main.py's security_headers
 * middleware.
 *
 * Runs before first paint (blocking <script src> in <head>, no `defer`) so
 * there's no flash-of-wrong-theme: we set data-theme on <html> before React
 * mounts or any styles paint.
 *
 * A-5: also does a system-preference check for first-time visitors (no
 * saved choice yet) instead of always defaulting to light, matching the
 * more complete dark-mode behaviour described in the backlog. Once the user
 * makes an explicit choice (via the ThemeToggle), that choice is persisted
 * in localStorage under 'reach-theme' and always wins over system
 * preference from then on.
 */
(function () {
  try {
    var saved = localStorage.getItem('reach-theme');
    var theme;
    if (saved === 'dark' || saved === 'light') {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      theme = 'dark';
    } else {
      theme = 'light';
    }
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
