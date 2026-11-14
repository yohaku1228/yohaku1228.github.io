import { activeFixed, monthOf, monthly, sum, transactionAmount } from './finance.ts'
import type { Ledger } from './model.ts'

export function monthlyAllocation(data: Ledger, month: string) {
  const transactions = data.transactions.filter(row => monthOf(row.date) === month)
  const rows: { id: string; name: string; accountId: string; amount: number; kind: 'card' | 'fixed' | 'cash' | 'direct'; paymentId?: string; calculated?: number; confirmed?: boolean; personal?: number }[] = []
  const cashAccount = (id: string) => id === 'cash' || data.accounts.find(a => a.id === id)?.name === '現金' ? 'cash' : id
  const cards = data.payments.filter(row => row.kind === 'card')
  const cardAmounts = new Map(cards.map(card => [card.id, { amount: 0, personal: 0 }]))
  for (const item of activeFixed(data, month)) {
    if (transactions.some(row => row.fixedExpenseId === item.id)) continue
    const card = cards.find(card => card.id === item.cardPaymentId)
    if (card) cardAmounts.get(card.id)!.amount += item.amount
    else rows.push({ id: 'fixed:' + item.id, name: item.name, accountId: item.cashPaymentId ? 'cash' : cashAccount(item.accountId), amount: item.amount, kind: 'fixed' })
  }
  for (const transaction of transactions) {
    const payment = data.payments.find(row => row.id === transaction.paymentId)
    const amount = transactionAmount(transaction)
    if (payment?.kind === 'card') {
      const item = cardAmounts.get(payment.id)!
      item.amount += amount
      if (transaction.personal) item.personal += amount
    } else if (payment) rows.push({ id: transaction.id, name: transaction.merchant, accountId: payment.kind === 'cash' ? 'cash' : cashAccount(payment.accountId), amount, kind: payment.kind, personal: transaction.personal ? amount : 0 })
  }
  for (const payment of cards) {
    const key = payment.id + ':' + month
    const override = data.monthlyCardAmounts?.[key]
    const calculated = cardAmounts.get(payment.id)!
    rows.push({ id: 'card:' + key, name: payment.name, accountId: cashAccount(payment.accountId), amount: override?.amount ?? calculated.amount,
      kind: 'card', paymentId: payment.id, calculated: calculated.amount, confirmed: override?.confirmed ?? false, personal: calculated.personal })
  }
  const groups = [...data.accounts.filter(row => row.id !== 'cash' && row.name !== '現金' && (row.kind !== 'annual' || rows.some(item => item.accountId === row.id))).map(row => ({ id: row.id, name: row.name })), { id: 'cash', name: '現金' }]
    .map(group => ({ ...group, rows: rows.filter(row => row.accountId === group.id), amount: sum(rows.filter(row => row.accountId === group.id).map(row => row.amount)) }))
    .filter(group => !(group.id === 'main' && group.name === 'メイン口座' && group.rows.every(row => row.amount === 0)))
  const income = monthly(data, month).income
  const expense = sum(rows.map(row => row.amount))
  return { income, expense, balance: income - expense, rows, groups }
}
