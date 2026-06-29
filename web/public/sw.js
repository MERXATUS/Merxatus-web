const CACHE = "merxatus-static-v2";

const LEGACY_CACHES = ["merxatus-static-v1"];

function isCacheableAsset(url) {
  return url.pathname.startsWith("/Icon/") || url.pathname.startsWith("/_next/static/");
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all([
        ...keys.filter((k) => LEGACY_CACHES.includes(k)).map((k) => caches.delete(k)),
        self.clients.claim(),
      ]),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || !isCacheableAsset(url)) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const res = await fetch(event.request);
      if (res.ok) cache.put(event.request, res.clone());
      return res;
    }),
  );
});
