import type { FavoriteMeal, Ledger } from './model.ts'

export const defaultMeals: FavoriteMeal[] = [
  { id: 'curry', name: 'カレー', notes: '' },
  { id: 'stew', name: 'シチュー', notes: '' },
  { id: 'hayashi', name: 'ハヤシライス', notes: '' },
  { id: 'gyoza', name: 'ぎょうざ', notes: '' },
  { id: 'bibimbap', name: 'ビビンバ', notes: '' },
  { id: 'temaki', name: '手巻き寿司', notes: 'サーモン・まぐろは安いとき。きゅうり・たまご・かにかま。' },
  { id: 'imoni', name: 'いもに', notes: '' },
  { id: 'fish', name: '焼き魚', notes: 'ほっけ・しゃけ・さば。' },
  { id: 'nikomi', name: '煮込み', notes: '牛切り出し肉・大根・人参・ごぼう・こんにゃく。' },
  { id: 'hippari', name: 'ひっぱりうどん', notes: '' },
  { id: 'yakisoba', name: 'やきそば', notes: '' },
  { id: 'kenchin', name: 'けんちんうどん', notes: '' },
  { id: 'soba', name: 'そば', notes: '' },
  { id: 'ramen', name: 'ラーメン', notes: '' },
  { id: 'yakiniku', name: '焼肉', notes: 'たまに。' },
  { id: 'gyusara', name: 'すき家の牛皿持ち帰り', notes: 'たまに。牛皿だけ購入。' },
]

export const favoritesFor = (data: Pick<Ledger, 'favoriteMeals'>) => data.favoriteMeals ?? defaultMeals
const dayNumber = (date: string) => Date.parse(date + 'T00:00:00Z') / 86400000
export function mealOverview(data: Pick<Ledger, 'favoriteMeals' | 'mealHistory'>, date: string) {
  return favoritesFor(data).map(meal => {
    const lastCooked = (data.mealHistory ?? []).filter(row => row.mealId === meal.id && row.date <= date)
      .map(row => row.date).sort().at(-1) ?? null
    return { ...meal, lastCooked, daysSince: lastCooked ? dayNumber(date) - dayNumber(lastCooked) : null }
  })
}
export function mealCandidates(data: Pick<Ledger, 'favoriteMeals' | 'mealHistory'>, date: string) {
  const rows = mealOverview(data, date)
  return [...rows.filter(row => row.daysSince !== null && row.daysSince >= 14).sort((a, b) => b.daysSince! - a.daysSince!),
    ...rows.filter(row => row.lastCooked === null)].slice(0, 3)
}
export function mealContext(data: Pick<Ledger, 'favoriteMeals' | 'mealHistory'>, date: string) {
  return {
    date,
    favorites: mealOverview(data, date).map(({ name, notes, lastCooked }) => ({ name, notes, lastCooked })),
    recent: [...(data.mealHistory ?? [])].filter(row => row.date <= date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
      .map(({ name, date, note }) => ({ name, date, note: note ?? '' })),
  }
}
export type MealContext = ReturnType<typeof mealContext>
