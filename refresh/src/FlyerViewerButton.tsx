import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, RefreshCw, X } from 'lucide-react'
import { flyerStores, type Flyer, type FlyerCategory, type FlyerData } from './flyer-stores'

let cached: { data: FlyerData; expires: number } | null = null
let pending: Promise<FlyerData> | null = null
function loadFlyers() {
  if (cached && cached.expires > Date.now()) return Promise.resolve(cached.data)
  if (pending) return pending
  pending = fetch('/api/flyers', { credentials: 'omit', signal: AbortSignal.timeout(18000) })
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
  { id: 'drug', label: '業務・ドラッグ' }, { id: 'home', label: 'ホームセンター' },
]

function Preview({ store }: { store: Flyer }) {
  const [failed, setFailed] = useState(false)
  const [pdf, setPdf] = useState(true)
  const [waiting, setWaiting] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => { setWaiting(false) }, 8000)
    return () => window.clearTimeout(timer)
  }, [])
  const image = store.previewImageUrl
  return <div className="flyer-preview">
    {image && !failed ? <>
      <a href={image} target="_blank" rel="noopener noreferrer" aria-label="チラシ画像を大きく開く">
        <img src={image} alt={store.name + 'のチラシ'} referrerPolicy="no-referrer" onLoad={() => setWaiting(false)} onError={() => { setFailed(true); setWaiting(false) }} />
      </a>
      <p className="hint">画像をタップすると拡大できます。掲載期間・対象店舗はチラシでご確認ください。</p>
      {waiting && <p role="status" className="hint">プレビューを読み込み中…</p>}
    </> : store.extractedPdfUrl && !failed ? <>
      <a className="flyer-link quiet" href={store.extractedPdfUrl} target="_blank" rel="noopener noreferrer">PDFを大きく開く <ExternalLink size={17} /></a>
      {!pdf ? <button className="quiet flyer-link" onClick={() => setPdf(true)}>ここでPDFを表示</button> : <>
        <iframe title={store.name + 'のチラシPDF'} src={store.extractedPdfUrl} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        <button className="quiet flyer-link" onClick={() => setFailed(true)}>表示されない場合はこちら</button>
      </>}
    </> : <p className="flyer-empty">{failed ? 'プレビューを表示できません。上のボタンからチラシをご覧ください。' : 'チラシは上のボタンからご覧いただけます。'}</p>}
  </div>
}

export function FlyerViewerButton() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<FlyerData | null>(cached?.data ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [category, setCategory] = useState<FlyerCategory | 'all'>('all')
  const [selected, setSelected] = useState(flyerStores[0].id)
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
  const stores = data?.stores ?? fallback
  const visible = stores.filter(store => category === 'all' || store.category === category)
  const store = visible.find(item => item.id === selected) ?? visible[0]
  function changeCategory(value: FlyerCategory | 'all') {
    setCategory(value)
    const first = stores.find(item => value === 'all' || item.category === value)
    if (first) setSelected(first.id)
  }
  return <>
    <button ref={trigger} className="flyer-open" onClick={() => { setOpen(true); void load() }}>📰 チラシを見る <span>近隣{flyerStores.length}店舗</span></button>
    {open && createPortal(<dialog ref={dialog} className="flyer-dialog" aria-labelledby="flyer-title" onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <div className="flyer-sheet">
        <header className="flyer-header"><div><h2 id="flyer-title">近隣のチラシ</h2><p>天童市内 {stores.length}店舗</p></div><button className="quiet flyer-close" onClick={() => setOpen(false)} aria-label="チラシを閉じる"><X size={22} /></button></header>
        <div className="flyer-scroll">
          <div className="flyer-chips" role="group" aria-label="店舗カテゴリ">{filters.map(filter => <button key={filter.id} aria-pressed={category === filter.id} onClick={() => changeCategory(filter.id)}>{filter.label}{filter.id === 'all' && ` (${stores.length})`}</button>)}</div>
          <div className="flyer-chips flyer-stores" role="group" aria-label="店舗を選択">{visible.map(item => <button key={item.id} aria-pressed={store?.id === item.id} onClick={() => setSelected(item.id)}>{item.name}<small>{item.area}</small></button>)}</div>
          {loading && <p role="status" className="hint">チラシ情報を確認中… 公式サイトはすぐ開けます。</p>}
          {error && <div className="flyer-notice" role="status"><p>{error}</p><button className="quiet" onClick={() => void load()} disabled={loading}><RefreshCw size={16} /> 再取得</button></div>}
          {store && <section aria-label={store.name + 'のチラシ'} className="flyer-content">
            <h3>{store.name}</h3><p className="hint">{store.area}</p>
            <div className="flyer-actions">
              <a className="primary flyer-link" href={store.officialUrl} target="_blank" rel="noopener noreferrer">公式チラシを開く <ExternalLink size={18} /></a>
              <a className="quiet flyer-link" href={store.flyerPortalUrl} target="_blank" rel="noopener noreferrer">{store.portalName}で見る <ExternalLink size={18} /></a>
            </div>
            <Preview key={store.id + (data?.fetchedAt ?? '')} store={store} />
          </section>}
          {data && <p className="hint flyer-checked">確認：{new Date(data.fetchedAt).toLocaleString('ja-JP')}<br />チラシの掲載・更新状況は各店舗サイトでご確認ください。</p>}
        </div>
        <footer className="flyer-footer"><button className="quiet" onClick={() => setOpen(false)}>閉じる</button></footer>
      </div>
    </dialog>, document.body)}
  </>
}
