import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accountProjection, activeFixed, annualSummary, cardBills, cashEvents, foodWeek, monthly } from './finance.ts'
import { starter } from './seed.ts'
import type { Transaction } from './model.ts'

const purchase: Transaction = {
  id: 'purchase', date: '2026-12-20', merchant: '検証用店舗', paymentId: 'card', memo: '', personal: false,
  items: [{ id: 'item', name: '食材', categoryId: 'food', amount: 4200, discount: 200, quantity: 1 }],
}

test('予算配分は支出にせず、給与確定と固定費終了を計算する', () => {
  const ledger = starter()
  ledger.defaultBudget = { food: 32_000, daily: 12_000 }
  ledger.incomes = [
    { id: 'pay-a', label: '給与', date: '2026-12-25', forecast: 100_000, actual: 99_000, route: 'deposit', accountId: 'main' },
    { id: 'pay-b', label: '負担', date: '2026-12-25', forecast: 20_000, actual: null, route: 'direct', accountId: 'main' },
  ]
  ledger.fixed = [{ id: 'fixed', name: 'ローン', amount: 60_000, accountId: 'main', dueDay: 15, kind: 'expense', startMonth: '2026-01', endMonth: '2026-12' }]
  const totals = monthly(ledger, '2026-12')
  assert.equal(totals.income, 119_000)
  assert.equal(totals.fixed, 60_000)
  assert.equal(totals.allocated, 44_000)
  assert.equal(totals.spent, 0)
  assert.equal(totals.plan, 15_000)
  assert.equal(activeFixed(ledger, '2027-01').length, 0)
  const events = cashEvents(ledger, '2026-12')
  assert.equal(events.some(e => e.id === 'pay-b'), false)
  const main = { ...ledger.accounts[0], openingBalances: { '2026-12': 10_000 } }
  assert.equal(accountProjection(main, events, '2026-12').required, 50_000)
})

test('カードの締め日・返金・引落確認は利用月の支出を二重計上しない', () => {
  const ledger = starter()
  ledger.payments[2].closingDay = 15
  ledger.transactions.push(purchase, {
    ...purchase, id: 'refund', date: '2026-12-21',
    items: [{ ...purchase.items[0], amount: -500, discount: 0 }],
  }, { ...purchase, id: 'personal', personal: true })
  const [bill] = cardBills(ledger)
  assert.equal(bill.date, '2027-02-27')
  assert.equal(bill.amount, 7500)
  assert.equal(monthly(ledger, '2026-12').spent, 3500)
  assert.equal(monthly(ledger, '2027-02').spent, 0)
  ledger.settled.push(bill.id)
  const [debit] = cashEvents(ledger, '2027-02')
  assert.equal(debit.amount, -7500)
  assert.equal(debit.paid, true)
  assert.equal(monthly(ledger, '2026-12').spent, 3500)
})

test('口座間移動と資産形成は消費額に加算されない', () => {
  const ledger = starter()
  ledger.transfers.push({ id: 'transfer', date: '2026-12-23', from: 'main', to: 'annual', amount: 5000, completed: true, purpose: 'savings' })
  ledger.annual.push(
    { id: 'bonus', label: '賞与', kind: 'income', amount: 150_000, accountId: 'annual' },
    { id: 'asset', label: '積立', kind: 'asset', amount: 20_000, accountId: 'annual' },
  )
  assert.equal(monthly(ledger, '2026-12').spent, 0)
  assert.equal(monthly(ledger, '2026-12').savingsActual, 5000)
  assert.equal(cashEvents(ledger, '2026-12').reduce((sum, e) => sum + e.amount, 0), 0)
  assert.equal(annualSummary(ledger, 2026).surplus, 130_000)
  assert.equal(annualSummary(ledger, 2026).asset, 20_000)
})

test('固定費をカードで払った場合は登録した引落だけを資金繰りに入れる', () => {
  const ledger = starter()
  ledger.fixed.push({ id: 'fixed', name: '通信費', amount: 3500, accountId: 'main', dueDay: 20, kind: 'expense', startMonth: '2026-12', endMonth: '2026-12' })
  ledger.transactions.push({ ...purchase, fixedExpenseId: 'fixed' })
  assert.equal(monthly(ledger, '2026-12').spent, 0)
  assert.equal(monthly(ledger, '2026-12').fixed, 3500)
  assert.equal(monthly(ledger, '2026-12').expected, -4000)
  assert.equal(cashEvents(ledger, '2026-12').length, 0)
  assert.equal(cashEvents(ledger, '2027-01')[0]?.amount, -4000)
})

test('月をまたぐ週を月ごとに分けて、月間食費と一致する', () => {
  const ledger = starter()
  ledger.defaultBudget = { food: 10_000 }
  const weeks = [1, 7, 14, 21, 28].map(day => foodWeek(ledger, '2026-12', `2026-12-${String(day).padStart(2, '0')}`))
  assert.equal(weeks.at(-1)?.endDate, '2026-12-31')
  assert.equal(weeks.reduce((total, week) => total + week.allocated, 0), 10_000)
})
