// Minimal service worker: caches just the app shell (this page) so the
// interface still loads if you open it with no signal. Your actual data
// (products, queue, batches) always comes fresh from Firestore over the
// network — this only helps the UI itself appear instantly / offline.
const CACHE_NAME = 'vayora-tickets-shell-v1';
const SHELL_URL = './';

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.add(SHELL_URL)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Only handle same-origin navigations to the app shell itself.
  // Everything else (Firebase, fonts, CDN libraries) goes straight to the
  // network untouched — we never want to serve stale data or break auth.
  if(event.request.mode === 'navigate' && url.origin === self.location.origin){
    event.respondWith(
      fetch(event.request).catch(() => caches.match(SHELL_URL))
    );
  }
});
