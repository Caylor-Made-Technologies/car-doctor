// Car Doctor service worker: network first, cache fallback, so you get
// updates when online and the app still works offline.
// Bump VERSION whenever app files change so old caches get cleared.
const VERSION = "v2";
const CACHE = "car-doctor-" + VERSION;
const FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "theme.js",
  "fonts/inter-latin-wght-normal.woff2",
  "causes.json",
  "codes.json",
  "model.json",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined))
        .then((hit) => hit || Response.error())));
});
