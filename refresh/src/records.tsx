import { useState } from 'react'
import { activeFixed, cashEvents, daysInMonth, debitDate, monthOf, onDay, sum, today, transactionAmount, yen } from './finance'
import type { Day, Ledger, Month, Transaction } from './model'
import { Amount, Field, form, Money, num, Panel, str, uid, type Save } from './ui'

function billId(data: Ledger, transaction: Transaction) {
  const payment = data.payments.find(p => p.id === transaction.paymentId)
  return payment?.kind === 'card' ? `card:${payment.id}:${debitDate(transaction, payment)}` : ''
}

export function Records({ data, month, save, editing, setEditing, setMonth }: {
  data: Ledger; month: Month; save: Save; editing: string | null
  setEditing: (id: string | null) => void; setMonth: (month: Month) => void
}) {
  const [formVersion, setFormVersion] = useState(0)
  const current = data.transactions.find(t => t.id === editing)
  const rows = data.transactions.filter(t => monthOf(t.date) === month).sort((a, b) => b.date.localeCompare(a.date))
  function remove(transaction: Transaction) {
    if (!window.confirm('この支出記録を削除しますか？')) return
    save(old => {
      if (old.settled.includes(billId(old, transaction))) throw new Error('引落済みです。口座画面で確認を外してから編集してください。')
      return { ...old, transactions: old.transactions.filter(t => t.id !== transaction.id) }
    })
  }
  return <div className="stack">
    <Panel title={current ? '支出を編集' : '支出を記録'} description="支出には購入日を使います。返金はマイナスの金額で登録できます。">
      <form key={(current?.id ?? month) + formVersion} onSubmit={form(fields => {
        const categoryId = str(fields, 'category')
        const allowance = data.categories.find(c => c.id === categoryId)?.allowance
        const date = str(fields, 'date')
        const paymentId = str(fields, 'payment')
        const fixedExpenseId = str(fields, 'fixed') || undefined
        const merchant = allowance ? 'お小遣い支給' : str(fields, 'merchant')
        const record: Transaction = {
          id: current?.id ?? uid(), date, merchant, paymentId, fixedExpenseId,
          memo: allowance ? '' : str(fields, 'memo'), personal: fields.has('personal') && !allowance,
          items: [{ id: current?.items[0]?.id ?? uid(), name: merchant, categoryId, quantity: 1, amount: num(fields, 'amount'), discount: 0 }],
        }
        const payment = data.payments.find(p => p.id === paymentId)
        if (payment?.kind === 'card') record.debitOn =
          current?.date === date && current.paymentId === paymentId && current.debitOn ? current.debitOn : debitDate(record, payment)
        const duplicate = data.transactions.some(t => t.id !== record.id && t.date === date &&
          t.merchant.normalize('NFKC').trim() === merchant.normalize('NFKC').trim() && t.paymentId === paymentId &&
          transactionAmount(t) === transactionAmount(record))
        if (duplicate && !window.confirm('同日・同じ店舗・同じ金額の記録があります。別の支出として保存しますか？')) return
        if (save(old => {
          if (record.fixedExpenseId) {
            const usageMonth = monthOf(record.date)
            const target = activeFixed(old, usageMonth).find(f => f.id === record.fixedExpenseId)
            if (!target || record.personal || allowance || transactionAmount(record) < 0) {
              throw new Error('固定費に紐づける場合は、対象月の共通支出を選んでください。')
            }
            if (old.settled.includes(`fixed:${target.id}:${usageMonth}`)) {
              throw new Error('固定費の支払確認を外してから、明細を紐づけてください。')
            }
            if (old.transactions.some(t => t.id !== record.id && t.fixedExpenseId === target.id && monthOf(t.date) === usageMonth)) {
              throw new Error('この月の固定費には明細が登録済みです。登録済みの明細を編集してください。')
            }
          }
          if (old.settled.includes(billId(old, record)) || (current && old.settled.includes(billId(old, current)))) {
            throw new Error('対象のカード引落は確認済みです。口座画面で引落済みを外してから編集してください。')
          }
          return { ...old, transactions: [...old.transactions.filter(t => t.id !== record.id), record] }
        })) {
          setEditing(null)
          setMonth(monthOf(date))
          setFormVersion(v => v + 1)
        }
      })}>
        <div className="fields">
          <Field label="利用日"><input type="date" name="date" required defaultValue={current?.date ?? (monthOf(today()) === month ? today() : onDay(month, 1))} /></Field>
          <Field label="店舗・品名"><input name="merchant" defaultValue={current?.merchant} placeholder="例：スーパー" maxLength={100} /></Field>
          <Field label="金額（円）"><Money name="amount" value={current ? transactionAmount(current) : null} negative /></Field>
          <Field label="カテゴリー"><select name="category" defaultValue={current?.items[0].categoryId ?? 'food'}>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="支払方法"><select name="payment" defaultValue={current?.paymentId ?? 'cash'}>{data.payments.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          {data.fixed.length > 0 && <Field label="固定費に紐づける"><select name="fixed" defaultValue={current?.fixedExpenseId ?? ''}><option value="">生活費として記録</option>{data.fixed.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
          <Field label="メモ"><input name="memo" defaultValue={current?.memo} maxLength={500} placeholder="任意" /></Field>
        </div>
        <label className="check"><input type="checkbox" name="personal" defaultChecked={current?.personal} /> 個人の買い物として生活費から除外</label>
        <div className="actions"><button className="primary">支出を保存</button>{current && <button type="button" className="quiet" onClick={() => setEditing(null)}>取消</button>}</div>
      </form>
    </Panel>
    <Panel title="この月の履歴">
      {rows.length === 0 && <p className="empty">まだ支出がありません。</p>}
      <ul className="rows">{rows.map(t => <li key={t.id}><span><b>{t.merchant}</b><small>{t.date} ・ {data.categories.find(c => c.id === t.items[0].categoryId)?.name}{t.personal ? ' ・ 個人' : ''}</small>{t.memo && <small>{t.memo}</small>}</span><Amount value={transactionAmount(t)} /><div className="row-actions"><button className="quiet" onClick={() => { setEditing(t.id); window.scrollTo(0, 0) }}>編集</button><button className="quiet negative" onClick={() => remove(t)}>削除</button></div></li>)}</ul>
    </Panel>
  </div>
}

export function Calendar({ data, month, edit }: { data: Ledger; month: Month; edit: (id: string) => void }) {
  const [mode, setMode] = useState<'spent' | 'due'>('spent')
  const [category, setCategory] = useState('')
  const [selectedDay, selectDay] = useState<Day>(monthOf(today()) === month ? today() : onDay(month, 1))
  const selected = monthOf(selectedDay) === month ? selectedDay : onDay(month, 1)
  const first = new Date(onDay(month, 1) + 'T00:00:00Z').getUTCDay()
  const transactions = data.transactions.filter(t => !t.personal && monthOf(t.date) === month)
  const events = cashEvents(data, month).filter(e => e.date && e.amount < 0)
  const list = (date: Day) => transactions.filter(t => t.date === date && t.items.some(i => !category || i.categoryId === category))
  const itemSum = (transaction: Transaction) => sum(transaction.items.filter(i => !category || i.categoryId === category).map(i => i.amount - i.discount))
  return <div className="stack">
    <Panel title="家計カレンダー">
      <div className="actions"><button className={mode === 'spent' ? 'primary' : 'quiet'} onClick={() => setMode('spent')}>利用日</button><button className={mode === 'due' ? 'primary' : 'quiet'} onClick={() => setMode('due')}>支払日</button>
        {mode === 'spent' && <select aria-label="カテゴリーで絞り込み" value={category} onChange={e => setCategory(e.target.value)}><option value="">すべて</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</div>
      <div className="calendar">
        {['日', '月', '火', '水', '木', '金', '土'].map(d => <span className="weekday" key={d}>{d}</span>)}
        {Array.from({ length: first }, (_, i) => <span key={'empty' + i} />)}
        {Array.from({ length: daysInMonth(month) }, (_, i) => {
          const date = onDay(month, i + 1)
          const records = list(date)
          const due = events.filter(e => e.date === date)
          const value = mode === 'spent' ? sum(records.map(itemSum)) : -sum(due.map(e => e.amount))
          const categories = new Set(records.flatMap(t => t.items.filter(item => !category || item.categoryId === category).map(item => item.categoryId)))
          const hasRecords = mode === 'spent' ? records.length > 0 : due.length > 0
          return <button className="day" key={date} aria-pressed={date === selected} aria-label={date + (hasRecords ? ' ' + yen(value) : '')} onClick={() => selectDay(date)}>
            <b>{i + 1}</b>{hasRecords && <small>{value.toLocaleString('ja-JP')}</small>}
            {mode === 'spent' && <span className="dots">{[...categories].map(id => <i key={id} style={{ background: data.categories.find(c => c.id === id)?.color }} />)}</span>}
          </button>
        })}
      </div>
    </Panel>
    <Panel title={selected + ' の明細'}>
      {mode === 'spent' ? <ul className="rows">{list(selected).map(t => <li key={t.id}><span><b>{t.merchant}</b>{t.items.filter(i => !category || i.categoryId === category).map(i => <small key={i.id}>{i.name} ・ {yen(i.amount - i.discount)}</small>)}</span><Amount value={itemSum(t)} /><button className="quiet" onClick={() => edit(t.id)}>編集</button></li>)}</ul>
        : <ul className="rows">{events.filter(e => e.date === selected).map(e => <li key={e.id}><span><b>{e.label}</b><small>{e.paid ? '済' : '予定'}</small></span><Amount value={-e.amount} /></li>)}</ul>}
      {(mode === 'spent' ? list(selected).length === 0 : !events.some(e => e.date === selected)) && <p className="empty">この日の記録はありません。</p>}
    </Panel>
  </div>
}
