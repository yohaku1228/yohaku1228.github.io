import assert from 'node:assert/strict'
import { test } from 'node:test'
import { starter } from './seed.ts'
import { favoritesFor, mealCandidates, mealContext, mealOverview } from './meals.ts'

test('old ledgers get household favorites without fabricating dinner history', () => {
 const data=starter()
 assert.equal(favoritesFor(data).length,16)
 assert.equal(data.mealHistory,undefined)
 assert.ok(mealCandidates(data,'2026-11-11').every(row=>row.lastCooked===null))
 assert.equal(mealContext(data,'2026-11-11').recent.length,0)
})
test('uses latest actual dinner, preserves notes and ranks long gaps before unrecorded meals', () => {
 const data=starter()
 data.mealHistory=[
  {id:'a',mealId:'curry',name:'カレー',date:'2026-10-01'},
  {id:'b',mealId:'curry',name:'カレー',date:'2026-11-10',note:'おかわりした'},
  {id:'c',mealId:'gyoza',name:'ぎょうざ',date:'2026-10-10'},
  {id:'d',mealId:'fish',name:'焼き魚',date:'2026-10-20'},
  {id:'future',mealId:'stew',name:'シチュー',date:'2026-12-01'},
 ]
 const rows=mealOverview(data,'2026-11-11')
 assert.equal(rows.find(r=>r.id==='curry')?.daysSince,1)
 assert.equal(rows.find(r=>r.id==='stew')?.lastCooked,null)
 assert.equal(mealCandidates(data,'2026-11-11')[0].id,'gyoza')
 assert.equal(mealCandidates(data,'2026-11-11')[1].id,'fish')
 assert.equal(mealContext(data,'2026-11-11').recent[0].note,'おかわりした')
 assert.equal(mealContext(data,'2026-11-11').recent.length,4)
})
test('cleared favorites stay empty and deleted records no longer count',()=>{
 const data=starter();data.favoriteMeals=[]
 assert.equal(favoritesFor(data).length,0)
 data.favoriteMeals=[{id:'custom',name:'おでん',notes:'大根多め'}]
 data.mealHistory=[{id:'r',mealId:'custom',name:'おでん',date:'2024-02-28'}]
 assert.equal(mealOverview(data,'2024-03-01')[0].daysSince,2)
 data.mealHistory=[]
 assert.equal(mealOverview(data,'2024-03-01')[0].lastCooked,null)
})
