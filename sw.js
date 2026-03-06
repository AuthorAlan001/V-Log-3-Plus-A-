// ═══════════════════════════════════════════════════
// SW.JS — Service Worker with Version-Aware Caching
// Neuro-Stim Voiding Diary v3.2
// ═══════════════════════════════════════════════════

// Version must match APP_VERSION in shared.js
const SW_VERSION = '3.2';
const CACHE_NAME = 'vlog-plus-v' + SW_VERSION;

const ASSETS = [
  './',
  './index.html',
  './shared.js',
  './components.js',
  './timers.js',
  './form-view.js',
  './list-view.js',
  './stats-view.js',
  './intake-view.js',
  './report-view.js',
  './settings-view.js',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/prop-types@15/prop-types.min.js',
  'https://unpkg.com/recharts@2.12.7/umd/Recharts.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first for navigation requests (HTML), cache-first for assets
self.addEventListener('fetch', event => {
  const request = event.request;

  // Navigation requests: try network first so updates are picked up
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache the fresh copy
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // All other requests: cache-first with network fallback
  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request))
      .catch(() => caches.match('./index.html'))
  );
});

// Listen for skip waiting message from the app
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
