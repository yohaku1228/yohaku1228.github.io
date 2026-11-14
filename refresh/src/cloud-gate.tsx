import { useEffect, useState, type ReactNode } from 'react'
import { cloudEnabled, currentOwner, login, logout, pullLedger } from './cloud'
import { existingDeviceLedger, useLedger } from './storage'
import { CloudConflict } from './cloud-conflict'
import { Field, form, Panel } from './ui'

export function CloudGate({ children }: { children: ReactNode }) {
  const [owner, setOwner] = useState<string | null | undefined>(undefined)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const status = useLedger(state => state.cloudStatus)
  const retry = useLedger(state => state.retryCloud)
  const save = useLedger(state => state.update)
  const [canImport, setCanImport] = useState(false)
  const [version, reload] = useState(0)
  const [showConflict, setShowConflict] = useState(false)
  useEffect(() => {
    if (status === 'saving') setCanImport(false)
  }, [status])

  useEffect(() => {
    if (!cloudEnabled || owner !== undefined) return
    let active = true
    void currentOwner().then(value => { if (active) setOwner(value) }).catch(error => {
      if (active) setMessage(error instanceof Error ? error.message : '接続できませんでした。')
    })
    return () => { active = false }
  }, [owner, version])

  useEffect(() => {
    if (!cloudEnabled) return
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

  if (!cloudEnabled) return children
  if (owner && loaded === owner) return <>
    <aside className="cloud-bar">
      <span role="status">{status === 'saving' ? 'クラウドへ保存中…' : status === 'ready' ? 'クラウド保存' : status === 'conflict' ? '変更内容の確認が必要' : '再送を待っています'}</span>
      {status === 'error' && <button className="quiet" onClick={retry}>保存を再試行</button>}
      {status === 'conflict' && <button className="quiet" onClick={() => setShowConflict(v => !v)}>保存内容を確認</button>}
      {canImport && <button className="quiet" disabled={status !== 'ready'} onClick={() => {
        const device = existingDeviceLedger()
        if (device && window.confirm('この端末の家計をクラウドに取り込みますか？')) {
          if (save(() => device)) setCanImport(false)
        }
      }}>この端末のデータを取り込む</button>}
      <button className="quiet" disabled={status === 'saving'} onClick={async () => {
        try { await logout(); setOwner(null); setMessage('') }
        catch { useLedger.getState().report('ログアウトできませんでした。') }
      }}>ログアウト</button>
    </aside>
    {status === 'conflict' && showConflict && <CloudConflict />}
    {children}
  </>

  return <main className="wrap">
    <Panel title={owner === null ? 'MoneyFlow Managerにログイン' : '家計を読み込み中'}>
      {owner === null && <form onSubmit={form(async fields => {
        setLoading(true)
        setMessage('')
        try {
          setOwner(await login(String(fields.get('password') ?? '')))
        } catch (error) { setMessage(error instanceof Error ? error.message : '接続できませんでした。') }
        finally { setLoading(false) }
      })}>
        <div className="fields">
          <Field label="パスワード"><input name="password" type="password" autoComplete="current-password" required /></Field>
        </div>
        <button className="primary" disabled={loading}>ログイン</button>
      </form>}
      {message && <p className="notice" role="alert">{message}</p>}
      {owner !== null && message && <button className="quiet" onClick={() => { setMessage(''); reload(v => v + 1) }}>再試行</button>}
    </Panel>
  </main>
}
