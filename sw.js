const CACHE_NAME = "etro-cache-v3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./assets/css/styles.css",
  "./assets/js/app.js",
  "./manifest.json",
  "./assets/icons/favicon.svg",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-192-maskable.png",
  "./assets/icons/icon-512-maskable.png"
];

const OPTIONAL_EXTERNAL_ASSETS = ["https://cdn.tailwindcss.com", "https://fonts.cdnfonts.com/css/alliance-no1"];

function createNetworkFirstRequest(request) {
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") {
    return request;
  }
  return new Request(request, { cache: "no-cache" });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(CORE_ASSETS);
        await Promise.all(
          OPTIONAL_EXTERNAL_ASSETS.map(async (assetUrl) => {
            try {
              const response = await fetch(assetUrl, { mode: "no-cors" });
              await cache.put(assetUrl, response);
            } catch (_error) {
              // Ignore optional external cache failures.
            }
          })
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((oldKey) => caches.delete(oldKey))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(createNetworkFirstRequest(request))
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Same-origin files use network-first so app updates are picked up quickly.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(createNetworkFirstRequest(request))
        .then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Cross-origin assets (CDN script/fonts) use cache-first.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (!response || (!response.ok && response.type !== "opaque")) {
            return response;
          }
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));
    })
  );
});
