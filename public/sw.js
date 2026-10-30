/* Rhemlo service worker: app shell stays available offline; downloaded lesson packs serve from cache. */
const SHELL = 'rhemlo-shell-v1'
self.addEventListener('install', e => { e.waitUntil(caches.open(SHELL).then(c => c.addAll(['/', '/manifest.webmanifest']))); self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return
  const url = new URL(req.url); if (url.origin !== location.origin) return
  if (req.mode === 'navigate') { // network first, offline falls back to the cached shell
    e.respondWith(fetch(req).then(r => { const copy = r.clone(); caches.open(SHELL).then(c => c.put('/', copy)); return r }).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.startsWith('/data/')) { // downloaded packs first, then network
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)))
    return
  }
  if (url.pathname.startsWith('/assets/')) { // stale-while-revalidate for code, fonts and art
    e.respondWith(caches.open(SHELL).then(async c => { const hit = await c.match(req); const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r }).catch(() => hit); return hit || net }))
  }
})
