import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accountProjection, activeFixed, annualSummary, cardBills, cashEvents, foodWeek, monthly, subAccountForecast, transactionAmount } from './finance.ts'
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
  ledger.payments[2].accountId = 'annual'
  ledger.fixed.push({ id: 'fixed', name: '通信費', amount: 3500, accountId: 'main', cardPaymentId: 'card', dueDay: null, kind: 'expense', startMonth: '2026-12', endMonth: '2026-12' })
  const [planned] = cashEvents(ledger, '2026-12')
  assert.equal(planned.accountId, 'annual')
  assert.equal(planned.date, null)
  assert.equal(planned.amount, -3500)
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

test('外税は商品を増やさず、カテゴリー予算とカード請求の合計に含める', () => {
  const ledger = starter()
  const receipt: Transaction = {
    ...purchase, externalTax: 44, items: [
      { ...purchase.items[0], amount: 78, discount: 0 },
      { ...purchase.items[0], id: 'salad', amount: 218, discount: 44 },
      { ...purchase.items[0], id: 'third', categoryId: 'daily', amount: 298, discount: 0 },
    ],
  }
  ledger.transactions.push(receipt)
  assert.equal(transactionAmount(receipt), 594)
  assert.equal(cardBills(ledger)[0].amount, 594)
  assert.equal(cardBills(ledger)[0].itemCount, 3)
  assert.deepEqual(monthly(ledger, '2026-12').categorySpend, { food: 272, daily: 322 })
  assert.equal(foodWeek(ledger, '2026-12', receipt.date).spent, 272)
})

test('偶数月の入金、毎月の積立、24か月ごとの費用を織り込み、実績を二重計上しない', () => {
  const ledger = starter()
  ledger.accounts[1].openingBalances['2026-01'] = 30_000
  ledger.annual = [
    { id: 'benefit', label: '手当', kind: 'income', amount: 180_000, accountId: 'annual', schedule: { kind: 'even' } },
    { id: 'asset', label: '積立', kind: 'asset', amount: 120_000, accountId: 'annual', schedule: { kind: 'monthly' } },
    { id: 'inspection', label: '点検', kind: 'expense', amount: 40_000, accountId: 'annual', schedule: { kind: 'cycle', interval: 24, nextMonth: '2026-03' } },
  ]
  ledger.annualActuals = [{ id: 'actual', planId: 'benefit', date: '2026-02-10', amount: 30_000 }]
  const forecast = subAccountForecast(ledger, '2026-01', 3)
  assert.deepEqual(forecast.months.map(m => [m.income, m.expense, m.closing]), [
    [0, 10_000, 20_000], [30_000, 10_000, 40_000], [0, 50_000, -10_000],
  ])
  assert.equal(forecast.required, 40_000)
  assert.equal(forecast.shortage, 10_000)
  assert.equal(annualSummary(ledger, 2026).outflow, 160_000)
  assert.equal(annualSummary(ledger, 2027).outflow, 120_000)
  assert.equal(annualSummary(ledger, 2028).outflow, 160_000)
})
