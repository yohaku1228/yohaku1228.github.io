import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrast, defaultTheme, themePalette, validTheme } from './theme.ts'

test('free colors retain readable button, gradient and ordinary text contrast',()=>{
 for(const color of ['#ffff00','#ff0000','#00ffff','#ffffff','#000000','#777777','#7a7a00','#88bbff','#ff77aa']) {
  const p=themePalette(color)
  assert.equal(p['--accent'],color)
  assert.ok(contrast(p['--on-accent'],p['--accent'])>=4.5,color)
  assert.ok(contrast(p['--on-accent'],p['--accent-dark'])>=4.5,color)
  assert.ok(contrast(p['--blue'],'#ffffff')>=4.5,color)
 }
})
test('only six-digit hexadecimal colors are accepted and unsafe input falls back',()=>{
 assert.equal(validTheme('#aabbcc'),true)
 assert.equal(validTheme('#AABBCC'),true)
 for(const value of ['red','#abc','url(https://example.com)',';color:red',null]) assert.equal(validTheme(value),false)
 assert.equal(themePalette('invalid')['--accent'],defaultTheme)
})
