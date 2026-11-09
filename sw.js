/* Network-first service worker for Will Ruby's Garage.
   Cache names are prefixed so this app does not delete caches
   belonging to other projects on the same GitHub Pages origin. */
const CACHE_PREFIX = 'will-rubys-garage-';
const CACHE_NAME = CACHE_PREFIX + 'v5';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './calc.js',
  './sync-model.js',
  './vin.js',
  './cloud.js',
  './guide.js',
  './app.js',
  './wrg-config.js',
  './manifest.json',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-192.jpg',
  './icon-512.jpg',
  './icon-maskable-192.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(ASSETS.map(async (url) => {
      try {
        await cache.add(url);
      } catch (err) {
        /* A single missing asset should not block the shell. */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) return caches.delete(key);
      return Promise.resolve(false);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && fresh.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = (await caches.match('./index.html')) || (await caches.match('./'));
        if (shell) return shell;
      }
      return new Response('Offline', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
