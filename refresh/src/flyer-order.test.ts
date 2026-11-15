import test from 'node:test'
import assert from 'node:assert/strict'
import { orderFlyers } from './flyer-order.ts'
import { flyerStores } from './flyer-stores.ts'

test('supermarkets including Gyomu precede drugs and home centers, available sheets first within each group', () => {
  const stores = flyerStores.map(store => ({ ...store, extractedPdfUrl: null,
    previewImageUrl: ['yamazawa', 'tsuruha', 'musashi'].includes(store.id) ? 'https://image.test/paper.jpg' : null }))
  const ordered = orderFlyers(stores)
  assert.equal(ordered[0].id, 'yamazawa')
  assert.ok(ordered.slice(0, 7).every(store => store.category === 'supermarket'))
  assert.equal(ordered[7].id, 'tsuruha')
  assert.equal(ordered[8].id, 'musashi')
  assert.equal(ordered.find(store => store.id === 'gyomu')?.category, 'supermarket')
  assert.equal(ordered.find(store => store.id === 'aoki')?.category, 'supermarket')
  assert.equal(ordered[6].id, 'aeon')
  assert.equal(orderFlyers(stores, { aeon: true, yamazawa: false })[6].id, 'aeon')
})
