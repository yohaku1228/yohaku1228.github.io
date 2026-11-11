import { dinnerContext } from './meal-context.mjs'

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

const defaultModel = '@cf/google/gemma-4-26b-a4b-it'

async function foodAdvice(request, env) {
  if (!env.AI?.run) return json(503, { error: 'AIの設定が完了していません。' })
  const body = await readJson(request, 128_000)
  const { budget, spent, weekRemaining, daysLeft, dayGuide } = body ?? {}
  if (![budget, spent, weekRemaining, daysLeft, dayGuide].every(value => Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000) ||
      budget < 0 || spent < 0 || weekRemaining < 0 || daysLeft < 1 || daysLeft > 31 || dayGuide < 0) {
    return json(400, { error: '今月の食費予算を確認してください。' })
  }
  const history = body.messages ?? [{ role: 'user', content: '今月の食費を見て、今日からできる工夫を教えてください。' }]
  if (!Array.isArray(history) || history.length < 1 || history.length > 11 || history.length % 2 !== 1 ||
      history.some((item, index) => !item || item.role !== (index % 2 === 0 ? 'user' : 'assistant') ||
        typeof item.content !== 'string' || !item.content.trim() || item.content.length > (item.role === 'user' ? 1000 : 3000)) ||
      history.reduce((size, item) => size + item.content.length, 0) > 10_000) {
    return json(400, { error: '質問は1000文字以内で入力してください。会話が長い場合は新しい相談を始めてください。' })
  }
  const meals = dinnerContext(body.meals)
  if (meals === null) return json(400, { error: '晩ごはんの記録を確認してください。' })
  const remaining = budget - spent
  const context = history.map(({ role, content }) => ({ role, content: content.trim() }))
  while (context.length > 1 && context.reduce((size, item) => size + item.content.length, 0) > 10_000) context.splice(0, 2)
  const messages = [{ role: 'system', content:
    'あなたは、パパ・ママと食べ盛りの子ども3人、計5人の暮らしを支える食費・献立相談アシスタントです。' +
    '目的は安さだけでなく、家族がおいしく十分に食べられ、作る人も無理なく続けられることです。自然な日本語で質問に直接答えてください。' +
    '【献立】夕食を提案するときは、ごはん等の主食、肉・魚・卵・大豆製品等を使った食べ応えのある主菜、野菜のおかずをそろえてください。' +
    '主菜と野菜を兼ねる料理や具だくさんの丼・麺もよく、品数を増やすこと自体を目的にしません。汁物は任意です。' +
    'ごはんと野菜スープだけ、もやしだけなど、主菜がなく物足りない内容を家族の夕食として勧めないでください。' +
    '献立案には5人分の主要な材料とおおよその使用量、簡単な作り方、満足感を保つ工夫を添えてください。量は調理の目安で、年齢や食欲に応じて増減できることを踏まえます。' +
    '予算は肉を少し減らして豆腐や卵も組み合わせる、旬・冷凍野菜を使う、余りを別料理に使うなどで調整し、食事を抜いたり量や必要な栄養を削ったりしません。' +
    '満腹感のために味を濃くしてごはんだけを増やす、汁物で空腹をごまかす、といった提案はしないでください。主菜そのものの量と食べ応えを確保します。' +
    '【予算】1日あたりの食費の目安は家族全員の朝昼夕などを含む目安で、夕食だけに使える金額ではありません。' +
    '予算が現実的な食事に足りないときは、無理な献立を押しつけず不足を伝え、食費予算や他の支出の見直しを提案してください。' +
    '残り予算0円は現金も0円という意味ではありません。購入できないと決めつけず、必要なら予備費から食費へ回せるか確認し、豆腐・卵など主菜を補う少数の買い足し候補を示してください。' +
    '米と野菜しかない場合に野菜粥等を夕食の解決策として押しつけず、主菜の不足と予算の再配分を具体的に相談してください。わかめ等を肉・卵・大豆製品の代わりになる主なたんぱく質源として扱わないでください。' +
    '店舗の実売価格や未提供の家計情報、子どもの年齢、好み、アレルギーを推測して断定しないでください。費用を示す場合は概算と明記し、予算内と保証しません。' +
    '【会話】直前の提案への不満や追加条件を受け止め、具体的に改善してください。同じ一般論を繰り返さないでください。' +
    '手持ち食材や調理時間の指定があれば優先し、重要な情報が足りなければ確認は1つまでにして、可能なら仮の案も出してください。' +
    '【買い物】献立の提案では、手持ち食材を生かしたうえで、足りないものがあれば「買い足すもの」として具体的な食材・5人分に必要なおおよその購入量・使う目的を短く添えてください。' +
    '必須の買い足しと、家にあれば使える代用品・任意の追加を区別し、不要な買い物を増やさないでください。手持ちとして挙げられた食材を重複して買わせないでください。' +
    '買い足し最小限の相談では、まず主菜の不足を補う1〜2種類を優先し、副菜や任意の汁物のためだけに別の食材を必須扱いしないでください。' +
    '同じ手持ち食材を複数の料理に使う場合は合計使用量が在庫を超えないように配分し、足りなければ献立を簡素にするか不足分を明記してください。' +
    '在庫が分からなければ「なければ買い足す候補」と明示し、冷蔵庫にあるものを一つの質問で確認してください。調味料や主食も在庫があると断定せず、必要なら在庫確認に含めます。' +
    '量が不明な手持ち食材は足りると断定せず、必要量から不足分だけ買うよう伝えてください。予算が厳しい場合は買う優先順位と安価な代用品を示し、無理にすべて買うよう勧めません。' +
    '通常は短く、献立や作り方には必要な説明を省略せず、600字程度までを目安に改行で読みやすくしてください。Markdown不要。集計値の一覧を毎回末尾に転載しないでください。' +
    '以下の最新集計を正として使い、過去の回答と違う場合は最新集計を優先してください。支出は変更せず、提案にとどめてください。Markdownは使わないでください。' +
    (budget ? '月間食費予算 ' + budget + '円' : '月間食費予算は未設定') + '、使用済み ' + spent + '円、残り予算 ' + remaining + '円、今週これからの目安 ' + weekRemaining +
    '円、月末まで今日を含め ' + daysLeft + '日、1日あたりの目安 ' + dayGuide + '円。残りが負なら予算超過です。' +
    '予算未設定の場合は予算不足と断定せず、金額を保証しないで献立相談に答えてください。' +
    'この集計は判断用の背景情報であり、回答に一覧を転載しないでください。最後まで質問への具体的な答えだけを書いてください。' + meals },
    ...context]
  try {
    const result = await env.AI.run(env.AI_MODEL || defaultModel, { messages, max_completion_tokens: 1024, temperature: 0.4, chat_template_kwargs: { enable_thinking: false } })
    const candidate = result?.choices?.[0]
    const content = candidate?.message?.content ?? result?.response
    const text = typeof content === 'string' ? content.trim() : ''
    if (candidate && candidate.finish_reason !== 'stop') return json(502, { error: '回答を最後まで取得できませんでした。質問を短くして再試行してください。' })
    return text && text.length <= 3000
      ? json(200, { text }) : json(502, { error: '回答を取得できませんでした。もう一度お試しください。' })
  } catch (error) {
    const limited = error?.status === 429 || /quota|limit|capacity|neuron|429/i.test(String(error?.message ?? ''))
    return json(limited ? 429 : 503, { error: limited
      ? 'AIの利用上限に達したか、混み合っています。時間をおいてお試しください。'
      : 'AIに接続できませんでした。時間をおいて再試行してください。' })
  }
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
      return json(404, { error: '操作が見つかりませんでした。' })
    } catch {
      return json(503, { error: '処理できませんでした。通信状況を確認して再試行してください。' })
    }
  },
}
