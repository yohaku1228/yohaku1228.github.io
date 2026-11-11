export type Yen = number
export type Month = string
export type Day = string
export type Id = string
export interface Household { id: Id; name: string; size: number; currency: 'JPY' }
export interface User { id: Id; name: string; householdId: Id }
export interface Account { id: Id; name: string; kind: 'main' | 'annual'; openingBalances: Record<Month, Yen> }
export interface Income {
  id: Id; label: string; userId?: Id; date: Day; forecast: Yen; actual: Yen | null
  route: 'deposit' | 'budget' | 'reserve' | 'direct' | 'undecided'; accountId: Id
}
export interface Category { id: Id; name: string; color: string; allowance?: boolean }
export interface Budget { month: Month; amounts: Record<Id, Yen>; plannedSavings: Yen }
export interface WeeklyBudget { month: Month; start: Day; categoryId: Id; amount: Yen }
export interface FixedExpense {
  id: Id; name: string; amount: Yen; accountId: Id; dueDay: number | null
  cardPaymentId?: Id
  startMonth: Month; endMonth: Month | null; kind: 'expense' | 'asset'
}
export interface TransactionItem { id: Id; name: string; categoryId: Id; quantity: number; amount: Yen; discount: Yen }
export interface Transaction {
  id: Id; date: Day; merchant: string; paymentId: Id; memo: string; personal: boolean
  items: TransactionItem[]; externalTax?: Yen; receiptId?: Id; fixedExpenseId?: Id; debitMonth?: Month; debitOn?: Day
}
export interface Receipt { id: Id; date: Day; total: Yen; fingerprint: string; imageRefs: string[] }
export interface PaymentMethod {
  id: Id; name: string; kind: 'cash' | 'card' | 'direct'; accountId: Id
  closingDay: number; debitDay: number; debitLag: number
}
export interface CardBilling { id: Id; paymentId: Id; date: Day; accountId: Id; amount: Yen; paid: boolean; itemCount: number }
export interface Transfer {
  id: Id; date: Day; from: Id; to: Id; amount: Yen; completed: boolean
  purpose: 'transfer' | 'savings' | 'withdrawal'
}
export interface SavingsGoal { id: Id; name: string; target: Yen }
export interface AnnualBudget {
  id: Id; label: string; kind: 'income' | 'expense' | 'asset'
  amount: Yen; endYear?: number; accountId: Id
  schedule?: { kind: 'monthly' | 'even' } | { kind: 'yearly'; month: number } | { kind: 'cycle'; nextMonth?: Month; interval: number }
}
export interface AnnualActual { id: Id; planId: Id; date: Day; amount: Yen }
export interface FinancialMilestone { id: Id; label: string; month: Month | null; fixedExpenseId?: Id; annualBudgetId?: Id }
export interface AIAdvice { id: Id; month: Month; text: string; createdAt: string }
export interface RecipeSuggestion { id: Id; servings: number; name: string; estimatedCost: Yen; ingredients: string[]; steps: string[] }
export interface FavoriteMeal { id: Id; name: string; notes: string }
export interface MealRecord { id: Id; mealId: Id; name: string; date: Day; note?: string; status?: 'planned' | 'cooked' }
export interface Ledger {
  themeColor?: string
  household: Household; users: User[]; accounts: Account[]; categories: Category[]
  incomes: Income[]; budgets: Budget[]; defaultBudget: Record<Id, Yen>
  weeklyBudgets: WeeklyBudget[]; fixed: FixedExpense[]; transactions: Transaction[]
  receipts: Receipt[]; payments: PaymentMethod[]; settled: Id[]; transfers: Transfer[]
  statementTotals?: Record<Id, Yen>
  monthlyCardAmounts?: Record<Id, { amount: Yen; confirmed: boolean }>
  legacyArchive?: LegacyArchive
  annual: AnnualBudget[]; annualActuals: AnnualActual[]; savingsGoals: SavingsGoal[]
  milestones: FinancialMilestone[]; advice: AIAdvice[]; recipes: RecipeSuggestion[]
  favoriteMeals?: FavoriteMeal[]
  mealHistory?: MealRecord[]
  mealCatalogVersion?: 2
  mealPreferences?: string
  mealShopping?: { date: Day; text: string }[]
}
export interface LegacyArchive {
  months: Record<Month, {
    incomes: { id: Id; name: string; amount: Yen }[]
    expenses: { id: Id; name: string; amount: Yen; account: string }[]
    transferredStatus: Record<string, boolean>
  }>
  rakutenCount: number
}
