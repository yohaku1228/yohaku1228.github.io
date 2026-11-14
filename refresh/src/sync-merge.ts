import type { Ledger } from './model.ts'
export interface SyncConflict { path: string; title: string; local: unknown; remote: unknown }
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => [k, v[k]])) : v) ?? 'undefined'
export const sameLedger = (a: unknown, b: unknown) => canonical(a) === canonical(b)
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const keyed: Record<string, (v: any) => string> = Object.fromEntries(['users','accounts','categories','incomes','fixed','transactions','receipts','payments','transfers','annual','annualActuals','savingsGoals','milestones','advice','recipes','favoriteMeals','mealHistory'].map(key => [key, (v: any) => v.id]))
keyed.budgets = v => v.month
keyed.mealShopping = v => v.date
keyed.weeklyBudgets = v => v.month + ':' + v.start + ':' + v.categoryId
const titles: Record<string, string> = { household:'家計',accounts:'口座',categories:'支出項目',incomes:'収入',fixed:'固定費',transactions:'支出',payments:'支払方法',annual:'サブ口座',annualActuals:'サブ口座の記録',defaultBudget:'変動費予算',budgets:'月の予算',monthlyCardAmounts:'カード利用額',stores:'店舗',themeColor:'テーマ',mealHistory:'晩ごはん',mealShopping:'買い物メモ',mealPreferences:'家族の好み',amount:'金額',accountId:'口座',cardPaymentId:'カード',cashPaymentId:'現金払い',name:'名前',memo:'メモ',actual:'確定額',forecast:'見込み額',date:'日付' }
export function mergeLedgers(base: Ledger | undefined, local: Ledger, remote: Ledger, choices: Record<string, 'local' | 'remote'> = {}) {
 const conflicts: SyncConflict[] = []
 function merge(b: unknown, l: unknown, r: unknown, path: string[], context: string): unknown {
  if (sameLedger(l,r)) return l
  if (base !== undefined) { if (sameLedger(l,b)) return r; if (sameLedger(r,b)) return l }
  if (isObject(l) && isObject(r) && (b === undefined || isObject(b))) {
   const old=isObject(b)?b:{}; const result: Record<string,unknown>={}
   const title=String(l.name ?? l.label ?? l.merchant ?? r.name ?? r.label ?? r.merchant ?? context)
   for (const key of new Set([...Object.keys(old),...Object.keys(l),...Object.keys(r)])) {
    const value=merge(old[key],l[key],r[key],[...path,key],title)
    if(value!==undefined)result[key]=value
   }
   return result
  }
  const field=path.at(-1) ?? ''
  const keyFor=Object.hasOwn(keyed,field)?keyed[field]:undefined
  if(Array.isArray(l)&&Array.isArray(r)&&keyFor&&(b===undefined||Array.isArray(b))){
   const old=new Map((Array.isArray(b)?b:[]).map(v=>[keyFor(v),v]));const left=new Map(l.map(v=>[keyFor(v),v]));const right=new Map(r.map(v=>[keyFor(v),v]));const result=[]
   for(const key of new Set([...right.keys(),...left.keys(),...old.keys()])){const value=merge(old.get(key),left.get(key),right.get(key),[...path,key],context);if(value!==undefined)result.push(value)}
   return result
  }
  const key=path.join('/');const choice=Object.hasOwn(choices,key)?choices[key]:undefined
  if(choice)return choice==='local'?l:r
  const object=isObject(l)?l:isObject(r)?r:null
  conflicts.push({path:key,title:[titles[path[0]]??'家計データ',object?.name??object?.label??object?.merchant??context,titles[path.at(-1)??'']??'内容'].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join('・'),local:l,remote:r})
  return l
 }
 return {ledger:merge(base,local,remote,[],'') as Ledger,conflicts}
}
