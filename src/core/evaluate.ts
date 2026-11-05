import { formatNumber } from './physics/format.ts'
import type { ComputeResult, EnumParam, Inputs, Message, NumberParam, OutputDef, ParamDef, SimDefinition } from '../sims/types.ts'

/** 初期値の入力 */
export function defaultInputs(def: SimDefinition): Inputs {
  const inputs: Inputs = {}
  for (const p of def.inputs) {
    inputs[p.key] = p.kind === 'table' ? p.defaultRows.map((r) => ({ ...r })) : p.default
  }
  return inputs
}

/** 選択肢を選んだときに入れるプリセット値 */
export function presetFor(p: EnumParam, value: string, inputs: Inputs): Inputs {
  if (!p.presets) return {}
  return typeof p.presets === 'function' ? p.presets(value, inputs) : (p.presets[value] ?? {})
}

/** 選択肢を変えた後の入力。プリセット値は、選んだ値を入れた後の入力をもとに決める */
export function selectEnum(p: EnumParam, value: string, inputs: Inputs): Inputs {
  const next = { ...inputs, [p.key]: value }
  return { ...next, ...presetFor(p, value, next) }
}

/**
 * 選択欄に表示する値。プリセットで入れた値が手で変えられていれば「カスタム」。
 * 計算には保存している値を使う（ユーザーが選んだ方式のまま）
 */
export function enumDisplayValue(p: EnumParam, inputs: Inputs): string {
  const value = String(inputs[p.key])
  if (!p.customValue || value === p.customValue) return value
  const preset = presetFor(p, value, inputs)
  const keys = p.customKeys ?? Object.keys(preset)
  for (const k of keys) {
    if (!(k in preset)) continue
    if (!sameValue(preset[k], inputs[k])) return p.customValue
  }
  return value
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b))
  return a === b
}

export function isVisible(p: ParamDef | OutputDef, inputs: Inputs): boolean {
  return p.visibleWhen?.(inputs) ?? true
}

/** 今の入力で、そのパラメータが入力か出力か */
export function paramRole(p: ParamDef, inputs: Inputs): 'input' | 'output' {
  return p.kind === 'number' && p.role ? p.role(inputs) : 'input'
}

/** 数値パラメータの範囲チェック。範囲内なら null、範囲外なら理由 */
export function checkNumber(p: NumberParam, value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '数値を入力してください'
  if (p.integer && !Number.isInteger(value)) return '整数を入力してください'
  const belowMin = p.min !== undefined && (p.minExclusive ? value <= p.min : value < p.min)
  const aboveMax = p.max !== undefined && (p.maxExclusive ? value >= p.max : value > p.max)
  if (!belowMin && !aboveMax) return null
  return p.rangeMessage ?? rangeText(p)
}

function rangeText(p: NumberParam): string {
  if (p.min !== undefined && p.max !== undefined) return `${p.min} 〜 ${p.max} の範囲で入力してください`
  if (p.min === 0 && p.minExclusive) return '正の値を入力してください'
  if (p.min !== undefined) return `${p.min} ${p.minExclusive ? 'より大きい' : '以上の'}値を入力してください`
  return `${p.max} ${p.maxExclusive ? 'より小さい' : '以下の'}値を入力してください`
}

/** 表示されている入力欄ごとの不正な値。キー → 理由 */
export function validateInputs(def: SimDefinition, inputs: Inputs): Record<string, string> {
  const invalid: Record<string, string> = {}
  for (const p of def.inputs) {
    if (p.kind !== 'number' || !isVisible(p, inputs) || paramRole(p, inputs) === 'output') continue
    const reason = checkNumber(p, inputs[p.key])
    if (reason) invalid[p.key] = reason
  }
  return invalid
}

export const INVALID_INPUT = 'invalid-input'

/**
 * 入力のチェックをしてから計算する。カードの計算とグラフの各点の計算の入口。
 * 入力が不正なとき、計算が例外を出したとき、NaN が出たときはエラーにする。
 */
export function evaluate(def: SimDefinition, inputs: Inputs): ComputeResult {
  const invalid = Object.keys(validateInputs(def, inputs))
  if (invalid.length > 0) {
    return { outputs: {}, warnings: [], errors: [{ code: INVALID_INPUT, keys: invalid }] }
  }
  let result: ComputeResult
  try {
    result = def.compute(inputs)
  } catch {
    return { outputs: {}, warnings: [], errors: [{ code: 'compute-failed' }] }
  }
  const bad: Message[] = []
  for (const [key, out] of Object.entries(result.outputs)) {
    if (out.kind === 'number' && !Number.isFinite(out.value)) bad.push({ code: 'non-finite', keys: [key] })
  }
  return bad.length > 0 ? { ...result, errors: [...result.errors, ...bad] } : result
}

/** メッセージの文言。モジュールの文言、共通の文言の順に探す */
export function messageText(def: SimDefinition, m: Message): string {
  const text = def.messages[m.code] ?? commonMessages[m.code] ?? m.code
  if (!m.params) return text
  return text.replace(/\{(\w+)\}/g, (all, name: string) => {
    const v = m.params![name]
    if (v === undefined) return all
    return typeof v === 'number' ? formatNumber(v) : v
  })
}

/** モジュールによらない共通のメッセージ */
export const commonMessages: Record<string, string> = {
  [INVALID_INPUT]: '入力に不正な値があります',
  'compute-failed': '計算中にエラーが起きました',
  'non-finite': '計算結果が有限の値になりませんでした（0除算やオーバーフロー）',
}
