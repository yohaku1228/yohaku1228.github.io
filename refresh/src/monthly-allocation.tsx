import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { monthlyAllocation } from './allocation'
import { monthOf, yen } from './finance'
import type { Ledger } from './model'
import { Amount, Field, Money, form, str, num, type Save } from './ui'

export function MonthlyAllocation({ data, month, save, openIncome, openFixed, openRecords }: {
  data: Ledger; month: string; save: Save; openIncome?: () => void; openFixed?: () => void; openRecords?: () => void
}) {
  const summary = monthlyAllocation(data, month)
  const incomes = data.incomes.filter(row => monthOf(row.date) === month)
  const [account, setAccount] = useState('all')
  const [editingCard, setEditingCard] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const card = data.payments.find(row => row.id === editingCard)
  const key = editingCard + ':' + month
  const amount = data.monthlyCardAmounts?.[key]
  const cardRow = summary.rows.find(row => row.paymentId === editingCard)
  const parent = (id?: string) => id === data.users[0]?.id ? 'パパ' : id === data.users[1]?.id ? 'ママ' : ''
  return <section className="monthly-allocation stack" aria-label="今月の収入・支出・収支">
    <h2 className="section-title">今月の収入・支出・収支</h2>
    <details className="summary-card">
      <summary><span className="summary-card-heading">収入<span className="summary-toggle"><span className="when-closed">開く</span><span className="when-open">閉じる</span><ChevronDown size={20} /></span></span><strong className="summary-value">{yen(summary.income)}</strong><span className="summary-description">予算に登録した給与・予備費など（{incomes.length}件）</span></summary>
      <div className="summary-content"><ul className="rows">{incomes.map(row => <li key={row.id}><span><b>{row.label.replace(/^夫の/, 'パパの').replace(/^妻の/, 'ママの')}{row.userId && !/の給与$/.test(row.label) && parent(row.userId) ? `（${parent(row.userId)}）` : ''}</b><small>{row.route === 'reserve' ? '今月に使う予備費' : row.actual === null ? '見込み' : '確定'}</small></span><Amount value={row.actual ?? row.forecast} /></li>)}</ul>
        {!incomes.length && <p className="empty">予算から給与・予備費を登録してください。</p>}{openIncome && <button className="quiet" onClick={openIncome}>収入を追加・編集</button>}</div>
    </details>
    <details className="summary-card">
      <summary><span className="summary-card-heading">支出<span className="summary-toggle"><span className="when-closed">開く</span><span className="when-open">閉じる</span><ChevronDown size={20} /></span></span><strong className="summary-value">{yen(summary.expense)}</strong><span className="summary-description">この月分として振り分ける合計</span></summary>
      <div className="summary-content">
        <Field label="銀行・現金で絞り込み"><select aria-label="銀行・現金で絞り込み" value={account} onChange={e => setAccount(e.target.value)}><option value="all">すべての銀行・現金</option>{summary.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></Field>
        <div className="allocation-groups">{summary.groups.filter(group => account === 'all' || group.id === account).map(group => <section className="allocation-group" key={group.id}>
          <h3><span>{group.name}</span><Amount value={group.amount} /></h3>
          <ul className="rows">{group.rows.map(row => <li key={row.id}><span><b>{row.name}</b><small>{row.kind === 'card' ? row.confirmed ? '確定額' : data.monthlyCardAmounts?.[row.paymentId + ':' + month] ? '入力した見込み額' : '利用記録・固定費から集計' : row.kind === 'fixed' ? '固定費' : '利用月の記録'}{row.personal ? ` ・ 個人分 ${yen(row.personal)}を含む` : ''}</small></span><Amount value={row.amount} />{row.kind === 'card' && <button className="quiet" aria-label={row.name + 'の月額を編集'} onClick={() => { setEditingCard(row.paymentId!); setNotice('') }}>編集</button>}</li>)}</ul>
          {!group.rows.length && <p className="hint">この月分の支出はありません。</p>}
        </section>)}</div>
        {card && <form className="monthly-card-form" key={key + JSON.stringify(amount)} onSubmit={form(fields => {
          const value = str(fields, 'amount')
          if (save(old => {
            const monthlyCardAmounts = { ...old.monthlyCardAmounts }
            if (value === '') delete monthlyCardAmounts[key]
            else monthlyCardAmounts[key] = { amount: num(fields, 'amount'), confirmed: fields.has('confirmed') }
            return { ...old, monthlyCardAmounts }
          })) { setEditingCard(null); setNotice('この月分のカード利用額を保存しました。') }
        })}>
          <h3>{card.name}・{month.replace('-', '年')}月分</h3>
          <Field label="この月分のカード利用額（円）"><Money name="amount" value={amount?.amount} negative required={false} /></Field>
          <label className="check"><input name="confirmed" type="checkbox" defaultChecked={amount?.confirmed ?? false} /> カード会社の確定額を確認済み</label>
          <p className="hint">利用記録とカード払いの固定費の合計：{yen(cardRow?.calculated ?? 0)}。空欄で保存すると、この計算額に戻ります。入力額との差は食費などの内訳へ自動配分しません。</p>
          <div className="actions"><button className="primary">月額を保存</button><button className="quiet" type="button" onClick={() => setEditingCard(null)}>取消</button></div>
        </form>}
        {notice && <p className="hint" role="status">{notice}</p>}
        <div className="actions">{openFixed && <button className="quiet" onClick={openFixed}>固定費を追加・編集</button>}{openRecords && <button className="quiet" onClick={openRecords}>支出の記録を確認</button>}</div>
        <p className="hint">固定費と、この月に使ったカード・現金等を集計します。カードは翌月に移さず、利用月で表示。見込み額・確定額は後から変更できます。未使用の変動費予算は含みません。</p>
      </div>
    </details>
    <article className="summary-card balance-card"><h3>今月の収支<span className={'balance-tag ' + (summary.balance < 0 ? 'is-negative' : '')}>{incomes.length ? summary.balance < 0 ? '不足（赤字）' : '残り' : '収入未入力'}</span></h3><strong className={'summary-value ' + (incomes.length && summary.balance < 0 ? 'negative' : '')}>{incomes.length ? yen(summary.balance) : '—'}</strong><p className="summary-description">収入 − この月分の支出</p></article>
  </section>
}
