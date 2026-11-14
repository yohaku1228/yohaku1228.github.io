import assert from 'node:assert/strict'
import { test } from 'node:test'
import { starter } from './seed.ts'
import { expenseRecords, recordAmount } from './expense-records.ts'
import { monthly, sum } from './finance.ts'
import type { Transaction } from './model.ts'
const buy=(id:string,date:string,amount:number,extra:Partial<Transaction>={}):Transaction=>({id,date,paymentId:'card',merchant:id,memo:'',personal:false,items:[{id:id+'-item',name:'買い物',categoryId:'food',quantity:1,amount,discount:0}],...extra})
test('monthly and daily record totals retain refunds, private and fixed entries like full history',()=>{
 const d=starter();d.transactions=[buy('mixed','2026-11-14',100,{externalTax:16,items:[{id:'f',name:'食品',categoryId:'food',quantity:1,amount:100,discount:0},{id:'d',name:'日用品',categoryId:'daily',quantity:1,amount:100,discount:0}]}),buy('refund','2026-11-13',-8),buy('personal','2026-11-14',500,{personal:true}),buy('fixed','2026-11-14',1000,{fixedExpenseId:'school'}),buy('other','2026-12-01',999)]
 assert.equal(sum(expenseRecords(d,'2026-11').map(row=>recordAmount(row))),1708)
 assert.equal(sum(expenseRecords(d,'2026-11','', '2026-11-14').map(row=>recordAmount(row))),1716)
 assert.equal(expenseRecords(d,'2026-11','', '2026-11-01').length,0)
 const household=expenseRecords(d,'2026-11','food',null,true)
 assert.equal(household.length,2)
 assert.equal(sum(household.map(row=>recordAmount(row,'food'))),100)
 assert.equal(sum(household.map(row=>recordAmount(row,'food'))),monthly(d,'2026-11').categorySpend.food)
 assert.equal(recordAmount(d.transactions[0],'daily'),108)
})
