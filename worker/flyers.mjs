import { flyerStores } from '../refresh/src/flyer-stores.ts'

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type', 'X-Content-Type-Options': 'nosniff' }
const decode = value => value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#(x[0-9a-f]+|\d+);/gi,
  (_, code) => String.fromCodePoint(Number.parseInt(code.replace(/^x/i, ''), /^x/i.test(code) ? 16 : 10)))
function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)]
    .map(([, key, a, b, c]) => [key.toLowerCase(), decode(a ?? b ?? c)]))
}
function safeUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value, base)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}
const flyerHint = /チラシ|ちらし|広告|特売|chirashi|flyer|leaflet/i
const unrelated = /news|recruit|privacy|company|採用|求人|個人情報/i

// Do not mistake corporate PDFs, maps, logos or store photos for current flyers.
export function extractFlyer(html, base) {
  const clean = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<!--[\s\S]*?-->/g, '')
  let extractedPdfUrl = null, previewImageUrl = null
  for (const match of clean.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
    const tag = match[0], a = attrs(tag.slice(0, tag.indexOf('>') + 1))
    const url = safeUrl(a.href, base)
    if (url && /\.pdf(?:[?#]|$)/i.test(url) && flyerHint.test(tag + base) && !unrelated.test(tag + url)) {
      extractedPdfUrl = url; break
    }
  }
  for (const match of clean.matchAll(/<(?:img|meta)\b[^>]*>/gi)) {
    const a = attrs(match[0])
    const value = a['data-src'] ?? a.src ?? (a.property === 'og:image' ? a.content : null)
    const url = value && safeUrl(value, base)
    if (url && flyerHint.test([a.alt, url].join(' ')) && !/logo|icon|banner|bnr|button|btn|header|footer|side_|\/common\/|other_image|map|\.svg(?:[?#]|$)/i.test(url)) {
      // Official Tokubai widgets return thumbnails; use the same image's readable CDN size.
      previewImageUrl = new URL(url).hostname === 'image.tokubai.co.jp'
        ? url.replace(/\/w=\d+(?:,h=\d+)?\//, '/w=1200/') : url
      break
    }
  }
  const widget = [...clean.matchAll(/<(?:iframe|a)\b[^>]*>/gi)].map(m => attrs(m[0]))
    .map(a => safeUrl(a.src ?? a.href, base)).find(value => {
      if (!value) return false
      const url = new URL(value)
      return url.hostname === 'widgets.tokubai.co.jp' && /^\/\d+\/leaflet_widget$/.test(url.pathname)
    })
  return { extractedPdfUrl, previewImageUrl, widget: widget ?? null }
}

async function htmlAt(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(6500), cf: { cacheTtl: 3600, cacheEverything: true },
    headers: { Accept: 'text/html,application/xhtml+xml' } })
  if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw Error('Unavailable')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let html = '', size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 2_000_000) throw Error('Page too large')
      html += decoder.decode(value, { stream: true })
    }
    return { html: html + decoder.decode(), url: response.url || url }
  } finally { await reader.cancel().catch(() => {}) }
}

export async function getFlyers(fetcher = fetch) {
  const stores = await Promise.all(flyerStores.map(async store => {
    const fallback = { ...store, extractedPdfUrl: null, previewImageUrl: null, status: 'unavailable' }
    try {
      const page = await htmlAt(store.officialUrl, fetcher)
      let found = extractFlyer(page.html, page.url), sourceUrl = page.url
      if (!found.extractedPdfUrl && !found.previewImageUrl && found.widget) {
        try {
          const widget = await htmlAt(found.widget, fetcher)
          found = extractFlyer(widget.html, widget.url); sourceUrl = widget.url
        } catch { /* External links remain usable even if a widget is blocked. */ }
      }
      return { ...fallback, extractedPdfUrl: found.extractedPdfUrl, previewImageUrl: found.previewImageUrl,
        sourceUrl, previewKind: 'flyer', status: 'ok' }
    } catch { return fallback }
  }))
  return { stores, fetchedAt: new Date().toISOString() }
}

export async function flyersResponse(request, ctx, cache = globalThis.caches?.default, fetcher = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Max-Age': '86400' } })
  if (request.method !== 'GET') return Response.json({ error: 'GETで取得してください。' }, { status: 405, headers: { ...headers, Allow: 'GET, OPTIONS' } })
  const key = new Request(new URL('/api/flyers', request.url))
  const cached = cache && await cache.match(key)
  if (cached) return cached
  const response = Response.json(await getFlyers(fetcher), { headers: { ...headers, 'Cache-Control': 'public, max-age=3600' } })
  if (cache) {
    const write = cache.put(key, response.clone()).catch(() => {})
    if (ctx?.waitUntil) ctx.waitUntil(write)
    else await write
  }
  return response
}
