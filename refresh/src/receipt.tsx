import { useState } from 'react'
import { Camera, ScanLine } from 'lucide-react'
import { z } from 'zod'
import { readReceipt } from './cloud'
import { daysInMonth, monthOf } from './finance'

const money = z.int().min(-1_000_000_000).max(1_000_000_000)
const scanSchema = z.object({
  merchant: z.string().trim().max(100).nullable(),
  date: z.string().nullable(),
  total: money.nullable(),
  externalTax: money.min(0).nullable().optional(),
  items: z.array(z.object({ name: z.string().trim().max(100), amount: money.nullable(), discount: money.nullable() })).min(1).max(100),
})
export type ReceiptScan = z.infer<typeof scanSchema> & { fingerprint: string }

async function prepareImage(file: File) {
  if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {
    throw new Error('20MB以下の画像を選んでください。')
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('画像を変換できません。')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob && blob.size <= 3 * 1024 * 1024 ? resolve(blob) : reject(new Error('画像が大きすぎます。')),
      'image/jpeg', 0.86,
    ))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function ReceiptReader({ onRead, seen }: { onRead: (scan: ReceiptScan) => void; seen: (fingerprint: string) => boolean }) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  return <div className="scan-flow">
    <label className="scan-picker">
      <input className="sr-only" aria-label="レシート画像を選ぶ" type="file" accept="image/*" disabled={busy} onChange={event => {
        setFile(event.target.files?.[0] ?? null)
        setMessage('')
      }} />
      <Camera size={25} aria-hidden="true" />
      <strong>{file ? '別の画像を選ぶ' : '撮影・写真を選ぶ'}</strong>
      <small>{file?.name ?? 'レシートや通販のスクリーンショット'}</small>
    </label>
    <p className="hint">選んだ画像は読み取り時にGeminiへ送信します。読み取った明細を確認してから保存できます。</p>
    <button type="button" className="primary scan-submit" disabled={!file || busy} onClick={async () => {
      if (!file) return
      setBusy(true)
      setMessage('')
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('20MB以下の画像を選んでください。')
        const buffer = await file.arrayBuffer()
        const fingerprint = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))]
          .map(byte => byte.toString(16).padStart(2, '0')).join('')
        if (seen(fingerprint)) throw new Error('この画像はすでに登録済みです。')
        let jpeg: Blob
        try { jpeg = await prepareImage(file) } catch { throw new Error('画像を開けません。20MB以下のJPEGやPNGでお試しください。') }
        const parsed = scanSchema.parse(await readReceipt(jpeg, AbortSignal.timeout(35_000)))
        const subtotal = parsed.items.reduce((sum, item) => sum + (item.amount ?? 0) - (item.discount ?? 0), 0)
        if (!parsed.externalTax || parsed.items.some(item => item.amount === null) || subtotal + parsed.externalTax !== parsed.total) {
          parsed.externalTax = null
        }
        const date = parsed.date
        if (date && (!/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/.test(date) ||
            Number(date.slice(8)) < 1 || Number(date.slice(8)) > daysInMonth(monthOf(date)))) parsed.date = null
        onRead({ ...parsed, fingerprint })
        setFile(null)
      } catch (error) {
        setMessage(error instanceof z.ZodError ? '明細の一部を読み取れませんでした。画像を撮り直すか手入力してください。'
          : error instanceof Error ? error.message : '読み取れませんでした。')
      } finally { setBusy(false) }
    }}><ScanLine size={18} aria-hidden="true" />{busy ? '読み取り中…' : 'Geminiで読み取る'}</button>
    {message && <p className="notice" role="alert">{message}</p>}
  </div>
}
