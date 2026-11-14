import { useState } from 'react'
import type { Category, Ledger } from './model'
import { expenseRecords, recordAmount } from './expense-records'
import { sum, yen } from './finance'
import { Amount, BudgetRow } from './ui'

export function CategoryDetails({ data, month, category, cap, used }: { data: Ledger; month: string; category: Category; cap: number; used: number }) {
  const [open, setOpen] = useState(false)
  const rows = expenseRecords(data, month, category.id, null, true)
  const region = 'category-details-' + category.id
  return <div className="category-details">
    <button className="budget-detail-toggle" aria-label={category.name + 'の明細を表示'} aria-expanded={open} aria-controls={region} onClick={() => setOpen(value => !value)}><BudgetRow category={category} cap={cap} used={used} /></button>
    {open && <section className="category-detail-list" id={region} aria-label={category.name + 'の明細'}>
      <div className="home-editor-heading"><h3>{category.name}の明細</h3><button className="quiet" aria-label={category.name + 'の明細を閉じる'} onClick={() => setOpen(false)}>閉じる</button></div>
      <p className="hint">{month.replace('-', '年')}月・{rows.length}件・合計 {yen(sum(rows.map(row => recordAmount(row, category.id))))}</p>
      <ul className="rows">{rows.map(row => <li key={row.id}><span><b>{row.merchant}</b><small>{row.date} ・ {data.payments.find(p => p.id === row.paymentId)?.name}</small>{row.memo && <small>{row.memo}</small>}</span><Amount value={recordAmount(row, category.id)} /></li>)}</ul>
      {!rows.length && <p className="empty">この月の明細はありません。</p>}
    </section>}
  </div>
}
