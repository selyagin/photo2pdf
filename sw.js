
const CACHE_NAME = 'photo2pdf-v2-2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './jspdf.umd.min.js',
  './tesseract.min.js',
  './worker.min.js',
  './tesseract-core-simd.wasm.js',
  './tesseract-core-simd.wasm',
  './eng.traineddata.gz',
  './rus.traineddata.gz',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(url).catch((err) => console.warn('SW cache skip', url, err))))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
