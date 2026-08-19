/**
 * ChopBuilder service worker — offline support.
 *
 * Strategy: navigations go network-first (deploys show up immediately) with a
 * cache fallback for offline; everything else is cache-first, which is safe
 * because Vite content-hashes filenames, so a cache hit is always current.
 * pdf.js's standard fonts and cmaps are fetched on demand and get cached the
 * first time a score needs them.
 */
const CACHE = 'chopbuilder-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      // Seed the shell so a hard-offline first navigation still resolves.
      .then((c) => Promise.allSettled([c.add('./'), c.add('./index.html')]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('./index.html'))),
    )
    return
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
