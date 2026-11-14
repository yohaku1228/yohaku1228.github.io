import { useState } from 'react'
import { useLedger } from './storage'
import { Field, Panel } from './ui'
const labels: Record<string,string>={name:'名前',label:'項目',merchant:'店舗',date:'日付',amount:'金額',forecast:'見込み',actual:'確定額',accountId:'口座',cardPaymentId:'カード',cashPaymentId:'現金払い'}
export function CloudConflict() {
 const conflicts=useLedger(s=>s.syncConflicts),resolve=useLedger(s=>s.resolveCloud),data=useLedger(s=>s.ledger)
 const [choices,setChoices]=useState<Record<string,'local'|'remote'>>({})
 function format(value:unknown,depth=0):string {
  if(value===undefined||value===null)return '未入力・削除'
  if(typeof value==='string')return data.accounts.find(a=>a.id===value)?.name??data.payments.find(p=>p.id===value)?.name??data.categories.find(c=>c.id===value)?.name??value
  if(typeof value==='number')return value.toLocaleString('ja-JP')
  if(typeof value==='boolean')return value?'はい':'いいえ'
  if(Array.isArray(value))return value.map(v=>format(v,depth+1)).join('、')||'登録なし'
  if(typeof value==='object')return Object.entries(value).filter(([key])=>depth<2||key==='name'||key==='amount').slice(0,12).map(([key,v])=>(labels[key]??key)+'：'+format(v,depth+1)).join(' ／ ')
  return String(value)
 }
 return <section className="wrap cloud-conflict"><Panel title="保存内容の確認">
  <p className="hint">同じ項目が両方の端末で変わっています。使う内容を選んでください。ほかの変更は自動で合わせます。</p>
  <form onSubmit={e=>{e.preventDefault();resolve(choices)}}>
   {conflicts.map(c=><div className="sync-choice" key={c.path}><h3>{c.title}</h3><p><b>この端末：</b>{format(c.local)}</p><p><b>クラウド：</b>{format(c.remote)}</p><Field label="保存する内容"><select aria-label={c.title+'の保存する内容'} required value={choices[c.path]??''} onChange={e=>setChoices(old=>({...old,[c.path]:e.target.value as 'local'|'remote'}))}><option value="" disabled>選んでください</option><option value="local">この端末の内容</option><option value="remote">クラウドの内容</option></select></Field></div>)}
   <div className="actions"><button className="primary">選んだ内容を保存</button></div>
  </form>
 </Panel></section>
}
