import { describe, expect, it } from 'vitest'
import { formatGrouped, formatInputValue, formatNumber, parseNumberInput } from './format.ts'

describe('formatNumber', () => {
  it('有効数字4桁の固定小数点', () => {
    expect(formatNumber(1025.04)).toBe('1025')
    expect(formatNumber(0.75341)).toBe('0.7534')
    expect(formatNumber(1.5)).toBe('1.500')
    expect(formatNumber(123456)).toBe('123456')
    expect(formatNumber(0.001)).toBe('0.001000')
  })

  it('10⁻³ 未満と 10⁶ 以上は指数表記', () => {
    expect(formatNumber(1.234e7)).toBe('1.234×10⁷')
    expect(formatNumber(1.041e-4)).toBe('1.041×10⁻⁴')
    expect(formatNumber(999_999.7)).toBe('1.000×10⁶')
    expect(formatNumber(-4.081e10)).toBe('−4.081×10¹⁰')
  })

  it('特別な値', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(Number.NaN)).toBe('—')
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('∞')
  })
})

describe('parseNumberInput', () => {
  it('普通の数と指数表記', () => {
    expect(parseNumberInput('1.5e7')).toBe(1.5e7)
    expect(parseNumberInput(' -2.5E-3 ')).toBe(-2.5e-3)
    expect(parseNumberInput('.5')).toBe(0.5)
    expect(parseNumberInput('1,000')).toBe(1000)
  })

  it('全角の数字と記号', () => {
    expect(parseNumberInput('１．５ｅ３')).toBe(1500)
    expect(parseNumberInput('−3')).toBe(-3)
  })

  it('数値でないものは null', () => {
    expect(parseNumberInput('')).toBeNull()
    expect(parseNumberInput('abc')).toBeNull()
    expect(parseNumberInput('1e')).toBeNull()
    expect(parseNumberInput('1e999')).toBeNull()
  })
})

describe('formatInputValue', () => {
  it('浮動小数点の誤差を見せない', () => {
    expect(formatInputValue(0.1 + 0.2)).toBe('0.3')
    expect(formatInputValue(1e-4 * 1e6)).toBe('100')
    expect(formatInputValue(1.5e12)).toBe('1.5e12')
    expect(formatInputValue(1e-6)).toBe('1e-6')
  })
})

describe('formatGrouped', () => {
  it('指数表記にせず、3桁ごとにカンマで区切る', () => {
    expect(formatGrouped(9802)).toBe('9,802')
    expect(formatGrouped(12_345_678)).toBe('12,345,678')
    expect(formatGrouped(999)).toBe('999')
    expect(formatGrouped(9801.69, 1)).toBe('9,801.7')
    expect(formatGrouped(-1234.5, 1)).toBe('−1,234.5')
    expect(formatGrouped(Number.NaN)).toBe('—')
  })

  it('区切った文字列は入力欄で読める', () => {
    expect(parseNumberInput(formatGrouped(12_345_678))).toBe(12_345_678)
  })
})
