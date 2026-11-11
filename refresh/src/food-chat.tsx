import { useEffect, useRef, useState } from 'react'
import { getFoodAdvice, type ChatMessage, type FoodSnapshot } from './cloud'
import { Field } from './ui'
import type { MealContext } from './meals'

export function FoodChat({ snapshot, meals, dinnerMode = false, onSaveAnswer }: { snapshot: FoodSnapshot; meals?: MealContext; dinnerMode?: boolean; onSaveAnswer?: (text: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const active = useRef<AbortController | null>(null)
  const end = useRef<HTMLDivElement | null>(null)
  useEffect(() => () => { active.current?.abort() }, [])
  useEffect(() => { if (messages.length) end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [messages.length])

  async function send(question: string) {
    if (active.current || !question.trim()) return
    const controller = new AbortController()
    active.current = controller
    const timeout = window.setTimeout(() => controller.abort(), 60_000)
    setBusy(true)
    setError('')
    const pending: ChatMessage[] = [...messages, { role: 'user', content: question.trim() }]
    // Keep complete pairs so the model receives the recent conversation in order.
    const context = pending.slice(-11)
    while (context.length > 1 && context.reduce((n, item) => n + item.content.length, 0) > 10_000) context.splice(0, 2)
    try {
      const answer = await getFoodAdvice(snapshot, controller.signal, context, meals)
      if (!controller.signal.aborted) {
        setMessages([...pending, { role: 'assistant', content: answer }])
        setDraft('')
      }
    } catch (failure) {
      setError(controller.signal.aborted ? '回答に時間がかかっています。もう一度お試しください。' : failure instanceof Error ? failure.message : '回答を取得できませんでした。')
    } finally {
      window.clearTimeout(timeout)
      if (active.current === controller) active.current = null
      setBusy(false)
    }
  }

  return <div className="food-chat">
    {messages.length === 0 && <button className="quiet" disabled={busy} onClick={() => void send(dinnerMode ? '選択日の晩ごはんの予定があれば、その予定を優先して5人分の買い物リスト（食材・購入量・使い道）を作って。予定がなければ定番と実際の調理記録から候補を1つ提案して。食材の在庫は未確認として、なければ買い足すものを区別して。' : '今月の食費を見て、今日からできる工夫を教えてください。')}>{dinnerMode ? '献立と買い物リストを相談' : 'AIに食費のコツを聞く'}</button>}
    {messages.length > 0 && <>
      <div className="chat-history" role="log" aria-label="食費の相談" aria-live="polite">
        {messages.map((item, index) => <div key={index} className={'chat-message chat-' + item.role}><small>{item.role === 'user' ? 'あなた' : 'AI'}</small><p>{item.content}</p></div>)}
        <div ref={end} />
      </div>
      <button className="quiet chat-reset" disabled={busy} onClick={() => { setMessages([]); setError(''); setDraft('') }}>新しい相談</button>
      {onSaveAnswer && <button className="quiet" disabled={busy} onClick={() => onSaveAnswer(messages.at(-1)!.content)}>回答をこの日の買い物メモに保存</button>}
    </>}
    <form onSubmit={event => { event.preventDefault(); void send(draft) }}>
      <Field label={messages.length ? '続けて質問する' : dinnerMode ? '献立・買い物について質問する' : '食費について質問する'}><textarea value={draft} onChange={event => setDraft(event.target.value)} rows={3} maxLength={1000} disabled={busy} placeholder={dinnerMode ? '例：今日はぎょうざにしたい。キャベツと卵はあるけど、何を買う？' : '例：まとめ買いで無駄を減らすには？'} required /></Field>
      <button className="primary" disabled={busy || !draft.trim()} type="submit">{busy ? '回答を作成中…' : '送信'}</button>
    </form>
    {busy && <p className="hint" role="status">AIが回答を作成しています。</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <p className="hint">食費・定番・好み・晩ごはんの予定と履歴・会話をAIに送ります。会話は画面を離れると消え、予定・記録・保存した買い物メモはクラウドで共有します。</p>
  </div>
}
