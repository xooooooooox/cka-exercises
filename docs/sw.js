// CKA Practice — service worker.
//
// Cache strategy:
//   SHELL_CACHE — index.html / app.js / style.css / sync.js / llm.js /
//                 manifest / icons. Precached on install, served
//                 cache-first afterwards. New deploy bumps the cache key
//                 via __BUILD__ → old cache deleted on activate.
//   DATA_CACHE  — *.json (exercises.json, tools-*.json, nodes-*.json,
//                 tools-versions.json, version.json). Stale-while-
//                 revalidate so users see cached data instantly but the
//                 latest copy lands in cache for the next visit.
//
// Cross-origin requests (JSPM CodeMirror imports, kubernetes.io links)
// pass through without interception.
//
// The literal __BUILD__ is replaced at build time by scripts/build-sw.mjs
// reading docs/version.json.generatedAt. The output is written to
// docs/sw.gen.js, which docs/index.html / app.js register.

const SHELL_CACHE = 'cka-shell-v__BUILD__';
const DATA_CACHE  = 'cka-data-v__BUILD__';

const SHELL_FILES = [
  './',
  './index.html',
  './app.js',
  './style.css',
  './sync.js',
  './llm.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Use no-cache fetches so install pulls the latest bytes from the
    // server even when the browser's HTTP cache has older copies pinned.
    await Promise.all(SHELL_FILES.map(async (path) => {
      try {
        const req = new Request(path, { cache: 'no-cache' });
        const resp = await fetch(req);
        if (resp && resp.ok) await cache.put(path, resp.clone());
      } catch {
        // Best-effort precache; missing assets just fall through to network later.
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('cka-') && k !== SHELL_CACHE && k !== DATA_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // JSON data files — stale-while-revalidate. Skip the manifest (treated
  // as part of the shell) and version.json (small enough that we want it
  // fresh on every fetch to drive update detection).
  const isJson = /\.json$/.test(url.pathname);
  const isManifest = /manifest\.webmanifest$/.test(url.pathname);
  if (isJson && !isManifest) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(req);
      const networkPromise = fetch(req).then(async (resp) => {
        if (resp && resp.ok) await cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      if (cached) {
        networkPromise.catch(() => {});
        return cached;
      }
      const fresh = await networkPromise;
      return fresh || new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } });
    })());
    return;
  }

  // Navigation requests — serve the cached SPA shell when offline. Without
  // this an iOS standalone PWA goes white on cold start with no network.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const resp = await fetch(req);
        if (resp && resp.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put('./index.html', resp.clone());
        }
        return resp;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match('./index.html') || await cache.match('./');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Shell + everything else same-origin → cache-first.
  event.respondWith((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (resp && resp.ok) await cache.put(req, resp.clone());
      return resp;
    } catch {
      return cached || Response.error();
    }
  })());
});
