import { useState } from 'react'
import { activeFixed, addMonths, budgetFor, foodWeek, monthly, onDay, today, yen } from './finance'
import type { FixedExpense, Income, Ledger, Month } from './model'
import { Amount, BudgetRow, Field, form, Money, num, Panel, Stat, str, uid, type Save } from './ui'

export function Planning({ data, month, save }: { data: Ledger; month: Month; save: Save }) {
  const totals = monthly(data, month)
  const [editingIncome, setEditingIncome] = useState<string | null>(null)
  const [editingFixed, setEditingFixed] = useState<string | null>(null)
  const incomes = data.incomes.filter(i => i.date.startsWith(month))
  const income = incomes.find(i => i.id === editingIncome)
  const fixed = data.fixed.find(i => i.id === editingFixed)
  const fixedCard = data.payments.find(p => p.id === fixed?.cardPaymentId)
  const week = foodWeek(data, month, today())
  const previous = addMonths(month, -1)
  const previousIncome = data.incomes.filter(i => i.date.startsWith(previous))
  const budgets = data.budgets
  const currentBudget = budgetFor(data, month)
  return <div className="stack">
    <div className="stats"><Stat label="家計への収入・負担" value={totals.income} /><Stat label="固定費確保" value={totals.fixed} detail={totals.asset ? `うち資産形成 ${yen(totals.asset)}` : undefined} /><Stat label="未配分" value={totals.unallocated} /><Stat label="貯蓄見込み" value={totals.savingsForecast} /></div>
    <Panel title="給与・臨時収入" description="見込みを先に登録し、給与が確定したら実額を入力します。直接負担分は銀行残高の予測から除きます。">
      <ul className="rows">{incomes.map(item => <li key={item.id}><span><b>{item.label}</b><small>{item.date} ・ {item.route === 'deposit' ? '口座入金' : item.route === 'direct' ? '直接負担' : '負担方法未定'} ・ {item.actual === null ? '見込み' : '確定'}</small></span><Amount value={item.actual ?? item.forecast} /><button className="quiet" onClick={() => setEditingIncome(item.id)}>編集</button></li>)}</ul>
      {incomes.length === 0 && previousIncome.length > 0 && <button className="quiet" onClick={() => save(old => ({
        ...old, incomes: [...old.incomes, ...previousIncome.map(i => ({ ...i, id: uid(), date: onDay(month, Number(i.date.slice(8))), forecast: i.actual ?? i.forecast, actual: null }))],
      }))}>前月の収入を見込みとしてコピー</button>}
      <form key={income?.id ?? month} onSubmit={form(fields => {
        const record: Income = {
          id: income?.id ?? uid(), label: str(fields, 'label'), userId: str(fields, 'user') || undefined,
          date: onDay(month, num(fields, 'day')), forecast: num(fields, 'forecast'), actual: str(fields, 'actual') === '' ? null : num(fields, 'actual'),
          route: str(fields, 'route') as Income['route'], accountId: str(fields, 'account'),
        }
        if (save(old => ({ ...old, incomes: [...old.incomes.filter(i => i.id !== record.id), record] }))) setEditingIncome(null)
      })}>
        <div className="fields">
          <Field label="項目"><input name="label" defaultValue={income?.label} placeholder="給与・臨時収入" required maxLength={100} /></Field>
          <Field label="担当"><select name="user" defaultValue={income?.userId ?? ''}><option value="">共通</option>{data.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
          <Field label="日付（日）"><input type="number" name="day" min="1" max="31" defaultValue={income ? Number(income.date.slice(8)) : 25} required /></Field>
          <Field label="見込み（円）"><Money name="forecast" value={income?.forecast} /></Field>
          <Field label="確定額（空欄は未確定）"><Money name="actual" value={income?.actual} required={false} /></Field>
          <Field label="負担方法"><select name="route" defaultValue={income?.route ?? 'deposit'}><option value="deposit">口座に入金</option><option value="direct">直接負担</option><option value="undecided">未定</option></select></Field>
          <Field label="入金先"><select name="account" defaultValue={income?.accountId ?? 'main'}>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </div>
        <div className="actions"><button className="primary">{income ? '収入を更新' : '収入を追加'}</button>{income && <button type="button" className="quiet" onClick={() => setEditingIncome(null)}>取消</button>}</div>
      </form>
    </Panel>
    <Panel title="生活費の配分" description="予算の配分は支出になりません。お菓子・お酒・外食の予算は他のカテゴリーから移せます。">
      <form key={month + JSON.stringify(currentBudget)} onSubmit={form(fields => {
        const amounts = Object.fromEntries(data.categories.map(c => [c.id, num(fields, c.id)]))
        save(old => ({ ...old, budgets: [...old.budgets.filter(b => b.month !== month), { month, amounts, plannedSavings: num(fields, 'savings') }] }))
      })}>
        <div className="fields">
          {data.categories.map(c => <Field key={c.id} label={c.name}><Money name={c.id} value={totals.budget.amounts[c.id] ?? 0} /></Field>)}
          <Field label="貯蓄予定"><Money name="savings" value={totals.budget.plannedSavings} /></Field>
        </div>
        <div className="actions"><button className="primary">予算を保存</button><button type="button" className="quiet" disabled={!budgets.some(b => b.month === previous)} onClick={() => {
          if (!window.confirm('この月の配分を前月の配分で置き換えますか？')) return
          const plan = budgetFor(data, previous)
          save(old => ({ ...old, budgets: [...old.budgets.filter(b => b.month !== month), { ...plan, month }] }))
        }}>前月予算をコピー</button></div>
      </form>
      {data.categories.map(c => <BudgetRow key={c.id} category={c} cap={totals.budget.amounts[c.id] ?? 0} used={totals.categorySpend[c.id] ?? 0} />)}
      {totals.budget.plannedSavings > totals.savingsForecast && <p className="notice">貯蓄予定の見直し額は <Amount value={totals.budget.plannedSavings - totals.savingsForecast} /> です。</p>}
      {totals.expected < 0 && <p className="notice">今の配分と支出ペースで不足見込みは <Amount value={-totals.expected} /> です。</p>}
    </Panel>
    <Panel title="固定費" description="開始月から終了月まで毎月反映します。引落日が分からない項目は未定のまま登録できます。">
      <ul className="rows">{data.fixed.map(item => <li key={item.id}><span><b>{item.name}</b><small>{item.kind === 'asset' ? '資産形成 ・ ' : ''}{item.dueDay ? `${item.dueDay}日` : '日付未定'}{item.endMonth ? ` ・ ${item.endMonth}まで` : ''}</small></span><Amount value={item.amount} /><button className="quiet" onClick={() => setEditingFixed(item.id)}>編集</button></li>)}</ul>
      <form key={fixed?.id ?? month} onSubmit={form(fields => {
        const record: FixedExpense = {
          id: fixed?.id ?? uid(), name: str(fields, 'name'), amount: num(fields, 'amount'), accountId: str(fields, 'account'),
          cardPaymentId: fixed?.cardPaymentId,
          dueDay: str(fields, 'day') ? num(fields, 'day') : null, startMonth: str(fields, 'start'),
          endMonth: str(fields, 'end') || null, kind: str(fields, 'kind') as FixedExpense['kind'],
        }
        if (save(old => ({ ...old, fixed: [...old.fixed.filter(f => f.id !== record.id), record] }))) setEditingFixed(null)
      })}>
        <div className="fields">
          <Field label="項目"><input name="name" defaultValue={fixed?.name} required maxLength={100} /></Field>
          <Field label="月額（円）"><Money name="amount" value={fixed?.amount} /></Field>
          <Field label="引落日（日）"><input name="day" type="number" min="1" max="31" defaultValue={fixed?.dueDay ?? ''} placeholder="未定" /></Field>
          <Field label="開始月"><input type="month" name="start" defaultValue={fixed?.startMonth || month} required /></Field>
          <Field label="終了月"><input type="month" name="end" defaultValue={fixed?.endMonth ?? ''} /></Field>
          {fixedCard ? <>
            <input type="hidden" name="account" value={fixedCard.accountId} />
            <p className="hint">{fixedCard.name} → {data.accounts.find(a => a.id === fixedCard.accountId)?.name}。変更は「引落口座の設定」から行えます。</p>
          </> : <Field label="口座"><select name="account" defaultValue={fixed?.accountId ?? 'main'}>{data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
          <Field label="種類"><select name="kind" defaultValue={fixed?.kind ?? 'expense'}><option value="expense">固定費</option><option value="asset">資産形成</option></select></Field>
        </div>
        <div className="actions"><button className="primary">{fixed ? '固定費を更新' : '固定費を追加'}</button>{fixed && <button type="button" className="quiet" onClick={() => setEditingFixed(null)}>取消</button>}</div>
      </form>
      <p className="hint">この月の対象 {activeFixed(data, month).length}件</p>
    </Panel>
    <Panel title="今週の食費" description={week.startDate + ' 〜 ' + week.endDate}>
      <div className="stats"><Stat label="週間予算" value={week.allocated} /><Stat label="使用額" value={week.spent} /><Stat label="週間残り" value={week.remaining} /><Stat label="1日あたり" value={week.daily} /></div>
      <p className="hint">週間予算は月間食費の内訳です。1日あたりの目安は、月間の残額を上限に計算します。</p>
    </Panel>
  </div>
}
