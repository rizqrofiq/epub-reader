// Bump VERSION on any change to this file to invalidate old caches.
const VERSION = "v2";
const STATIC_CACHE = `readium-static-${VERSION}`;
const PAGE_CACHE = `readium-pages-${VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle our own origin. Supabase, R2, Google, MathJax all pass through.
  if (url.origin !== self.location.origin) return;

  // Immutable hashed build assets — cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // Page navigations — network-first with an offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, PAGE_CACHE));
    return;
  }

  // Everything else (manifest, icons, RSC, fonts) — let the browser fetch it
  // normally. Don't intercept; that's what broke the manifest before.
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // Last resort so we never resolve to undefined.
    return Response.error();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    const shell =
      (await cache.match("/dashboard")) || (await cache.match("/"));
    if (shell) return shell;
    return new Response("Offline", {
      status: 503,
      statusText: "Offline",
      headers: { "Content-Type": "text/plain" },
    });
  }
}
