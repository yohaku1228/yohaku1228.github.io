import { useEffect, useState, type ReactNode } from 'react'
import { pullLedger, supabase } from './cloud'
import { backup, download, existingDeviceLedger, useLedger } from './storage'
import { Field, form, Panel, str } from './ui'

export function CloudGate({ children }: { children: ReactNode }) {
  const client = supabase
  const [owner, setOwner] = useState<string | null | undefined>(undefined)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const status = useLedger(state => state.cloudStatus)
  const retry = useLedger(state => state.retryCloud)
  const save = useLedger(state => state.update)
  const [canImport, setCanImport] = useState(false)
  const [version, reload] = useState(0)
  useEffect(() => {
    if (status === 'saving') setCanImport(false)
  }, [status])

  useEffect(() => {
    if (!supabase) return
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setOwner(session?.user.id ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    setLoaded(null)
    setCanImport(false)
    useLedger.getState().stopCloud()
    if (owner) {
      void pullLedger().then(row => {
        if (!active) return
        useLedger.getState().startCloud(owner, row)
        setCanImport(!row && useLedger.getState().cloudStatus === 'ready' && !!existingDeviceLedger())
        setLoaded(owner)
      }).catch(() => {
        if (active) setMessage('クラウドの家計を読み込めませんでした。通信と設定を確認し、再試行してください。')
      })
    }
    return () => { active = false }
  }, [owner, version])

  if (!client) return children
  if (owner && loaded === owner) return <>
    <aside className="cloud-bar">
      <span role="status">{status === 'saving' ? 'クラウドへ保存中…' : status === 'ready' ? 'クラウド保存' : '未送信の変更あり'}</span>
      {status === 'error' && <button className="quiet" onClick={retry}>保存を再試行</button>}
      {status === 'conflict' && <button className="quiet" onClick={() => {
        if (!window.confirm('未送信の変更をJSONに書き出し、クラウドの最新版を開き直しますか？')) return
        download('家計とカード-未送信の変更.json', JSON.stringify(backup(useLedger.getState().ledger)), 'application/json')
        localStorage.removeItem('household-pwa:pending:' + owner)
        reload(v => v + 1)
      }}>変更を保存して最新版を開く</button>}
      {canImport && <button className="quiet" disabled={status !== 'ready'} onClick={() => {
        const device = existingDeviceLedger()
        if (device && window.confirm('この端末の家計をクラウドに取り込みますか？')) {
          if (save(() => device)) setCanImport(false)
        }
      }}>この端末のデータを取り込む</button>}
      <button className="quiet" disabled={status === 'saving'} onClick={async () => {
        const result = await client.auth.signOut({ scope: 'local' })
        if (result.error) useLedger.getState().report('ログアウトできませんでした。')
      }}>ログアウト</button>
    </aside>
    {children}
  </>

  return <main className="wrap">
    <Panel title={owner === null ? '家計とカードにログイン' : '家計を読み込み中'}>
      {owner === null && <form onSubmit={form(async fields => {
        setLoading(true)
        setMessage('')
        try {
          const result = await client.auth.signInWithPassword({ email: str(fields, 'email'), password: String(fields.get('password') ?? '') })
          if (result.error) setMessage('ログインできません。メールアドレスとパスワードを確認してください。')
        } catch { setMessage('接続できませんでした。通信を確認してください。') }
        finally { setLoading(false) }
      })}>
        <div className="fields">
          <Field label="メールアドレス"><input name="email" type="email" autoComplete="username" required /></Field>
          <Field label="パスワード"><input name="password" type="password" autoComplete="current-password" required /></Field>
        </div>
        <button className="primary" disabled={loading}>ログイン</button>
      </form>}
      {message && <p className="notice" role="alert">{message}</p>}
      {owner && message && <button className="quiet" onClick={() => { setMessage(''); reload(v => v + 1) }}>再試行</button>}
    </Panel>
  </main>
}
