const CACHE_NAME = "tpf-v0-8-1";
const ASSETS = [
  "index.html",
  "support.html",
  "myforest.html",
  "menu.html",
  "manifest.json",
  "assets/styles.css",
  "assets/app-common.js",
  "assets/pi-init.js",
  "assets/home.js",
  "assets/support.js",
  "assets/myforest.js",
  "assets/tpf-logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => null))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(key => {
      if (key !== CACHE_NAME) return caches.delete(key);
    })))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request).then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => null);
        return response;
      });
    }).catch(() => caches.match("index.html"))
  );
});
