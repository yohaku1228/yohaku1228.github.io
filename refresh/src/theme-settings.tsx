import { useEffect, useState } from 'react'
import type { Ledger } from './model'
import { applyTheme, defaultTheme } from './theme'
import { Field, Panel, type Save } from './ui'

export function ThemeSettings({ data, save }: { data: Ledger; save: Save }) {
  const saved = data.themeColor ?? defaultTheme
  const [color, setColor] = useState(saved)
  const [notice, setNotice] = useState('')
  useEffect(() => {
    applyTheme(color)
    return () => applyTheme(saved)
  }, [color, saved])
  return <Panel title="テーマカラー">
    <form className="theme-form" onSubmit={event => { event.preventDefault(); if (save(old => ({ ...old, themeColor: color }))) setNotice('テーマを保存しました。') }}>
      <Field label="サイトの色"><input className="theme-color-input" aria-label="サイトの色" type="color" value={color} onChange={event => { setColor(event.target.value); setNotice('') }} /></Field>
      <p className="hint">色を選ぶと画面に反映されます。保存したテーマは、家計と一緒に夫婦で共有します。</p>
      <div className="actions"><button className="primary">この色を保存</button><button className="quiet" type="button" onClick={() => { setColor(defaultTheme); setNotice('') }}>青に戻す</button></div>
      {notice && <p className="hint" role="status">{notice}</p>}
    </form>
  </Panel>
}
