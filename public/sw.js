const CACHE_NAME = 'futurex-v8.8.2';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Force immediate activation
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('Service Worker: Pre-cache asset error', err);
      });
    })
  );
});

// Take control of all clients and delete old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('Service Worker: Purging outdated cache key:', key);
          return caches.delete(key);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Message listener for forced update / cache purge
self.addEventListener('message', (event) => {
  if (event.data && (event.data.type === 'SKIP_WAITING' || event.data.type === 'PURGE_CACHE')) {
    self.skipWaiting();
    caches.keys().then((keys) => {
      keys.forEach((key) => caches.delete(key));
    });
  }
});

// Network-First for Navigation (HTML), Stale-While-Revalidate for static assets
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests or non-http(s)
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // Never cache version.json or Service Worker files
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('sw.js')) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigation requests (HTML / page loads): ALWAYS try network first!
  const isHTMLRequest = request.mode === 'navigate' || 
                        (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) ||
                        url.pathname === '/' || 
                        url.pathname.endsWith('/index.html');

  if (isHTMLRequest) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', responseClone));
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match('/index.html');
        })
    );
    return;
  }

  // Static assets (js, css, images): Cache first with network fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});
