/**
 * Serves the Service Worker JS code as plain text with correct MIME type.
 */
const SW_SCRIPT = `
const CACHE_NAME = "lifeos-cache-v1";
const urlsToCache = ["/exec", "?file=manifest"];

self.addEventListener("install", (event) => {
  console.log("🧠 LifeOS Service Worker installed");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("🚀 LifeOS Service Worker active");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => k !== CACHE_NAME && caches.delete(k)))
    )
  );
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
`;
