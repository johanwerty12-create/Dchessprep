const APP_CACHE = 'chessdesk-app-__APP_CACHE_VERSION__';
const ENGINE_CACHE = 'chessdesk-engine-__ENGINE_CACHE_VERSION__';
const SHELL = ['/','/index.html','/manifest.webmanifest','/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    try {
      await cache.addAll(SHELL);
      const response = await fetch('/offline-assets.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Offline asset manifest failed with ${response.status}.`);
      const urls = await response.json();
      if (!Array.isArray(urls) || !urls.every((url) => typeof url === 'string' && url.startsWith('/') && !url.startsWith('//'))) {
        throw new Error('Offline asset manifest is malformed.');
      }
      await cache.addAll(urls.filter((url) => !url.startsWith('/engine/')));
    } catch (error) {
      await caches.delete(APP_CACHE);
      throw error;
    }
    // Let existing tabs finish on their installed version. Activating an update
    // immediately would delete assets that those tabs still need while offline.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('chessdesk-') && ![APP_CACHE, ENGINE_CACHE].includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/engine/')) {
    event.respondWith((async () => {
      const cache = await caches.open(ENGINE_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          try { await cache.put(request, response.clone()); } catch { /* a full engine cache must not mask a valid network response */ }
        }
        return response;
      } catch {
        return cached || new Response('Stockfish has not been downloaded on this device yet.', { status: 503, statusText: 'Engine offline' });
      }
    })());
    return;
  }
  if (pathname.startsWith('/assets/') || pathname.startsWith('/pieces/') || pathname.startsWith('/icons/') || pathname === '/manifest.webmanifest') {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch { /* keep network delivery working when storage is full */ }
      }
      return response;
    })());
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(async (response) => {
      if (response.ok) return response;
      return (await caches.open(APP_CACHE)).match('/index.html') || response;
    }).catch(async () => (await caches.open(APP_CACHE)).match('/index.html')));
  }
});
