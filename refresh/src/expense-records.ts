import type { Ledger, Transaction } from './model.ts'
import { monthOf, sum, transactionAmount, transactionItemAmounts } from './finance.ts'

export const recordAmount = (row: Transaction, category = '') => category
  ? sum(transactionItemAmounts(row).filter((_, index) => row.items[index].categoryId === category))
  : transactionAmount(row)
export function expenseRecords(data: Ledger, month: string, category = '', day: string | null = null, householdOnly = false) {
  return data.transactions.filter(row => monthOf(row.date) === month && (!day || row.date === day) &&
    (!householdOnly || !row.personal && !row.fixedExpenseId) && (!category || row.items.some(item => item.categoryId === category)))
    .sort((a, b) => b.date.localeCompare(a.date))
}
