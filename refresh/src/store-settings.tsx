import { useState } from 'react'
import type { Ledger } from './model'
import { storesFor } from './stores'
import { Field, Panel, SwipeRow, form, str, type Save } from './ui'

export function StoreSettings({ data, save }: { data: Ledger; save: Save }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const stores = storesFor(data)
  return <Panel title="店舗の追加・編集">
    <ul className="rows">{stores.map(name => <SwipeRow key={name} label={name} onRemove={() => {
      if (save(old => ({ ...old, stores: storesFor(old).filter(store => store !== name) }))) { setEditing(null); setNotice('店舗の候補から削除しました。過去の記録は残ります。') }
    }}><b>{name}</b><button className="quiet" aria-label={name + 'を編集'} onClick={() => { setEditing(name); setNotice('') }}>編集</button></SwipeRow>)}</ul>
    <form key={editing ?? stores.join('|')} onSubmit={form(fields => {
      const name = str(fields, 'name')
      if (stores.some(store => store !== editing && store.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase())) { setNotice('同じ名前の店舗が登録されています。'); return }
      if (save(old => ({ ...old, stores: editing ? storesFor(old).map(store => store === editing ? name : store) : [...storesFor(old), name] }))) { setEditing(null); setNotice('店舗を保存しました。') }
    })}>
      <Field label="店舗名"><input name="name" required maxLength={100} defaultValue={editing ?? ''} /></Field>
      <div className="actions"><button className="primary" disabled={!editing && stores.length >= 100}>{editing ? '店舗名を更新' : '店舗を追加'}</button>{editing && <button className="quiet" type="button" onClick={() => setEditing(null)}>取消</button>}</div>
    </form>
    {notice && <p className="hint" role="status">{notice}</p>}
    <p className="hint">左にスワイプ、または「…」から候補を削除できます。名前を変えても、過去の支出に記録した店舗名は変わりません。「その他（手入力）」はいつでも使えます。</p>
  </Panel>
}
