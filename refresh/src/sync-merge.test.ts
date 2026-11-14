import assert from 'node:assert/strict'
import { test } from 'node:test'
import { starter } from './seed.ts'
import { mergeLedgers, sameLedger } from './sync-merge.ts'
const clone=<T>(v:T):T=>structuredClone(v)
test('independent fixed changes and a new expense merge without losing either',()=>{
 const base=starter();base.fixed=[{id:'f',name:'通信費',amount:1000,accountId:'main',dueDay:null,startMonth:'2026-11',endMonth:null,kind:'expense'}]
 const local=clone(base),remote=clone(base);local.fixed[0].amount=1500
 remote.transactions=[{id:'t',date:'2026-11-14',merchant:'店',paymentId:'card',personal:false,memo:'',items:[{id:'i',categoryId:'food',name:'食品',quantity:1,amount:800,discount:0}]}]
 const result=mergeLedgers(base,local,remote);assert.equal(result.conflicts.length,0);assert.equal(result.ledger.fixed[0].amount,1500);assert.equal(result.ledger.transactions.length,1)
})
test('different fields of same item merge, same field requires explicit choice',()=>{
 const base=starter();base.categories[0].name='食費'
 const local=clone(base),remote=clone(base);local.categories[0].name='食品';remote.categories[0].color='#ff0000'
 assert.equal(mergeLedgers(base,local,remote).conflicts.length,0)
 remote.categories[0].name='ごはん';const result=mergeLedgers(base,local,remote);assert.equal(result.conflicts.length,1)
 const resolved=mergeLedgers(base,local,remote,{[result.conflicts[0].path]:'local'});assert.equal(resolved.ledger.categories[0].name,'食品');assert.equal(resolved.ledger.categories[0].color,'#ff0000');assert.equal(resolved.conflicts.length,0)
})
test('deletions versus edits conflict and legacy unknown baseline never discards differences',()=>{
 const base=starter(),local=clone(base),remote=clone(base);local.categories=local.categories.filter(c=>c.id!=='daily');remote.categories.find(c=>c.id==='daily')!.name='雑貨'
 assert.ok(mergeLedgers(base,local,remote).conflicts.length)
 assert.ok(mergeLedgers(undefined,local,remote).conflicts.length)
 assert.equal(mergeLedgers(undefined,remote,remote).conflicts.length,0)
 assert.equal(sameLedger({b:1,a:2},{a:2,b:1}),true)
})
