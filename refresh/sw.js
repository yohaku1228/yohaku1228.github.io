const REVISION = "ea8e7f977309d476"
const FILES = ["assets/index-94n0pYRb.js","assets/index-CorTY6oP.css","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","icons/icon.svg","index.html","manifest.webmanifest"]

const scope = self.registration.scope
const cachePrefix = 'household-shell:' + scope + ':'
const cacheName = cachePrefix + REVISION
const shell = new URL('index.html', scope).href
const assets = new Set(FILES.map(path => new URL(path, scope).href))

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...assets])))
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(cachePrefix) && name !== cacheName) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const isAppEntry = url.href.startsWith(scope) &&
    (url.pathname === new URL(scope).pathname || url.pathname === new URL(shell).pathname)
  if (request.mode === 'navigate' && isAppEntry) {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(cacheName)
      return await cache.match(shell) || Response.error()
    }))
  } else if (assets.has(request.url)) {
    // These files are immutable build output, independent of headers such as Origin.
    event.respondWith(caches.open(cacheName).then(async cache => await cache.match(request.url, { ignoreVary: true }) || fetch(request)))
  }
})
