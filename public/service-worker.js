// NORODATA service worker.
// v2: navigations are NETWORK-FIRST so users always get the current app shell
// (the previous cache-first strategy kept users pinned to a stale index.html +
// bundle revision for an extra visit after every deploy). The cache remains as
// the offline fallback.
const CACHE_NAME = 'noroya-v2';
const OFFLINE_URLS = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  // App shell / navigations: network-first, fall back to cache when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return networkResponse;
        })
        .catch(() =>
          caches
            .match('/index.html')
            .then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Static same-origin assets: cache-first with background refresh. Hashed
  // JS/CSS files are immutable by name; icons/manifest refresh in background.
  if (sameOrigin) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            }
            return networkResponse;
          })
          .catch(() => {});
        return cachedResponse || networkFetch;
      })
    );
  }
  // Cross-origin requests: pass through untouched (no caching).
});
