import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cloudEnabled } from './cloud'
import { confirmSave } from './save-feedback'
import { Field, Panel, type Save } from './ui'

const drafts = new Map<string, string>()
export function ShoppingMemo({ date, householdId, savedText, save, request }: {
  date: string; householdId: string; savedText: string; save: Save; request: { date: string; text: string; nonce: number } | null
}) {
  const key = 'household-pwa:shopping-draft:' + householdId + ':' + date
  const [text, setText] = useState(() => {
    try { return drafts.get(key) ?? localStorage.getItem(key) ?? savedText } catch { return drafts.get(key) ?? savedText }
  })
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const dirty = useRef(text !== savedText)
  const lock = useRef(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  function draft(value: string) {
    dirty.current = true; setText(value); setNotice('未保存の下書きです。')
    drafts.set(key, value)
    try { localStorage.setItem(key, value) } catch { /* Keep the in-memory draft. */ }
  }
  useEffect(() => { if (!dirty.current) setText(savedText) }, [savedText])
  useEffect(() => {
    if (request?.date === date) { draft(request.text); setConfirm(true) }
  }, [request?.nonce])
  useEffect(() => {
    if (!confirm || !dialog.current) return
    const element = dialog.current
    element.showModal()
    return () => { element.close(); button.current?.focus({ preventScroll: true }) }
  }, [confirm])
  async function persist() {
    if (lock.current) return
    lock.current = true; setBusy(true); setNotice('保存中…')
    const value = text
    try {
      const ok = await confirmSave(save, old => ({ ...old, mealShopping: [...(old.mealShopping ?? []).filter(row => row.date !== date), { date, text: value }] }))
      if (!ok) { if (alive.current) setNotice('保存できませんでした。入力内容は消さずに保護しています。通信状態と画面上の保存状況を確認し、再試行してください。'); return }
      dirty.current = false; drafts.delete(key)
      try { localStorage.removeItem(key) } catch { /* The confirmed cloud copy is authoritative. */ }
      if (alive.current) { setConfirm(false); setNotice(cloudEnabled ? '✓ クラウドに保存しました。' : '✓ 保存しました。') }
    } finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  return <Panel title={date.replaceAll('-', '/') + ' の買い物メモ'}>
    <form onSubmit={event => { event.preventDefault(); if (!lock.current) setConfirm(true) }}>
      <Field label="買うもの・購入量"><textarea className="meal-shopping-input" name="shopping" rows={7} maxLength={5000} value={text} onChange={event => draft(event.target.value)} disabled={busy} placeholder="AIの回答を保存するか、買うものを入力" /></Field>
      <div className="actions"><button ref={button} className="primary" disabled={busy}>{busy ? '保存中…' : '買い物メモを保存'}</button></div>
    </form>
    {notice && <p className="memo-save-status" role="status">{notice}</p>}
    <p className="hint">買い物メモは日付ごとに保存し、夫婦で共有します。</p>
    {confirm && createPortal(<dialog ref={dialog} className="memo-confirm" aria-labelledby="memo-confirm-title" onCancel={event => { if (lock.current) event.preventDefault(); else setConfirm(false) }}>
      <h2 id="memo-confirm-title">この内容を保存しますか？</h2>
      <p>{date.replaceAll('-', '/')} の買い物メモ</p>
      <pre>{text || '（メモを空にして保存します）'}</pre>
      {notice && <p role="status">{notice}</p>}
      <div className="actions"><button type="button" className="memo-cancel" disabled={busy} onClick={() => setConfirm(false)}>取消</button><button type="button" className="memo-commit" disabled={busy} onClick={() => void persist()}>{busy ? 'クラウドに保存中…' : '保存する'}</button></div>
    </dialog>, document.body)}
  </Panel>
}
