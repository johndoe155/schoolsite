/*
 * School Portal service worker.
 *
 * What it is for, and what it deliberately is not:
 *
 *   FOR:  the teacher standing in a classroom with no signal. The register is
 *         marked up on the phone; the page must load, the marks must survive,
 *         and they must go up when the phone finds a signal again. So the app
 *         shell (JS/CSS/fonts) is cached, and /portal/offline-register — a
 *         client-rendered page with no server data — is precached so there is
 *         somewhere to go that still works. Every other navigation falls back
 *         to an offline notice instead of the browser's dinosaur.
 *
 *   NOT:  an API cache. Responses from /api/ are never written to the Cache
 *         Storage — they carry a signed-in user's children's data, and on a
 *         shared staffroom device a cached response could be served to the next
 *         person who opens the app. Offline writes wait in IndexedDB (see
 *         lib/offline.ts) and only the page decides when to send them.
 */
/* Bump VERSION when the shell changes: `activate` deletes every cache that does
   not start with it, which is the only way an installed app picks up new code
   before the old cache expires. */
const VERSION = "portal-v2";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

/* Precache only things that are public and stable. Hashed Next chunks are
   handled at runtime (cache-first) because their names change every build. */
const PRECACHE = [
  "/portal/offline.html",
  "/portal/offline-register",
  "/portal/icon.svg",
  "/portal/icon-192.png",
  "/portal/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function isStatic(url) {
  return url.pathname.includes("/_next/static/") ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                    // writes are the page's business
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // never proxy third parties
  if (url.pathname.startsWith("/portal/api/")) return; // see the note above: no API cache

  if (isStatic(url)) {
    // Cache-first for immutable, content-hashed assets.
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(RUNTIME);
          cache.put(req, res.clone());
        }
        return res;
      } catch {
        return new Response("", { status: 504, statusText: "offline" });
      }
    })());
    return;
  }

  if (req.mode === "navigate") {
    // Network-first: never show a stale page when the portal is reachable.
    event.respondWith((async () => {
      try {
        return await fetch(req);
      } catch {
        const cache = await caches.open(SHELL);
        /* The offline register is the page that is actually useful with no
           signal, so it wins over the generic notice. It reads the class list
           out of IndexedDB itself. */
        const register = await cache.match("/portal/offline-register");
        const offline = register ?? await cache.match("/portal/offline.html");
        return offline ?? new Response("You are offline.", {
          status: 503, headers: { "content-type": "text/plain" },
        });
      }
    })());
  }
});
