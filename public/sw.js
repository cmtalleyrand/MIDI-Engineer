const CACHE_VERSION = 'v5';
const STATIC_CACHE = `midi-combiner-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `midi-combiner-runtime-${CACHE_VERSION}`;
const SHELL_CACHE = `midi-combiner-shell-${CACHE_VERSION}`;

const SHELL_FILES = ['./', './index.html', './manifest.json', './icon.svg', './metadata.json'];

const toAbsoluteUrl = (relativePath) => new URL(relativePath, self.registration.scope).toString();

const isNavigationRequest = (request) =>
  request.mode === 'navigate' || request.destination === 'document';

const isCacheableStaticAsset = (request) => {
  if (request.method !== 'GET') {
    return false;
  }

  const destination = request.destination;
  return ['script', 'style', 'image', 'font', 'audio', 'video', 'worker'].includes(destination);
};

const isSuccessfulResponse = (response) =>
  response && response.status === 200 && (response.type === 'basic' || response.type === 'cors');

self.addEventListener('install', (event) => {
  self.skipWaiting();

  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const results = await Promise.allSettled(
        SHELL_FILES.map((path) => cache.add(toAbsoluteUrl(path)))
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn('[SW] Failed to precache:', SHELL_FILES[index], result.reason);
        }
      });
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, RUNTIME_CACHE, SHELL_CACHE]);
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!keep.has(cacheName)) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(
      (async () => {
        try {
          const networkResponse = await fetch(request);
          if (isSuccessfulResponse(networkResponse)) {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(toAbsoluteUrl('./index.html'), networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          const cache = await caches.open(SHELL_CACHE);
          const fallback = await cache.match(toAbsoluteUrl('./index.html'));
          if (fallback) {
            return fallback;
          }

          return new Response('Offline and no cached app shell available.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  if (!isCacheableStaticAsset(request)) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);

      const networkPromise = fetch(request)
        .then((response) => {
          if (isSuccessfulResponse(response)) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => undefined);

      if (cached) {
        networkPromise.catch(() => undefined);
        return cached;
      }

      const networkResponse = await networkPromise;
      if (networkResponse) {
        return networkResponse;
      }

      return new Response('Resource unavailable offline.', {
        status: 504,
        statusText: 'Gateway Timeout',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })()
  );
});
