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

async function htmlAt(url, fetcher, xml = false) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(6500), cf: { cacheTtl: 3600, cacheEverything: true },
    headers: { Accept: 'text/html,application/xhtml+xml' } })
  if (!response.ok || !new RegExp(xml ? 'xml' : 'text/html').test(response.headers.get('content-type') ?? '')) throw Error('Unavailable')
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

const xmlValue = (text, name) => decode(text.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'))?.[1] ?? '')

export function imagePages(html, base, limit = 4) {
  const host = new URL(base).hostname
  if (host === 'tokubai.co.jp') {
    const id = new URL(base).pathname.match(/\/(\d+)(?:\/|$)/)?.[1]
    if (!id) return []
    // Store pages contain nearby stores too; only use this store's leaflet links.
    html = [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map(match => match[0]).filter(tag => {
      const url = safeUrl(attrs(tag.slice(0, tag.indexOf('>') + 1)).href, base)
      return url && new URL(url).pathname.includes('/' + id + '/leaflets/')
    }).join('')
  }
  if (host === 'www.oh-ban.com') {
    const body = html.split(/<h3\b[^>]*>/i)[1]?.split(/<h3\b/i)[0] ?? ''
    return [...body.matchAll(/<a\b[^>]*>/gi)].map(m => safeUrl(attrs(m[0]).href, base))
      .filter(url => url && /\/wp-content\/uploads\/\d{4}\/\d{2}\/[^/]+\.jpe?g(?:\?|$)/i.test(url))
      .slice(0, 4).map(imageUrl => ({ imageUrl }))
  }
  if (host === 'chirashi.line.me') {
    try {
      const state = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '{}').props.pageProps.initialApolloState
      return Object.values(state).filter(row => row.__typename === 'Flyer' && !row.deleteTime)
        .filter(row => {
          const promotion = state[row.promotion?.__ref]
          return promotion && !promotion.deleteTime && Date.parse(promotion.displayStartDateTime) <= Date.now() && Date.parse(promotion.displayEndDateTime) >= Date.now()
        }).sort((a, b) => Number(/チラシ/.test(b.flyerName)) - Number(/チラシ/.test(a.flyerName)) || a.order - b.order)
        .slice(0, 4).map(row => ({ imageUrl: safeUrl(row.flyerWebpImage, base), title: row.flyerName,
          width: row.flyerMeta.webpWidth, height: row.flyerMeta.webpHeight })).filter(row => row.imageUrl)
    } catch { return [] }
  }
  return [...new Set([...html.matchAll(/<img\b[^>]*>/gi)].map(m => attrs(m[0])).map(a => safeUrl(a['data-src'] || a.src, base))
    .filter(url => url && new URL(url).hostname === 'image.tokubai.co.jp' && url.includes('/bargain_office_leaflets/'))
    // Remove crop instructions as well as thumbnail size, so the entire paper is visible.
    .map(url => url.replace(/(\/bargain_office_leaflets\/)w=[^/]+\//, '$1w=1600/')))]
    .slice(0, limit).map(imageUrl => ({ imageUrl }))
}

export function shufooSheets(xml, now = Date.now()) {
  return [...xml.matchAll(/<chirashi>([\s\S]*?)<\/chirashi>/g)].map(m => m[1])
    .filter(item => Date.parse(xmlValue(item, 'publishStartTime').replace(' ', 'T').replaceAll('/', '-') + '+09:00') <= now &&
      Date.parse(xmlValue(item, 'publishEndTime').replace(' ', 'T').replaceAll('/', '-') + '+09:00') >= now)
    .sort((a, b) => Number(/チラシ|今週のお買い得/.test(xmlValue(b, 'title'))) - Number(/チラシ|今週のお買い得/.test(xmlValue(a, 'title'))))
}

export function tiledPages(xml, manifestUrl, title) {
  const width = Number(xmlValue(xml, 'bookW')) * 2, height = Number(xmlValue(xml, 'bookH')) * 2
  const tileW = Number(xmlValue(xml, 'sliceW')), tileH = Number(xmlValue(xml, 'sliceH'))
  const count = Math.min(Number(xmlValue(xml, 'totalPages')), 4)
  const base = new URL(manifestUrl)
  if (!/^(?:www|ipqcache2)\.shufoo\.net$/.test(base.hostname) || !/^\/c\//.test(base.pathname) ||
    ![width, height, tileW, tileH, count].every(n => Number.isSafeInteger(n) && n > 0) || width > 10000 || height > 10000 ||
    !xmlValue(xml, 'scaleSize').split(',').includes('2')) return []
  const columns = Math.ceil(width / tileW), rows = Math.ceil(height / tileH)
  if (columns * rows > 80) return []
  return Array.from({ length: count }, (_, page) => ({ width, height, title: title + (count > 1 ? ` (${page + 1}/${count})` : ''),
    tiles: Array.from({ length: columns * rows }, (_, index) => {
      const x = (index % columns) * tileW, y = Math.floor(index / columns) * tileH
      return { url: new URL(`img/${page}_200_${index}.jpg`, manifestUrl).href, x, y,
        width: Math.min(tileW, width - x), height: Math.min(tileH, height - y) }
    }) }))
}

async function verifiedPage(page, fetcher) {
  try {
    const response = await fetcher(page.imageUrl ?? page.tiles?.[0]?.url, {
      signal: AbortSignal.timeout(6500), cf: { cacheTtl: 3600, cacheEverything: true } })
    const good = response.ok && /^image\//.test(response.headers.get('content-type') ?? '')
    await response.body?.cancel()
    return good
  } catch { return false }
}

async function shufooPages(store, fetcher) {
  const id = store.flyerPortalUrl.match(/shufoo\.net\/pntweb\/shopDetail\/(\d+)\//)?.[1]
  if (!id) return []
  const feed = await htmlAt(`https://www.shufoo.net/api/shopDetailNewXML/${id}/?crosstype=portal&useUtf=true`, fetcher, true)
  const sheet = shufooSheets(feed.html)[0]
  if (!sheet) return []
  const manifestUrl = safeUrl(xmlValue(sheet, 'contentsXml'), feed.url)
  if (!manifestUrl || !/^https:\/\/(?:www|ipqcache2)\.shufoo\.net\/c\//.test(manifestUrl)) return []
  const manifest = await htmlAt(manifestUrl, fetcher, true)
  return tiledPages(manifest.html, manifestUrl, xmlValue(sheet, 'title'))
}

export async function getFlyers(fetcher = fetch) {
  const stores = await Promise.all(flyerStores.map(async store => {
    const fallback = { ...store, extractedPdfUrl: null, previewImageUrl: null, status: 'unavailable' }
    let pages = [], found = {}, sourceUrl = store.officialUrl
    try {
      const page = await htmlAt(store.officialUrl, fetcher)
      found = extractFlyer(page.html, page.url); sourceUrl = page.url
      pages = imagePages(page.html, page.url)
      // York's official widget is limited to two sheets. Read the complete store
      // catalog instead, keeping the widget as a fallback if that request fails.
      if (store.id === 'york') {
        try {
          const catalog = await htmlAt(store.flyerPortalUrl, fetcher)
          const complete = imagePages(catalog.html, catalog.url, Infinity)
          if (complete.length) { pages = complete; sourceUrl = catalog.url }
        } catch { /* Continue with the official widget below. */ }
      }
      if (!pages.length && found.widget) {
        try {
          const widget = await htmlAt(found.widget, fetcher)
          const next = extractFlyer(widget.html, widget.url)
          found = { ...found, previewImageUrl: next.previewImageUrl }; sourceUrl = widget.url
          pages = imagePages(widget.html, widget.url)
        } catch { /* External links remain usable even if a widget is blocked. */ }
      }
      if (!pages.length && store.id === 'musashi') {
        const link = [...page.html.matchAll(/<a\b[^>]*>/gi)].map(m => safeUrl(attrs(m[0]).href, page.url))
          .find(url => url && /^https:\/\/chirashi\.line\.me\/branches\/[a-f0-9]+/.test(url))
        if (link) { const line = await htmlAt(link, fetcher); pages = imagePages(line.html, line.url); sourceUrl = link }
      }
    } catch { /* Retry through the store's independent flyer source below. */ }
    if (!pages.length) {
      try {
        if (store.flyerSourceUrl) {
          const source = await htmlAt(store.flyerSourceUrl, fetcher)
          pages = imagePages(source.html, source.url); sourceUrl = source.url
        }
        else if (store.portalName === 'Shufoo!') { pages = await shufooPages(store, fetcher); sourceUrl = store.flyerPortalUrl }
        else if (!store.flyerPortalUrl.includes('/search?')) {
          const portal = await htmlAt(store.flyerPortalUrl, fetcher)
          pages = imagePages(portal.html, portal.url, store.id === 'york' ? Infinity : 4); sourceUrl = portal.url
        }
      } catch { /* Keep official and portal links even when both extraction routes fail. */ }
    }
    if (!pages.length && found.previewImageUrl) pages = [{ imageUrl: found.previewImageUrl }]
    // A successfully parsed URL alone is insufficient: verify an actual image response.
    const checks = await Promise.all(pages.map(page => verifiedPage(page, fetcher)))
    pages = pages.filter((_, index) => checks[index])
    return { ...fallback, extractedPdfUrl: found.extractedPdfUrl ?? null,
      previewImageUrl: pages[0]?.imageUrl ?? null, pages, verified: pages.length > 0,
      sourceUrl, previewKind: 'flyer', status: pages.length ? 'ok' : 'unavailable' }
  }))
  return { stores, fetchedAt: new Date().toISOString() }
}

export async function flyersResponse(request, ctx, cache = globalThis.caches?.default, fetcher = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Max-Age': '86400' } })
  if (request.method !== 'GET') return Response.json({ error: 'GETで取得してください。' }, { status: 405, headers: { ...headers, Allow: 'GET, OPTIONS' } })
  const key = new Request(new URL('/api/flyers?schema=5', request.url))
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
