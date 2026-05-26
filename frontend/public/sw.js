/**
 * REACH — Service Worker
 * P2-5.2: App shell cache-first strategy.
 * API calls always go to network (never cached here — handled by lib/cache.js).
 * IndexedDB sync queue (lib/offline.js) handles write-while-offline.
 */

const CACHE_NAME  = 'reach-shell-v1';
const SHELL_URLS  = ['/', '/index.html', '/manifest.json'];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API calls — always hit the network
  if (url.pathname.startsWith('/api') || url.hostname !== self.location.hostname) {
    return; // fall through to network
  }

  // Navigation requests — serve app shell from cache, fall back to network
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cached => cached || fetch(request))
    );
    return;
  }

  // Static assets — cache first, then network
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
