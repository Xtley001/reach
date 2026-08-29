import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// D-47: frontend error monitoring. The backend already has Sentry wired up
// (main.py/config.py/SENTRY_DSN) — this was the missing half: a crash on a
// volunteer's phone mid-call used to vanish with no record. Dynamically
// imported so the bundle stays lean when VITE_SENTRY_DSN isn't configured.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  import('@sentry/react').then((Sentry) => {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
    window.Sentry = Sentry; // used by ErrorBoundary.componentDidCatch
  }).catch(() => {
    // eslint-disable-next-line no-console
    console.warn('[Sentry] failed to load — continuing without error monitoring');
  });
}

// P2-5.2: Service Worker registration for offline-first support
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
