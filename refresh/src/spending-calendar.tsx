import type { Transaction } from './model'
import { daysInMonth, onDay, sum, yen } from './finance'
import { recordAmount } from './expense-records'
import { Panel } from './ui'

export function SpendingCalendar({ month, rows, selected, category, onSelect }: {
  month: string; rows: Transaction[]; selected: string | null; category: string; onSelect: (day: string | null) => void
}) {
  const first = new Date(onDay(month, 1) + 'T00:00:00Z').getUTCDay()
  return <Panel title="支出カレンダー">
    <div className="actions"><button className={selected || category ? 'quiet' : 'primary'} aria-pressed={!selected && !category} onClick={() => onSelect(null)}>今月すべて</button></div>
    <div className="calendar">
      {['日', '月', '火', '水', '木', '金', '土'].map(day => <b className="weekday" key={day}>{day}</b>)}
      {Array.from({ length: first }, (_, i) => <div key={'blank' + i} />)}
      {Array.from({ length: daysInMonth(month) }, (_, i) => {
        const date = onDay(month, i + 1)
        const records = rows.filter(row => row.date === date)
        const amount = sum(records.map(row => recordAmount(row, category)))
        return <button className="day" key={date} aria-pressed={date === selected} aria-label={date + (records.length ? ' ' + yen(amount) : ' 記録なし')} onClick={() => onSelect(date)}><span>{i + 1}</span><small>{records.length ? yen(amount) : '—'}</small></button>
      })}
    </div>
  </Panel>
}
