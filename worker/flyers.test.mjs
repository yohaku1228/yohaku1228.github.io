import test from 'node:test'
import assert from 'node:assert/strict'
import { extractFlyer, getFlyers, flyersResponse } from './flyers.mjs'
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
  await flyersResponse(request, null, cache, fetcher)
  assert.equal(calls, 9)
  const preflight = await worker.fetch(new Request(request.url, { method: 'OPTIONS', headers: { Origin: 'https://yohaku1228.github.io' } }), {})
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal((await flyersResponse(new Request(request.url, { method: 'POST' }), null, cache, fetcher)).status, 405)
  assert.equal(calls, 9)
})
