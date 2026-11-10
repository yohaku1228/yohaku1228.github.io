import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeftRight, ArrowRight, BarChart3, CalendarDays, ChevronLeft, ChevronRight, CreditCard, House, Landmark, Menu, PencilLine, Plus, Settings2, Wallet } from 'lucide-react'
import { Accounts, type AccountView } from './accounts'
import { CloudGate } from './cloud-gate'
import { cloudEnabled, getFoodAdvice } from './cloud'
import { addMonths, daysInMonth, foodWeek, monthly, monthOf, today, yen } from './finance'
import { Planning } from './planning'
import { Calendar, Records } from './records'
import { Analysis, ErrorNotice, Settings } from './settings'
import { useLedger } from './storage'
import { BudgetRow, Panel, Stat } from './ui'
import type { Ledger } from './model'
import './style.css'

const tabs = [
  { id: 'home', name: 'ホーム', icon: House },
  { id: 'planning', name: '収入', icon: Wallet },
  { id: 'add', name: '支出を追加', icon: Plus },
  { id: 'records', name: '支出', icon: PencilLine },
  { id: 'more', name: 'メニュー', icon: Menu },
] as const
type View = typeof tabs[number]['id'] | 'fixed' | 'budget' | 'calendar' | 'accounts' | 'analysis' | 'settings'
const titles: Record<View, string> = {
  home: '今月の家計', planning: '今月の収入', records: '支出の履歴', fixed: '固定費', budget: '変動費予算', add: '支出を追加',
  calendar: 'カレンダー', more: 'メニュー', accounts: '口座と振込', analysis: '家計の分析', settings: '設定',
}

function Home({ data, month, go, openPayments }: {
  data: Ledger; month: string; go: (view: View) => void; openPayments: () => void
}) {
  const totals = monthly(data, month)
  const date = today()
  const current = month === monthOf(date)
  const week = foodWeek(data, month, date)
  const days = daysInMonth(month)
  const elapsed = current ? Number(date.slice(8)) : 0
  const daysLeft = days - elapsed + 1
  const foodBudget = totals.budget.amounts.food ?? 0
  const foodSpent = totals.categorySpend.food ?? 0
  const foodName = data.categories.find(category => category.id === 'food')?.name ?? '食費'
  const snacksName = data.categories.find(category => category.id === 'snacks')?.name ?? 'お菓子・ジュース'
  const weekRemaining = Math.min(week.remaining, foodBudget - foodSpent)
  const dayGuide = Math.min(week.daily, Math.floor(Math.max(0, foodBudget - foodSpent) / daysLeft))
  const snapshot = { budget: foodBudget, spent: foodSpent, weekRemaining, daysLeft, dayGuide }
  const requestKey = JSON.stringify(snapshot)
  const [advice, setAdvice] = useState<{ key: string; text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const hasIncome = data.incomes.some(income => monthOf(income.date) === month)
  const foodAlert = foodBudget > 0 && foodSpent > foodBudget ? `${foodName}が予算を ${yen(foodSpent - foodBudget)} 超えています。`
    : foodBudget > 0 && foodSpent === foodBudget ? foodName + 'が今月の予算に達しました。'
    : foodBudget > 0 && foodSpent / foodBudget >= 0.8 ? foodName + 'は予算の80％以上を使っています。'
    : current && foodBudget > 0 && foodSpent > foodBudget * elapsed / days * 1.15 ? foodName + 'が月の日数に対して早めのペースです。' : ''
  return <div className="stack">
    <section className="focus-budgets" aria-label="よく使う予算">
      {([{ id: 'food', label: foodName }, { id: 'snacks', label: snacksName }]).map(({ id, label }) => {
        const budget = totals.budget.amounts[id] ?? 0
        const spent = totals.categorySpend[id] ?? 0
        return <article className={id === 'food' ? 'focus-budget focus-food' : 'focus-budget'} key={id}>
          <h2>{label}</h2>
          <strong>{budget ? yen(budget - spent) : '予算未設定'}</strong>
          <p>{budget > 0 && (spent > budget ? 'マイナスは予算超過' : '今月の残り')}</p>
          <p className="focus-amounts"><span>予算 {yen(budget)}</span><span>使用 {yen(spent)}</span></p>
          {budget > 0 && <progress max={budget} value={Math.max(0, Math.min(budget, spent))} aria-label={label + 'の消化率'} />}
        </article>
      })}
    </section>
    {foodAlert && <p className="notice" role="status">{foodAlert}</p>}
    {!hasIncome && <section className="onboarding"><div><b>まず、この月の給与・予備費を入力</b><p>固定費を引いたあと、変動費に回せる金額が分かります。</p></div><button className="quiet" onClick={() => go('planning')}>入力する <ArrowRight size={16} /></button></section>}
    {current && foodBudget > 0 && <Panel title="食費のアドバイス">
      <div className="stats"><Stat label="今日の買い物の目安" value={dayGuide} detail={`月末まで今日を含めて${daysLeft}日`} /><Stat label="今週使える食費" value={weekRemaining} detail="月の残りを上限に表示" /></div>
      {cloudEnabled && <>
        <button className="quiet" disabled={busy || (advice?.key === requestKey && !advice.error)} onClick={async () => {
          setBusy(true)
          try { setAdvice({ key: requestKey, text: await getFoodAdvice(snapshot, AbortSignal.timeout(24_000)) }) }
          catch (error) { setAdvice({ key: requestKey, text: error instanceof Error ? error.message : '助言を取得できませんでした。', error: true }) }
          finally { setBusy(false) }
        }}>{busy ? '助言を作成中…' : 'AIに食費のコツを聞く'}</button>
        <p className="hint">押すと、食費の集計額と残り日数をGeminiに送ります。</p>
        {advice?.key === requestKey && <p className={advice.error ? 'notice' : 'advice-result'} role="status">{advice.text}</p>}
      </>}
    </Panel>}
    <Panel title="今月の変動費">
      <div className="stats"><Stat label="収入から固定費を引いた額" value={hasIncome ? totals.income - totals.fixed : null} /><Stat label="変動費予算の残り" value={totals.allocated ? totals.remaining : null} /></div>
      <button className="quiet" onClick={() => go(hasIncome ? 'budget' : 'planning')}>{hasIncome ? '変動費予算を設定・確認' : '収入から設定する'} <ArrowRight size={16} /></button>
    </Panel>
    <button className="quiet bank-entry" onClick={openPayments}><CreditCard size={18} /> 銀行別の引落・現金支払い <ArrowRight size={16} /></button>
    <Panel title="変動費の内訳">
      {data.categories.filter(c => totals.budget.amounts[c.id] || totals.categorySpend[c.id]).map(c => <BudgetRow key={c.id} category={c} cap={totals.budget.amounts[c.id] ?? 0} used={totals.categorySpend[c.id] ?? 0} />)}
      {!totals.allocated && !totals.spent && <p className="empty">予算を設定すると、カテゴリー別の残額が表示されます。</p>}
    </Panel>
  </div>
}

function App() {
  const data = useLedger(s => s.ledger)
  const save = useLedger(s => s.update)
  const [month, setMonth] = useState(() => monthOf(today()))
  const [view, setView] = useState<View>('home')
  const [accountMode, setAccountMode] = useState<AccountView>('payments')
  const [editing, setEditing] = useState<string | null>(null)
  function go(next: View) {
    if (next === 'records' || next === 'add') setEditing(null)
    setView(next)
    window.scrollTo(0, 0)
  }
  function openAccount(mode: AccountView) {
    setAccountMode(mode)
    go('accounts')
  }
  const spending = view === 'records' || view === 'fixed' || view === 'budget'
  const nav = spending ? 'records' : tabs.some(t => t.id === view) ? view : 'more'
  return <>
    <header className="top"><div className="top-inner"><div className="brand"><img src={import.meta.env.BASE_URL + 'icons/icon-192.png'} alt="" /><span>家計とカード<small>{data.household.name}の家計</small></span></div>{!cloudEnabled && <span className="local"><i /> 端末に保存</span>}</div></header>
    <main className="wrap">
      <div className="page-head">
        <h1>{view === 'accounts' && accountMode === 'payments' ? '銀行別の引落' : titles[view]}</h1>
        {view !== 'more' && view !== 'settings' && view !== 'add' && <div className="month"><button aria-label="前の月" disabled={month <= '2000-01'} onClick={() => { setEditing(null); setMonth(addMonths(month, -1)) }}><ChevronLeft size={19} /></button><input aria-label="表示する月" type="month" min="2000-01" max="2099-12" value={month} onChange={e => {
          if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) { setEditing(null); setMonth(e.target.value) }
        }} /><button aria-label="次の月" disabled={month >= '2099-12'} onClick={() => { setEditing(null); setMonth(addMonths(month, 1)) }}><ChevronRight size={19} /></button></div>}
      </div>
      <ErrorNotice />
      {view === 'home' && <Home key={month} data={data} month={month} go={go} openPayments={() => openAccount('payments')} />}
      {view === 'planning' && <Planning key={month} data={data} month={month} save={save} section="income" />}
      {spending && <nav className="actions" aria-label="支出の切り替え">
        {([{ id: 'records', label: '記録・履歴' }, { id: 'fixed', label: '固定費' }, { id: 'budget', label: '変動費予算' }] as const)
          .map(item => <button key={item.id} className={view === item.id ? 'primary' : 'quiet'} aria-pressed={view === item.id}
            onClick={() => { if (view !== item.id) go(item.id) }}>{item.label}</button>)}
      </nav>}
      {(view === 'fixed' || view === 'budget') && <Planning key={month} data={data} month={month} save={save} section={view}
        openBudget={() => go('budget')} />}
      {view === 'records' && <div className="actions">
        <button className="primary" onClick={() => go('add')}><Plus size={17} /> 買い物を追加</button>
        <button className="quiet" onClick={() => openAccount('payments')}><CreditCard size={17} /> 銀行別の引落・現金支払い</button>
      </div>}
      {(view === 'records' || view === 'add') && <Records key={view} mode={view === 'add' ? 'add' : 'history'} data={data}
        month={month} save={save} editing={editing} setEditing={setEditing} setMonth={setMonth} />}
      {view === 'calendar' && <Calendar data={data} month={month} edit={id => { go('records'); setEditing(id) }} />}
      {view === 'accounts' && <Accounts data={data} month={month} save={save} mode={accountMode} setMode={setAccountMode} />}
      {view === 'analysis' && <Analysis data={data} month={month} />}
      {view === 'settings' && <Settings data={data} save={save} />}
      {view === 'more' && <div className="stack">
        {[
          { title: '記録する', items: [
            { icon: PencilLine, label: '支出の記録・履歴', detail: '支払合計を登録・編集する', open: () => go('records') },
            { icon: Wallet, label: '給与・予備費を入力', detail: '今月の収入の追加・編集', open: () => go('planning') },
          ] },
          { title: '確認する', items: [
            { icon: ArrowLeftRight, label: '銀行別の引落・現金支払い', detail: '今月の支払い合計・支払未確認額', open: () => openAccount('payments') },
            { icon: CalendarDays, label: 'カレンダー', detail: '支出・支払いを日付で見る', open: () => go('calendar') },
            { icon: BarChart3, label: '家計の分析', detail: '支出の推移・貯蓄の見通し', open: () => go('analysis') },
            { icon: Landmark, label: 'サブ口座', detail: 'ボーナス・児童手当・積立', open: () => openAccount('year') },
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
      <button key={id} className={id === 'add' ? 'nav-primary' : undefined} aria-current={nav === id ? 'page' : undefined}
        onClick={() => go(id)}>
        <Icon size={id === 'add' ? 27 : 22} strokeWidth={nav === id ? 2.25 : 1.8} aria-hidden="true" /><span>{name}</span>
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
