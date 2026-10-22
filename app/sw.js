// Car Doctor service worker: network first, cache fallback, so you get
// updates when online and the app still works offline.
// Bump VERSION whenever app files change so old caches get cleared.
const VERSION = "v4";
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
  "glossary.json",
  "circuit.svg",
  "fonts/montserrat-latin-wght-normal.woff2",
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
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // Reminders: app.js opens event.ics?d=<calendar text>. Answering with a
  // real text/calendar file makes the phone offer to add it to Calendar.
  if (url.pathname.endsWith("/event.ics")) {
    const ics = url.searchParams.get("d") || "";
    if (!ics.startsWith("BEGIN:VCALENDAR")) {
      event.respondWith(new Response("Not a calendar file", { status: 400 }));
      return;
    }
    event.respondWith(new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8" } }));
    return;
  }

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
