/* Magical Map Maker — Service Worker for Offline Support */

const CACHE_NAME = 'magical-map-maker-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './css/themes.css',
  './css/editor.css',
  './css/print.css',
  './js/app.js',
  './js/editor.js',
  './js/grid.js',
  './js/tiles.js',
  './js/overlays.js',
  './js/palette.js',
  './js/input.js',
  './js/camera.js',
  './js/history.js',
  './js/storage.js',
  './js/export.js',
  './js/themes.js',
  './js/animation.js',
  './js/sound.js',
  './js/names.js',
  './js/settings.js',
  './js/tutorial.js',
  './js/realm-brew.js',
  './js/lib/jspdf.umd.min.js',
  './assets/icons/overlays.svg'
];

// Data files use network-first strategy
const DATA_FILES = [
  './js/data/base-types.json',
  './js/data/overlays.json',
  './js/data/themes.json',
  './js/data/templates.json'
];

// Install: cache all core assets, then activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([...ASSETS_TO_CACHE, ...DATA_FILES]))
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for assets, network-first for data files
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests (skip CDN fonts etc.)
  if (url.origin !== self.location.origin) return;

  // Network-first for data JSON files
  const isDataFile = DATA_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')));
  if (isDataFile) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // Cache successful same-origin responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
