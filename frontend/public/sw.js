/*
 * Travel Space service worker.
 *
 * Goals:
 *   1. Precache the app-shell assets (manifest, icons) so first launch after
 *      install is instant and the install prompt can fire.
 *   2. Cache static assets on the fly (JS bundles, images, fonts) with a
 *      stale-while-revalidate strategy. If the network is available the user
 *      always sees the latest bundle; if it isn't, the last cached copy is
 *      served.
 *   3. NEVER cache /api/* responses. The client already ships its own
 *      offline layer (AsyncStorage mirror + sync queue) — the service worker
 *      must not interfere with those flows.
 *   4. Serve an offline fallback for navigations so the app shell always
 *      loads even without a network.
 */

const VERSION = "v1";
const APP_SHELL = `travel-space-shell-${VERSION}`;
const RUNTIME = `travel-space-runtime-${VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== APP_SHELL && k !== RUNTIME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

function isApiRequest(url) {
  return url.pathname.startsWith("/api/") || url.pathname === "/api";
}

function isCacheable(url) {
  // Static asset extensions we happily cache.
  return /\.(?:js|mjs|css|png|jpg|jpeg|webp|svg|gif|woff2?|ttf|eot|ico|map)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // POST/PATCH/DELETE go straight to network

  const url = new URL(req.url);

  // Same-origin only. Third-party requests (map tiles, Nominatim proxy, etc.)
  // are left untouched.
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls — the app's sync layer handles offline for those.
  if (isApiRequest(url)) return;

  // Navigation requests: network-first, fall back to cached root.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(RUNTIME);
          cache.put(req, fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(APP_SHELL);
          const cached = await cache.match("/");
          if (cached) return cached;
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  if (isCacheable(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((resp) => {
            if (resp && resp.status === 200 && resp.type !== "opaque") {
              cache.put(req, resp.clone()).catch(() => {});
            }
            return resp;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })()
    );
  }
});

// Optional: let the client force a manual sync-worker wake-up.
self.addEventListener("message", (event) => {
  if (event?.data === "SKIP_WAITING") self.skipWaiting();
});
