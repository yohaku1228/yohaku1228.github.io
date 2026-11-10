import { createReceiptHandler, geminiEndpoint } from './receipt.mjs'

const cookieName = '__Host-kakei-session'
const sessionSeconds = 14 * 24 * 60 * 60
const encoder = new TextEncoder()
const json = (status, body, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
})
const cookie = (value, age) => `${cookieName}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`
const toHex = bytes => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
const hmacKey = env => crypto.subtle.importKey('raw', encoder.encode(env.SESSION_SECRET + ':' + env.APP_PASSWORD),
  { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])

async function session(env) {
  const payload = `${Math.floor(Date.now() / 1000) + sessionSeconds}.${crypto.randomUUID()}`
  return payload + '.' + toHex(await crypto.subtle.sign('HMAC', await hmacKey(env), encoder.encode(payload)))
}

async function authenticated(request, env) {
  const value = request.headers.get('Cookie')?.split('; ').find(part => part.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
  if (!value || !/^\d{10}\.[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(value)) return false
  const [expiry, nonce, signature] = value.split('.')
  if (Number(expiry) <= Date.now() / 1000) return false
  const bytes = Uint8Array.from(signature.match(/../g), hex => Number.parseInt(hex, 16))
  return crypto.subtle.verify('HMAC', await hmacKey(env), bytes, encoder.encode(expiry + '.' + nonce))
}

async function readJson(request, limit) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) return null
  const stream = request.body?.getReader()
  if (!stream) return null
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  while (true) {
    const { done, value } = await stream.read()
    if (done) break
    size += value.length
    if (size > limit) { await stream.cancel(); return null }
    text += decoder.decode(value, { stream: true })
  }
  try { return JSON.parse(text + decoder.decode()) } catch { return null }
}

async function login(request, env) {
  const limiter = await env.LOGIN_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') ?? 'unknown' })
  if (!limiter.success) return json(429, { error: '試行が多いため、少し待ってからお試しください。' })
  const body = await readJson(request, 1024)
  if (typeof body?.password !== 'string') return json(400, { error: 'パスワードを入力してください。' })
  const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(env.APP_PASSWORD)))
  const provided = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(body.password)))
  if (expected.reduce((diff, byte, i) => diff | (byte ^ provided[i]), 0)) return json(401, { error: 'パスワードを確認してください。' })
  return json(200, { owner: 'personal' }, { 'Set-Cookie': cookie(await session(env), sessionSeconds) })
}

async function writeLedger(request, env) {
  const body = await readJson(request, 1_000_000)
  if (!Number.isSafeInteger(body?.revision) || body.revision < 0 || !body.ledger ||
      typeof body.ledger !== 'object' || Array.isArray(body.ledger)) {
    return json(400, { error: '家計データを保存できません。形式かサイズを確認してください。' })
  }
  const content = JSON.stringify(body.ledger)
  const row = body.revision === 0
    ? await env.DB.prepare('insert into household_ledger (id, revision, ledger) values (1, 1, ?) on conflict(id) do nothing returning revision').bind(content).first()
    : await env.DB.prepare('update household_ledger set ledger = ?, revision = revision + 1 where id = 1 and revision = ? returning revision').bind(content, body.revision).first()
  return row ? json(200, { revision: row.revision }) : json(409, { error: '別の端末で更新されました。' })
}

async function takeGeminiQuota(env) {
  return !!await env.DB.prepare(`insert into receipt_quota(day, calls) values (?, 1)
    on conflict(day) do update set calls = calls + 1 where calls < 15 returning calls`)
    .bind(new Date().toISOString().slice(0, 10)).first()
}

async function foodAdvice(request, env) {
  const key = env.GEMINI_API_KEY?.trim()
  if (!key || env.GEMINI_FREE_TIER_CONFIRMED !== 'true') return json(503, { error: 'AIの設定が完了していません。' })
  const body = await readJson(request, 1024)
  const { budget, spent, weekRemaining, daysLeft, dayGuide } = body ?? {}
  if (![budget, spent, weekRemaining, daysLeft, dayGuide].every(value => Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000) ||
      budget < 1 || daysLeft < 1 || daysLeft > 31 || dayGuide < 0) {
    return json(400, { error: '今月の食費予算を確認してください。' })
  }
  if (!await takeGeminiQuota(env)) return json(429, { error: '今日のAI利用上限に達しました。' })
  const response = await fetch(geminiEndpoint, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20_000),
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `5人家族向けに、今日から実行しやすい食費の工夫を日本語で2～3文、180字以内で提案してください。残日数が少ない、使いすぎ、予算内などの状況に応じてください。食事の量や必要な栄養は削らず、金額を新しく計算したり価格を推測したりしないでください。金額を挙げる場合は下記の数値だけ使ってください。Markdown不要。月間予算 ${budget}円、支出 ${spent}円、今週の残り ${weekRemaining}円、月末まで今日を含め ${daysLeft}日、今日の買い物の目安 ${dayGuide}円。` }] }],
      generationConfig: { maxOutputTokens: 640 },
    }),
  })
  if (response.status === 429) return json(429, { error: 'Geminiの利用上限に達しました。時間をおいてお試しください。' })
  if (!response.ok) return json(502, { error: 'AIの助言を取得できませんでした。画面の食費の目安は引き続き使えます。' })
  const candidate = (await response.json()).candidates?.[0]
  const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text ?? '').join('').trim()
  return candidate?.finishReason === 'STOP' && text && text.length <= 600
    ? json(200, { text }) : json(502, { error: 'AIの助言を取得できませんでした。' })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (!env.APP_PASSWORD || env.APP_PASSWORD.length < 24 || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      return json(503, { error: 'ログインの初期設定が必要です。' })
    }
    const { method } = request
    if (method !== 'GET' && request.headers.get('Origin') !== url.origin) return json(403, { error: 'このサイトから実行してください。' })
    try {
      if (url.pathname === '/api/login' && method === 'POST') return await login(request, env)
      const signedIn = await authenticated(request, env)
      if (url.pathname === '/api/session' && method === 'GET') return json(200, { owner: signedIn ? 'personal' : null })
      if (!signedIn) return json(401, { error: 'ログインしてください。' })
      if (url.pathname === '/api/logout' && method === 'POST') return json(200, {}, { 'Set-Cookie': cookie('', 0) })
      if (url.pathname === '/api/ledger' && method === 'GET') {
        const row = await env.DB.prepare('select revision, ledger from household_ledger where id = 1').first()
        return json(200, row ? { revision: row.revision, ledger: JSON.parse(row.ledger) } : null)
      }
      if (url.pathname === '/api/ledger' && method === 'PUT') return await writeLedger(request, env)
      if (url.pathname === '/api/food-advice' && method === 'POST') return await foodAdvice(request, env)
      if (url.pathname === '/api/receipt' && method === 'POST') return await createReceiptHandler({
        origin: url.origin, apiKey: env.GEMINI_API_KEY, freeTierConfirmed: env.GEMINI_FREE_TIER_CONFIRMED === 'true',
        takeQuota: () => takeGeminiQuota(env),
      })(request)
      return json(404, { error: '操作が見つかりませんでした。' })
    } catch {
      return json(503, { error: '処理できませんでした。通信状況を確認して再試行してください。' })
    }
  },
}
