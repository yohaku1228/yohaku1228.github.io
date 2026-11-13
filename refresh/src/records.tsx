import { useState } from 'react'
import { activeFixed, cashEvents, daysInMonth, debitDate, monthOf, onDay, sum, today, transactionAmount, transactionItemAmounts, yen } from './finance'
import type { Day, Ledger, Month, Transaction, TransactionItem } from './model'
import { Amount, Field, form, Money, Panel, str, SwipeRow, uid, type Save } from './ui'

import { storesFor } from './stores'

function QuickPurchase({ categories, stores, current }: { categories: Ledger['categories']; stores: string[]; current?: Transaction }) {
  const [category, setCategory] = useState(current?.items[0].categoryId ?? 'food')
  const [store, setStore] = useState(current?.merchant ? stores.includes(current.merchant) ? 'named:' + current.merchant : 'other' : '')
  return <>
    <Field label="変動費の項目"><select aria-label="変動費の項目" name="category" value={category} onChange={event => setCategory(event.target.value)}>
      {categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></Field>
    <div className="store-fields">
      <Field label="店舗"><select aria-label="店舗" name="store" required value={store} onChange={event => setStore(event.target.value)}>
        <option value="" disabled>店舗を選ぶ</option>
        {stores.map(name => <option key={name} value={'named:' + name}>{name}</option>)}
        <option value="other">その他（手入力）</option>
      </select></Field>
      {store === 'other' && <Field label="店舗名"><input name="merchant" defaultValue={current && !stores.includes(current.merchant) ? current.merchant : ''} required maxLength={100} /></Field>}
    </div>
    <div className="purchase-total">
      <Field label="支払合計（税込・円）"><Money name="amount" value={current ? transactionAmount(current) : undefined} negative /></Field>
    </div>
  </>
}

function billId(data: Ledger, transaction: Transaction) {
  const payment = data.payments.find(p => p.id === transaction.paymentId)
  return payment?.kind === 'card' ? `card:${payment.id}:${debitDate(transaction, payment)}` : ''
}

function PurchaseLines({ categories, items }: { categories: Ledger['categories']; items: TransactionItem[] }) {
  const [lines, setLines] = useState<{ id: string; item?: TransactionItem }[]>(() => items.length
    ? items.map(item => ({ id: item.id, item }))
    : [{ id: uid(), item: undefined }])

  return <div className="purchase-lines">
    {lines.map(({ id, item }, index) => <fieldset key={id}>
      <legend>{lines.length === 1 ? '明細' : `明細 ${index + 1}`}</legend>
      <input type="hidden" name="item-id" value={id} />
      <div className="fields">
        <Field label="金額（円）"><Money name="amount" value={item?.amount} negative /></Field>
        <Field label="カテゴリー"><select name="category" defaultValue={item?.categoryId ?? 'food'}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="品名（任意）"><input name="item-name" defaultValue={item?.name} maxLength={100} placeholder="例：お米" /></Field>
        <Field label="割引（円）"><Money name="discount" value={item?.discount} required={false} /></Field>
      </div>
      {lines.length > 1 && <button type="button" className="quiet negative" aria-label={`明細 ${index + 1} を外す`}
        onClick={() => setLines(previous => previous.filter(line => line.id !== id))}>この明細を外す</button>}
    </fieldset>)}
    <button type="button" className="quiet" onClick={() => setLines(previous => [...previous, { id: uid(), item: undefined }])}>＋ 明細を追加</button>
  </div>
}

export function Records({ data, month, save, mode, editing, setEditing, setMonth }: {
  data: Ledger; month: Month; save: Save; mode: 'add' | 'history'; editing: string | null
  setEditing: (id: string | null) => void; setMonth: (month: Month) => void
}) {
  const [formVersion, setFormVersion] = useState(0)
  const [saved, setSaved] = useState(false)
  const stores = storesFor(data)
  const current = data.transactions.find(t => t.id === editing)
  const detailed = !!current && (current.items.length > 1 || !!current.externalTax || current.items.some(item => item.discount || item.quantity !== 1))
  const cash = data.payments.find(payment => payment.id === 'cash-wallet' && payment.kind === 'cash')
    ?? data.payments.find(payment => payment.id === 'cash')!
  const cards = data.payments.filter(payment => payment.kind === 'card' && payment.id !== 'orico-card')
    .sort((a, b) => Number(/楽天|rakuten/i.test(b.name)) - Number(/楽天|rakuten/i.test(a.name)))
  const previousPayment = data.payments.find(payment => payment.id === current?.paymentId &&
    payment.id !== cash.id && !cards.some(card => card.id === payment.id))
  const rows = data.transactions.filter(t => monthOf(t.date) === month).sort((a, b) => b.date.localeCompare(a.date))
  function remove(transaction: Transaction) {
    if (!window.confirm('この支出記録を削除しますか？')) return
    save(old => {
      if (old.settled.includes(billId(old, transaction))) throw new Error('引落済みです。口座画面で確認を外してから編集してください。')
      const transactions = old.transactions.filter(t => t.id !== transaction.id)
      const receipts = transaction.receiptId && !transactions.some(t => t.receiptId === transaction.receiptId)
        ? old.receipts.filter(receipt => receipt.id !== transaction.receiptId) : old.receipts
      return { ...old, transactions, receipts }
    })
  }
  return <div className="stack">
    {saved && <p className="save-success" role="status">支出を保存しました。</p>}
    {(mode === 'add' || current) && <section className="panel">
      {current && <h2>支出を編集</h2>}
      <form className={mode === 'add' ? 'quick-entry' : undefined} key={(current?.id ?? month) + formVersion} onSubmit={form(fields => {
        const categories = fields.getAll('category').map(String)
        const date = str(fields, 'date')
        const paymentId = str(fields, 'payment')
        const fixedExpenseId = str(fields, 'fixed') || undefined
        const store = str(fields, 'store')
        const selectedStore = store.startsWith('named:') ? store.slice(6) : ''
        const merchant = stores.includes(selectedStore) ? selectedStore : str(fields, 'merchant')
        const names = fields.getAll('item-name').map(value => String(value).trim())
        const amounts = fields.getAll('amount').map(Number)
        const discounts = fields.getAll('discount').map(Number)
        const items = detailed ? fields.getAll('item-id').map((value, index) => ({
          id: String(value),
          name: names[index] || merchant,
          categoryId: categories[index],
          quantity: current?.items.find(item => item.id === value)?.quantity ?? 1,
          amount: amounts[index],
          discount: discounts[index],
        })) : [{
          id: current?.items[0].id ?? uid(),
          name: current?.items[0].name === current?.merchant ? merchant : current?.items[0].name ?? merchant,
          categoryId: categories[0], quantity: 1, amount: amounts[0], discount: 0,
        }]
        const record: Transaction = {
          id: current?.id ?? uid(), date, merchant, paymentId, fixedExpenseId,
          memo: str(fields, 'memo'), personal: fields.has('personal'),
          items,
          externalTax: Number(fields.get('external-tax')) || undefined,
          receiptId: current?.receiptId,
        }
        const payment = data.payments.find(p => p.id === paymentId)
        if (payment?.kind === 'card') record.debitOn =
          current?.date === date && current.paymentId === paymentId && current.debitOn ? current.debitOn : debitDate(record, payment)
        const duplicate = data.transactions.some(t => t.id !== record.id && t.date === date &&
          t.merchant.normalize('NFKC').trim() === merchant.normalize('NFKC').trim() && t.paymentId === paymentId &&
          (detailed || (t.items.length === 1 && t.items[0].categoryId === items[0].categoryId)) &&
          transactionAmount(t) === transactionAmount(record))
        if (duplicate && !window.confirm('同日・同じ店舗・同じ金額の記録があります。別の支出として保存しますか？')) return
        if (save(old => {
          if (items.some(item => item.discount > Math.max(0, item.amount))) {
            throw new Error('割引は各明細の金額以下にしてください。返金の割引は0円です。')
          }
          if (record.fixedExpenseId) {
            const usageMonth = monthOf(record.date)
            const target = activeFixed(old, usageMonth).find(f => f.id === record.fixedExpenseId)
            if (!target || record.personal || transactionAmount(record) < 0) {
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
          setSaved(true)
          window.scrollTo(0, 0)
          setEditing(null)
          setMonth(monthOf(date))
          setFormVersion(v => v + 1)
        }
      })}>
        {!detailed && <QuickPurchase categories={data.categories} stores={stores} current={current} />}
        <div className="fields purchase-meta">
          <Field label="利用日"><input type="date" name="date" required defaultValue={current?.date ?? (monthOf(today()) === month ? today() : onDay(month, 1))} /></Field>
          {detailed && <Field label="店舗名"><input name="merchant" defaultValue={current?.merchant} required maxLength={100} /></Field>}
          <Field label="支払方法"><select aria-label="支払方法" name="payment" defaultValue={current?.paymentId ?? cards[0]?.id ?? cash.id}>
            {cards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
            {previousPayment && <option value={previousPayment.id}>{previousPayment.name}（登録時）</option>}
            <option value={cash.id}>現金</option>
          </select></Field>
        </div>
        <Field label="使い道メモ（任意）"><textarea aria-label="使い道メモ（任意）" className="meal-shopping-input" name="memo" defaultValue={current?.memo} maxLength={500} rows={2} placeholder="例：昼食、仕事で使う文具、友人との食事" /></Field>
        {detailed && <PurchaseLines items={current?.items ?? []} categories={data.categories} />}
        {!!current?.externalTax && <div className="fields">
          <Field label="外税（円）"><Money name="external-tax" value={current.externalTax} required={false} /></Field>
        </div>}
        <details open={!!(current?.fixedExpenseId || current?.personal)}>
          <summary>その他の設定</summary>
          <div className="fields">
            {data.fixed.length > 0 && <Field label="固定費に紐づける"><select name="fixed" defaultValue={current?.fixedExpenseId ?? ''}><option value="">生活費として記録</option>{data.fixed.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
          </div>
          <label className="check"><input type="checkbox" name="personal" defaultChecked={current?.personal} /> 個人の買い物として生活費から除外</label>
        </details>
        <div className="actions"><button className="primary">支出を保存</button>{current && <button type="button" className="quiet" onClick={() => setEditing(null)}>取消</button>}</div>
      </form>
    </section>}
    {mode === 'history' && <Panel title="この月の履歴">
      {rows.length === 0 && <p className="empty">まだ支出がありません。</p>}
      <ul className="rows">{rows.map(t => <SwipeRow key={t.id} label={t.merchant} onRemove={() => remove(t)}>
        <span><b>{t.merchant}</b><small>{t.date} ・ {t.items.length > 1 ? `${t.items.length}明細` : data.categories.find(c => c.id === t.items[0].categoryId)?.name}{t.personal ? ' ・ 個人' : ''}</small>{t.memo && <small>{t.memo}</small>}</span>
        <Amount value={transactionAmount(t)} /><button className="quiet" onClick={() => { setEditing(t.id); window.scrollTo(0, 0) }}>編集</button>
      </SwipeRow>)}</ul>
    </Panel>}
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
  const itemSum = (transaction: Transaction) => category
    ? sum(transactionItemAmounts(transaction).filter((_, index) => transaction.items[index].categoryId === category))
    : transactionAmount(transaction)
  return <div className="stack">
    <Panel title="家計カレンダー">
      <div className="fields">
        <Field label="表示する日付"><select value={mode} onChange={event => setMode(event.target.value === 'due' ? 'due' : 'spent')}>
          <option value="spent">利用日</option><option value="due">支払日</option>
        </select></Field>
        {mode === 'spent' && <Field label="カテゴリー"><select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">すべて</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></Field>}
      </div>
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
      {mode === 'spent' ? <ul className="rows">{list(selected).map(t => <li key={t.id}><span><b>{t.merchant}</b>{t.items.filter(i => !category || i.categoryId === category).map(i => <small key={i.id}>{i.name} ・ {yen(i.amount - i.discount)}</small>)}{!category && !!t.externalTax && <small>外税 ・ {yen(t.externalTax)}</small>}</span><Amount value={itemSum(t)} /><button className="quiet" onClick={() => edit(t.id)}>編集</button></li>)}</ul>
        : <ul className="rows">{events.filter(e => e.date === selected).map(e => <li key={e.id}><span><b>{e.label}</b><small>{e.paid ? '済' : '予定'}</small></span><Amount value={-e.amount} /></li>)}</ul>}
      {(mode === 'spent' ? list(selected).length === 0 : !events.some(e => e.date === selected)) && <p className="empty">この日の記録はありません。</p>}
    </Panel>
  </div>
}
