import { z } from 'zod'
import { create } from 'zustand'
import { daysInMonth, monthOf } from './finance'
import type { Ledger } from './model'
import { starter } from './seed'
import { pushLedger, pullLedger, cloudEnabled } from './cloud'
import { mergeLedgers, sameLedger, type SyncConflict } from './sync-merge'

const id = z.string().min(1).max(200)
const label = z.string().trim().min(1).max(200)
const integer = z.int().min(-1_000_000_000).max(1_000_000_000)
const amount = integer.min(0)
const month = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/)
const day = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/)
  .refine(date => Number(date.slice(8)) >= 1 && Number(date.slice(8)) <= daysInMonth(monthOf(date)))
const dayOfMonth = z.int().min(1).max(31)
const route = z.enum(['deposit', 'budget', 'reserve', 'direct', 'undecided'])
const amounts = z.record(id, amount)
const fixed = z.object({
  id, name: label, amount, accountId: id, dueDay: dayOfMonth.nullable(), cardPaymentId: id.optional(), cashPaymentId: id.optional(),
  startMonth: z.union([month, z.literal('')]), endMonth: month.nullable(), kind: z.enum(['expense', 'asset']),
}).refine(item => !item.endMonth || item.endMonth >= item.startMonth)
const annual = z.object({
  id, label, amount, accountId: id, kind: z.enum(['income', 'expense', 'asset']), endYear: z.int().min(2000).max(2099).optional(),
  schedule: z.discriminatedUnion('kind', [
    z.object({ kind: z.enum(['monthly', 'even']) }),
    z.object({ kind: z.literal('yearly'), month: z.int().min(1).max(12) }),
    z.object({ kind: z.literal('cycle'), nextMonth: month.optional(), interval: z.int().min(2).max(60) }),
  ]).optional(),
})
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
  stores: z.array(z.string().trim().min(1).max(100)).max(100).refine(rows => new Set(rows.map(s => s.normalize('NFKC').toLowerCase())).size === rows.length).optional(),
  themeColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
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
    externalTax: amount.optional(),
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
  monthlyCardAmounts: z.record(id, z.object({ amount: integer, confirmed: z.boolean() })).optional(),
  legacyArchive: legacyArchiveSchema.optional(),
  transfers: records(z.object({ id, date: day, from: id, to: id, amount: amount.positive(), completed: z.boolean(), purpose: z.enum(['transfer', 'savings', 'withdrawal']) })
    .refine(transfer => transfer.from !== transfer.to)),
  annual: records(annual),
  annualActuals: records(z.object({ id, planId: id, date: day, amount: amount.positive() })),
  savingsGoals: records(z.object({ id, name: label, target: amount })),
  milestones: records(milestone),
  advice: records(z.object({ id, month, text: z.string(), createdAt: z.string() })),
  recipes: records(z.object({ id, servings: z.int().positive(), name: label, estimatedCost: amount, ingredients: z.array(z.string()), steps: z.array(z.string()) })),
  favoriteMeals: records(z.object({ id, name: label.max(80), notes: z.string().max(200) })).max(60).optional(),
  mealHistory: records(z.object({ id, mealId: id, name: label.max(80), date: day, note: z.string().max(300).optional(), status: z.enum(['planned', 'cooked']).optional() })).max(3000).optional(),
  mealCatalogVersion: z.literal(2).optional(),
  mealPreferences: z.string().max(1000).optional(),
  mealShopping: z.array(z.object({ date: day, text: z.string().max(5000) })).refine(rows => new Set(rows.map(row => row.date)).size === rows.length).optional(),
}).refine(data => {
  const accounts = new Set(data.accounts.map(a => a.id))
  const categories = new Set(data.categories.map(c => c.id))
  const payments = new Map(data.payments.map(p => [p.id, p]))
  const annualIds = new Set(data.annual.map(a => a.id))
  return accounts.has('main') && accounts.has('annual') && categories.has('food') && payments.has('cash')
    && data.users.every(u => u.householdId === data.household.id)
    && [...data.incomes, ...data.fixed, ...data.payments, ...data.annual].every(r => accounts.has(r.accountId))
    && data.fixed.every(item => !item.cardPaymentId || payments.get(item.cardPaymentId)?.kind === 'card')
    && data.fixed.every(item => !item.cashPaymentId || !item.cardPaymentId && payments.get(item.cashPaymentId)?.kind === 'cash')
    && data.transactions.every(t => payments.has(t.paymentId) && t.items.every(i => categories.has(i.categoryId)))
    && data.transfers.every(t => accounts.has(t.from) && accounts.has(t.to))
    && data.annualActuals.every(a => annualIds.has(a.planId))
    && [data.defaultBudget, ...data.budgets.map(b => b.amounts)].every(row => Object.keys(row).every(key => categories.has(key)))
}).transform(data => {
  const receipts = new Map(data.receipts.map(receipt => [receipt.id, receipt]))
  return { ...data, transactions: data.transactions.map(transaction => {
    if (transaction.externalTax !== undefined || !transaction.receiptId || transaction.items.length < 2) return transaction
    const receipt = receipts.get(transaction.receiptId)
    const last = transaction.items.at(-1)!
    // Older scans stored the calculated tax as a generated final item.
    if (receipt && last.name === '外税' && last.amount > 0 && last.discount === 0 &&
        last.id === receipt.fingerprint + ':' + (transaction.items.length - 1)) {
      return { ...transaction, items: transaction.items.slice(0, -1), externalTax: last.amount }
    }
    return transaction
  }) }
})

const backupSchema = z.object({ format: z.literal('household-pwa-v1'), ledger: ledgerSchema })
const key = 'household-pwa:ledger:v1'
export const backup = (ledger: Ledger) => ({ format: 'household-pwa-v1' as const, exportedAt: new Date().toISOString(), ledger })

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
  cloudStatus: 'local' | 'ready' | 'saving' | 'error' | 'conflict'
  startCloud(owner: string, row: { ledger: unknown; revision: number } | null): void
  stopCloud(): void
  retryCloud(): void
  syncConflicts: SyncConflict[]
  resolveCloud(choices: Record<string, 'local' | 'remote'>): void
}

export function existingDeviceLedger(): Ledger | null {
  try { return repository.read()?.ledger ?? null } catch { return null }
}

export const useLedger = create<Store>((set, get) => {
  let initial: ReturnType<LedgerRepository['read']> = null
  let readError = ''
  try { if (!cloudEnabled) initial = repository.read() } catch {
    readError = '保存データを読み込めませんでした。既存の保存データを保護するため、編集を停止しました。'
  }
  let ledger = initial?.ledger ?? starter()
  let revision = initial?.revision ?? null
  let cloud: { key: string; revision: number; pending: Ledger | null; base: Ledger | undefined } | null = null
  let resolution: { base: Ledger | undefined; local: Ledger; remote: Ledger; revision: number } | null = null
  const persist = (active: NonNullable<typeof cloud>) => localStorage.setItem(active.key, JSON.stringify({ revision: active.revision, ledger: active.pending, base: active.base }))
  async function flush() {
    const active = cloud
    if (!active?.pending || get().cloudStatus === 'saving') return
    set({ cloudStatus: 'saving', error: '' })
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const latest = await pullLedger()
        if (cloud !== active) return
        const remote = latest ? ledgerSchema.parse(latest.ledger) : null
        const revision = latest?.revision ?? 0
        if (remote && sameLedger(active.pending, remote)) {
          active.base=remote; active.revision=revision; active.pending=null; ledger=remote
          localStorage.removeItem(active.key); resolution=null
          set({ ledger, cloudStatus:'ready',error:'',syncConflicts:[] }); return
        }
        if (revision !== active.revision) {
          if (!remote) throw new Error('クラウドの家計を確認できません。')
          const merged=mergeLedgers(active.base,active.pending!,remote)
          if(merged.conflicts.length){
            resolution={base:active.base,local:active.pending!,remote,revision}
            set({cloudStatus:'conflict',syncConflicts:merged.conflicts,error:''});return
          }
          active.pending=ledgerSchema.parse(merged.ledger);active.base=remote;active.revision=revision;ledger=active.pending
          persist(active);set({ledger})
        }
        const sent=active.pending!
        const next=await pushLedger(active.revision,sent)
        if(cloud!==active)return
        if(next===null)continue
        active.revision=next;active.base=sent;active.pending=null;resolution=null
        localStorage.removeItem(active.key);set({cloudStatus:'ready',error:'',syncConflicts:[]});return
      }
      throw new Error('更新が続いています。少し待って再試行してください。')
    } catch {
      if(cloud===active)set({cloudStatus:'error',error:'通信を確認して再試行してください。未保存の入力はこの端末で保護しています。'})
    }
  }

  return {
    ledger,
    error: readError,
    syncConflicts: [],
    cloudStatus: 'local',
    report: error => set({ error }),
    startCloud(owner, row) {
      const key = 'household-pwa:pending:' + owner
      const raw = localStorage.getItem(key)
      const pending = raw ? z.object({ revision: z.int().nonnegative(), ledger: ledgerSchema, base: ledgerSchema.optional() }).parse(JSON.parse(raw)) : null
      const remoteRevision = row?.revision ?? 0
      const base = row ? ledgerSchema.parse(row.ledger) : starter()
      const alreadySaved = pending && sameLedger(pending.ledger,base)
      cloud = { key, revision: pending && !alreadySaved ? pending.revision : remoteRevision, pending: alreadySaved ? null : pending?.ledger ?? null,
        base: pending && !alreadySaved ? pending.base ?? (pending.revision === remoteRevision ? base : undefined) : base }
      ledger = alreadySaved ? base : pending?.ledger ?? base
      resolution=null
      if(alreadySaved)localStorage.removeItem(key)
      set({ ledger, cloudStatus: cloud.pending ? 'error' : 'ready', error:'',syncConflicts:[] })
      if(cloud.pending)void flush()
    },
    stopCloud() {
      cloud = null
      ledger = starter()
      set({ ledger, cloudStatus: 'local', error: '', syncConflicts: [] })
    },
    retryCloud() { void flush() },
    resolveCloud(choices) {
      if(!cloud||!resolution)return
      const merged=mergeLedgers(resolution.base,resolution.local,resolution.remote,choices)
      if(merged.conflicts.length){set({error:'すべての項目で使う内容を選んでください。'});return}
      const next=ledgerSchema.safeParse(merged.ledger)
      if(!next.success){set({error:'組み合わせた内容を保存できません。選択内容を確認してください。'});return}
      cloud.pending=next.data;cloud.base=resolution.remote;cloud.revision=resolution.revision;ledger=next.data
      persist(cloud);resolution=null;set({ledger,cloudStatus:'error',error:'',syncConflicts:[]});void flush()
    },
    update(action) {
      try {
        if (cloudEnabled && !cloud) throw new Error('家計を読み込み直してください。')
        if (cloud && get().cloudStatus !== 'ready') throw new Error('先に未送信の変更を確認してください。')
        if (readError) throw new Error(readError)
        const next = ledgerSchema.parse(action(ledger))
        if(sameLedger(next,ledger))return true
        if (cloud) {
          if (!ledgerSchema.safeParse(next).success) throw new Error('日付・金額・設定を確認してください。')
          localStorage.setItem(cloud.key, JSON.stringify({ revision: cloud.revision, ledger: next, base: cloud.base }))
          cloud.pending = next
          ledger = next
          set({ ledger })
          void flush()
          return true
        }
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
