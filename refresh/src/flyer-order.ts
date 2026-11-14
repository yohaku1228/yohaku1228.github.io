import type { Flyer, FlyerCategory } from './flyer-stores.ts'
const categoryOrder: Record<FlyerCategory, number> = { supermarket: 0, drug: 1, home: 2 }
export function orderFlyers(stores: Flyer[], displayed: Record<string, boolean> = {}) {
  const available = (store: Flyer) => displayed[store.id] ?? Boolean(store.pages?.length || store.previewImageUrl)
  return stores.map((store, index) => ({ store, index })).sort((a, b) =>
    categoryOrder[a.store.category] - categoryOrder[b.store.category] ||
    Number(a.store.id === 'aeon') - Number(b.store.id === 'aeon') ||
    Number(available(b.store)) - Number(available(a.store)) || a.index - b.index).map(row => row.store)
}
