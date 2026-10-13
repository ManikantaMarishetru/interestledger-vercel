// InterestLedger service worker — app shell only.
// CACHE version: bump (v1 -> v2 ...) to force an update.
// Caches ONLY the shell (index, css, js, manifest, icon).
// Never caches IndexedDB/localStorage data or backup files.

const CACHE = "interestledger-v1";

const SHELL = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/money.js",
  "./js/interest.js",
  "./js/ledger.js",
  "./js/store.js",
  "./js/i18n.js",
  "./js/backup.js",
  "./js/pwa.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

function isBackupFile(pathname) {
  const p = pathname.toLowerCase();
  return (
    p.includes("backup") ||
    p.endsWith(".backup") ||
    p.endsWith(".bak") ||
    // Exported JSON copies are user data, never shell.
    (p.endsWith(".json") && !p.endsWith("manifest.webmanifest") && !p.endsWith("package.json"))
  );
}

function isShellRequest(url) {
  const path = url.pathname.toLowerCase();
  return SHELL.some((entry) => {
    const clean = entry.replace(/^\.\//, "/").toLowerCase();
    if (clean === "/" || clean === "") {
      return path === "/" || path.endsWith("/index.html");
    }
    return path.endsWith(clean);
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // addAll fails if one file is missing (e.g. other worker stub not yet
      // written). Cache what exists so install never bricks offline use.
      await Promise.allSettled(
        SHELL.map(async (entry) => {
          try {
            await cache.add(entry);
          } catch {
            // Missing stub: skip, next version will pick it up.
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  // Never cache or serve user data / backup files.
  if (isBackupFile(url.pathname)) return;
  // Only the app shell gets cache-first. Everything else goes to network.
  if (!isShellRequest(url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: false });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          // Clone before put; never store backup/data responses (guarded above).
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        // Offline and not cached: fall back to cached index for navigations.
        if (req.mode === "navigate") {
          const index = await cache.match("./index.html");
          if (index) return index;
        }
        throw new Error("offline");
      }
    })()
  );
});
