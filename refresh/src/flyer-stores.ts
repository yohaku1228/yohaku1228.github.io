export type FlyerCategory = 'supermarket' | 'drug' | 'home'
export interface FlyerStore {
  id: string; name: string; area: string; category: FlyerCategory
  officialUrl: string; flyerPortalUrl: string; portalName: 'トクバイ' | 'Shufoo!'
  flyerSourceUrl?: string
}
const tokubai = (chain: string, id: number) => 'https://tokubai.co.jp/' + encodeURIComponent(chain) + '/' + id
// Store-specific URLs only. Update or append entries here; both Worker and UI use this master.
export const flyerStores: FlyerStore[] = [
  { id: 'aeon', name: 'イオンスタイル天童', area: '芳賀タウン北', category: 'supermarket', officialUrl: 'https://aeontohoku.co.jp/stores/a-tendo', flyerPortalUrl: tokubai('イオンスタイル', 12908), portalName: 'トクバイ' },
  { id: 'yamazawa', name: 'ヤマザワ 天童西店', area: '南小畑', category: 'supermarket', officialUrl: 'https://yamazawa.co.jp/shop/070.html', flyerPortalUrl: tokubai('ヤマザワ', 878), portalName: 'トクバイ' },
  { id: 'york', name: 'ヨークベニマル ららパーク天童店', area: '南町', category: 'supermarket', officialUrl: 'https://yorkbenimaru.com/store/details/raraparktendo/', flyerPortalUrl: tokubai('ヨークベニマル', 9631), portalName: 'トクバイ' },
  { id: 'ohban', name: 'おーばん 南天童店', area: '東芳賀', category: 'supermarket', officialUrl: 'https://www.oh-ban.com/flyer_store/minamitendo/', flyerPortalUrl: tokubai('おーばん', 931), portalName: 'トクバイ' },
  { id: 'gyomu', name: '業務スーパー 天童店', area: '南町', category: 'supermarket', officialUrl: 'https://www.gyomusuper.jp/shop/detail.php?sh_id=1359', flyerPortalUrl: tokubai('業務スーパー', 263430), portalName: 'トクバイ' },
  { id: 'aoki', name: 'クスリのアオキ 中里店', area: '中里', category: 'supermarket', officialUrl: 'https://kusuri-aoki-shop-info.com/result?storeCode=693', flyerPortalUrl: 'https://www.shufoo.net/pntweb/shopDetail/857833/', portalName: 'Shufoo!' },
  { id: 'tsuruha', name: 'ツルハドラッグ 天童芳賀店', area: '東芳賀', category: 'drug', officialUrl: 'https://shop.tsuruha-g.com/0918', flyerPortalUrl: 'https://www.shufoo.net/pntweb/shopDetail/890203/', portalName: 'Shufoo!' },
  { id: 'sunday', name: 'サンデー 天童南店', area: '南町', category: 'home', officialUrl: 'https://www.sunday.co.jp/stores/75', flyerPortalUrl: tokubai('サンデー', 34384), portalName: 'トクバイ' },
  { id: 'musashi', name: 'ホームセンタームサシ 天童店', area: '南小畑', category: 'home', officialUrl: 'https://store.musashi.vivahome.com/vivamusashi/spot/detail?code=tendo_hc', flyerPortalUrl: 'https://tokubai.co.jp/search?bargain_keyword=' + encodeURIComponent('ムサシ 天童'), portalName: 'トクバイ', flyerSourceUrl: 'https://chirashi.line.me/branches/67fdef22415f1b62d8ef2b52' },
]
export interface FlyerTile { url: string; x: number; y: number; width: number; height: number }
export interface FlyerPage { imageUrl?: string; width?: number; height?: number; tiles?: FlyerTile[]; title?: string }
export interface Flyer extends FlyerStore {
  pages?: FlyerPage[]; verified?: boolean
  extractedPdfUrl: string | null; previewImageUrl: string | null
  previewKind?: 'flyer' | 'page'; sourceUrl?: string; status?: 'ok' | 'unavailable'
}
export interface FlyerData { stores: Flyer[]; fetchedAt: string }
