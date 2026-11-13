import type { Ledger } from './model'
export const defaultStores = ['ヤマザワ', 'ヨークベニマル', 'おーばん', '業務スーパー', 'カワチ', 'ツルハ']
export const storesFor = (data: Pick<Ledger, 'stores'>) => data.stores ?? defaultStores
