import { useState } from 'react'
import type { Ledger, FavoriteMeal, MealRecord } from './model'
import { favoritesFor, mealCandidates, mealContext, mealOverview, normalizeMealId } from './meals'
import { daysInMonth, foodWeek, monthly, monthOf, today } from './finance'
import { Field, Panel, SwipeRow, form, str, uid, type Save } from './ui'
import { FoodChat } from './food-chat'
import { cloudEnabled } from './cloud'

export function DinnerCalendar({ data, month, save }: { data: Ledger; month: string; save: Save }) {
  const date = today()
  const [selected, setSelected] = useState(month === monthOf(date) ? date : month + '-01')
  const [editing, setEditing] = useState<MealRecord | null>(null)
  const [choice, setChoice] = useState('')
  const [entryStatus, setEntryStatus] = useState<'planned' | 'cooked'>(selected > date ? 'planned' : 'cooked')
  const [shoppingVersion, setShoppingVersion] = useState(0)
  const [shoppingNotice, setShoppingNotice] = useState('')
  const [editingFavorite, setEditingFavorite] = useState<FavoriteMeal | null>(null)
  const [notice, setNotice] = useState('')
  const [formVersion, setFormVersion] = useState(0)
  const favorites = favoritesFor(data)
  const history = data.mealHistory ?? []
  const candidates = mealCandidates(data, date)
  const overview = mealOverview(data, date)
  const records = history.filter(row => row.date === selected)
  const first = new Date(month + '-01T00:00:00Z').getUTCDay()
  const totals = monthly(data, monthOf(date))
  const week = foodWeek(data, monthOf(date), date)
  const snapshot = { budget: totals.budget.amounts.food ?? 0, spent: totals.categorySpend.food ?? 0, weekRemaining: week.availableThisWeek, daysLeft: week.daysLeft, dayGuide: week.daily }
  function selectDay(value: string) { setSelected(value); setEditing(null); setChoice(''); setEntryStatus(value > date ? 'planned' : 'cooked'); setNotice(''); setShoppingNotice('') }
  const shopping = data.mealShopping?.find(row => row.date === selected)
  function saveShopping(text: string) {
    if (save(old => ({ ...old, mealShopping: [...(old.mealShopping ?? []).filter(row => row.date !== selected), { date: selected, text }] }))) { setShoppingVersion(v => v + 1); setShoppingNotice('買い物メモをクラウドに保存しました。') }
  }
  return <div className="stack">
    <Panel title="晩ごはんカレンダー">
      <div className="calendar dinner-calendar">
        {['日', '月', '火', '水', '木', '金', '土'].map(d => <b className="weekday" key={d}>{d}</b>)}
        {Array.from({ length: first }, (_, i) => <div key={'blank' + i} />)}
        {Array.from({ length: daysInMonth(month) }, (_, i) => {
          const day = month + '-' + String(i + 1).padStart(2, '0')
          const rows = history.filter(row => row.date === day)
          return <button className="day dinner-day" key={day} aria-label={day + ' ' + (rows.map(row => (row.status === 'planned' ? '予定：' : '') + row.name).join('、') || '記録なし')} aria-pressed={selected === day} onClick={() => selectDay(day)}>
            <span>{i + 1}</span><small>{rows[0]?.status === 'planned' ? '予定 ' : ''}{rows[0]?.name ?? ''}</small>{rows.length > 1 && <small>ほか{rows.length - 1}件</small>}
          </button>
        })}
      </div>
      <p className="hint">未来の日付も予定を登録できます。予定は「食べた」にするまで調理履歴には含めません。</p>
    </Panel>
    <Panel title={selected.replaceAll('-', '/') + ' の晩ごはん'}>
      <ul className="rows">{records.map(row => <SwipeRow key={row.id} label={row.name} onRemove={() => {
        if (save(old => ({ ...old, mealHistory: (old.mealHistory ?? []).filter(item => item.id !== row.id) }))) { setEditing(null); setChoice(''); setNotice('記録を削除しました。') }
      }}><div className="meal-record"><b>{row.status === 'planned' && <span className="meal-plan-label">予定</span>}{row.name}</b>{row.note && <small>{row.note}</small>}</div>{row.status === 'planned' && row.date <= date && <button className="quiet" onClick={() => { if (save(old => ({ ...old, mealHistory: (old.mealHistory ?? []).map(item => item.id === row.id ? { ...item, status: 'cooked' as const } : item) }))) { setEditing(null); setChoice(''); setNotice('食べた記録に変更しました。') } }}>食べた</button>}<button className="quiet" onClick={() => { setEditing(row); setChoice(favorites.some(f => f.id === normalizeMealId(row.mealId)) ? normalizeMealId(row.mealId) : 'other'); setEntryStatus(row.status ?? 'cooked'); setNotice('') }}>編集</button></SwipeRow>)}</ul>
      {!records.length && <p className="empty">この日の記録はまだありません。</p>}
      <form key={(editing?.id ?? selected) + formVersion} onSubmit={form(fields => {
        const meal = favorites.find(item => item.id === choice)
        const name = choice === 'other' ? str(fields, 'name') : meal?.name
        if (!name || entryStatus === 'cooked' && selected > date) return
        const item: MealRecord = { id: editing?.id ?? uid(), mealId: meal?.id ?? 'other', name, date: selected, note: str(fields, 'note'), status: entryStatus }
        if (!editing && records.some(row => row.mealId === item.mealId && row.name === item.name && (row.status ?? 'cooked') === item.status)) { setNotice('この料理はすでに記録されています。'); return }
        if (save(old => ({ ...old, mealHistory: editing ? (old.mealHistory ?? []).map(row => row.id === item.id ? item : row) : [...(old.mealHistory ?? []), item] }))) {
          setEditing(null); setChoice(''); setFormVersion(v => v + 1); setNotice(entryStatus === 'planned' ? '晩ごはんの予定を保存しました。' : '晩ごはんを保存しました。')
        }
      })}>
        <Field label="登録内容"><select aria-label="登録内容" value={entryStatus} onChange={e => setEntryStatus(e.target.value as 'planned' | 'cooked')}><option value="planned">予定</option><option value="cooked" disabled={selected > date}>食べた記録</option></select></Field>
        <Field label="料理"><select aria-label="料理" required value={choice} onChange={e => setChoice(e.target.value)}><option value="" disabled>選んでください</option>{favorites.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}<option value="other">その他（手入力）</option></select></Field>
        {choice === 'other' && <Field label="料理名"><input name="name" maxLength={80} defaultValue={editing?.name} required /></Field>}
        <Field label="晩ごはんメモ（任意）"><input name="note" maxLength={300} defaultValue={editing?.note ?? ''} placeholder="例：鶏肉が必要／作ったら子どもに好評" /></Field>
        <div className="actions"><button className="primary" disabled={!choice || entryStatus === 'cooked' && selected > date}>{editing ? '予定・記録を更新' : entryStatus === 'planned' ? '予定を登録' : '晩ごはんを記録'}</button>{editing && <button className="quiet" type="button" onClick={() => { setEditing(null); setChoice('') }}>取消</button>}</div>
      </form>
      {notice && <p className="hint" role="status">{notice}</p>}
    </Panel>
    <Panel title="選択日の献立・買い物相談">
      {records.some(row => row.status === 'planned') ? <p className="hint">選択日の予定：{records.filter(row => row.status === 'planned').map(row => row.name).join('、')}</p> : candidates.length ? <ul className="meal-candidates">{candidates.map(item => <li key={item.id}><b>{item.name}</b><small>{item.lastCooked ? `前回 ${item.lastCooked.replaceAll('-', '/')}（${item.daysSince}日前）` : 'まだ作った日の記録がありません'}</small></li>)}</ul> : <p className="hint">14日以上空いた定番はありません。記録が増えると、間隔の空いた料理をここに表示します。</p>}
      {cloudEnabled && <FoodChat key={selected} snapshot={snapshot} meals={mealContext(data, date, selected)} dinnerMode onSaveAnswer={saveShopping} />}
    </Panel>
    <Panel title={selected.replaceAll('-', '/') + ' の買い物メモ'}>
      <form key={selected + ':' + shoppingVersion} onSubmit={form(fields => saveShopping(str(fields, 'shopping')))}>
        <Field label="買うもの・購入量"><textarea className="meal-shopping-input" name="shopping" rows={7} maxLength={5000} defaultValue={shopping?.text ?? ''} placeholder="AIの回答を保存するか、買うものを入力" /></Field>
        <div className="actions"><button className="primary">買い物メモを保存</button></div>
      </form>
      {shoppingNotice && <p className="hint" role="status">{shoppingNotice}</p>}
      <p className="hint">予定と買い物メモは夫婦で共有します。別端末で更新された内容は画面を開き直すと読み込まれます。</p>
    </Panel>
    <details className="panel"><summary>家族の好み・食べる量</summary>
      <form onSubmit={form(fields => { if (save(old => ({ ...old, mealPreferences: str(fields, 'preferences') }))) setNotice('家族の好みを保存しました。') })}>
        <Field label="好み・苦手・食べる量・買い物のルール"><textarea className="meal-shopping-input" name="preferences" rows={4} maxLength={1000} defaultValue={data.mealPreferences ?? ''} placeholder="例：鶏肉は多め。辛さ控えめ。からあげは人気。" /></Field>
        <div className="actions"><button className="primary">好みを保存</button></div>
      </form>
      <p className="hint">保存した好みや料理へのメモを、AIが次の提案で参照します。</p>
    </details>
    <details className="panel"><summary>定番料理を追加・編集</summary>
      <ul className="rows">{overview.map(item => <SwipeRow key={item.id} label={item.name + 'の定番登録'} onRemove={() => {
        if (save(old => ({ ...old, mealCatalogVersion: 2, favoriteMeals: favoritesFor(old).filter(row => row.id !== item.id) }))) setEditingFavorite(null)
      }}><div className="meal-record"><b>{item.name}</b>{item.notes && <small>{item.notes}</small>}</div><button className="quiet" onClick={() => setEditingFavorite(item)}>編集</button></SwipeRow>)}</ul>
      <form key={editingFavorite?.id ?? favorites.length} onSubmit={form(fields => {
        const item = { id: editingFavorite?.id ?? uid(), name: str(fields, 'name'), notes: str(fields, 'notes') }
        if (save(old => ({ ...old, mealCatalogVersion: 2, favoriteMeals: editingFavorite ? favoritesFor(old).map(row => row.id === item.id ? item : row) : [...favoritesFor(old), item] }))) setEditingFavorite(null)
      })}>
        <Field label="定番料理の名前"><input name="name" defaultValue={editingFavorite?.name} maxLength={80} required /></Field>
        <Field label="いつもの材料・好み（任意）"><input name="notes" defaultValue={editingFavorite?.notes} maxLength={200} placeholder="例：サーモンは安いときだけ" /></Field>
        <div className="actions"><button className="primary" disabled={!editingFavorite && favorites.length >= 60}>{editingFavorite ? '定番を更新' : '定番を追加'}</button>{editingFavorite && <button type="button" className="quiet" onClick={() => setEditingFavorite(null)}>取消</button>}</div>
      </form>
    </details>
  </div>
}
