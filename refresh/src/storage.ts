import { z } from 'zod'
import { create } from 'zustand'
import { daysInMonth, monthOf } from './finance'
import type { Ledger, Plan } from './model'
import { starter } from './seed'

const id = z.string().min(1).max(200)
const label = z.string().trim().min(1).max(200)
const integer = z.int().min(-1_000_000_000).max(1_000_000_000)
const amount = integer.min(0)
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
const day = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/)
  .refine(date => Number(date.slice(8)) >= 1 && Number(date.slice(8)) <= daysInMonth(monthOf(date)))
const dayOfMonth = z.int().min(1).max(31)
const route = z.enum(['deposit', 'direct', 'undecided'])
const amounts = z.record(id, amount)
const fixed = z.object({
  id, name: label, amount, accountId: id, dueDay: dayOfMonth.nullable(),
  startMonth: z.union([month, z.literal('')]), endMonth: month.nullable(), kind: z.enum(['expense', 'asset']),
}).refine(item => !item.endMonth || item.endMonth >= item.startMonth)
const annual = z.object({ id, label, amount, accountId: id, kind: z.enum(['income', 'expense', 'asset']), endYear: z.int().min(2000).max(2099).optional() })
const milestone = z.object({ id, label, month: month.nullable(), fixedExpenseId: id.optional(), annualBudgetId: id.optional() })
const records = <T extends { id: string }>(schema: z.ZodType<T>) => z.array(schema)
  .refine(rows => new Set(rows.map(row => row.id)).size === rows.length)

const legacyIncome = z.object({ id, name: label, amount: integer })
const legacyMonths = z.record(month, z.object({
  incomes: z.array(legacyIncome),
  expenses: z.array(legacyIncome.extend({ account: z.string() })),
  transferredStatus: z.record(z.string(), z.boolean()).default({}),
}))
const legacyArchiveSchema = z.object({ months: legacyMonths, rakutenCount: z.int().nonnegative() })

const ledgerSchema: z.ZodType<Ledger> = z.object({
  household: z.object({ id, name: label, size: z.int().min(1).max(30), currency: z.literal('JPY') }),
  users: records(z.object({ id, name: label, householdId: id })).length(2),
  accounts: records(z.object({ id, name: label, kind: z.enum(['main', 'annual']), openingBalances: z.record(month, integer) })),
  categories: records(z.object({ id, name: label, color: z.string().regex(/^#[0-9a-f]{6}$/i), allowance: z.boolean().optional() })),
  incomes: records(z.object({ id, label, userId: id.optional(), date: day, forecast: amount, actual: amount.nullable(), route, accountId: id })),
  budgets: z.array(z.object({ month, amounts, plannedSavings: amount }))
    .refine(rows => new Set(rows.map(row => row.month)).size === rows.length),
  defaultBudget: amounts,
  weeklyBudgets: z.array(z.object({ month, start: day, categoryId: id, amount })),
  fixed: records(fixed),
  transactions: records(z.object({
    id, date: day, merchant: label, paymentId: id, memo: z.string().max(500), personal: z.boolean(),
    items: records(z.object({ id, name: label, categoryId: id, quantity: z.int().positive(), amount: integer, discount: amount })
      .refine(item => item.amount >= 0 ? item.discount <= item.amount : item.discount === 0)).min(1),
    receiptId: id.optional(), fixedExpenseId: id.optional(), debitMonth: month.optional(), debitOn: day.optional(),
  })),
  receipts: records(z.object({ id, date: day, total: integer, fingerprint: id, imageRefs: z.array(id) })),
  payments: records(z.object({
    id, name: label, kind: z.enum(['cash', 'card', 'direct']), accountId: id,
    closingDay: dayOfMonth, debitDay: dayOfMonth, debitLag: z.int().min(1).max(3),
  })),
  settled: z.array(id),
  statementTotals: z.record(id, integer).optional(),
  legacyArchive: legacyArchiveSchema.optional(),
  transfers: records(z.object({ id, date: day, from: id, to: id, amount: amount.positive(), completed: z.boolean(), purpose: z.enum(['transfer', 'savings', 'withdrawal']) })
    .refine(transfer => transfer.from !== transfer.to)),
  annual: records(annual),
  annualActuals: records(z.object({ id, planId: id, date: day, amount: amount.positive() })),
  savingsGoals: records(z.object({ id, name: label, target: amount })),
  milestones: records(milestone),
  advice: records(z.object({ id, month, text: z.string(), createdAt: z.string() })),
  recipes: records(z.object({ id, servings: z.int().positive(), name: label, estimatedCost: amount, ingredients: z.array(z.string()), steps: z.array(z.string()) })),
}).refine(data => {
  const accounts = new Set(data.accounts.map(a => a.id))
  const categories = new Set(data.categories.map(c => c.id))
  const payments = new Set(data.payments.map(p => p.id))
  const annualIds = new Set(data.annual.map(a => a.id))
  return accounts.has('main') && accounts.has('annual') && categories.has('food') && payments.has('cash')
    && data.users.every(u => u.householdId === data.household.id)
    && [...data.incomes, ...data.fixed, ...data.payments, ...data.annual].every(r => accounts.has(r.accountId))
    && data.transactions.every(t => payments.has(t.paymentId) && t.items.every(i => categories.has(i.categoryId)))
    && data.transfers.every(t => accounts.has(t.from) && accounts.has(t.to))
    && data.annualActuals.every(a => annualIds.has(a.planId))
    && [data.defaultBudget, ...data.budgets.map(b => b.amounts)].every(row => Object.keys(row).every(key => categories.has(key)))
})

export const planSchema: z.ZodType<Plan> = z.object({
  budget: amounts,
  incomes: z.array(z.object({ userId: id, amount, route })),
  fixed: records(fixed), annual: records(annual), milestones: records(milestone),
})
const backupSchema = z.object({ format: z.literal('household-pwa-v1'), ledger: ledgerSchema })
const legacySchema = z.object({
  format: z.literal('finance-unified-v1'),
  data: z.object({
    kakeibo_data_v5: z.object({ monthlyData: legacyMonths }).nullable(),
    rakuten_alert_checker_v3: z.object({ transactions: z.array(z.unknown()) }).nullable(),
  }),
})
const key = 'household-pwa:ledger:v1'
export const backup = (ledger: Ledger) => ({ format: 'household-pwa-v1' as const, exportedAt: new Date().toISOString(), ledger })

export function inspectImport(value: unknown) {
  const legacy = legacySchema.safeParse(value)
  if (legacy.success) {
    const archive = {
      months: legacy.data.data.kakeibo_data_v5?.monthlyData ?? {},
      rakutenCount: legacy.data.data.rakuten_alert_checker_v3?.transactions.length ?? 0,
    }
    return { type: 'legacy' as const, archive }
  }
  const saved = backupSchema.safeParse(value)
  if (saved.success) return { type: 'backup' as const, ledger: saved.data.ledger }
  const plan = z.object({ format: z.literal('household-phase1-plan-v1'), plan: planSchema }).safeParse(value)
  if (plan.success) return { type: 'plan' as const, plan: plan.data.plan }
  throw new Error('ファイルの形式または金額を確認してください。')
}

interface LedgerRepository {
  read(): { ledger: Ledger; revision: string | null } | null
  write(ledger: Ledger, expected: string | null): string
}

const repository: LedgerRepository = {
  read() {
    const raw = localStorage.getItem(key)
    return raw ? { ledger: backupSchema.parse(JSON.parse(raw)).ledger, revision: raw } : null
  },
  write(ledger, expected) {
    if (localStorage.getItem(key) !== expected) {
      throw new Error('別のタブで更新されました。ページを再読み込みしてから操作してください。')
    }
    if (!ledgerSchema.safeParse(ledger).success) throw new Error('日付・金額・設定に無効な値があります。入力を確認してください。')
    const raw = JSON.stringify(backup(ledger))
    localStorage.setItem(key, raw)
    return raw
  },
}

interface Store {
  ledger: Ledger
  error: string
  update(action: (previous: Ledger) => Ledger): boolean
  report(error: string): void
}

export const useLedger = create<Store>(set => {
  let initial: ReturnType<LedgerRepository['read']> = null
  let readError = ''
  try { initial = repository.read() } catch {
    readError = '保存データを読み込めませんでした。既存の保存データを保護するため、編集を停止しました。'
  }
  let ledger = initial?.ledger ?? starter()
  let revision = initial?.revision ?? null
  return {
    ledger,
    error: readError,
    report: error => set({ error }),
    update(action) {
      try {
        if (readError) throw new Error(readError)
        const next = action(ledger)
        revision = repository.write(next, revision)
        ledger = next
        set({ ledger, error: '' })
        return true
      } catch (error) {
        set({ error: error instanceof Error ? error.message : '保存できませんでした。' })
        return false
      }
    },
  }
})

export function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
