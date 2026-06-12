// =============================================
// Kasir PS — Service Worker v5
// Auto cache-bust + offline-capable PWA
// =============================================

// Change this version string every time you deploy.
// The SW will auto-activate and clear old caches.
const CACHE_VERSION = '5';
const CACHE_NAME    = `kasirps-v${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  `/style.css?v=${CACHE_VERSION}`,
  '/app.js',
  '/manifest.json',
  '/icon.png',
  '/icon-192.png',
  '/icon-512.png'
];

// Install: cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // If some assets fail, still complete install
        return Promise.resolve();
      });
    })
  );
  // Force activate immediately (don't wait for old tabs to close)
  self.skipWaiting();
});

// Activate: delete ALL old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  // Immediately take control of all open tabs
  self.clients.claim();
});

// Fetch strategy:
// - Supabase/external APIs: always network (pass-through)
// - HTML navigation: network-first (so user gets latest version)
// - Static assets: cache-first with network fallback
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Always network for Supabase / external APIs
  if (
    url.includes('supabase.co') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com') ||
    url.includes('jsdelivr.net')
  ) {
    return; // Let it pass through normally
  }

  // HTML navigation: network-first (ensures fresh deploys are picked up)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh HTML
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
