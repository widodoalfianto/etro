const CACHE_NAME = "etro-cache-v9";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./assets/css/app-shell.css",
  "./assets/js/app.js",
  "./assets/audio/Metronome.wav",
  "./assets/audio/MetronomeUp.wav",
  "./manifest.json",
  "./assets/fonts/Degarism Studio - Alliance No.1 Light.otf",
  "./assets/icons/favicon.svg",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-192-maskable.png",
  "./assets/icons/icon-512-maskable.png"
];

const CORE_ASSET_URLS = CORE_ASSETS.map((asset) => new URL(asset, self.location.href).href);
const CORE_ASSET_URL_SET = new Set(CORE_ASSET_URLS);
const INDEX_URL = new URL("./index.html", self.location.href).href;

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
      .then((cache) => cache.addAll(CORE_ASSET_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SKIP_WAITING") return;
  self.skipWaiting();
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
      caches.match(INDEX_URL).then((cached) => {
        if (cached) return cached;

        return fetch(createNetworkFirstRequest(request)).then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(INDEX_URL, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Core shell files are cache-first so installed launches work without network.
  if (CORE_ASSET_URL_SET.has(url.href)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;

        return fetch(createNetworkFirstRequest(request)).then((response) => {
          if (response && (response.ok || response.type === "opaque")) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Other same-origin files stay network-first so local updates are still picked up quickly.
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
        .catch(() => caches.match(request).then((cached) => cached || caches.match(INDEX_URL)))
    );
    return;
  }

  // Cross-origin assets use a simple network-first fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (!response || (!response.ok && response.type !== "opaque")) {
          return response;
        }
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match(INDEX_URL)))
  );
});
