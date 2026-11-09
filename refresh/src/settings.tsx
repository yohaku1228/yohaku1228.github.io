import { useState } from 'react'
import { addMonths, activeFixed, annualSummary, monthly, onDay, sum, yen } from './finance'
import type { Ledger, Month } from './model'
import { backup, download, inspectImport, useLedger } from './storage'
import { Amount, BudgetRow, Field, form, num, Panel, Stat, str, uid, type Save } from './ui'

export function Settings({ data, month, save }: { data: Ledger; month: Month; save: Save }) {
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<ReturnType<typeof inspectImport> | null>(null)
  const [editing, edit] = useState<string | null>(null)
  const category = data.categories.find(c => c.id === editing)
  function exportLedger() {
    download('家計とカード-バックアップ.json', JSON.stringify(backup(data), null, 2), 'application/json')
  }
  function exportCsv() {
    const cell = (value: string | number) => {
      if (typeof value === 'number') return String(value)
      const safe = /^[\t\r\n\s]*[=+@-]/.test(value) ? "'" + value : value
      return '"' + safe.replaceAll('"', '""') + '"'
    }
    const rows = data.transactions.flatMap(t => t.items.map(i => [
      t.date, t.merchant, i.name, data.categories.find(c => c.id === i.categoryId)?.name ?? '',
      i.quantity, i.amount, i.discount, data.payments.find(p => p.id === t.paymentId)?.name ?? '', t.personal ? '個人' : '共通', t.memo,
    ]))
    const csv = [['日付', '店舗', '品名', 'カテゴリー', '数量', '金額', '割引', '支払方法', '負担区分', 'メモ'], ...rows]
    download('家計とカード-支出明細.csv', '\uFEFF' + csv.map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8')
  }
  return <div className="stack">
    <Panel title="保存とデータ移行" description="このレビュー版のデータは、この端末のブラウザーに保存されます。">
      <div className="actions"><button className="primary" onClick={exportLedger}>JSONバックアップ</button><button className="quiet" onClick={exportCsv}>支出をCSV出力</button></div>
      <Field label="バックアップ・初期設定ファイルを選ぶ"><input type="file" accept=".json,application/json" onChange={async event => {
        const input = event.currentTarget
        const file = input.files?.[0]
        setPreview(null)
        setStatus('')
        try {
          if (!file) return
          if (file.size > 15_000_000) throw new Error('15MB以下のJSONファイルを選んでください。')
          setPreview(inspectImport(JSON.parse(await file.text())))
        } catch (error) { setStatus(error instanceof Error ? error.message : 'ファイルを読み込めません。') }
        finally { input.value = '' }
      }} /></Field>
      {preview?.type === 'legacy' && <p className="notice">旧バックアップを確認しました。家計 {preview.months}か月、楽天明細 {preview.transactions}件。元のファイルを保管してください。</p>}
      {preview?.type === 'backup' && <div className="notice">
        <p>家計「{preview.ledger.household.name}」 ・ 月別予算 {preview.ledger.budgets.length}件 ・ 支出 {preview.ledger.transactions.length}件</p>
        <button className="quiet" onClick={() => {
          if (!window.confirm('この端末の現在のデータをバックアップで置き換えますか？ 現在のデータもファイルに書き出します。')) return
          exportLedger()
          if (save(() => preview.ledger)) { setPreview(null); setStatus('復元しました。') }
        }}>現在のデータを退避して復元</button>
      </div>}
      {preview?.type === 'plan' && <div className="notice">
        <p>{month}の収入・負担 {yen(sum(preview.plan.incomes.map(i => i.amount)))} ・ 固定費 {yen(sum(preview.plan.fixed.map(f => f.amount)))} ・ 生活費配分 {yen(sum(Object.values(preview.plan.budget)))}</p>
        <button className="quiet" onClick={() => {
          const plan = preview.plan
          if (save(old => {
            if (old.fixed.length || old.annual.length || old.budgets.length || old.incomes.length || Object.keys(old.defaultBudget).length) {
              throw new Error('初期設定は、給与・予算・固定費・年次計画が空のときに読み込めます。')
            }
            return {
              ...old, defaultBudget: plan.budget, fixed: plan.fixed.map(f => ({
                ...f, startMonth: f.startMonth || (f.endMonth && f.endMonth < month ? f.endMonth : month),
              })),
              budgets: [{ month, amounts: plan.budget, plannedSavings: 0 }], annual: plan.annual, milestones: plan.milestones,
              incomes: plan.incomes.map(i => ({
                id: uid(), label: (old.users.find(u => u.id === i.userId)?.name ?? '') + 'の給与・負担',
                userId: i.userId, date: onDay(month, 25), forecast: i.amount, actual: null, route: i.route, accountId: 'main',
              })),
            }
          })) { setPreview(null); setStatus('初期設定を読み込みました。') }
        }}>この月から使う</button>
      </div>}
      {status && <p role="status" className="hint">{status}</p>}
    </Panel>
    <Panel title="カテゴリーと色">
      <ul className="rows">{data.categories.map(c => <li key={c.id}><b className="category"><i style={{ background: c.color }} />{c.name}</b><button className="quiet" onClick={() => edit(c.id)}>編集</button></li>)}</ul>
      <form key={category?.id ?? data.categories.length} onSubmit={form(fields => {
        const item = { id: category?.id ?? uid(), name: str(fields, 'name'), color: str(fields, 'color'), allowance: category?.allowance }
        if (save(old => ({ ...old, categories: category ? old.categories.map(c => c.id === item.id ? item : c) : [...old.categories, item] }))) edit(null)
      })}>
        <div className="fields"><Field label="カテゴリー名"><input name="name" defaultValue={category?.name} maxLength={100} required /></Field>
          <Field label="表示色"><input name="color" type="color" defaultValue={category?.color ?? '#287b51'} /></Field></div>
        <div className="actions"><button className="primary">{category ? 'カテゴリーを更新' : 'カテゴリーを追加'}</button>{category && <button type="button" className="quiet" onClick={() => edit(null)}>取消</button>}</div>
      </form>
    </Panel>
    <Panel title="家計の基本設定">
      <form onSubmit={form(fields => save(old => ({ ...old, household: { ...old.household, name: str(fields, 'name'), size: num(fields, 'size') } })))}>
        <div className="fields"><Field label="表示名"><input name="name" defaultValue={data.household.name} maxLength={100} required /></Field><Field label="家族の人数"><input name="size" type="number" min="1" max="30" defaultValue={data.household.size} required /></Field></div>
        <div className="actions"><button className="primary">設定を保存</button></div>
      </form>
      <p className="hint">iPhoneのSafariから共有メニューを開き、「ホーム画面に追加」を選びます。</p>
    </Panel>
  </div>
}

export function Analysis({ data, month }: { data: Ledger; month: Month }) {
  const totals = monthly(data, month)
  const previous = monthly(data, addMonths(month, -1))
  const year = Number(month.slice(0, 4))
  const annual = annualSummary(data, year)
  const periods = Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)).map(m => ({ month: m, spent: monthly(data, m).spent }))
  const max = Math.max(1, ...periods.map(p => p.spent))
  const loans = data.fixed.filter(f => f.endMonth && f.endMonth >= month).sort((a, b) => a.endMonth!.localeCompare(b.endMonth!))
  const monthNumber = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5))
  return <div className="stack">
    <div className="stats"><Stat label="生活費 前月比" value={totals.spent - previous.spent} /><Stat label="貯蓄実績（純額）" value={totals.savingsActual} /><Stat label="サブ口座 年間黒字見込み" value={annual.surplus} /></div>
    <Panel title="生活費の推移" description="購入月で集計。カード引落と口座移動は含めません。">
      <div className="bars">{periods.map(period => <div key={period.month}><span>{period.month.slice(5)}月</span><meter min="0" max={max} value={Math.max(0, period.spent)} aria-label={period.month + 'の生活費'} /><Amount value={period.spent} /></div>)}</div>
    </Panel>
    <Panel title="カテゴリー別">
      {data.categories.map(c => <BudgetRow key={c.id} category={c} cap={totals.budget.amounts[c.id] ?? 0} used={totals.categorySpend[c.id] ?? 0} />)}
    </Panel>
    <Panel title="完済後の家計シミュレーション" description="選択月の収入と予算を基準に、各費用が終了した翌月の予定黒字を計算します。">
      <ul className="rows">{loans.map(item => {
        const after = addMonths(item.endMonth!, 1)
        const surplus = totals.income - totals.allocated - sum(activeFixed(data, after).map(f => f.amount))
        return <li key={item.id}><span><b>{item.name} 完済後</b><small>{after}から ・ 完済まで {monthNumber(item.endMonth!) - monthNumber(month)}か月</small></span><Amount value={surplus} /></li>
      })}
      {data.milestones.filter(m => m.annualBudgetId).map(m => {
        const cost = annual.plans.find(p => p.id === m.annualBudgetId && p.kind !== 'income')?.amount ?? 0
        return <li key={m.id}><span><b>{m.label}後の年間黒字</b><small>終了時期は年間計画で調整できます</small></span><Amount value={annual.surplus + cost} /></li>
      })}</ul>
      {loans.length === 0 && !data.milestones.some(m => m.annualBudgetId) && <p className="empty">固定費に終了月を設定すると、ここに表示されます。</p>}
    </Panel>
  </div>
}

export function ErrorNotice() {
  const error = useLedger(s => s.error)
  const report = useLedger(s => s.report)
  return error ? <div className="error" role="alert"><span>{error}</span><button className="quiet" onClick={() => report('')}>閉じる</button></div> : null
}
