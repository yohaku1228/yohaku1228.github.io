import { useState } from 'react'
import { accountProjection, activeFixed, cardBills, cashEvents, monthOf, onDay, paymentSummary, today, yen } from './finance'
import type { Ledger, Month, PaymentMethod, Transfer } from './model'
import { SubAccount } from './sub-account'
import { Amount, Field, form, Money, num, Panel, Stat, str, SwipeRow, uid, type Save } from './ui'

export type AccountView = 'payments' | 'month' | 'year' | 'setup'
export function Accounts({ data, month, save, mode, setMode }: { data: Ledger; month: Month; save: Save; mode: AccountView; setMode: (mode: AccountView) => void }) {
  const [cardId, editCard] = useState<string | null>(null)
  const [transferVersion, bump] = useState(0)
  const [editingTransfer, setEditingTransfer] = useState<string | null>(null)
  const card = data.payments.find(p => p.id === cardId)
  const events = cashEvents(data, month)
  const summaries = data.accounts.map(account => ({ account, ...paymentSummary(events, account.id) }))
    .filter(({ account, payments }) => payments.length > 0 || (account.id !== 'main' && account.kind !== 'annual'))
  const bills = cardBills(data).filter(b => monthOf(b.date) >= month || !b.paid)
  const fixed = activeFixed(data, month)
  const transfers = data.transfers.filter(t => monthOf(t.date) === month)
  const transferToEdit = transfers.find(t => t.id === editingTransfer)
  function toggle(id: string) {
    save(old => ({ ...old, settled: old.settled.includes(id) ? old.settled.filter(s => s !== id) : [...old.settled, id] }))
  }
  return <div className="stack">
    <div className="actions"><button className={mode === 'payments' ? 'primary' : 'quiet'} aria-pressed={mode === 'payments'} onClick={() => setMode('payments')}>銀行別の引落</button><button className={mode === 'month' ? 'primary' : 'quiet'} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>月次の資金繰り</button><button className={mode === 'year' ? 'primary' : 'quiet'} aria-pressed={mode === 'year'} onClick={() => setMode('year')}>サブ口座</button><button className={mode === 'setup' ? 'primary' : 'quiet'} aria-pressed={mode === 'setup'} onClick={() => setMode('setup')}>引落口座の設定</button></div>
    {mode === 'payments' && <Panel title="今月の引落・支払い" description="登録した固定費・カード請求・現金払いを口座別に表示します。引落日が決まっていない固定費も含みます。">
      {summaries.length ? <div className="payment-accounts">
        {summaries.map(({ account, payments, total, remaining }) => <article className="payment-account" key={account.id}>
          <h3>{account.name}</h3>
          <div className="payment-figures">
            <div><small>今月の支払い合計</small><strong><Amount value={total} /></strong></div>
            <div><small>支払未確認</small><strong><Amount value={remaining} /></strong></div>
          </div>
          {payments.length > 0 && <details>
            <summary>内訳を見る（{payments.length}件）</summary>
            <ul className="rows">{payments.map(event => <li key={event.source + ':' + event.id}>
              <span><b>{event.label}</b><small>{event.date ? event.date.slice(5).replace('-', '/') : '日付未設定'}</small></span>
              <Amount value={-event.amount} />
              {event.source === 'cash' ? <span className="hint">支払済み</span> : <label className="check">
                <input type="checkbox" checked={event.paid} onChange={() => toggle(event.id)} /> {event.source === 'card' ? '引落済み' : '支払済み'}
              </label>}
            </li>)}</ul>
          </details>}
        </article>)}
      </div> : <p className="empty">この月の支払いはまだ登録されていません。</p>}
      <p className="hint">「支払未確認」はまだ済にしていない金額です。残高も含めて確認する場合は「月次の資金繰り」を開いてください。</p>
    </Panel>}
    {mode === 'year' ? <SubAccount data={data} month={month} save={save} /> : <>
      {mode === 'month' && <>
      <Panel title="口座別の資金繰り" description="月初残高から日付順に入出金を予測します。同じ日の出金は入金より先に計算します。日付未定の支払いは予測残高に含めず、別に表示します。">
        <div className="account-grid">{data.accounts.map(account => {
          const projection = accountProjection(account, events, month)
          return <div className="account-card" key={account.id}>
            <h3>{account.name}</h3>
            <div className="stats"><Stat label="日付がある分の必要入金" value={projection.required} /><Stat label="日付がある分の月末見込み" value={projection.closing} /><Stat label="支払未確認" value={projection.pending} /><Stat label="うち日付未定" value={projection.undated} /></div>
            <form key={month + String(account.openingBalances[month])} onSubmit={form(fields => save(old => ({
              ...old, accounts: old.accounts.map(a => a.id === account.id ? { ...a, openingBalances: { ...a.openingBalances, [month]: num(fields, 'opening') } } : a),
            })))}>
              <Field label="月初の実残高（円）"><Money name="opening" negative value={account.openingBalances[month]} /></Field>
              <button className="quiet">残高を保存</button>
            </form>
          </div>
        })}</div>
        {data.incomes.some(i => monthOf(i.date) === month && (i.route === 'direct' || i.route === 'undecided')) && <p className="notice">口座残高に反映していない収入があります。「予算」の「収入」で入金先を確認できます。</p>}
      </Panel>
      <Panel title="カード別の引落予定" description="カード利用は利用月の生活費、引落は引落月の口座資金として集計します。">
        <ul className="rows">{bills.map(bill => {
          const statement = data.statementTotals?.[bill.id]
          const difference = statement === undefined ? undefined : statement - bill.amount
          return <li className="bill" key={bill.id}>
            <span><b>{data.payments.find(p => p.id === bill.paymentId)?.name}</b><small>{bill.date} ・ 明細 {bill.itemCount}件</small></span>
            <Amount value={bill.amount} />
            <label className="check"><input type="checkbox" checked={bill.paid} onChange={() => toggle(bill.id)} /> 引落済み</label>
            <details>
              <summary>{difference === undefined ? 'カード会社の請求額と照合' : difference === 0 ? '照合済み ・ 一致' : `請求額との差 ${yen(difference)}`}</summary>
              <form key={String(statement)} onSubmit={form(fields => save(old => {
                const statementTotals = { ...old.statementTotals }
                if (str(fields, 'statement')) statementTotals[bill.id] = num(fields, 'statement')
                else delete statementTotals[bill.id]
                return { ...old, statementTotals }
              }))}>
                <Field label="カード会社の請求額（円）"><Money name="statement" value={statement} required={false} negative /></Field>
                <p className="hint">記録の合計との差を表示します。空欄で保存すると照合額を取り消せます。</p>
                <button className="quiet">照合額を保存</button>
              </form>
            </details>
          </li>
        })}</ul>
        {!bills.length && <p className="empty">カード利用を登録すると、ここに引落予定が表示されます。</p>}
      </Panel>
      </>}
      {mode === 'setup' && <>
        <Panel title="カードの引落口座" description="カードを選ぶと、口座・締め日・引落日を設定できます。">
          <ul className="rows">{data.payments.filter(p => p.kind === 'card').map(p => <li key={p.id}>
            <span><b>{p.name}</b><small>{data.accounts.find(a => a.id === p.accountId)?.name} ・ {p.debitDay}日引落</small></span>
            <button className="quiet" onClick={() => editCard(p.id)}>{p.name}を編集</button>
          </li>)}</ul>
          <div className="actions"><button className="quiet" onClick={() => editCard('new')}>＋ カードを追加</button></div>
          {cardId && <>
          <form key={cardId ?? 'new'} onSubmit={form(fields => {
            const record: PaymentMethod = { id: card?.id ?? uid(), kind: 'card', name: str(fields, 'name'), accountId: str(fields, 'account'),
              closingDay: num(fields, 'closing'), debitDay: num(fields, 'debit'), debitLag: num(fields, 'lag') }
            if (save(old => {
              if (card && card.accountId !== record.accountId && old.transactions.some(t => t.paymentId === card.id)) {
                throw new Error('明細のあるカードは口座を変更できません。新しい支払方法を追加してください。')
              }
              return { ...old, payments: [...old.payments.filter(p => p.id !== record.id), record] }
            })) editCard(null)
          })}>
            <div className="fields">
              <Field label="カード名"><input name="name" defaultValue={card?.name} required maxLength={100} /></Field>
              <Field label="締め日（日）"><input name="closing" type="number" min="1" max="31" defaultValue={card?.closingDay ?? 31} required /></Field>
              <Field label="引落日（日）"><input name="debit" type="number" min="1" max="31" defaultValue={card?.debitDay ?? 27} required /></Field>
              <Field label="締め月から何か月後"><input name="lag" type="number" min="1" max="3" defaultValue={card?.debitLag ?? 1} required /></Field>
              <Field label="引落口座"><select name="account" defaultValue={card?.accountId ?? 'main'}>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            </div>
            <p className="hint">31日は月末扱いです。休日の繰り延べは金融機関の明細で確認してください。</p>
            <div className="actions"><button className="primary">{card ? '設定を更新' : 'カードを追加'}</button><button type="button" className="quiet" onClick={() => editCard(null)}>取消</button></div>
          </form>
          </>}
        </Panel>
        <Panel title="固定費の引落口座" description="銀行・現金で直接払うか、カードを通して払うかを選びます。カード払いはそのカードの引落口座に集計します。">
          {data.fixed.length ? <div className="fields">{data.fixed.map(item => <Field key={item.id} label={item.name + 'の支払方法'}>
            <select value={item.cardPaymentId ? 'card:' + item.cardPaymentId : 'account:' + item.accountId} onChange={event => {
              const value = event.target.value
              const isCard = value.startsWith('card:')
              const id = value.slice(isCard ? 'card:'.length : 'account:'.length)
              save(old => {
                const payment = isCard ? old.payments.find(p => p.id === id && p.kind === 'card') : undefined
                return { ...old, fixed: old.fixed.map(row => row.id === item.id
                  ? { ...row, accountId: payment?.accountId ?? id, cardPaymentId: payment?.id } : row) }
              })
            }}>
              <optgroup label="口座・現金">{data.accounts.map(a => <option key={a.id} value={'account:' + a.id}>{a.name}</option>)}</optgroup>
              <optgroup label="カード払い">{data.payments.filter(p => p.kind === 'card').map(p => <option key={p.id} value={'card:' + p.id}>{p.name} → {data.accounts.find(a => a.id === p.accountId)?.name}</option>)}</optgroup>
            </select>
          </Field>)}</div> : <p className="empty">固定費は下の「予算」から追加できます。</p>}
        </Panel>
      </>}
      {mode === 'month' && <>
      <Panel title="固定費の支払確認">
        <ul className="rows">{fixed.map(item => {
          const id = `fixed:${item.id}:${month}`
          const linked = data.transactions.some(t => t.fixedExpenseId === item.id && monthOf(t.date) === month)
          if (linked) return <li key={id}><span><b>{item.name}</b><small>登録した明細の支払方法で集計</small></span><span className="hint">明細に紐づけ済み</span></li>
          const event = events.find(event => event.id === id)
          const account = data.accounts.find(a => a.id === event?.accountId)
          const card = data.payments.find(p => p.id === item.cardPaymentId)
          return <li key={id}><span><b>{item.name}</b><small>{card && card.name + ' → '}{account?.name} ・ {event?.date ?? '日付未定'}</small></span><Amount value={item.amount} /><label className="check"><input type="checkbox" checked={data.settled.includes(id)} onChange={() => toggle(id)} /> 支払済み</label></li>
        })}</ul>{!fixed.length && <p className="empty">この月の固定費はありません。</p>}
      </Panel>
      <Panel title="口座間の移動" description="振込、貯蓄、取り崩しを記録します。生活費の支出には加えません。">
        <form id="transfer-form" key={month + transferVersion + (transferToEdit?.id ?? '')} onSubmit={form(fields => {
          const transfer: Transfer = {
            id: transferToEdit?.id ?? uid(), from: str(fields, 'from'), to: str(fields, 'to'), date: str(fields, 'date'), amount: num(fields, 'amount'),
            completed: fields.has('completed'), purpose: str(fields, 'purpose') as Transfer['purpose'],
          }
          if (save(old => ({ ...old, transfers: [...old.transfers.filter(row => row.id !== transfer.id), transfer] }))) {
            setEditingTransfer(null)
            bump(v => v + 1)
          }
        })}>
          <div className="fields">
            <Field label="日付"><input type="date" name="date" defaultValue={transferToEdit?.date ?? (monthOf(today()) === month ? today() : onDay(month, 1))} required /></Field>
            <Field label="金額"><Money name="amount" value={transferToEdit?.amount} /></Field>
            <Field label="振込元"><select name="from" defaultValue={transferToEdit?.from ?? 'main'}>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="振込先"><select name="to" defaultValue={transferToEdit?.to ?? 'annual'}>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="用途"><select name="purpose" defaultValue={transferToEdit?.purpose ?? 'transfer'}><option value="transfer">振込</option><option value="savings">貯蓄</option><option value="withdrawal">取り崩し</option></select></Field>
          </div>
          <label className="check"><input name="completed" type="checkbox" defaultChecked={transferToEdit?.completed} /> 振込済み</label>
          <div className="actions"><button className="primary">{transferToEdit ? '移動を更新' : '移動を登録'}</button>{transferToEdit && <button type="button" className="quiet" onClick={() => setEditingTransfer(null)}>取消</button>}</div>
        </form>
        <ul className="rows">{transfers.map(t => <SwipeRow key={t.id} label="口座間の移動" onRemove={() => {
          if (!window.confirm(`${t.date}の移動 ${yen(t.amount)} を削除しますか？`)) return
          if (save(old => ({ ...old, transfers: old.transfers.filter(row => row.id !== t.id) })) && editingTransfer === t.id) setEditingTransfer(null)
        }}>
          <span><b>{data.accounts.find(a => a.id === t.from)?.name} → {data.accounts.find(a => a.id === t.to)?.name}</b><small>{t.date} ・ {t.purpose === 'savings' ? '貯蓄' : t.purpose === 'withdrawal' ? '取り崩し' : '振込'}</small></span>
          <Amount value={t.amount} /><label className="check"><input type="checkbox" checked={t.completed} onChange={() => {
            if (save(old => ({ ...old, transfers: old.transfers.map(row => row.id === t.id ? { ...row, completed: !row.completed } : row) })) && editingTransfer === t.id) {
              setEditingTransfer(null)
            }
          }} /> 振込済み</label>
          <button className="quiet" onClick={() => {
            setEditingTransfer(t.id)
            requestAnimationFrame(() => document.getElementById('transfer-form')?.scrollIntoView({ block: 'nearest' }))
          }}>編集</button>
        </SwipeRow>)}</ul>
      </Panel>
      </>}
    </>}
  </div>
}
