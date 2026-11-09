import type { Ledger } from './model.ts'

export function starter(): Ledger {
  const id = crypto.randomUUID()
  return {
    household: { id, name: 'わが家', size: 5, currency: 'JPY' },
    users: [{ id: 'partner-a', name: '夫', householdId: id }, { id: 'partner-b', name: '妻', householdId: id }],
    accounts: [
      { id: 'main', name: 'メイン口座', kind: 'main', openingBalances: {} },
      { id: 'annual', name: 'サブ口座', kind: 'annual', openingBalances: {} },
    ],
    categories: [
      { id: 'food', name: '食費', color: '#287b51' },
      { id: 'utility', name: '水道光熱費', color: '#197787' },
      { id: 'leisure', name: '予備費・レジャー費', color: '#4a796a' },
      { id: 'daily', name: '日用品・雑費', color: '#3776b7' },
      { id: 'allowance', name: '夫お小遣い', color: '#766a5d', allowance: true },
      { id: 'snacks', name: 'お菓子・ジュース', color: '#af7b08' },
      { id: 'dining', name: '外食', color: '#865bb3' },
      { id: 'alcohol', name: 'お酒', color: '#b35065' },
    ],
    payments: [
      { id: 'cash', name: 'メイン口座・現金', kind: 'cash', accountId: 'main', closingDay: 31, debitDay: 27, debitLag: 1 },
      { id: 'direct', name: '直接負担', kind: 'direct', accountId: 'main', closingDay: 31, debitDay: 27, debitLag: 1 },
      { id: 'card', name: '楽天カード', kind: 'card', accountId: 'main', closingDay: 31, debitDay: 27, debitLag: 1 },
    ],
    incomes: [], budgets: [], defaultBudget: {}, weeklyBudgets: [], fixed: [], transactions: [],
    receipts: [], settled: [], transfers: [], annual: [], annualActuals: [], savingsGoals: [],
    milestones: [], advice: [], recipes: [],
  }
}
