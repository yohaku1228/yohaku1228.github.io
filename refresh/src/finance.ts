import type { Account, AnnualBudget, Budget, Day, Ledger, Month, PaymentMethod, Transaction, Yen } from './model.ts'

export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
export const yen = (value: Yen) => `${value.toLocaleString('ja-JP')}円`
export const pad = (n: number) => String(n).padStart(2, '0')
export const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
export const monthOf = (date: Day) => date.slice(0, 7)
export const monthIndex = (month: Month) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1
export function addMonths(month: Month, change: number): Month {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + change, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}
export function daysInMonth(month: Month): number {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number, 0)).getUTCDate()
}
export const onDay = (month: Month, day: number) => `${month}-${pad(Math.min(day, daysInMonth(month)))}`
export const transactionAmount = (transaction: Transaction) =>
  sum(transaction.items.map(item => item.amount - item.discount)) + (transaction.externalTax ?? 0)

export function transactionItemAmounts(transaction: Transaction) {
  const amounts = transaction.items.map(item => item.amount - item.discount)
  const tax = transaction.externalTax ?? 0
  if (!tax) return amounts
  const basis = sum(amounts.map(amount => Math.max(0, amount)))
  let weighted = 0
  let allocated = 0
  return amounts.map((amount, index) => {
    if (!basis) return amount + (index === 0 ? tax : 0)
    weighted += Math.max(0, amount)
    const throughThisItem = Math.round(tax * (weighted / basis))
    const total = amount + throughThisItem - allocated
    allocated = throughThisItem
    return total
  })
}
export const activeFixed = (data: Ledger, month: Month) => data.fixed.filter(item =>
  (!item.startMonth || item.startMonth <= month) && (!item.endMonth || month <= item.endMonth))
export const budgetFor = (data: Ledger, month: Month): Budget =>
  data.budgets.find(b => b.month === month) ?? { month, amounts: data.defaultBudget, plannedSavings: 0 }

export function debitDate(transaction: Transaction, payment: PaymentMethod): Day {
  if (transaction.debitOn) return transaction.debitOn
  const month = monthOf(transaction.date)
  const cycle = Number(transaction.date.slice(8)) > payment.closingDay ? 1 : 0
  return onDay(transaction.debitMonth ?? addMonths(month, cycle + payment.debitLag), payment.debitDay)
}

export function categorySpending(data: Ledger, month: Month) {
  const spending: Record<string, number> = {}
  for (const transaction of data.transactions) {
    if (transaction.personal || transaction.fixedExpenseId || monthOf(transaction.date) !== month) continue
    const amounts = transactionItemAmounts(transaction)
    for (const [index, item] of transaction.items.entries()) {
      spending[item.categoryId] = (spending[item.categoryId] ?? 0) + amounts[index]
    }
  }
  return spending
}

export function monthly(data: Ledger, month: Month) {
  const incomes = data.incomes.filter(i => monthOf(i.date) === month)
  const income = sum(incomes.map(i => i.actual ?? i.forecast))
  const fixedItems = activeFixed(data, month)
  const fixed = sum(fixedItems.map(f => f.amount))
  const asset = sum(fixedItems.filter(f => f.kind === 'asset').map(f => f.amount))
  const fixedActuals = data.transactions.filter(t => t.fixedExpenseId && monthOf(t.date) === month)
  const fixedVariance = sum(fixedActuals.map(t =>
    transactionAmount(t) - (fixedItems.find(f => f.id === t.fixedExpenseId)?.amount ?? 0)))
  const budget = budgetFor(data, month)
  const categorySpend = categorySpending(data, month)
  const allocated = sum(Object.values(budget.amounts))
  const spent = sum(Object.values(categorySpend))
  const plan = income - fixed - allocated
  const categories = new Set([...Object.keys(budget.amounts), ...Object.keys(categorySpend)])
  const expected = income - fixed - fixedVariance - sum([...categories].map(id => Math.max(budget.amounts[id] ?? 0, categorySpend[id] ?? 0)))
  const savingsActual = sum(data.transfers.filter(t => t.completed && monthOf(t.date) === month && t.purpose !== 'transfer')
    .map(t => t.purpose === 'withdrawal' ? -t.amount : t.amount))
  return {
    income, fixed, asset, budget, allocated, spent, plan, expected, savingsActual,
    categorySpend, remaining: allocated - spent,
    savingsForecast: Math.min(budget.plannedSavings || Math.max(0, plan), Math.max(0, expected)),
    unallocated: plan - budget.plannedSavings,
  }
}

export function annualScheduledAmount(plan: AnnualBudget, month: Month): Yen {
  const rule = plan.schedule
  if (!rule || (plan.endYear && Number(month.slice(0, 4)) > plan.endYear)) return 0
  const number = Number(month.slice(5))
  if (rule.kind === 'yearly') return number === rule.month ? plan.amount : 0
  if (rule.kind === 'cycle') {
    if (!rule.nextMonth || month < rule.nextMonth) return 0
    return (monthIndex(month) - monthIndex(rule.nextMonth)) % rule.interval === 0 ? plan.amount : 0
  }
  if (rule.kind === 'even' && number % 2 !== 0) return 0
  const count = rule.kind === 'even' ? 6 : 12
  const position = rule.kind === 'even' ? number / 2 : number
  return Math.floor(plan.amount * position / count) - Math.floor(plan.amount * (position - 1) / count)
}

export function annualPlanAmount(plan: AnnualBudget, year: number): Yen {
  if (plan.schedule?.kind !== 'cycle') return plan.amount
  return sum(Array.from({ length: 12 }, (_, i) => annualScheduledAmount(plan, `${year}-${pad(i + 1)}`)))
}

export function annualSummary(data: Ledger, year: number) {
  const plans = data.annual.filter(p => !p.endYear || year <= p.endYear)
  const income = sum(plans.filter(p => p.kind === 'income').map(p => annualPlanAmount(p, year)))
  const outflow = sum(plans.filter(p => p.kind !== 'income').map(p => annualPlanAmount(p, year)))
  const asset = sum(plans.filter(p => p.kind === 'asset').map(p => annualPlanAmount(p, year)))
  const actuals = data.annualActuals.filter(a => a.date.startsWith(String(year)))
  const actual = (kind: 'income' | 'outflow') => sum(actuals.filter(a => {
    const plan = data.annual.find(p => p.id === a.planId)
    return plan && (kind === 'income' ? plan.kind === 'income' : plan.kind !== 'income')
  }).map(a => a.amount))
  return { plans, income, outflow, asset, surplus: income - outflow, actualIncome: actual('income'), actualOutflow: actual('outflow') }
}

export function cardBills(data: Ledger) {
  const bills = new Map<string, import('./model.ts').CardBilling>()
  for (const transaction of data.transactions) {
    const payment = data.payments.find(p => p.id === transaction.paymentId)
    if (!payment || payment.kind !== 'card') continue
    const date = debitDate(transaction, payment)
    const id = `card:${payment.id}:${date}`
    const bill = bills.get(id) ?? {
      id, paymentId: payment.id, date, accountId: payment.accountId, amount: 0,
      paid: data.settled.includes(id), itemCount: 0,
    }
    bill.amount += transactionAmount(transaction)
    bill.itemCount += transaction.items.length
    bills.set(id, bill)
  }
  return [...bills.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export interface CashEvent {
  id: string; label: string; accountId: string; date: Day | null; amount: Yen; paid: boolean
  source: 'income' | 'fixed' | 'card' | 'cash' | 'transfer' | 'annual'
}
export function cashEvents(data: Ledger, month: Month): CashEvent[] {
  const events: CashEvent[] = []
  for (const income of data.incomes) {
    if (income.route !== 'deposit' || monthOf(income.date) !== month) continue
    events.push({ id: income.id, label: income.label, accountId: income.accountId, date: income.date, amount: income.actual ?? income.forecast, paid: income.actual !== null, source: 'income' })
  }
  for (const fixed of activeFixed(data, month)) {
    const id = `fixed:${fixed.id}:${month}`
    const linked = data.transactions.some(t => t.fixedExpenseId === fixed.id && monthOf(t.date) === month)
    if (linked) continue
    const card = data.payments.find(payment => payment.id === fixed.cardPaymentId && payment.kind === 'card')
    events.push({
      id, label: card ? fixed.name + '（' + card.name + '）' : fixed.name, accountId: card?.accountId ?? fixed.accountId,
      date: fixed.dueDay ? onDay(month, fixed.dueDay) : null, amount: -fixed.amount, paid: data.settled.includes(id), source: 'fixed',
    })
  }
  for (const bill of cardBills(data).filter(b => monthOf(b.date) === month)) {
    const label = data.payments.find(p => p.id === bill.paymentId)?.name ?? 'カード'
    events.push({ ...bill, label, amount: -bill.amount, source: 'card' })
  }
  for (const transaction of data.transactions.filter(t => monthOf(t.date) === month)) {
    const payment = data.payments.find(p => p.id === transaction.paymentId)
    if (payment?.kind !== 'cash') continue
    events.push({ id: transaction.id, label: transaction.merchant, accountId: payment.accountId, date: transaction.date, amount: -transactionAmount(transaction), paid: true, source: 'cash' })
  }
  for (const transfer of data.transfers.filter(t => monthOf(t.date) === month)) {
    events.push({ id: transfer.id, label: '口座間移動（出金）', accountId: transfer.from, date: transfer.date, amount: -transfer.amount, paid: transfer.completed, source: 'transfer' })
    events.push({ id: transfer.id, label: '口座間移動（入金）', accountId: transfer.to, date: transfer.date, amount: transfer.amount, paid: transfer.completed, source: 'transfer' })
  }
  for (const actual of data.annualActuals.filter(a => monthOf(a.date) === month)) {
    const plan = data.annual.find(p => p.id === actual.planId)
    if (!plan) continue
    events.push({ id: actual.id, label: plan.label, accountId: plan.accountId, date: actual.date, amount: plan.kind === 'income' ? actual.amount : -actual.amount, paid: true, source: 'annual' })
  }
  return events.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.amount - b.amount)
}

export function paymentSummary(events: CashEvent[], accountId: string) {
  const payments = events.filter(event => event.accountId === accountId && event.amount < 0 &&
    (event.source === 'fixed' || event.source === 'card' || event.source === 'cash'))
  return {
    payments,
    total: sum(payments.map(event => -event.amount)),
    remaining: sum(payments.filter(event => !event.paid).map(event => -event.amount)),
  }
}

export function subAccountForecast(data: Ledger, start: Month, length = 24) {
  const opening = data.accounts.find(a => a.id === 'annual')?.openingBalances[start]
  let running = 0
  let minimum = 0
  const months = Array.from({ length }, (_, index) => {
    const month = addMonths(start, index)
    const actualOrPlanned = cashEvents(data, month).filter(event => event.accountId === 'annual' && event.date)
    const scheduled = data.annual.filter(plan => plan.accountId === 'annual').map(plan => {
      const actual = sum(data.annualActuals.filter(row => row.planId === plan.id &&
        (plan.schedule?.kind === 'yearly' ? row.date.slice(0, 4) === month.slice(0, 4) : monthOf(row.date) === month)).map(row => row.amount))
      const left = Math.max(0, annualScheduledAmount(plan, month) - actual)
      return plan.kind === 'income' ? left : -left
    })
    const values = [...actualOrPlanned.map(event => event.amount), ...scheduled]
    const income = sum(values.filter(value => value > 0))
    const expense = -sum(values.filter(value => value < 0))
    minimum = Math.min(minimum, running - expense)
    running += income - expense
    return { month, income, expense, closing: opening === undefined ? null : opening + running }
  })
  return { months, opening, required: -minimum, shortage: opening === undefined ? null : Math.max(0, -minimum - opening) }
}

export function accountProjection(account: Account, events: CashEvent[], month: Month) {
  const opening = account.openingBalances[month]
  const own = events.filter(e => e.accountId === account.id)
  const undated = sum(own.filter(e => !e.date && !e.paid && e.amount < 0).map(e => -e.amount))
  const pending = sum(own.filter(e => !e.paid && e.amount < 0).map(e => -e.amount))
  if (opening === undefined) return { pending, undated, minimum: null, closing: null, required: null }
  let balance = opening
  let minimum = opening
  for (const event of own) {
    if (!event.date) continue
    balance += event.amount
    minimum = Math.min(minimum, balance)
  }
  return { pending, undated, minimum, closing: balance, required: Math.max(0, -minimum) }
}

export function foodWeek(data: Ledger, month: Month, selected: Day) {
  const focus = monthOf(selected) === month ? selected : onDay(month, 1)
  const weekday = (new Date(focus + 'T00:00:00Z').getUTCDay() + 6) % 7
  const day = Number(focus.slice(8))
  const start = Math.max(1, day - weekday)
  const end = Math.min(daysInMonth(month), day - weekday + 6)
  const startDate = onDay(month, start)
  const endDate = onDay(month, end)
  const total = budgetFor(data, month).amounts.food ?? 0
  const days = daysInMonth(month)
  const manual = data.weeklyBudgets.find(w => w.month === month && w.start === startDate && w.categoryId === 'food')
  const allocated = manual?.amount ?? Math.floor(total * end / days) - Math.floor(total * (start - 1) / days)
  const spent = sum(data.transactions.filter(t => !t.personal && !t.fixedExpenseId && t.date >= startDate && t.date <= endDate)
    .flatMap(t => transactionItemAmounts(t).filter((_, index) => t.items[index].categoryId === 'food')))
  const monthlyRemaining = total - (categorySpending(data, month).food ?? 0)
  const remaining = allocated - spent
  return { startDate, endDate, allocated, spent, remaining, daily: Math.floor(Math.max(0, Math.min(remaining, monthlyRemaining)) / (end - day + 1)) }
}
