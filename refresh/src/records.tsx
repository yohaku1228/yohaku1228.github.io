import { useRef, useState } from 'react'
import { activeFixed, cashEvents, daysInMonth, debitDate, monthOf, onDay, sum, today, transactionAmount, transactionItemAmounts, yen } from './finance'
import type { Day, Ledger, Month, Transaction, TransactionItem } from './model'
import { Amount, Field, form, Money, Panel, str, SwipeRow, uid, type Save } from './ui'
import { ReceiptReader, type ReceiptScan } from './receipt'

function billId(data: Ledger, transaction: Transaction) {
  const payment = data.payments.find(p => p.id === transaction.paymentId)
  return payment?.kind === 'card' ? `card:${payment.id}:${debitDate(transaction, payment)}` : ''
}

type DraftItem = Omit<TransactionItem, 'amount'> & { amount: number | null }
function PurchaseLines({ categories, items }: { categories: Ledger['categories']; items: DraftItem[] }) {
  const [lines, setLines] = useState<{ id: string; item?: DraftItem }[]>(() => items.length
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

export function Records({ data, month, save, mode, editing, setEditing, setMonth, onManual }: {
  data: Ledger; month: Month; save: Save; mode: 'manual' | 'scan'; editing: string | null
  setEditing: (id: string | null) => void; setMonth: (month: Month) => void; onManual: () => void
}) {
  const [formVersion, setFormVersion] = useState(0)
  const [scan, setScan] = useState<ReceiptScan | null>(null)
  const [scanSaved, setScanSaved] = useState(false)
  const review = useRef<HTMLHeadingElement>(null)
  const current = data.transactions.find(t => t.id === editing)
  const cash = data.payments.find(payment => payment.id === 'cash-wallet' && payment.kind === 'cash')
    ?? data.payments.find(payment => payment.id === 'cash')!
  const cards = data.payments.filter(payment => payment.kind === 'card' && payment.id !== 'orico-card')
  const previousPayment = data.payments.find(payment => payment.id === current?.paymentId &&
    payment.id !== cash.id && !cards.some(card => card.id === payment.id))
  const draft = current ? null : scan
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
    {mode === 'scan' && !draft && <Panel title="写真から支出を登録" description="レシートを撮るか、写真やスクリーンショットを選んでください。">
      {scanSaved && <p className="scan-success" role="status">支出を登録しました。続けて次のレシートを読み取れます。</p>}
      <ReceiptReader seen={fingerprint => data.receipts.some(receipt => receipt.fingerprint === fingerprint)} onRead={read => {
        setScan(read)
        setFormVersion(version => version + 1)
        requestAnimationFrame(() => review.current?.focus())
      }} />
      <div className="actions"><button className="quiet" onClick={onManual}>支出の手入力・履歴へ</button></div>
    </Panel>}
    {(mode === 'manual' || draft) && <section className="panel">
      <h2 ref={review} tabIndex={-1}>{draft ? '読み取った明細を確認' : current ? '支出を編集' : '支出を手入力'}</h2>
      {!draft && <p className="hint">支出には購入日を使います。返金はマイナスの金額で登録できます。</p>}
      {draft && <p className="notice">読み取った内容を確認してください。{draft.total !== null ? `レシートの合計は ${yen(draft.total)} です。` : 'レシートの合計は読み取れませんでした。'}</p>}
      <form key={(current?.id ?? month) + formVersion} onSubmit={form(fields => {
        const categories = fields.getAll('category').map(String)
        const allowanceLines = categories.filter(id => data.categories.find(c => c.id === id)?.allowance)
        const allowance = allowanceLines.length > 0
        const date = str(fields, 'date')
        const paymentId = str(fields, 'payment')
        const fixedExpenseId = str(fields, 'fixed') || undefined
        const merchant = allowance ? 'お小遣い支給' : str(fields, 'merchant')
        const names = fields.getAll('item-name').map(value => String(value).trim())
        const amounts = fields.getAll('amount').map(Number)
        const discounts = fields.getAll('discount').map(Number)
        const items = fields.getAll('item-id').map((value, index) => ({
          id: String(value),
          name: allowance ? merchant : names[index] || merchant,
          categoryId: categories[index],
          quantity: current?.items.find(item => item.id === value)?.quantity ?? 1,
          amount: amounts[index],
          discount: discounts[index],
        }))
        const record: Transaction = {
          id: current?.id ?? uid(), date, merchant, paymentId, fixedExpenseId,
          memo: allowance ? '' : str(fields, 'memo'), personal: fields.has('personal') && !allowance,
          items,
          externalTax: allowance ? undefined : Number(fields.get('external-tax')) || undefined,
          receiptId: current?.receiptId ?? (draft ? uid() : undefined),
        }
        if (draft?.total !== null && draft?.total !== undefined && draft.total !== transactionAmount(record) &&
          !window.confirm(`レシートの合計 ${yen(draft.total)} と、外税を含む入力合計 ${yen(transactionAmount(record))} が異なります。保存しますか？`)) return
        const payment = data.payments.find(p => p.id === paymentId)
        if (payment?.kind === 'card') record.debitOn =
          current?.date === date && current.paymentId === paymentId && current.debitOn ? current.debitOn : debitDate(record, payment)
        const duplicate = data.transactions.some(t => t.id !== record.id && t.date === date &&
          t.merchant.normalize('NFKC').trim() === merchant.normalize('NFKC').trim() && t.paymentId === paymentId &&
          transactionAmount(t) === transactionAmount(record))
        if (duplicate && !window.confirm('同日・同じ店舗・同じ金額の記録があります。別の支出として保存しますか？')) return
        if (save(old => {
          if (allowance && items.length !== 1) throw new Error('お小遣いの支給は、買い物と分けて1件で記録してください。')
          if (items.some(item => item.discount > Math.max(0, item.amount))) {
            throw new Error('割引は各明細の金額以下にしてください。返金の割引は0円です。')
          }
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
          if (draft && old.receipts.some(receipt => receipt.fingerprint === draft.fingerprint)) throw new Error('このレシート画像はすでに登録済みです。')
          const receipts = draft && record.receiptId ? [...old.receipts, { id: record.receiptId, date, total: draft.total ?? transactionAmount(record),
            fingerprint: draft.fingerprint, imageRefs: [] }] : old.receipts
          return { ...old, receipts, transactions: [...old.transactions.filter(t => t.id !== record.id), record] }
        })) {
          if (draft) {
            setScanSaved(true)
            window.scrollTo(0, 0)
          }
          setScan(null)
          setEditing(null)
          setMonth(monthOf(date))
          setFormVersion(v => v + 1)
        }
      })}>
        <div className="fields">
          <Field label="利用日"><input type="date" name="date" required defaultValue={current?.date ?? (draft ? draft.date ?? '' : monthOf(today()) === month ? today() : onDay(month, 1))} /></Field>
          <Field label="店舗・品名"><input name="merchant" defaultValue={current?.merchant ?? draft?.merchant ?? ''} placeholder="例：スーパー" maxLength={100} /></Field>
          <Field label="支払方法"><select name="payment" defaultValue={current?.paymentId ?? cash.id}>
            {cards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
            <option value={cash.id}>現金</option>
            {previousPayment && <option value={previousPayment.id}>{previousPayment.name}（登録時）</option>}
          </select></Field>
          {data.fixed.length > 0 && <Field label="固定費に紐づける"><select name="fixed" defaultValue={current?.fixedExpenseId ?? ''}><option value="">生活費として記録</option>{data.fixed.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></Field>}
          <Field label="メモ"><input name="memo" defaultValue={current?.memo} maxLength={500} placeholder="任意" /></Field>
        </div>
        <PurchaseLines items={current?.items ?? draft?.items.map((item, index) => ({
          id: draft.fingerprint + ':' + index, name: item.name, amount: item.amount,
          discount: Math.max(0, item.discount ?? 0), categoryId: 'food', quantity: 1,
        })) ?? []} categories={data.categories} />
        {(draft || current?.externalTax) && <div className="fields">
          <Field label="外税（円）"><Money name="external-tax" value={current?.externalTax ?? draft?.externalTax} required={false} /></Field>
        </div>}
        <label className="check"><input type="checkbox" name="personal" defaultChecked={current?.personal} /> 個人の買い物として生活費から除外</label>
        <div className="actions"><button className="primary">支出を保存</button>{current && <button type="button" className="quiet" onClick={() => setEditing(null)}>取消</button>}
          {draft && <button type="button" className="quiet" onClick={() => {
            if (window.confirm('この読み取りを取り消しますか？')) {
              setScan(null)
              setScanSaved(false)
              window.scrollTo(0, 0)
            }
          }}>読み取りを取り消す</button>}</div>
      </form>
    </section>}
    {mode === 'manual' && <Panel title="この月の履歴">
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
      {mode === 'spent' ? <ul className="rows">{list(selected).map(t => <li key={t.id}><span><b>{t.merchant}</b>{t.items.filter(i => !category || i.categoryId === category).map(i => <small key={i.id}>{i.name} ・ {yen(i.amount - i.discount)}</small>)}{!category && !!t.externalTax && <small>外税 ・ {yen(t.externalTax)}</small>}</span><Amount value={itemSum(t)} /><button className="quiet" onClick={() => edit(t.id)}>編集</button></li>)}</ul>
        : <ul className="rows">{events.filter(e => e.date === selected).map(e => <li key={e.id}><span><b>{e.label}</b><small>{e.paid ? '済' : '予定'}</small></span><Amount value={-e.amount} /></li>)}</ul>}
      {(mode === 'spent' ? list(selected).length === 0 : !events.some(e => e.date === selected)) && <p className="empty">この日の記録はありません。</p>}
    </Panel>
  </div>
}
