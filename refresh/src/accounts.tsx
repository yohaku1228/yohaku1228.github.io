import { useState } from 'react'
import { accountProjection, activeFixed, annualSummary, cardBills, cashEvents, monthOf, onDay, sum, today, yen } from './finance'
import type { AnnualBudget, Ledger, Month, PaymentMethod, Transfer } from './model'
import { Amount, Field, form, Money, num, Panel, Stat, str, uid, type Save } from './ui'

export function Accounts({ data, month, save }: { data: Ledger; month: Month; save: Save }) {
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [cardId, editCard] = useState<string | null>(null)
  const [transferVersion, bump] = useState(0)
  const card = data.payments.find(p => p.id === cardId)
  const events = cashEvents(data, month)
  const bills = cardBills(data).filter(b => monthOf(b.date) >= month || !b.paid)
  const fixed = activeFixed(data, month)
  function toggle(id: string) {
    save(old => ({ ...old, settled: old.settled.includes(id) ? old.settled.filter(s => s !== id) : [...old.settled, id] }))
  }
  return <div className="stack">
    <div className="actions"><button className={mode === 'month' ? 'primary' : 'quiet'} onClick={() => setMode('month')}>月次の資金繰り</button><button className={mode === 'year' ? 'primary' : 'quiet'} onClick={() => setMode('year')}>サブ口座の年間計画</button></div>
    {mode === 'year' ? <Annual data={data} month={month} save={save} /> : <>
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
        {data.incomes.some(i => monthOf(i.date) === month && i.route === 'undecided') && <p className="notice">負担方法が未定の収入は、口座への入金見込みに含めていません。</p>}
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
        <details><summary>カードの追加・締め日設定</summary>
          <div className="actions">{data.payments.filter(p => p.kind === 'card').map(p => <button className="quiet" key={p.id} onClick={() => editCard(p.id)}>{p.name}を編集</button>)}</div>
          <form key={cardId ?? 'new'} onSubmit={form(fields => {
            const record: PaymentMethod = { id: cardId ?? uid(), kind: 'card', name: str(fields, 'name'), accountId: str(fields, 'account'),
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
            <div className="actions"><button className="primary">{card ? '設定を更新' : 'カードを追加'}</button>{card && <button type="button" className="quiet" onClick={() => editCard(null)}>取消</button>}</div>
          </form>
        </details>
      </Panel>
      <Panel title="固定費の支払確認">
        <ul className="rows">{fixed.map(item => {
          const id = `fixed:${item.id}:${month}`
          const linked = data.transactions.some(t => t.fixedExpenseId === item.id && monthOf(t.date) === month)
          if (linked) return <li key={id}><span><b>{item.name}</b><small>登録した明細の支払方法で集計</small></span><span className="hint">明細に紐づけ済み</span></li>
          return <li key={id}><span><b>{item.name}</b><small>{item.dueDay ? onDay(month, item.dueDay) : '日付未定'}</small></span><Amount value={item.amount} /><label className="check"><input type="checkbox" checked={data.settled.includes(id)} onChange={() => toggle(id)} /> 支払済み</label></li>
        })}</ul>{!fixed.length && <p className="empty">この月の固定費はありません。</p>}
      </Panel>
      <Panel title="口座間の移動" description="振込、貯蓄、取り崩しを記録します。生活費の支出には加えません。">
        <form key={month + transferVersion} onSubmit={form(fields => {
          const transfer: Transfer = {
            id: uid(), from: str(fields, 'from'), to: str(fields, 'to'), date: str(fields, 'date'), amount: num(fields, 'amount'),
            completed: fields.has('completed'), purpose: str(fields, 'purpose') as Transfer['purpose'],
          }
          if (save(old => ({ ...old, transfers: [...old.transfers, transfer] }))) bump(v => v + 1)
        })}>
          <div className="fields">
            <Field label="日付"><input type="date" name="date" defaultValue={monthOf(today()) === month ? today() : onDay(month, 1)} required /></Field>
            <Field label="金額"><Money name="amount" /></Field>
            <Field label="振込元"><select name="from" defaultValue="main">{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="振込先"><select name="to" defaultValue="annual">{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="用途"><select name="purpose"><option value="transfer">振込</option><option value="savings">貯蓄</option><option value="withdrawal">取り崩し</option></select></Field>
          </div>
          <label className="check"><input name="completed" type="checkbox" /> 振込済み</label><div className="actions"><button className="primary">移動を登録</button></div>
        </form>
        <ul className="rows">{data.transfers.filter(t => monthOf(t.date) === month).map(t => <li key={t.id}><span><b>{data.accounts.find(a => a.id === t.from)?.name} → {data.accounts.find(a => a.id === t.to)?.name}</b><small>{t.date} ・ {t.purpose === 'savings' ? '貯蓄' : t.purpose === 'withdrawal' ? '取り崩し' : '振込'}</small></span><Amount value={t.amount} /><label className="check"><input type="checkbox" checked={t.completed} onChange={() => save(old => ({ ...old, transfers: old.transfers.map(row => row.id === t.id ? { ...row, completed: !row.completed } : row) }))} /> 振込済み</label></li>)}</ul>
      </Panel>
    </>}
  </div>
}

function Annual({ data, month, save }: { data: Ledger; month: Month; save: Save }) {
  const year = Number(month.slice(0, 4))
  const annual = annualSummary(data, year)
  const [editing, edit] = useState<string | null>(null)
  const plan = data.annual.find(p => p.id === editing)
  return <div className="stack">
    <div className="stats"><Stat label="年間収入予定" value={annual.income} /><Stat label="年間確保額" value={annual.outflow} detail={`うち資産形成 ${yen(annual.asset)}`} /><Stat label="年間黒字見込み" value={annual.surplus} /><Stat label="年間実績差額" value={annual.actualIncome - annual.actualOutflow} /></div>
    <Panel title={year + '年の入出金計画'} description="年間の予定額と実際の入出金を別々に記録します。">
      <ul className="rows">{annual.plans.map(p => <li key={p.id}><span><b>{p.label}</b><small>{p.kind === 'asset' ? '資産形成 ・ ' : p.kind === 'income' ? '収入 ・ ' : ''}実績 {yen(sum(data.annualActuals.filter(a => a.planId === p.id && a.date.startsWith(String(year))).map(a => a.amount)))}</small></span><Amount value={p.amount} /><button className="quiet" onClick={() => edit(p.id)}>編集</button></li>)}</ul>
      <form key={editing ?? 'new'} onSubmit={form(fields => {
        const item: AnnualBudget = {
          id: editing ?? uid(), label: str(fields, 'label'), kind: str(fields, 'kind') as AnnualBudget['kind'],
          amount: num(fields, 'amount'), accountId: 'annual', endYear: str(fields, 'end') ? num(fields, 'end') : undefined,
        }
        if (save(old => ({ ...old, annual: [...old.annual.filter(p => p.id !== item.id), item] }))) edit(null)
      })}>
        <div className="fields">
          <Field label="項目"><input name="label" defaultValue={plan?.label} required maxLength={100} /></Field>
          <Field label="年間金額"><Money name="amount" value={plan?.amount} /></Field>
          <Field label="区分"><select name="kind" defaultValue={plan?.kind ?? 'expense'}><option value="expense">支出</option><option value="income">収入</option><option value="asset">資産形成</option></select></Field>
          <Field label="終了年（任意）"><input name="end" type="number" min="2000" max="2099" defaultValue={plan?.endYear} /></Field>
        </div><div className="actions"><button className="primary">{plan ? '予定を更新' : '予定を追加'}</button>{plan && <button type="button" className="quiet" onClick={() => edit(null)}>取消</button>}</div>
      </form>
    </Panel>
    {annual.plans.length > 0 && <Panel title="実際の入出金">
      <form key={month + data.annualActuals.length} onSubmit={form(fields => save(old => ({
        ...old, annualActuals: [...old.annualActuals, { id: uid(), planId: str(fields, 'plan'), date: str(fields, 'date'), amount: num(fields, 'amount') }],
      })))}>
        <div className="fields"><Field label="項目"><select name="plan">{annual.plans.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></Field>
          <Field label="日付"><input type="date" name="date" defaultValue={onDay(month, 1)} min={`${year}-01-01`} max={`${year}-12-31`} required /></Field><Field label="実額"><Money name="amount" /></Field></div>
        <div className="actions"><button className="primary">実績を登録</button></div>
      </form>
      <ul className="rows">{data.annualActuals.filter(a => a.date.startsWith(String(year))).map(a => <li key={a.id}><span><b>{data.annual.find(p => p.id === a.planId)?.label}</b><small>{a.date}</small></span><Amount value={a.amount} /><button className="quiet negative" onClick={() => {
        if (window.confirm('この実績を削除しますか？')) save(old => ({ ...old, annualActuals: old.annualActuals.filter(row => row.id !== a.id) }))
      }}>削除</button></li>)}</ul>
    </Panel>}
  </div>
}
