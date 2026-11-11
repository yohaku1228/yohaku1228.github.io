export const defaultTheme = '#2569b2'
export const validTheme = (color: unknown): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
const rgb = (color: string) => [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16))
export function mixColor(color: string, other: string, ratio: number) {
  const b = rgb(other)
  return '#' + rgb(color).map((n, i) => Math.round(n * (1 - ratio) + b[i] * ratio).toString(16).padStart(2, '0')).join('')
}
const luminance = (color: string) => rgb(color).map(n => { const c = n / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
export const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
export function themePalette(value: string) {
  const color = validTheme(value) ? value.toLowerCase() : defaultTheme
  let text = color
  for (let i = 0; i < 30 && contrast(text, '#ffffff') < 5; i++) text = mixColor(text, '#000000', 0.12)
  let dark = mixColor(color, '#000000', 0.12)
  if (Math.max(Math.min(contrast('#ffffff', color), contrast('#ffffff', dark)), Math.min(contrast('#000000', color), contrast('#000000', dark))) < 4.5) dark = color
  const ink = mixColor(color, '#000000', 0.83)
  const whiteScore = Math.min(contrast('#ffffff', color), contrast('#ffffff', dark))
  const blackScore = Math.min(contrast('#000000', color), contrast('#000000', dark))
  return {
    '--accent': color, '--accent-dark': dark, '--on-accent': whiteScore >= blackScore ? '#ffffff' : '#000000',
    '--blue': text, '--ink': ink, '--muted': mixColor(text, '#000000', 0.2),
    '--page': mixColor(color, '#ffffff', 0.94), '--surface': mixColor(color, '#ffffff', 0.98),
    '--wash': mixColor(color, '#ffffff', 0.94), '--soft': mixColor(color, '#ffffff', 0.85),
    '--border': mixColor(color, '#ffffff', 0.78), '--tint': mixColor(color, '#ffffff', 0.91),
  }
}
export function applyTheme(color: string) {
  const colors = themePalette(color)
  for (const [name, value] of Object.entries(colors)) document.documentElement.style.setProperty(name, value)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors['--page'])
}
const cacheKey = 'moneyflow:last-theme'
export function cachedTheme() {
  try { const value = localStorage.getItem(cacheKey); return validTheme(value) ? value : defaultTheme } catch { return defaultTheme }
}
export function cacheTheme(color: string) { try { localStorage.setItem(cacheKey, color) } catch { /* The ledger remains the source of truth. */ } }
