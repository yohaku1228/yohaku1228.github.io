import { useState } from 'react'
import { addMonths, annualPlanAmount, annualSummary, monthIndex, monthOf, onDay, subAccountForecast, sum, today, yen } from './finance'
import type { AnnualBudget, Ledger, Month } from './model'
import { Amount, Field, form, Money, num, Panel, Stat, str, uid, type Save } from './ui'

const descriptions = { monthly: '毎月', even: '偶数月', yearly: '年1回', cycle: '複数月ごと' }
const starterItems = [
  { label: 'ボーナス', kind: 'income', amount: 0 },
  { label: '児童手当', kind: 'income', amount: 0, schedule: { kind: 'even' } },
  { label: '固定資産税', kind: 'expense', amount: 0 },
  { label: '保険料', kind: 'expense', amount: 0 },
  { label: '車検', kind: 'expense', amount: 0, schedule: { kind: 'cycle', interval: 24 } },
  { label: '学童費', kind: 'expense', amount: 0, schedule: { kind: 'monthly' } },
  { label: 'NISA', kind: 'asset', amount: 0, schedule: { kind: 'monthly' } },
] satisfies Pick<AnnualBudget, 'label' | 'kind' | 'amount' | 'schedule'>[]

export function SubAccount({ data, month, save }: { data: Ledger; month: Month; save: Save }) {
  const year = Number(month.slice(0, 4))
  const annual = annualSummary(data, year)
  const forecast = subAccountForecast(data, month)
  const [draft, edit] = useState<AnnualBudget | null>(null)
  const [frequency, setFrequency] = useState('manual')
  const [actualId, selectActual] = useState<string | null>(null)
  const [version, bump] = useState(0)
  const actuals = data.annualActuals.filter(row => row.date.startsWith(String(year)))
  const realAmount = (id: string) => sum(actuals.filter(row => row.planId === id).map(row => row.amount))
  const selectedActual = annual.plans.find(p => p.id === actualId)
  const undated = annual.plans.filter(p => !p.schedule || (p.schedule.kind === 'cycle' && !p.schedule.nextMonth))
  const undatedAmount = (kind: 'income' | 'expense') => sum(undated.filter(p => kind === 'income' ? p.kind === 'income' : p.kind !== 'income')
    .map(p => Math.max(0, p.amount - realAmount(p.id))))
  function start(item?: AnnualBudget) {
    const next = item ?? { id: uid(), label: '', kind: 'expense', amount: 0, accountId: 'annual' }
    edit(next)
    setFrequency(next.schedule?.kind ?? 'manual')
    requestAnimationFrame(() => document.getElementById('sub-plan-form')?.scrollIntoView({ block: 'nearest' }))
  }
  function openActual(plan: AnnualBudget) {
    selectActual(plan.id)
    requestAnimationFrame(() => document.getElementById('sub-actual-form')?.scrollIntoView({ block: 'nearest' }))
  }
  return <div className="stack">
    <Panel title="入金・支払いを記録" description="ボーナスや児童手当が入った日、学童費などを支払った日に記録します。予定とは別に集計します。">
      <div className="actions">{annual.plans.map(plan => <button key={plan.id} className={actualId === plan.id ? 'primary' : 'quiet'} onClick={() => openActual(plan)}>{plan.label}{plan.kind === 'income' ? 'の入金' : 'の支払い'}</button>)}</div>
      {!annual.plans.length && <p className="empty">下の「年間・繰り返しの予定」で項目を追加すると、ここから記録できます。</p>}
      {selectedActual && <form id="sub-actual-form" key={month + selectedActual.id + version} onSubmit={form(fields => {
        if (save(old => ({
          ...old, annualActuals: [...old.annualActuals, { id: uid(), planId: selectedActual.id, date: str(fields, 'date'), amount: num(fields, 'amount') }],
        }))) bump(v => v + 1)
      })}>
        <div className="fields"><Field label={selectedActual.kind === 'income' ? '入金日' : '支払日'}><input type="date" name="date" defaultValue={monthOf(today()) === month ? today() : onDay(month, 1)} min={`${year}-01-01`} max={`${year}-12-31`} required /></Field>
          <Field label="実際の金額"><Money name="amount" /></Field></div>
        <button className="primary">{selectedActual.label}を記録</button>
      </form>}
      {actuals.length > 0 && <details open><summary>{year}年の記録（{actuals.length}件）</summary>
        <ul className="rows">{[...actuals].sort((a, b) => b.date.localeCompare(a.date)).map(row => {
          const plan = data.annual.find(p => p.id === row.planId)
          return <li key={row.id}><span><b>{plan?.label}</b><small>{row.date} ・ {plan?.kind === 'income' ? '入金' : '支払'}</small></span><Amount value={row.amount} /><button className="quiet negative" onClick={() => {
            if (window.confirm('この入出金記録を削除しますか？')) save(old => ({ ...old, annualActuals: old.annualActuals.filter(item => item.id !== row.id) }))
          }}>削除</button></li>
        })}</ul>
      </details>}
    </Panel>
    <Panel title="いくら残しておけばいい？" description="選択した月の月初を起点に、日程がある入出金を今後24か月分見込みます。月内は入金より先に支払う想定です。">
      <div className="stats"><Stat label="この月の月初に必要な残高" value={forecast.required} /><Stat label="実残高に対する不足見込み" value={forecast.shortage} /></div>
      <form key={month + String(forecast.opening)} onSubmit={form(fields => save(old => ({
        ...old, accounts: old.accounts.map(a => a.id === 'annual' ? { ...a, openingBalances: { ...a.openingBalances, [month]: num(fields, 'opening') } } : a),
      })))}>
        <div className="fields"><Field label={month + ' の月初実残高'}><Money name="opening" value={forecast.opening} negative /></Field></div>
        <button className="quiet">サブ口座の残高を保存</button>
      </form>
      {(undatedAmount('income') > 0 || undatedAmount('expense') > 0) && <p className="notice">日程未定の残りは必要残高に未反映です。{year}年の入金 {yen(undatedAmount('income'))} ／ 支払い {yen(undatedAmount('expense'))}</p>}
      <details><summary>月ごとの入出金と残高を見る</summary><ul className="rows">{forecast.months.map(row => <li key={row.month}><span><b>{row.month}</b><small>入金 {yen(row.income)} ・ 支払 {yen(row.expense)}</small></span><span>{row.closing === null ? '残高未設定' : <Amount value={row.closing} />}</span></li>)}</ul></details>
    </Panel>
    <Panel title="年間・繰り返しの予定" description="年額と支払頻度を設定します。車検などは1回分の金額と次の支払月を入れます。">
      <div className="stats"><Stat label={year + '年の入金予定'} value={annual.income} /><Stat label="支払・積立予定" value={annual.outflow} detail={`うち積立 ${yen(annual.asset)}`} /></div>
      <ul className="rows">{annual.plans.map(plan => {
        const rule = plan.schedule
        const cycle = rule?.kind === 'cycle' ? rule : undefined
        let next = cycle?.nextMonth
        if (cycle && next && next < month) next = addMonths(next, Math.ceil((monthIndex(month) - monthIndex(next)) / cycle.interval) * cycle.interval)
        const regular = rule?.kind === 'monthly' || rule?.kind === 'even'
        const timing = cycle ? `${cycle.interval}か月ごと ・ ${next ? '次回 ' + next : '次回月未定'}` : rule?.kind === 'yearly'
          ? `毎年${rule.month}月` : regular ? `${descriptions[rule.kind]} ${yen(plan.amount / (rule.kind === 'monthly' ? 12 : 6))}` : '時期未定'
        return <li key={plan.id}><span><b>{plan.label}</b><small>{plan.kind === 'asset' ? '積立 ・ ' : ''}{timing}</small>
          <small>{cycle ? `1回 ${yen(plan.amount)} ・ 月割り積立目安 ${yen(Math.ceil(plan.amount / cycle.interval))}` : `年間実績 ${yen(realAmount(plan.id))}`}</small></span>
          <Amount value={annualPlanAmount(plan, year)} /><button className="quiet" onClick={() => start(plan)}>編集</button></li>
      })}</ul>
      <div className="actions"><button className="quiet" onClick={() => start()}>＋ 項目を追加</button>
        {starterItems.filter(item => !annual.plans.some(p => p.label.includes(item.label))).map(item => <button key={item.label} className="quiet" onClick={() => start({ ...item, id: uid(), accountId: 'annual' })}>＋ {item.label}</button>)}</div>
      {draft && <form id="sub-plan-form" key={draft.id} onSubmit={form(fields => {
        let schedule: AnnualBudget['schedule']
        if (frequency === 'monthly' || frequency === 'even') schedule = { kind: frequency }
        if (frequency === 'yearly') schedule = { kind: 'yearly', month: num(fields, 'dueMonth') }
        if (frequency === 'cycle') schedule = { kind: 'cycle', nextMonth: str(fields, 'next') || undefined, interval: num(fields, 'interval') }
        const times = frequency === 'monthly' ? 12 : frequency === 'even' ? 6 : 1
        const item: AnnualBudget = { ...draft, label: str(fields, 'label'), kind: str(fields, 'kind') as AnnualBudget['kind'],
          amount: num(fields, 'amount') * times, schedule, endYear: str(fields, 'end') ? num(fields, 'end') : undefined }
        if (save(old => ({
          ...old, annual: old.annual.some(p => p.id === item.id) ? old.annual.map(p => p.id === item.id ? item : p) : [...old.annual, item],
        }))) edit(null)
      })}>
        <div className="fields">
          <Field label="項目"><input name="label" defaultValue={draft.label} required maxLength={100} /></Field>
          <Field label="区分"><select name="kind" defaultValue={draft.kind}><option value="income">入金</option><option value="expense">支払い</option><option value="asset">積立</option></select></Field>
          <Field label="頻度"><select value={frequency} onChange={event => setFrequency(event.target.value)}><option value="manual">年額のみ・時期未定</option><option value="monthly">毎月</option><option value="even">偶数月</option><option value="yearly">年1回・月を指定</option><option value="cycle">複数月ごと（車検など）</option></select></Field>
          <Field label={frequency === 'cycle' || frequency === 'monthly' || frequency === 'even' ? '1回の金額' : '年間金額'}><Money key={frequency} name="amount" value={draft.amount ? Math.round(draft.amount / (draft.schedule?.kind === 'monthly' ? 12 : draft.schedule?.kind === 'even' ? 6 : 1)) : undefined} /></Field>
          {frequency === 'yearly' && <Field label="毎年何月"><input type="number" name="dueMonth" min="1" max="12" defaultValue={draft.schedule?.kind === 'yearly' ? draft.schedule.month : undefined} required /></Field>}
          {frequency === 'cycle' && <><Field label="次回の支払月"><input type="month" name="next" defaultValue={draft.schedule?.kind === 'cycle' ? draft.schedule.nextMonth : undefined} /></Field><Field label="何か月ごと"><input type="number" name="interval" min="2" max="60" defaultValue={draft.schedule?.kind === 'cycle' ? draft.schedule.interval : 24} required /></Field></>}
          <Field label="終了年（任意）"><input name="end" type="number" min="2000" max="2099" defaultValue={draft.endYear} /></Field>
        </div>
        <div className="actions"><button className="primary">予定を保存</button><button type="button" className="quiet" onClick={() => edit(null)}>取消</button></div>
      </form>}
    </Panel>
  </div>
}
