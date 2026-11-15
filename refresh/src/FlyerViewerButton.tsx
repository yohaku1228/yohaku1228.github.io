import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, RefreshCw, X } from 'lucide-react'
import { flyerStores, type Flyer, type FlyerCategory, type FlyerData, type FlyerPage } from './flyer-stores'
import { orderFlyers } from './flyer-order'

let cached: { data: FlyerData; expires: number } | null = null
let pending: Promise<FlyerData> | null = null
function loadFlyers() {
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.data)
  if (pending) return pending
  pending = fetch('/api/flyers?v=5', { credentials: 'omit', signal: AbortSignal.timeout(35000) })
    .then(async response => {
      if (!response.ok) throw Error('取得できませんでした。公式サイトから確認できます。')
      const data: FlyerData = await response.json()
      if (!Array.isArray(data.stores) || !data.stores.length || typeof data.fetchedAt !== 'string') throw Error('店舗情報を取得できませんでした。')
      cached = { data, expires: Date.now() + 3600000 }
      return data
    }).finally(() => { pending = null })
  return pending
}
const fallback: Flyer[] = flyerStores.map(store => ({ ...store, extractedPdfUrl: null, previewImageUrl: null }))
const filters: { id: FlyerCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'すべて' }, { id: 'supermarket', label: 'スーパー' },
  { id: 'drug', label: 'ドラッグストア' }, { id: 'home', label: 'ホームセンター' },
]

function Paper({ page, name, onResult }: { page: FlyerPage; name: string; onResult: (ready: boolean) => void }) {
  const [zoom, setZoom] = useState(1)
  const [failed, setFailed] = useState(false)
  const [complete, setComplete] = useState(false)
  const loaded = useRef(new Set<number>())
  const reported = useRef(false)
  function ready(index: number) {
    loaded.current.add(index)
    if (!reported.current && loaded.current.size === (page.tiles?.length ?? 1)) { reported.current = true; setComplete(true); onResult(true) }
  }
  function fail() { if (!reported.current) { reported.current = true; onResult(false) }; setFailed(true) }
  return <figure className="flyer-paper" data-ready={complete}>
    {page.title && <figcaption>{page.title}</figcaption>}
    {!failed ? <>
      <div className="flyer-zoom" role="group" aria-label={name + 'の拡大操作'}>
        <button className="quiet" aria-label="縮小" disabled={zoom === 1} onClick={() => setZoom(value => Math.max(1, value - .5))}>−</button>
        <button className="quiet" onClick={() => setZoom(1)}>全体表示</button>
        <button className="quiet" aria-label="拡大" disabled={zoom === 4} onClick={() => setZoom(value => Math.min(4, value + .5))}>＋</button>
      </div>
      <div className="flyer-paper-scroll">
        <div className="flyer-paper-size" style={{ width: (zoom * 100) + '%' }}>
          {page.imageUrl ? <a href={page.imageUrl} target="_blank" rel="noopener noreferrer" aria-label={name + 'の画像を開く'}>
            <img loading="lazy" src={page.imageUrl} alt={name + 'のチラシ'} referrerPolicy="no-referrer" onLoad={() => ready(0)} onError={fail} />
          </a> : page.tiles && page.width && page.height ? <svg role="img" aria-label={name + 'のチラシ全体'} viewBox={'0 0 ' + page.width + ' ' + page.height} style={{ aspectRatio: page.width + ' / ' + page.height }}>
            {page.tiles.map((tile, index) => <image key={tile.url} href={tile.url} x={tile.x} y={tile.y} width={tile.width} height={tile.height} onLoad={() => ready(index)} onError={fail} />)}
          </svg> : null}
        </div>
      </div>
    </> : <p className="flyer-empty">画像を表示できませんでした。店舗サイトから確認できます。</p>}
  </figure>
}

function StoreFlyers({ store, onResult }: { store: Flyer; onResult: (id: string, ready: boolean) => void }) {
  const results = useRef<Record<number, boolean>>({})
  const pages = store.pages?.length ? store.pages : store.previewImageUrl ? [{ imageUrl: store.previewImageUrl }] : []
  function pageResult(index: number, ready: boolean) {
    results.current[index] = ready
    if (Object.values(results.current).some(Boolean)) onResult(store.id, true)
    else if (Object.keys(results.current).length === pages.length) onResult(store.id, false)
  }
  return <section aria-label={store.name + 'のチラシ'} className="flyer-content" data-store={store.id}>
    <header className="flyer-store-heading"><h3>{store.name}</h3><span>{store.area}{pages.length > 0 && `・${pages.length}枚`}</span></header>
    {pages.map((page, index) => <Paper key={page.imageUrl ?? index} page={page} name={store.name} onResult={ready => pageResult(index, ready)} />)}
    {!pages.length && <p className="flyer-empty">掲載画像を取得できませんでした。店舗サイトから確認できます。</p>}
    <div className="flyer-actions">
      <a className="primary flyer-link" href={store.officialUrl} target="_blank" rel="noopener noreferrer">公式チラシを開く <ExternalLink size={18} /></a>
      <a className="quiet flyer-link" href={store.flyerPortalUrl} target="_blank" rel="noopener noreferrer">{store.portalName}で見る <ExternalLink size={18} /></a>
      {store.extractedPdfUrl && <a className="quiet flyer-link" href={store.extractedPdfUrl} target="_blank" rel="noopener noreferrer">元のPDFを開く <ExternalLink size={18} /></a>}
    </div>
  </section>
}

export function FlyerViewerButton() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<FlyerData | null>(cached?.data ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<FlyerCategory | 'all'>('all')
  const [displayed, setDisplayed] = useState<Record<string, boolean>>({})
  const scroll = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function load() {
    setLoading(true); setError('')
    try { const result = await loadFlyers(); if (alive.current) setData(result) }
    catch { if (alive.current) setError('チラシ情報を取得できませんでした。公式サイトは開けます。') }
    finally { if (alive.current) setLoading(false) }
  }
  useEffect(() => {
    if (!open || !dialog.current) return
    const element = dialog.current, scrollY = window.scrollY
    const styles = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width }
    element.showModal()
    document.body.style.position = 'fixed'; document.body.style.top = `-${scrollY}px`; document.body.style.width = '100%'
    return () => {
      element.close()
      Object.assign(document.body.style, styles)
      window.scrollTo(0, scrollY)
      trigger.current?.focus({ preventScroll: true })
    }
  }, [open])
  const stores = orderFlyers(data?.stores ?? fallback, displayed)
  const visible = stores.filter(store => category === 'all' || store.category === category)
  function changeCategory(value: FlyerCategory | 'all') {
    setCategory(value)
    scroll.current?.scrollTo({ top: 0 })
  }
  function displayResult(id: string, ready: boolean) {
    setDisplayed(previous => previous[id] === ready ? previous : { ...previous, [id]: ready })
  }
  return <>
    <button ref={trigger} className="flyer-open" onClick={() => { setOpen(true); void load() }}>📰 チラシを見る <span>近隣{flyerStores.length}店舗</span></button>
    {open && createPortal(<dialog ref={dialog} className="flyer-dialog" aria-labelledby="flyer-title" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="flyer-sheet">
        <header className="flyer-header"><div><h2 id="flyer-title">近隣のチラシ</h2><p>天童市内 {stores.length}店舗</p></div><button className="quiet flyer-close" onClick={() => setOpen(false)} aria-label="チラシを閉じる"><X size={22} /></button></header>
        <div className="flyer-scroll" ref={scroll}>
          <div className="flyer-chips" role="group" aria-label="店舗カテゴリ">{filters.map(filter => <button key={filter.id} aria-pressed={category === filter.id} onClick={() => changeCategory(filter.id)}>{filter.label}{filter.id === 'all' && ` (${stores.length})`}</button>)}</div>
          {loading && <p role="status" className="hint">チラシ情報を確認中… 公式サイトはすぐ開けます。</p>}
          {error && <div className="flyer-notice" role="status"><p>{error}</p><button className="quiet" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> 再取得</button></div>}
          {visible.map(store => <StoreFlyers key={store.id + (data?.fetchedAt ?? '')} store={store} onResult={displayResult} />)}
          {data && <p className="hint flyer-checked">確認：{new Date(data.fetchedAt).toLocaleString('ja-JP')}<br />チラシの掲載・更新状況は各店舗サイトでご確認ください。</p>}
        </div>
        <footer className="flyer-footer"><button className="quiet" onClick={() => setOpen(false)}>閉じる</button></footer>
      </div>
    </dialog>, document.body)}
  </>
}
