import { useEffect, useRef, useState } from 'react'
import { useLedger } from './storage'
import { sameLedger } from './sync-merge'
import type { Save } from './ui'

export async function confirmSave(save: Save, action: Parameters<Save>[0]): Promise<boolean> {
  const state = useLedger.getState()
  if (state.cloudStatus === 'error' && sameLedger(action(state.ledger), state.ledger)) state.retryCloud()
  else if (!save(action)) return false
  const current = useLedger.getState().cloudStatus
  if (current !== 'saving') return current === 'ready' || current === 'local'
  return new Promise(resolve => {
    const unsubscribe = useLedger.subscribe(state => {
      if (state.cloudStatus === 'saving') return
      unsubscribe()
      resolve(state.cloudStatus === 'ready')
    })
  })
}

export function SaveFeedback() {
  const status = useLedger(state => state.cloudStatus)
  const previous = useRef(status)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (previous.current === 'saving' && status === 'ready') setSaved(true)
    if (status === 'saving') setSaved(false)
    previous.current = status
    const timeout = window.setTimeout(() => setSaved(false), 5000)
    return () => window.clearTimeout(timeout)
  }, [status])
  const text = status === 'saving' ? 'クラウドに保存中…' : status === 'error' ? '保存できませんでした。入力は保護しています。' : status === 'conflict' ? '保存内容の確認が必要です。入力は保護しています。' : saved ? '✓ クラウドに保存しました' : ''
  return text ? <div className={'save-feedback ' + (status === 'error' || status === 'conflict' ? 'save-failed' : '')} role="status" aria-live="polite">{text}</div> : null
}
