import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

const worker = String.raw`
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
`

export function offlineBuild(): Plugin {
  let outDir: string
  return {
    name: 'household-offline-shell',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    async closeBundle() {
      const files = (await readdir(outDir, { recursive: true, withFileTypes: true }))
        .filter(file => file.isFile() && file.name !== 'sw.js')
        .map(file => resolve(file.parentPath, file.name).slice(outDir.length + 1).replaceAll('\\', '/'))
        .sort()
      const digest = createHash('sha256').update(worker)
      for (const file of files) digest.update(file).update(await readFile(resolve(outDir, file)))
      const revision = digest.digest('hex').slice(0, 16)
      await writeFile(resolve(outDir, 'sw.js'), `const REVISION = "${revision}"\nconst FILES = ${JSON.stringify(files)}\n` + worker)
    },
  }
}
