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
  { id: 'udon', name: 'うどん', notes: 'ひっぱり・けんちんなど、作る日は種類をメモ。' },
  { id: 'yakisoba', name: 'やきそば', notes: '' },
  { id: 'soba', name: 'そば', notes: '' },
  { id: 'ramen', name: 'ラーメン', notes: '' },
  { id: 'chicken-steak', name: 'チキンステーキ', notes: 'わが家の定番。' },
  { id: 'karaage', name: 'からあげ', notes: 'わが家の定番。' },
  { id: 'pasta', name: 'パスタ', notes: '' },
  { id: 'gratin', name: 'グラタン', notes: '' },
  { id: 'hamburg', name: 'ハンバーグ', notes: '' },
  { id: 'shogayaki', name: '豚のしょうが焼き', notes: '' },
  { id: 'oyakodon', name: '親子丼', notes: '' },
  { id: 'mapo', name: '麻婆豆腐', notes: '' },
  { id: 'hoikoro', name: '回鍋肉', notes: '' },
  { id: 'chahan', name: 'チャーハン', notes: '' },
  { id: 'omurice', name: 'オムライス', notes: '' },
  { id: 'nikujaga', name: '肉じゃが', notes: '' },
  { id: 'oden', name: 'おでん', notes: '' },
  { id: 'nabe', name: '鍋', notes: '' },
  { id: 'tonjiru', name: '豚汁', notes: '主食・主菜との組み合わせで。' },
  { id: 'fried-fish', name: '魚のフライ', notes: '' },
  { id: 'saba-miso', name: 'さばの味噌煮', notes: '' },
  { id: 'yakiniku', name: '焼肉', notes: 'たまに。' },
  { id: 'gyusara', name: 'すき家の牛皿持ち帰り', notes: 'たまに。牛皿だけ購入。' },
]

export const normalizeMealId = (id: string) => id === 'hippari' || id === 'kenchin' ? 'udon' : id
const oldIds = new Set(['curry','stew','hayashi','gyoza','bibimbap','temaki','imoni','fish','nikomi','udon','yakisoba','soba','ramen','yakiniku','gyusara'])
export function favoritesFor(data: Pick<Ledger, 'favoriteMeals' | 'mealCatalogVersion'>): FavoriteMeal[] {
  if (!data.favoriteMeals) return defaultMeals
  const rows: FavoriteMeal[] = []
  for (const item of data.favoriteMeals) {
    const id = normalizeMealId(item.id)
    if (!rows.some(row => row.id === id)) rows.push(id === item.id ? item : { ...item, id, name: 'うどん' })
  }
  if (data.mealCatalogVersion !== 2 && rows.length) {
    for (const item of defaultMeals) if (!oldIds.has(item.id) && !rows.some(row => row.id === item.id || row.name === item.name) && rows.length < 60) rows.push(item)
  }
  return rows
}
export const mealIsCooked = (row: { status?: 'planned' | 'cooked' }) => row.status !== 'planned'
const dayNumber = (date: string) => Date.parse(date + 'T00:00:00Z') / 86400000
export function mealOverview(data: Pick<Ledger, 'favoriteMeals' | 'mealHistory' | 'mealCatalogVersion' | 'mealPreferences'>, date: string) {
  return favoritesFor(data).map(meal => {
    const lastCooked = (data.mealHistory ?? []).filter(row => normalizeMealId(row.mealId) === meal.id && mealIsCooked(row) && row.date <= date)
      .map(row => row.date).sort().at(-1) ?? null
    return { ...meal, lastCooked, daysSince: lastCooked ? dayNumber(date) - dayNumber(lastCooked) : null }
  })
}
export function mealCandidates(data: Pick<Ledger, 'favoriteMeals' | 'mealHistory' | 'mealCatalogVersion' | 'mealPreferences'>, date: string) {
  const rows = mealOverview(data, date)
  return [...rows.filter(row => row.daysSince !== null && row.daysSince >= 14).sort((a, b) => b.daysSince! - a.daysSince!),
    ...rows.filter(row => row.lastCooked === null)].slice(0, 3)
}
export function mealContext(data: Pick<Ledger, 'favoriteMeals' | 'mealHistory' | 'mealCatalogVersion' | 'mealPreferences'>, date: string, selectedDate?: string) {
  return {
    date,
    selectedDate: selectedDate ?? date,
    preferences: data.mealPreferences ?? '',
    planned: [...(data.mealHistory ?? [])].filter(row => row.status === 'planned' && (row.date >= date || row.date === selectedDate))
      .sort((a, b) => Number(b.date === selectedDate) - Number(a.date === selectedDate) || a.date.localeCompare(b.date)).slice(0, 30)
      .map(({ name, date, note }) => ({ name, date, note: note ?? '' })),
    favorites: mealOverview(data, date).map(({ name, notes, lastCooked }) => ({ name, notes, lastCooked })),
    recent: [...(data.mealHistory ?? [])].filter(row => mealIsCooked(row) && row.date <= date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30)
      .map(({ name, date, note }) => ({ name, date, note: note ?? '' })),
  }
}
export type MealContext = ReturnType<typeof mealContext>
