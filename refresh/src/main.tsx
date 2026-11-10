import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeftRight, ArrowRight, BarChart3, CalendarDays, ChevronLeft, ChevronRight, CreditCard, House, Landmark, Menu, PencilLine, ScanLine, Settings2, Wallet } from 'lucide-react'
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
  { id: 'receipt', name: cloudEnabled ? 'レシート' : '記録', icon: cloudEnabled ? ScanLine : PencilLine },
  { id: 'calendar', name: 'カレンダー', icon: CalendarDays },
  { id: 'more', name: 'メニュー', icon: Menu },
] as const
type View = typeof tabs[number]['id'] | 'records' | 'accounts' | 'analysis' | 'settings'
const titles: Record<View, string> = {
  home: '今月の家計', planning: '予算と収入', records: '支出を記録', receipt: 'レシート読み取り',
  calendar: 'カレンダー', more: 'メニュー', accounts: '口座と振込', analysis: '家計の分析', settings: '設定',
}

function Home({ data, month, go }: { data: Ledger; month: string; go: (view: View) => void }) {
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
    {needsSetup && <section className="onboarding"><div><b>まず、今月の計画を設定</b><p>給与・固定費・生活費の予算を登録できます。</p></div><button className="quiet" onClick={() => go('planning')}>予算へ <ArrowRight size={16} /></button></section>}
    <section className="hero">
      <span className="hero-label"><Wallet size={17} /> あと使える生活費</span>
      <strong className="hero-amount">{yen(totals.remaining)}</strong>
      <div className="hero-meta"><span>予算 {yen(totals.allocated)}</span><span>消化率 {ratio === null ? '—' : `${ratio}%`}</span></div>
      <progress aria-label="生活費の予算消化率" max="100" value={Math.max(0, Math.min(100, ratio ?? 0))} />
    </section>
    {!needsSetup && !hasIncome && <section className="onboarding"><div><b>この月の収入が未登録です</b><p>収入を登録すると、貯蓄と口座の見通しを計算できます。</p></div><button className="quiet" onClick={() => go('planning')}>収入を登録 <ArrowRight size={16} /></button></section>}
    <div className="stats">
      <Stat label="食費の残り" value={(totals.budget.amounts.food ?? 0) - (totals.categorySpend.food ?? 0)} />
      <Stat label={month === monthOf(today()) ? '今日使える食費' : '月初の食費目安 / 日'} value={week.daily} detail={week.startDate.slice(5) + ' 〜 ' + week.endDate.slice(5)} />
      <Stat label="貯蓄見込み" value={totals.savingsForecast} detail={`実績 ${yen(totals.savingsActual)}`} />
      <Stat label="次回カード引落" value={bill?.amount ?? null} detail={bill ? bill.date : '未確認の引落なし'} />
    </div>
    <Panel title="口座の見通し">
      <div className="stats"><Stat label="メイン口座の必要入金" value={projection.required} detail={projection.undated ? `別途、日付未定 ${yen(projection.undated)}` : '日付が決まった入出金で計算'} /><Stat label="サブ口座の年間黒字見込み" value={annual.surplus} /></div>
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
    if (next === 'records' || next === 'receipt') setEditing(null)
    setView(next)
    window.scrollTo(0, 0)
  }
  function openAccount(mode: AccountView) {
    setAccountMode(mode)
    go('accounts')
  }
  const nav = view === 'records' ? (cloudEnabled ? null : 'receipt') : tabs.some(t => t.id === view) ? view : 'more'
  return <>
    <header className="top"><div className="top-inner"><div className="brand"><img src={import.meta.env.BASE_URL + 'icons/icon-192.png'} alt="" /><span>家計とカード<small>{data.household.name}の家計</small></span></div>{!cloudEnabled && <span className="local"><i /> 端末に保存</span>}</div></header>
    <main className="wrap">
      <div className="page-head">
        <h1>{titles[view]}</h1>
        {view !== 'more' && view !== 'settings' && view !== 'receipt' && <div className="month"><button aria-label="前の月" disabled={month <= '2000-01'} onClick={() => { setEditing(null); setMonth(addMonths(month, -1)) }}><ChevronLeft size={19} /></button><input aria-label="表示する月" type="month" min="2000-01" max="2099-12" value={month} onChange={e => {
          if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) { setEditing(null); setMonth(e.target.value) }
        }} /><button aria-label="次の月" disabled={month >= '2099-12'} onClick={() => { setEditing(null); setMonth(addMonths(month, 1)) }}><ChevronRight size={19} /></button></div>}
      </div>
      <ErrorNotice />
      {view === 'home' && <Home data={data} month={month} go={go} />}
      {view === 'planning' && <Planning key={month} data={data} month={month} save={save} />}
      {(view === 'records' || view === 'receipt') && <Records key={view} mode={view === 'receipt' ? 'scan' : 'manual'} data={data}
        month={month} save={save} editing={editing} setEditing={setEditing} setMonth={setMonth} onManual={() => go('records')} />}
      {view === 'calendar' && <Calendar data={data} month={month} edit={id => { go('records'); setEditing(id) }} />}
      {view === 'accounts' && <Accounts data={data} month={month} save={save} mode={accountMode} setMode={setAccountMode} />}
      {view === 'analysis' && <Analysis data={data} month={month} />}
      {view === 'settings' && <Settings data={data} save={save} />}
      {view === 'more' && <div className="stack">
        {[
          { title: '記録する', items: [
            { icon: PencilLine, label: '支出の手入力・履歴', detail: '買い物を登録・編集する', open: () => go('records') },
            { icon: Wallet, label: '給与・予算を入力', detail: '収入・生活費・固定費', open: () => go('planning') },
            { icon: Landmark, label: 'サブ口座の入出金', detail: 'ボーナス・児童手当・積立', open: () => openAccount('year') },
          ] },
          { title: '確認する', items: [
            { icon: ArrowLeftRight, label: '引落・振込を確認', detail: '銀行別の必要額・カード請求', open: () => openAccount('month') },
            { icon: CalendarDays, label: 'カレンダー', detail: '支出・支払いを日付で見る', open: () => go('calendar') },
            { icon: BarChart3, label: '家計の分析', detail: '支出の推移・貯蓄の見通し', open: () => go('analysis') },
          ] },
          { title: '設定する', items: [
            { icon: CreditCard, label: '引落口座の設定', detail: 'カード・固定費の振り分け', open: () => openAccount('setup') },
            { icon: Settings2, label: '家計の設定', detail: '家計の名前・カテゴリー', open: () => go('settings') },
          ] },
        ].map(group => <section className="menu-section" key={group.title}>
          <h2>{group.title}</h2>
          <div className="menu-grid">
            {group.items.map(({ icon: Icon, label, detail, open }) => <button key={label} onClick={open}>
              <span className="menu-icon"><Icon size={22} aria-hidden="true" /></span>
              <span><strong>{label}</strong><small>{detail}</small></span>
              <ChevronRight size={17} className="menu-chevron" aria-hidden="true" />
            </button>)}
          </div>
        </section>)}
      </div>}
    </main>
    <nav className="nav" aria-label="メインメニュー"><div>{tabs.map(({ id, name, icon: Icon }) => (
      <button key={id} className={id === 'receipt' ? 'nav-primary' : undefined} aria-current={nav === id ? 'page' : undefined}
        onClick={() => go(id === 'receipt' && !cloudEnabled ? 'records' : id)}>
        <Icon size={id === 'receipt' ? 27 : 22} strokeWidth={nav === id ? 2.25 : 1.8} aria-hidden="true" /><span>{name}</span>
      </button>
    ))}</div></nav>
  </>
}

createRoot(document.getElementById('root')!).render(<CloudGate><App /></CloudGate>)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(error => {
    console.warn('オフライン準備ができませんでした。', error)
  })
}
