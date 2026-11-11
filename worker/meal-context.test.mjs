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
 assert.equal(dinnerContext({...input,favorites:Array(61).fill({name:'カレー',notes:'',lastCooked:null})}),null)
 assert.equal(dinnerContext({...input,recent:[{name:'カレー',date:'2026-11-10',note:'x'.repeat(301)}]}),null)
})

test('future dinner plans are accepted separately from actual history and bounded',()=>{
 const input={date:'2026-11-11',selectedDate:'2026-11-12',preferences:'鶏肉は多め',favorites:[],recent:[],planned:[{name:'チキンステーキ',date:'2026-11-12',note:'鶏肉を買う'}]}
 const result=dinnerContext(input)
 assert.match(result, /"planned":\[{"name":"チキンステーキ"/)
 assert.match(result, /"recent":\[\]/)
 assert.match(result, /鶏肉は多め/)
 assert.equal(dinnerContext({...input,selectedDate:'2026-02-30'}),null)
 assert.equal(dinnerContext({...input,planned:Array(31).fill(input.planned[0])}),null)
 assert.equal(dinnerContext({...input,preferences:'x'.repeat(1001)}),null)
})
