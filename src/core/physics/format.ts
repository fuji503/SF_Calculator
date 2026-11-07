/**
 * 数値の表示（WebApp仕様書 §5.4）。
 * 有効数字4桁。絶対値が 10⁻³ 未満または 10⁶ 以上のときは指数表記（1.234×10⁷）にする。
 */

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻',
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
}

export function formatNumber(value: number, digits = 4): string {
  if (Number.isNaN(value)) return '—'
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞'
  if (value === 0) return '0'

  // 丸めた結果で判定する（999,999.7 → 1.000×10⁶）
  const [mantissa, expStr] = value.toExponential(digits - 1).split('e')
  const exp = Number(expStr)
  if (exp < -3 || exp >= 6) {
    const sup = String(exp).replace(/./g, (c) => SUPERSCRIPT[c] ?? c)
    return `${mantissa.replace('-', '−')}×10${sup}`
  }
  // 固定小数点。末尾の 0 は有効数字として残す（1.500）
  const decimals = Math.max(0, digits - 1 - exp)
  return value.toFixed(decimals).replace('-', '−')
}

/**
 * 個数など、桁が大きくても指数表記にせず、3桁ごとにカンマで区切って書く（1,234,567）。
 * decimals は小数点以下の桁数
 */
export function formatGrouped(value: number, decimals = 0): string {
  if (Number.isNaN(value)) return '—'
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞'
  const [int, frac] = Math.abs(value).toFixed(decimals).split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const sign = value < 0 && Number(Math.abs(value).toFixed(decimals)) !== 0 ? '−' : ''
  return sign + (frac ? `${grouped}.${frac}` : grouped)
}

/**
 * 入力欄の文字列を数値にする。指数表記（1.5e7、1.5E-3）、全角数字、桁区切りのカンマを受け付ける。
 * 数値として読めないときは null。
 */
export function parseNumberInput(text: string): number | null {
  const normalized = text
    .replace(/[０-９．－＋ｅＥ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[−ー]/g, '-')
    .replace(/[,\s]/g, '')
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(normalized)) return null
  const v = Number(normalized)
  return Number.isFinite(v) ? v : null
}

/** 入力欄に入れる文字列。有効数字を多めに残し、末尾の 0 は消す */
export function formatInputValue(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (value === 0) return '0'
  const abs = Math.abs(value)
  if (abs >= 1e-4 && abs < 1e9) return String(Number(value.toPrecision(10)))
  const [m, e] = value.toExponential(9).split('e')
  return `${String(Number(m))}e${Number(e)}`
}
