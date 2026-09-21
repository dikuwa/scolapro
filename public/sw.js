const CACHE_NAME = "scolapro-shell-v2";
const OFFLINE_PATH = "/offline";
const SHELL = [
  "/manifest.webmanifest",
  "/brand/scolapro/icon-blue.svg",
  "/brand/scolapro/icon-180.png",
  "/brand/scolapro/icon-192.png",
  "/brand/scolapro/icon-512.png",
];

async function cacheOfflineShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(SHELL);

  const response = await fetch(OFFLINE_PATH, { cache: "reload" });
  if (!response.ok) return;
  await cache.put(OFFLINE_PATH, response.clone());

  const html = await response.text();
  const assetPaths = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
    const value = match[1];
    if (value.startsWith("/_next/static/") || value.startsWith("/brand/")) assetPaths.add(value);
  }

  await Promise.all(
    [...assetPaths].map(async (assetPath) => {
      try {
        const asset = await fetch(assetPath, { cache: "reload" });
        if (asset.ok) await cache.put(assetPath, asset);
      } catch {
        // A single optional asset must not prevent the offline shell installing.
      }
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflineShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(OFFLINE_PATH)) || Response.error();
      }),
    );
    return;
  }

  const stableAsset =
    url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/brand/")
    || url.pathname === "/manifest.webmanifest";

  if (!stableAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    })),
  );
});
