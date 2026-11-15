import test from 'node:test'
import assert from 'node:assert/strict'
import { extractFlyer, getFlyers, flyersResponse, imagePages, shufooSheets, tiledPages } from './flyers.mjs'
import worker from './index.mjs'

test('extracts flyer PDFs and images, resolves relative URLs and ignores unrelated documents', () => {
  const result = extractFlyer(`<a href="/company/news.pdf">お知らせ</a>
    <a href="/flyer/current.PDF?a=1&amp;b=2">最新チラシ</a>
    <meta content="/logo.png" property="og:image">
    <img data-src="/images/leaflet.jpg" alt="最新チラシ">`, 'https://store.test/shop/')
  assert.equal(result.extractedPdfUrl, 'https://store.test/flyer/current.PDF?a=1&b=2')
  assert.equal(result.previewImageUrl, 'https://store.test/images/leaflet.jpg')
  assert.deepEqual(extractFlyer('<a href="javascript:alert(1)">チラシ</a><meta property="og:image" content="/store-photo.jpg">', 'https://store.test'),
    { extractedPdfUrl: null, previewImageUrl: null, widget: null })
  assert.equal(extractFlyer('<script>const fake = \'<img src="https://bad.test/flyer.jpg">\'</script>', 'https://store.test').previewImageUrl, null)
  assert.equal(extractFlyer('<img src="/img/header_flyer_btn.png" alt="チラシ"><img src="/waon-bnr.jpg" alt="チラシ">', 'https://store.test').previewImageUrl, null)
})

test('only follows official linked Tokubai leaflet widgets', () => {
  assert.equal(extractFlyer('<iframe src="https://widgets.tokubai.co.jp/878/leaflet_widget?count=2&amp;type=spweb"></iframe>', 'https://store.test').widget,
    'https://widgets.tokubai.co.jp/878/leaflet_widget?count=2&type=spweb')
  assert.equal(extractFlyer('<iframe src="https://unknown.test/878/leaflet_widget"></iframe>', 'https://store.test').widget, null)
})

test('nine stores retain fallbacks on blocked, non-HTML and failed upstream responses', async () => {
  const result = await getFlyers(async (url, options) => {
    assert.deepEqual(options.cf, { cacheTtl: 3600, cacheEverything: true })
    if (url === 'https://image.test/leaflet.jpg') return new Response('image bytes', { headers: { 'Content-Type': 'image/jpeg' } })
    if (url.includes('yamazawa')) return new Response('<iframe src="https://widgets.tokubai.co.jp/878/leaflet_widget"></iframe>', { headers: { 'Content-Type': 'text/html' } })
    if (url.includes('widgets.tokubai')) return new Response('<img src="https://image.test/leaflet.jpg">', { headers: { 'Content-Type': 'text/html' } })
    if (url.includes('gyomusuper')) return new Response('blocked', { status: 403 })
    if (url.includes('tsuruha')) return new Response('not html')
    throw Error('Network unavailable')
  })
  assert.equal(result.stores.length, 9)
  assert.equal(new Set(result.stores.map(s => s.id)).size, 9)
  assert.equal(result.stores.find(s => s.id === 'yamazawa').previewImageUrl, 'https://image.test/leaflet.jpg')
  for (const store of result.stores) {
    assert.ok(store.officialUrl.startsWith('https://'))
    assert.ok(store.flyerPortalUrl.startsWith('https://'))
    if (store.id !== 'yamazawa') {
      assert.equal(store.extractedPdfUrl, null)
      assert.equal(store.previewImageUrl, null)
    }
  }
})

test('GET is edge cached for an hour, CORS preflight does not fetch and invalid methods are rejected', async () => {
  let calls = 0, saved = null
  const cache = { match: async () => saved?.clone(), put: async (_, response) => { saved = response } }
  const fetcher = async () => { calls++; return new Response('<p>店舗</p>', { headers: { 'Content-Type': 'text/html' } }) }
  const request = new Request('https://household.test/api/flyers')
  const first = await flyersResponse(request, null, cache, fetcher)
  assert.equal(first.headers.get('Cache-Control'), 'public, max-age=3600')
  assert.equal(first.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal((await first.json()).stores.length, 9)
  const firstCalls = calls
  assert.ok(firstCalls >= 9)
  await flyersResponse(request, null, cache, fetcher)
  assert.equal(calls, firstCalls)
  const preflight = await worker.fetch(new Request(request.url, { method: 'OPTIONS', headers: { Origin: 'https://yohaku1228.github.io' } }), {})
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal((await flyersResponse(new Request(request.url, { method: 'POST' }), null, cache, fetcher)).status, 405)
  assert.equal(calls, firstCalls)
})

test('Tokubai images are uncropped and belong to the requested store, not nearby stores', () => {
  const html = '<a href="/chain/123/leaflets/7"><img data-src="https://image.tokubai.co.jp/images/bargain_office_leaflets/w=552,h=444,mc=true,cw=552/123.jpg"></a>' +
    '<a href="/other/999/leaflets/8"><img src="https://image.tokubai.co.jp/images/bargain_office_leaflets/w=100/999.jpg"></a>'
  assert.deepEqual(imagePages(html, 'https://tokubai.co.jp/chain/123'), [
    { imageUrl: 'https://image.tokubai.co.jp/images/bargain_office_leaflets/w=1600/123.jpg' },
  ])
  assert.deepEqual(imagePages(html, 'https://tokubai.co.jp/other/456'), [])
})

test('Shufoo chooses active dated flyers and assembles complete sheets, including edge tiles', () => {
  const sheet = (title, start, end) => `<chirashi><title>${title}</title><publishStartTime>${start}</publishStartTime><publishEndTime>${end}</publishEndTime></chirashi>`
  const xml = sheet('ポイント', '2026/11/01 00:00:00', '2026/11/30 23:59:59') +
    sheet('今週のお買い得', '2026/11/11 00:00:00', '2026/11/17 23:59:59') +
    sheet('古いチラシ', '2026/10/01 00:00:00', '2026/10/30 23:59:59') +
    sheet('未来のチラシ', '2026/12/01 00:00:00', '2026/12/30 23:59:59')
  const active = shufooSheets(xml, Date.parse('2026-11-15T09:00:00+09:00'))
  assert.equal(active.length, 2)
  assert.match(active[0], /今週のお買い得/)
  const manifest = '<bookW>928</bookW><bookH>646</bookH><sliceW>512</sliceW><sliceH>512</sliceH><totalPages>2</totalPages><scaleSize>1,2,4,8</scaleSize>'
  const pages = tiledPages(manifest, 'https://www.shufoo.net/c/2026/11/05/123/index/contents.xml', 'チラシ')
  assert.equal(pages.length, 2)
  assert.equal(pages[0].width, 1856)
  assert.equal(pages[0].height, 1292)
  assert.equal(pages[0].tiles.length, 12)
  assert.deepEqual(pages[0].tiles.at(-1), { url: 'https://www.shufoo.net/c/2026/11/05/123/index/img/0_200_11.jpg', x: 1536, y: 1024, width: 320, height: 268 })
  assert.equal(pages[0].tiles.reduce((total, tile) => total + tile.width * tile.height, 0), 1856 * 1292)
  assert.deepEqual(tiledPages(manifest, 'https://unknown.test/c/contents.xml', 'bad'), [])
})

test('independent official flyer feed still works when the Musashi store page fails', async () => {
  const state = {
    'Promotion:one': { displayStartDateTime: new Date(Date.now() - 86400000).toISOString(), displayEndDateTime: new Date(Date.now() + 86400000).toISOString() },
    'Flyer:one': { __typename: 'Flyer', flyerName: '今週のチラシ', flyerWebpImage: 'https://image.test/musashi.webp',
      promotion: { __ref: 'Promotion:one' }, flyerMeta: { webpWidth: 1400, webpHeight: 1000 }, order: 1 },
  }
  const data = await getFlyers(async url => {
    if (url.startsWith('https://chirashi.line.me/branches/')) return new Response(
      '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify({ props: { pageProps: { initialApolloState: state } } }) + '</script>',
      { headers: { 'Content-Type': 'text/html' } })
    if (url === 'https://image.test/musashi.webp') return new Response('image', { headers: { 'Content-Type': 'image/webp' } })
    return new Response('Unavailable', { status: 503 })
  })
  const musashi = data.stores.find(store => store.id === 'musashi')
  assert.equal(musashi.verified, true)
  assert.equal(musashi.pages[0].imageUrl, 'https://image.test/musashi.webp')
})

test('York reads every own-store sheet from the full catalog rather than the two-sheet widget', async () => {
  const html = Array.from({ length: 8 }, (_, i) => `<a href="/chain/9631/leaflets/${i}"><img data-src="https://image.tokubai.co.jp/images/bargain_office_leaflets/w=100,h=137,c=true/${i}.jpg"></a>`).join('') +
    '<a href="/other/123/leaflets/999"><img src="https://image.tokubai.co.jp/images/bargain_office_leaflets/w=100/999.jpg"></a>'
  let widgetFetched = false
  const data = await getFlyers(async url => {
    if (url.includes('yorkbenimaru.com')) return new Response('<iframe src="https://widgets.tokubai.co.jp/9631/leaflet_widget?count=2"></iframe>', { headers: { 'Content-Type': 'text/html' } })
    if (new URL(url).hostname === 'tokubai.co.jp' && url.endsWith('/9631')) return new Response(html, { headers: { 'Content-Type': 'text/html' } })
    if (url.includes('widgets.tokubai.co.jp/9631')) widgetFetched = true
    if (new URL(url).hostname === 'image.tokubai.co.jp') return new Response('image', { headers: { 'Content-Type': 'image/jpeg' } })
    return new Response('unavailable', { status: 503 })
  })
  const york = data.stores.find(store => store.id === 'york')
  assert.equal(york.pages.length, 8)
  assert.equal(new Set(york.pages.map(page => page.imageUrl)).size, 8)
  assert.equal(york.verified, true)
  assert.equal(widgetFetched, false)
  assert.ok(york.pages.every(page => !page.imageUrl.includes('999.jpg')))
})
