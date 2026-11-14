import assert from 'node:assert/strict'
import { test } from 'node:test'
import { starter } from './seed.ts'
import { monthlyAllocation } from './allocation.ts'
import { monthly } from './finance.ts'
import type { Transaction } from './model.ts'

const buy=(id:string,date:string,paymentId:string,amount:number,extra:Partial<Transaction>={}):Transaction=>({id,date,paymentId,merchant:id,memo:'',personal:false,items:[{id:'item-'+id,name:'買い物',categoryId:'food',quantity:1,amount,discount:0}],...extra})
test('fixed cash payment is assigned to cash even when its legacy source account is a bank',()=>{
 const d=starter();d.accounts[0].name='東北労働金庫'
 d.fixed=[{id:'f',name:'現金で払う固定費',amount:1500,accountId:'main',cashPaymentId:'cash',dueDay:null,startMonth:'2026-11',endMonth:null,kind:'expense'}]
 const result=monthlyAllocation(d,'2026-11')
 assert.equal(result.groups.find(g=>g.id==='cash')?.amount,1500)
 assert.equal(result.groups.find(g=>g.id==='main')?.amount,0)
 assert.equal(result.expense,1500)
})
test('unused placeholder account is hidden; real banks and linked nonzero amounts stay visible',()=>{
 const d=starter()
 assert.equal(monthlyAllocation(d,'2026-11').groups.some(g=>g.name==='メイン口座'),false)
 d.transactions=[buy('card','2026-11-11','card',1000)]
 assert.equal(monthlyAllocation(d,'2026-11').groups.find(g=>g.id==='main')?.amount,1000)
 d.transactions=[];d.accounts[0].name='東北労働金庫'
 assert.equal(monthlyAllocation(d,'2026-11').groups.some(g=>g.name==='東北労働金庫'),true)
})
test('bank distribution uses purchase month even after closing day; cash is separate and refunds net correctly',()=>{
 const d=starter();d.accounts[0].name='東北労働金庫';d.payments[2].closingDay=15
 d.transactions=[buy('nov','2026-11-30','card',10000),buy('refund','2026-11-30','card',-1000),buy('old','2026-10-31','card',3000),buy('later','2026-12-01','card',9000),buy('cash','2026-11-10','cash',2000),buy('cash-refund','2026-11-11','cash',-500)]
 const result=monthlyAllocation(d,'2026-11')
 assert.equal(result.rows.find(r=>r.paymentId==='card')?.amount,9000)
 assert.equal(result.groups.find(g=>g.id==='main')?.amount,9000)
 assert.equal(result.groups.find(g=>g.id==='cash')?.amount,1500)
 assert.equal(result.expense,10500)
 assert.equal(monthly(d,'2026-11').spent,10500)
 assert.equal(monthlyAllocation(d,'2026-12').expense,9000)
})
test('fixed paid through a card is counted once and linked actual replaces fixed estimate',()=>{
 const d=starter();d.accounts.push({id:'bank2',name:'山形銀行',kind:'main',openingBalances:{}})
 d.fixed=[{id:'shed',name:'物置ローン',amount:7000,accountId:'bank2',cardPaymentId:'card',dueDay:null,kind:'expense',startMonth:'2026-11',endMonth:null},{id:'school',name:'学校費用',amount:10000,accountId:'bank2',dueDay:null,kind:'expense',startMonth:'2026-11',endMonth:null}]
 assert.equal(monthlyAllocation(d,'2026-11').rows.find(r=>r.paymentId==='card')?.amount,7000)
 d.transactions=[buy('actual','2026-11-12','card',6000,{fixedExpenseId:'shed'})]
 const result=monthlyAllocation(d,'2026-11')
 assert.equal(result.expense,16000)
 assert.equal(result.groups.find(g=>g.id==='main')?.amount,6000)
 assert.equal(result.groups.find(g=>g.id==='bank2')?.amount,10000)
 assert.equal(result.rows.some(r=>r.id==='fixed:shed'),false)
 assert.equal(monthly(d,'2026-11').spent,0)
})
test('forecasts, reserves and confirmed zero are linked; transfers and annual-account activity are excluded',()=>{
 const d=starter()
 d.incomes=[{id:'papa',label:'給与',date:'2026-11-01',forecast:280000,actual:281000,route:'budget',accountId:'main'}, {id:'mama',label:'給与',date:'2026-11-01',forecast:100000,actual:null,route:'budget',accountId:'main'}, {id:'reserve',label:'予備費',date:'2026-11-01',forecast:10000,actual:null,route:'reserve',accountId:'main'}, {id:'zero',label:'その他',date:'2026-11-01',forecast:5000,actual:0,route:'budget',accountId:'main'}]
 d.transfers=[{id:'t',date:'2026-11-11',from:'main',to:'annual',amount:5000,completed:true,purpose:'transfer'}]
 d.annual=[{id:'tax',label:'税金',kind:'expense',amount:60000,accountId:'annual'}];d.annualActuals=[{id:'a',planId:'tax',date:'2026-11-11',amount:60000}]
 const result=monthlyAllocation(d,'2026-11');assert.equal(result.income,391000);assert.equal(result.expense,0);assert.equal(result.balance,391000)
})
test('monthly card amount replaces, does not add to, calculation and can be revised or cleared without changing food detail',()=>{
 const d=starter();d.transactions=[buy('food','2026-11-11','card',10000)]
 d.monthlyCardAmounts={'card:2026-11':{amount:12000,confirmed:false}}
 assert.equal(monthlyAllocation(d,'2026-11').expense,12000)
 d.monthlyCardAmounts['card:2026-11']={amount:11000,confirmed:true}
 assert.equal(monthlyAllocation(d,'2026-11').expense,11000)
 assert.equal(monthlyAllocation(d,'2026-11').rows.find(r=>r.paymentId==='card')?.confirmed,true)
 assert.equal(monthly(d,'2026-11').categorySpend.food,10000)
 d.monthlyCardAmounts['card:2026-11']={amount:0,confirmed:true};assert.equal(monthlyAllocation(d,'2026-11').expense,0)
 delete d.monthlyCardAmounts['card:2026-11'];assert.equal(monthlyAllocation(d,'2026-11').expense,10000)
 assert.equal(monthlyAllocation(d,'2026-12').expense,0)
})
