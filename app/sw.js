// sw.js — cache-first service worker so Permit Bowl installs and runs offline on the phone.
const CACHE = 'permit-bowl-v8';
const SHELL = [
  './', './index.html', './styles.css',
  './js/game.js', './js/deck.js', './js/engine.js', './js/config.js',
  './manifest.webmanifest',
  '../content/ohio-permit-cards.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always prefer fresh files when online (so updates land immediately and dev
// isn't fighting a stale cache), and fall back to the cached copy only when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // {cache:'no-store'} forces a fresh copy from the network (no HTTP cache), so code updates
    // always land immediately. Falls back to the cached copy only when offline.
    fetch(e.request, { cache: 'no-store' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request))
  );
});
