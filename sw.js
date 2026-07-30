
const CACHE_VERSION = 'densel-pro-v3-1';
const ASSETS = [
  './', './home.html', './index.html', './app.js', './i18n.js', './manifest.json',
  './jspdf.umd.min.js', './tesseract.min.js', './worker.min.js',
  './tesseract-core-simd.wasm.js', './tesseract-core-simd.wasm',
  './eng.traineddata.gz', './rus.traineddata.gz',
  './pdf.min.js', './pdf.worker.min.js', './mammoth.browser.min.js',
  './icon-192.png', './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(url).catch((err) => console.warn('SW cache skip', url, err))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;
  const isCoreFile = url.endsWith('home.html') || url.endsWith('index.html') || url.endsWith('app.js') || url.endsWith('i18n.js') || url.endsWith('/') || url.endsWith('sw.js');

  if (isCoreFile) {
    e.respondWith(
      fetch(e.request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(e.request, clone));
        return resp;
      }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(e.request, clone));
        return resp;
      }))
    );
  }
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
