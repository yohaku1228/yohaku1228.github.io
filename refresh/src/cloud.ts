import { createClient } from '@supabase/supabase-js'
import type { Ledger } from './model'

const endpoint = import.meta.env.VITE_SUPABASE_URL
const publicKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const supabase = endpoint && publicKey ? createClient(endpoint, publicKey) : null

export async function pullLedger() {
  if (!supabase) throw new Error('接続設定がありません。')
  const { data, error } = await supabase.from('household_ledger').select('ledger,revision').maybeSingle()
  if (error) throw new Error('クラウドの家計を読み込めませんでした。')
  return data
}

export async function pushLedger(expectedRevision: number, ledger: Ledger): Promise<number | null> {
  if (!supabase) throw new Error('接続設定がありません。')
  const { data, error } = await supabase.rpc('save_household_ledger', { expected_revision: expectedRevision, new_ledger: ledger })
  if (error || (data !== null && !Number.isInteger(data))) throw new Error('クラウドへの保存に失敗しました。')
  return data
}

export async function readReceipt(image: Blob, signal: AbortSignal) {
  if (!supabase) throw new Error('レシート読み取りの接続準備が必要です。')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('ログインし直してください。')
  const response = await fetch(new URL('/functions/v1/receipt', endpoint), {
    method: 'POST', signal, redirect: 'error',
    headers: { 'Content-Type': 'image/jpeg', Authorization: 'Bearer ' + session.access_token },
    body: image,
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = payload as { error?: unknown } | null
    throw new Error(typeof detail?.error === 'string' ? detail.error : 'レシートを読み取れませんでした。')
  }
  return payload
}
