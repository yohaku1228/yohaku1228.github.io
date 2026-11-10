import type { Ledger } from './model'

export const cloudEnabled = import.meta.env.VITE_CLOUDFLARE === '1'

async function request(path: string, options: RequestInit = {}) {
  return fetch('/api/' + path, { ...options, cache: 'no-store', credentials: 'same-origin', redirect: 'error' })
}

async function message(response: Response, fallback: string) {
  const body = await response.json().catch(() => null)
  return typeof body?.error === 'string' ? body.error : fallback
}

export async function currentOwner(): Promise<string | null> {
  const response = await request('session')
  if (!response.ok) throw new Error(await message(response, 'ログイン状態を確認できません。'))
  return (await response.json()).owner
}

export async function login(password: string): Promise<string> {
  const response = await request('login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  })
  if (!response.ok) throw new Error(await message(response, 'ログインできませんでした。'))
  return (await response.json()).owner
}

export async function logout() {
  if (!(await request('logout', { method: 'POST' })).ok) throw new Error('ログアウトできませんでした。')
}

export async function pullLedger(): Promise<{ ledger: unknown; revision: number } | null> {
  const response = await request('ledger')
  if (!response.ok) throw new Error(await message(response, 'クラウドの家計を読み込めませんでした。'))
  return response.json()
}

export async function pushLedger(revision: number, ledger: Ledger): Promise<number | null> {
  const response = await request('ledger', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, ledger }),
  })
  if (response.status === 409) return null
  if (!response.ok) throw new Error(await message(response, 'クラウドへの保存に失敗しました。'))
  const body = await response.json()
  if (!Number.isSafeInteger(body.revision) || body.revision !== revision + 1) throw new Error('クラウドの保存結果を確認できませんでした。')
  return body.revision
}

export async function readReceipt(image: Blob, signal: AbortSignal) {
  const response = await request('receipt', {
    method: 'POST', signal, headers: { 'Content-Type': 'image/jpeg' }, body: image,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = typeof body?.error === 'string' ? body.error : 'レシートを読み取れませんでした。'
    const code = typeof body?.code === 'string' && /^[a-z0-9_]{1,48}$/.test(body.code) ? body.code : 'http_' + response.status
    throw new Error(detail + '（エラーコード ' + code + '）')
  }
  return response.json() as Promise<unknown>
}

export async function getFoodAdvice(totals: { budget: number; spent: number; weekRemaining: number; daysLeft: number; dayGuide: number }, signal: AbortSignal) {
  const response = await request('food-advice', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(totals),
  })
  if (!response.ok) throw new Error(await message(response, 'AIの助言を取得できませんでした。'))
  const body = await response.json()
  if (typeof body.text !== 'string' || !body.text.trim()) throw new Error('AIの助言を取得できませんでした。')
  return body.text as string
}
