import test from 'node:test'
import assert from 'node:assert/strict'
import { dinnerContext } from './meal-context.mjs'

test('dinner context keeps unknown dates unknown and calculates actual elapsed days',()=>{
 const input={date:'2026-11-11',favorites:[{name:'ぎょうざ',notes:'野菜多め',lastCooked:'2026-10-20'},{name:'カレー',notes:'',lastCooked:null}],recent:[{name:'ぎょうざ',date:'2026-10-20',note:'家族に好評'}]}
 const result=dinnerContext(input)
 assert.match(result,/"daysSince":22/)
 assert.match(result,/"lastCooked":null,"daysSince":null/)
 assert.match(result,/家族に好評/)
 assert.equal(dinnerContext(undefined),'')
})
test('invalid calendar dates, future meal dates and oversized data are rejected',()=>{
 const input={date:'2026-11-11',favorites:[],recent:[]}
 assert.equal(dinnerContext({...input,date:'2026-02-30'}),null)
 assert.equal(dinnerContext({...input,recent:[{name:'カレー',date:'2026-11-12'}]}),null)
 assert.equal(dinnerContext({...input,favorites:[{name:'カレー',notes:'',lastCooked:'2026-11-12'}]}),null)
 assert.equal(dinnerContext({...input,favorites:Array(41).fill({name:'カレー',notes:'',lastCooked:null})}),null)
 assert.equal(dinnerContext({...input,recent:[{name:'カレー',date:'2026-11-10',note:'x'.repeat(301)}]}),null)
})
