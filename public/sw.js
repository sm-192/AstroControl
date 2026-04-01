/* =================================================
   AstroControl — sw.js
   Service Worker: cache offline da interface
   ================================================= */

var CACHE = 'astrocontrol-v1';
var ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/alignment.js',
  '/manifest.json'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k)  { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  /* deixa requisições WebSocket e iframes passarem direto */
  if (e.request.url.includes(':3000') ||
      e.request.url.includes(':6080') ||
      e.request.url.includes(':6081') ||
      e.request.url.includes(':6082') ||
      e.request.url.includes(':7681') ||
      e.request.url.includes(':8624') ||
      e.request.url.includes(':8765')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(function(cached) {
      return cached || fetch(e.request).then(function(response) {
        /* atualiza cache com resposta fresca */
        var clone = response.clone();
        caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        return response;
      }).catch(function() {
        return cached;
      });
    })
  );
});
