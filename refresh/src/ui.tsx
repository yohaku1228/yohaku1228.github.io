import type { FormEvent, ReactNode } from 'react'
import type { Category, Ledger } from './model'
import { yen } from './finance'

export type Save = (action: (previous: Ledger) => Ledger) => boolean
export function Panel({ title, children, description }: { title: string; children: ReactNode; description?: string }) {
  return <section className="panel"><h2>{title}</h2>{description && <p className="hint">{description}</p>}{children}</section>
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>
}
export function Money({ name, value, negative = false, required = true }: { name: string; value?: number | null; negative?: boolean; required?: boolean }) {
  return <input type="number" inputMode={negative ? 'text' : 'numeric'} step="1" min={negative ? -1_000_000_000 : 0} max={1_000_000_000}
    name={name} defaultValue={value ?? ''} required={required} placeholder="円" />
}
export function form(handler: (fields: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    handler(new FormData(event.currentTarget))
  }
}
export const str = (fields: FormData, key: string) => String(fields.get(key) ?? '').trim()
export const num = (fields: FormData, key: string) => Number(str(fields, key))
export const uid = () => crypto.randomUUID()
export function Amount({ value }: { value: number }) {
  return <span className={value < 0 ? 'negative amount' : 'amount'}>{yen(value)}</span>
}
export function Stat({ label, value, detail }: { label: string; value: number | null; detail?: string }) {
  return <div className="stat"><span>{label}</span><strong>{value === null ? '未設定' : <Amount value={value} />}</strong>{detail && <small>{detail}</small>}</div>
}
export function BudgetRow({ category, cap, used }: { category: Category; cap: number; used: number }) {
  const ratio = cap ? Math.round(used / cap * 100) : 0
  const warning = used > 0 && (used >= cap ? '上限到達' : ratio >= 80 ? '80%超' : '')
  return <div className="budget-row">
    <div className="line"><span className="category"><i style={{ background: category.color }} />{category.name}</span><span>{yen(used)} / {yen(cap)}</span></div>
    <div className="line"><progress max="100" value={cap ? Math.min(100, Math.max(0, ratio)) : used > 0 ? 100 : 0} aria-label={category.name + 'の予算消化率'} />
      {warning ? <span className={used >= cap ? 'badge danger' : 'badge warning'}>{warning}</span> : <span className="hint">{ratio}%</span>}</div>
  </div>
}
