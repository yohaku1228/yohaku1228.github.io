import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeftRight, ArrowRight, BarChart3, CalendarDays, ChevronLeft, ChevronRight, CirclePlus, Ellipsis, House, Settings2, Wallet } from 'lucide-react'
import { Accounts, type AccountView } from './accounts'
import { CloudGate } from './cloud-gate'
import { cloudEnabled } from './cloud'
import { accountProjection, addMonths, annualSummary, cardBills, cashEvents, foodWeek, monthly, monthOf, subAccountForecast, today, yen } from './finance'
import { Planning } from './planning'
import { Calendar, Records } from './records'
import { Analysis, ErrorNotice, Settings } from './settings'
import { useLedger } from './storage'
import { BudgetRow, Panel, Stat } from './ui'
import type { Ledger } from './model'
import './style.css'

const tabs = [
  { id: 'home', name: 'ホーム', icon: House },
  { id: 'planning', name: '予算', icon: Wallet },
  { id: 'records', name: '記録', icon: CirclePlus },
  { id: 'calendar', name: 'カレンダー', icon: CalendarDays },
  { id: 'more', name: 'その他', icon: Ellipsis },
] as const
type View = typeof tabs[number]['id'] | 'accounts' | 'analysis' | 'settings'
const titles: Record<View, string> = {
  home: '今月の家計', planning: '予算と収入', records: '支出を記録', calendar: 'カレンダー',
  more: 'その他', accounts: '口座と振込', analysis: '家計の分析', settings: '設定',
}

function Home({ data, month, go, openAccount }: { data: Ledger; month: string; go: (view: View) => void; openAccount: (mode: AccountView) => void }) {
  const totals = monthly(data, month)
  const annual = annualSummary(data, Number(month.slice(0, 4)))
  const week = foodWeek(data, month, today())
  const account = data.accounts.find(a => a.id === 'main')!
  const projection = accountProjection(account, cashEvents(data, month), month)
  const bill = cardBills(data).find(b => !b.paid && b.amount !== 0)
  const ratio = totals.allocated > 0 ? Math.round(totals.spent / totals.allocated * 100) : null
  const needsSetup = !data.budgets.length && !data.fixed.length && !data.incomes.length && !Object.keys(data.defaultBudget).length
  const hasIncome = data.incomes.some(income => monthOf(income.date) === month)
  const sub = subAccountForecast(data, month)
  const hint = totals.remaining < 0 ? `生活費が予算を ${yen(-totals.remaining)} 超えています。「予算」で増えた項目を確認できます。`
    : sub.shortage ? `サブ口座は、登録済みの予定に対して ${yen(sub.shortage)} 不足する見込みです。`
    : bill ? `次の未確認のカード引落は ${bill.date}、${yen(bill.amount)} です。カード会社の請求額と照合できます。`
    : hasIncome ? `今月の生活費予算はあと ${yen(totals.remaining)} です。次の大きな支払いをサブ口座に登録しておくと、必要な残高が見えます。`
    : '給与・生活費予算・サブ口座の予定を登録すると、残高や支払いのヒントが表示されます。'
  return <div className="stack">
    {needsSetup && <section className="onboarding"><div><b>まず、今月の計画を設定</b><p>初期設定ファイルを読み込むと、給与・固定費・生活費がまとまって入ります。</p></div><button className="quiet" onClick={() => go('settings')}>設定へ <ArrowRight size={16} /></button></section>}
    <section className="hero">
      <span className="hero-label"><Wallet size={17} /> あと使える生活費</span>
      <strong className="hero-amount">{yen(totals.remaining)}</strong>
      <div className="hero-meta"><span>予算 {yen(totals.allocated)}</span><span>消化率 {ratio === null ? '—' : `${ratio}%`}</span></div>
      <progress aria-label="生活費の予算消化率" max="100" value={Math.max(0, Math.min(100, ratio ?? 0))} />
      <button onClick={() => go('records')}><CirclePlus size={17} /> 支出を記録</button>
    </section>
    <div className="account-shortcuts"><button className="quiet" onClick={() => openAccount('year')}>サブ口座 <ArrowRight size={16} /><small>ボーナス・児童手当・積立</small></button><button className="quiet" onClick={() => openAccount('setup')}>引落口座の設定 <ArrowRight size={16} /><small>カード・固定費</small></button></div>
    {!needsSetup && !hasIncome && <section className="onboarding"><div><b>この月の収入が未登録です</b><p>収入を登録すると、貯蓄と口座の見通しを計算できます。</p></div><button className="quiet" onClick={() => go('planning')}>収入を登録 <ArrowRight size={16} /></button></section>}
    <div className="stats">
      <Stat label="食費の残り" value={(totals.budget.amounts.food ?? 0) - (totals.categorySpend.food ?? 0)} />
      <Stat label={month === monthOf(today()) ? '今日使える食費' : '月初の食費目安 / 日'} value={week.daily} detail={week.startDate.slice(5) + ' 〜 ' + week.endDate.slice(5)} />
      <Stat label="貯蓄見込み" value={totals.savingsForecast} detail={`実績 ${yen(totals.savingsActual)}`} />
      <Stat label="次回カード引落" value={bill?.amount ?? null} detail={bill ? bill.date : '未確認の引落なし'} />
    </div>
    <Panel title="口座の見通し">
      <div className="stats"><Stat label="メイン口座の必要入金" value={projection.required} detail={projection.undated ? `別途、日付未定 ${yen(projection.undated)}` : '日付が決まった入出金で計算'} /><Stat label="サブ口座の年間黒字見込み" value={annual.surplus} /></div>
      <button className="quiet" onClick={() => openAccount('month')}>口座と振込を見る <ArrowRight size={16} /></button>
    </Panel>
    <Panel title="家計のヒント"><p className="hint">{hint}</p></Panel>
    <Panel title="生活費の内訳">
      {data.categories.filter(c => totals.budget.amounts[c.id] || totals.categorySpend[c.id]).map(c => <BudgetRow key={c.id} category={c} cap={totals.budget.amounts[c.id] ?? 0} used={totals.categorySpend[c.id] ?? 0} />)}
      {!totals.allocated && !totals.spent && <p className="empty">予算を設定すると、カテゴリー別の残額が表示されます。</p>}
      <button className="quiet" onClick={() => go('planning')}>予算を開く <ArrowRight size={16} /></button>
    </Panel>
  </div>
}

function App() {
  const data = useLedger(s => s.ledger)
  const save = useLedger(s => s.update)
  const [month, setMonth] = useState(() => monthOf(today()))
  const [view, setView] = useState<View>('home')
  const [accountMode, setAccountMode] = useState<AccountView>('month')
  const [editing, setEditing] = useState<string | null>(null)
  function go(next: View) {
    setView(next)
    window.scrollTo(0, 0)
  }
  function openAccount(mode: AccountView) {
    setAccountMode(mode)
    go('accounts')
  }
  const nav = tabs.some(t => t.id === view) ? view : 'more'
  return <>
    <header className="top"><div className="top-inner"><div className="brand"><img src={import.meta.env.BASE_URL + 'icons/icon-192.png'} alt="" /><span>家計とカード<small>{data.household.name}の家計</small></span></div>{!cloudEnabled && <span className="local"><i /> 端末に保存</span>}</div></header>
    <main className="wrap">
      <div className="page-head">
        <div><span className="eyebrow">ふたりの家計</span><h1>{titles[view]}</h1></div>
        {view !== 'more' && view !== 'settings' && <div className="month"><button aria-label="前の月" disabled={month <= '2000-01'} onClick={() => { setEditing(null); setMonth(addMonths(month, -1)) }}><ChevronLeft size={19} /></button><input aria-label="表示する月" type="month" min="2000-01" max="2099-12" value={month} onChange={e => {
          if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) { setEditing(null); setMonth(e.target.value) }
        }} /><button aria-label="次の月" disabled={month >= '2099-12'} onClick={() => { setEditing(null); setMonth(addMonths(month, 1)) }}><ChevronRight size={19} /></button></div>}
      </div>
      <ErrorNotice />
      {view === 'home' && <Home data={data} month={month} go={go} openAccount={openAccount} />}
      {view === 'planning' && <Planning key={month} data={data} month={month} save={save} />}
      {view === 'records' && <Records data={data} month={month} save={save} editing={editing} setEditing={setEditing} setMonth={setMonth} />}
      {view === 'calendar' && <Calendar data={data} month={month} edit={id => { setEditing(id); go('records') }} />}
      {view === 'accounts' && <Accounts data={data} month={month} save={save} mode={accountMode} setMode={setAccountMode} />}
      {view === 'analysis' && <Analysis data={data} month={month} />}
      {view === 'settings' && <Settings data={data} month={month} save={save} />}
      {view === 'more' && <div className="stack">
        <Panel title="家計を管理">
          <div className="menu">
            <button onClick={() => openAccount('month')}><ArrowLeftRight size={22} /> 口座と振込 <ArrowRight size={17} /></button>
            <button onClick={() => go('analysis')}><BarChart3 size={22} /> 家計の分析 <ArrowRight size={17} /></button>
            <button onClick={() => go('settings')}><Settings2 size={22} /> 設定とバックアップ <ArrowRight size={17} /></button>
          </div>
        </Panel>
      </div>}
    </main>
    <nav className="nav" aria-label="メインメニュー"><div>{tabs.map(({ id, name, icon: Icon }) => <button key={id} aria-current={nav === id ? 'page' : undefined} onClick={() => { if (id === 'records') setEditing(null); go(id) }}><Icon size={22} strokeWidth={nav === id ? 2.3 : 1.8} /><span>{name}</span></button>)}</div></nav>
  </>
}

createRoot(document.getElementById('root')!).render(<CloudGate><App /></CloudGate>)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(error => {
    console.warn('オフライン準備ができませんでした。', error)
  })
}
