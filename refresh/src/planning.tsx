import { useState } from 'react'
import { activeFixed, addMonths, budgetFor, foodWeek, monthly, onDay, today, yen } from './finance'
import type { FixedExpense, Income, Ledger, Month } from './model'
import { Amount, BudgetRow, Field, form, Money, num, Panel, Stat, str, SwipeRow, uid, type Save } from './ui'

export function Planning({ data, month, save, section, openBudget }: {
  data: Ledger; month: Month; save: Save; section: 'income' | 'fixed' | 'budget'; openBudget?: () => void
}) {
  const totals = monthly(data, month)
  const [editingIncome, setEditingIncome] = useState<string | null>(null)
  const [editingFixed, setEditingFixed] = useState<string | null>(null)
  const [allocatedDraft, setAllocatedDraft] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const incomes = data.incomes.filter(i => i.date.startsWith(month))
  const income = incomes.find(i => i.id === editingIncome)
  const fixed = data.fixed.find(i => i.id === editingFixed)
  const fixedCard = data.payments.find(p => p.id === fixed?.cardPaymentId)
  const week = foodWeek(data, month, today())
  const previous = addMonths(month, -1)
  const previousIncome = data.incomes.filter(i => i.date.startsWith(previous) && (i.route === 'deposit' || i.route === 'budget'))
  const budgets = data.budgets
  const currentBudget = budgetFor(data, month)
  const reserve = editingIncome === 'reserve' || income?.route === 'reserve'
  const parent = editingIncome === 'salary-a' ? data.users[0] : editingIncome === 'salary-b' ? data.users[1] : undefined
  const salary = editingIncome === 'salary-a' || editingIncome === 'salary-b' || /^(?:(?:パパ|ママ|夫|妻)の)?給与$/.test(income?.label ?? '')
  const fixedLabel = reserve ? income?.label ?? '予備費' : salary ? income?.label ?? '給与' : undefined
  const parentName = (id: string) => id === data.users[0]?.id ? 'パパ' : id === data.users[1]?.id ? 'ママ' : '共通'
  const available = totals.income - totals.fixed
  const unassigned = available - (allocatedDraft ?? totals.allocated + currentBudget.plannedSavings)
  function openIncome(id: string) {
    setEditingIncome(id)
    requestAnimationFrame(() => document.getElementById('income-form')?.scrollIntoView({ block: 'nearest' }))
  }
  function openFixed(id: string) {
    setEditingFixed(id)
    requestAnimationFrame(() => document.getElementById('fixed-form')?.scrollIntoView({ block: 'nearest' }))
  }
  function removeIncome(item: Income) {
    if (!window.confirm(`${item.label} ${yen(item.actual ?? item.forecast)} を削除しますか？`)) return
    if (save(old => ({ ...old, incomes: old.incomes.filter(row => row.id !== item.id) })) && editingIncome === item.id) {
      setEditingIncome(null)
    }
  }
  return <div className="stack">
    {section === 'income' && <Panel title="今月の給与・予備費" description="パパとママの給与見込みと、今月の生活費に回す予備費を入れます。">
      <div className="stats"><Stat label="今月の収入（見込みを含む）" value={totals.income} /><Stat label="確定した収入" value={incomes.reduce((total, item) => total + (item.actual ?? 0), 0)} /></div>
      {incomes.length > 0 ? <>
        <p className="hint">左にスワイプ、または「…」で削除できます。</p>
        <ul className="rows">{incomes.map(item => <SwipeRow key={item.id} label={item.label} onRemove={() => removeIncome(item)}>
          <span><b>{item.label.replace(/^(夫|妻)の給与$/, match => match.startsWith('夫') ? 'パパの給与' : 'ママの給与')}{item.userId && !/の給与$/.test(item.label) && `（${parentName(item.userId)}）`}</b><small>{item.route === 'reserve' ? '今月の予算に充当' : item.actual === null ? '見込み' : '確定'}</small></span>
          <Amount value={item.actual ?? item.forecast} /><button className="quiet" onClick={() => openIncome(item.id)}>編集</button>
        </SwipeRow>)}</ul>
      </> : <p className="empty">この月の収入はまだありません。</p>}
      {!editingIncome && <div className="picker-row"><Field label="収入を追加">
        <select value="" onChange={event => openIncome(event.target.value)}>
          <option value="" disabled>収入の種類を選ぶ</option>
          <option value="salary-a">パパの給与</option><option value="salary-b">ママの給与</option>
          <option value="reserve">予備費</option><option value="new">その他の収入</option>
        </select>
      </Field></div>}
      <div className="actions">
        {!editingIncome && incomes.length === 0 && previousIncome.length > 0 && <button className="quiet" onClick={() => save(old => {
          if (old.incomes.some(item => item.date.startsWith(month))) return old
          return { ...old, incomes: [...old.incomes, ...previousIncome.map(i => ({ ...i, id: uid(), date: onDay(month, 1), route: 'budget' as const, forecast: i.actual ?? i.forecast, actual: null }))] }
        })}>前月の収入をコピー</button>}
      </div>
      {editingIncome && <form id="income-form" key={editingIncome} onSubmit={form(fields => {
        const record: Income = {
          id: income?.id ?? uid(), label: fixedLabel ?? str(fields, 'label'), userId: parent?.id ?? (str(fields, 'user') || undefined),
          date: income?.date ?? onDay(month, 1), forecast: num(fields, 'forecast'), actual: str(fields, 'actual') === '' ? null : num(fields, 'actual'),
          route: income?.route ?? (reserve ? 'reserve' : 'budget'), accountId: income?.accountId ?? 'main',
        }
        const duplicate = incomes.some(item => item.id !== record.id && item.userId === record.userId &&
          item.label.normalize('NFKC') === record.label.normalize('NFKC') &&
          (item.actual ?? item.forecast) === (record.actual ?? record.forecast))
        if (duplicate && !window.confirm('今月に同じ項目・金額の収入があります。もう1件保存しますか？')) return
        if (save(old => ({ ...old, incomes: [...old.incomes.filter(i => i.id !== record.id), record] }))) setEditingIncome(null)
      })}>
        {fixedLabel && <h3>{parent ? parentName(parent.id) + 'の給与' : fixedLabel}</h3>}
        <div className="fields">
          {!fixedLabel && <Field label="項目"><input name="label" defaultValue={income?.label ?? ''} required maxLength={100} /></Field>}
          {reserve ? <Field label="今月使う金額（円）"><Money name="forecast" value={income?.forecast} /></Field> : <>
          {!parent && <Field label="誰の収入"><select name="user" defaultValue={income?.userId ?? ''}><option value="">共通</option>{data.users.map(u => <option key={u.id} value={u.id}>{parentName(u.id)}</option>)}</select></Field>}
          <Field label="見込み（円）"><Money name="forecast" value={income?.forecast} /></Field>
          <Field label="確定額（空欄は未確定）"><Money name="actual" value={income?.actual} required={false} /></Field>
          </>}
        </div>
        <div className="actions"><button className="primary">{income ? '収入を更新' : '収入を保存'}</button><button type="button" className="quiet" onClick={() => setEditingIncome(null)}>取消</button></div>
      </form>}
    </Panel>}
    {section !== 'income' && <div className="stack" hidden={section !== 'budget'}>
    <div className="stats"><Stat label="変動費に使える額" value={available} /><Stat label={unassigned < 0 ? '配分オーバー' : 'あと配分できる額'} value={Math.abs(unassigned)} /></div>
    <Panel title="変動費を配分する" description="同じ月の予算は、金額を変えて保存し直せます。">
      <form key={month + JSON.stringify(currentBudget)} onInput={event => {
        const fields = new FormData(event.currentTarget)
        setAllocatedDraft(data.categories.reduce((total, category) => total + num(fields, category.id), num(fields, 'savings')))
      }} onSubmit={form(fields => {
        const amounts = Object.fromEntries(data.categories.map(c => [c.id, num(fields, c.id)]))
        if (save(old => ({
          ...old,
          categories: renaming ? old.categories.map(category => ({ ...category, name: str(fields, 'category-name:' + category.id) })) : old.categories,
          budgets: [...old.budgets.filter(b => b.month !== month), { month, amounts, plannedSavings: num(fields, 'savings') }],
        }))) {
          setAllocatedDraft(null)
          setRenaming(false)
        }
      })}>
        <div className="fields">
          {data.categories.map(c => <Field key={c.id} label={c.name}><Money name={c.id} value={totals.budget.amounts[c.id] ?? 0} /></Field>)}
          <Field label="貯蓄予定"><Money name="savings" value={totals.budget.plannedSavings} /></Field>
        </div>
        {renaming && <fieldset className="budget-names">
          <legend>変動費の項目名</legend>
          <p className="hint">変更した名前はホームや過去の明細にも反映されます。</p>
          <div className="fields">{data.categories.map(category => <Field key={category.id} label={category.name + 'の名前'}>
            <input name={'category-name:' + category.id} defaultValue={category.name} required maxLength={100} />
          </Field>)}</div>
          <button type="button" className="quiet" onClick={() => setRenaming(false)}>名前の変更を取り消す</button>
        </fieldset>}
        <div className="actions"><button className="primary">予算を保存</button>
        {!renaming && <button type="button" className="quiet" onClick={() => setRenaming(true)}>項目名を変更</button>}
        <button type="button" className="quiet" disabled={renaming || !budgets.some(b => b.month === previous)} onClick={() => {
          if (!window.confirm('この月の配分を前月の配分で置き換えますか？')) return
          const plan = budgetFor(data, previous)
          if (save(old => ({ ...old, budgets: [...old.budgets.filter(b => b.month !== month), { ...plan, month }] }))) setAllocatedDraft(null)
        }}>前月予算をコピー</button></div>
      </form>
      {data.categories.map(c => <BudgetRow key={c.id} category={c} cap={totals.budget.amounts[c.id] ?? 0} used={totals.categorySpend[c.id] ?? 0} />)}
      {totals.budget.plannedSavings > totals.savingsForecast && <p className="notice">貯蓄予定の見直し額は <Amount value={totals.budget.plannedSavings - totals.savingsForecast} /> です。</p>}
      {totals.expected < 0 && <p className="notice">今の配分と支出ペースで不足見込みは <Amount value={-totals.expected} /> です。</p>}
    </Panel>
    <Panel title="今週の食費" description={week.startDate + ' 〜 ' + week.endDate}>
      <div className="stats"><Stat label="週間予算" value={week.allocated} /><Stat label="使用額" value={week.spent} /><Stat label="週間残り" value={week.remaining} /><Stat label="1日あたり" value={week.daily} /></div>
      <p className="hint">週間予算は月間食費の内訳です。1日あたりの目安は、月間の残額を上限に計算します。</p>
    </Panel>
    </div>}
    {section !== 'income' && <div hidden={section !== 'fixed'}><Panel title="固定費" description="登録した期間だけ毎月の予算に反映します。支払いが終わったら「編集」で終了月を入力します。">
      <div className="stats"><Stat label="今月の固定費" value={totals.fixed} detail={totals.asset ? `うち積立 ${yen(totals.asset)}` : undefined} /></div>
      <ul className="rows">{data.fixed.map(item => <li key={item.id}><span><b>{item.name}</b><small>{item.kind === 'asset' ? '積立 ・ ' : ''}{item.dueDay ? `${item.dueDay}日` : '引落日なし'}{item.endMonth ? ` ・ ${item.endMonth}まで` : ''}</small></span><Amount value={item.amount} /><button className="quiet" onClick={() => openFixed(item.id)}>編集</button></li>)}</ul>
      {!editingFixed && <div className="actions"><button className="quiet" onClick={() => openFixed('new')}>＋ 固定費を追加</button>
        <button className="primary" onClick={openBudget}>変動費を配分</button></div>}
      {editingFixed && <form id="fixed-form" key={editingFixed} onSubmit={form(fields => {
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
        <div className="actions"><button className="primary">{fixed ? '固定費を更新' : '固定費を保存'}</button><button type="button" className="quiet" onClick={() => setEditingFixed(null)}>取消</button></div>
      </form>}
      <p className="hint">この月の対象 {activeFixed(data, month).length}件</p>
    </Panel></div>}
  </div>
}
