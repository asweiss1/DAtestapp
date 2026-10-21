const CACHE = "daranch-app-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/config.js",
  "./js/logic.js",
  "./js/weather.js",
  "./js/idb.js",
  "./js/sync.js",
  "./js/tour.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./vendor/supabase.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const response = await fetch(event.request, { signal: ctrl.signal });
      clearTimeout(timer);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === "navigate") {
        const home = await cache.match("./index.html");
        if (home) return home;
      }
      return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
    }
  })());
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "daranch") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) client.postMessage({ type: "sync" });
    }),
  );
});
