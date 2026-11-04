/**
 * グラフ用のパラメータスイープ（WebApp仕様書 §4.7 グラフ欄）。
 * X軸以外の入力をカードの値に固定し、X軸のパラメータだけを範囲内で動かして計算する。
 */
import type { Inputs, NumberParam, OutputDef, SimDefinition } from '../sims/types.ts'
import { evaluate, isVisible, paramRole } from './evaluate.ts'

export type AxisScale = 'linear' | 'log'

export interface GraphSettings {
  /** X軸の入力のキー */
  x: string
  /** X軸の範囲（内部単位） */
  xMin: number
  xMax: number
  xScale: AxisScale
  points: number
  /** Y軸の出力のキー。当面は1つだけ使う（§11.2） */
  y: string[]
  yScale: AxisScale
}

export const DEFAULT_POINTS = 50
export const MIN_POINTS = 2
export const MAX_POINTS = 500

/** X軸に選べる入力：表示されている数値の入力で、今は出力になっていないもの */
export function xCandidates(def: SimDefinition, inputs: Inputs): NumberParam[] {
  return def.inputs.filter(
    (p): p is NumberParam => p.kind === 'number' && isVisible(p, inputs) && paramRole(p, inputs) === 'input',
  )
}

/** Y軸に選べる出力：数値の出力と、出力になっている数値の入力 */
export function yCandidates(def: SimDefinition, inputs: Inputs): (OutputDef | NumberParam)[] {
  const outputs = def.outputs.filter((o) => o.kind === 'number' && isVisible(o, inputs))
  const roleOutputs = def.inputs.filter(
    (p): p is NumberParam =>
      p.kind === 'number' && paramRole(p, inputs) === 'output' && !outputs.some((o) => o.key === p.key),
  )
  return [...outputs, ...roleOutputs]
}

/** X軸の範囲の初期値：現在値の 1/10〜10倍、対数（§4.7）。範囲はパラメータの上下限に収める */
export function defaultXRange(p: NumberParam, current: unknown): Pick<GraphSettings, 'xMin' | 'xMax' | 'xScale'> {
  const v = typeof current === 'number' && current > 0 ? current : p.default
  if (v > 0) {
    let lo = v / 10
    let hi = v * 10
    if (p.min !== undefined && lo < p.min) lo = p.min > 0 ? p.min : lo
    if (p.max !== undefined && hi > p.max) hi = p.max
    if (lo > 0 && hi > lo) return { xMin: lo, xMax: hi, xScale: 'log' }
  }
  const lo = p.min ?? 0
  return { xMin: lo, xMax: p.max ?? lo + 1, xScale: 'linear' }
}

export function defaultGraph(def: SimDefinition, inputs: Inputs, x = def.defaultGraph.x): GraphSettings {
  const p = def.inputs.find((q): q is NumberParam => q.key === x && q.kind === 'number')
  const range = p ? defaultXRange(p, inputs[x]) : { xMin: 1, xMax: 10, xScale: 'log' as const }
  return {
    x,
    ...range,
    points: DEFAULT_POINTS,
    y: [def.defaultGraph.y],
    yScale: 'log',
  }
}

/** 設定の範囲がそのまま使えないときの理由。使えるなら null */
export function graphRangeProblem(g: GraphSettings): string | null {
  if (!Number.isFinite(g.xMin) || !Number.isFinite(g.xMax)) return 'X軸の範囲を数値で入力してください'
  if (g.xMin >= g.xMax) return 'X軸の最小値は最大値より小さくしてください'
  if (g.xScale === 'log' && g.xMin <= 0) return '対数軸では、X軸の最小値を正の値にしてください'
  return null
}

/** X軸の値の列。整数のパラメータは丸めて、重なった点を除く */
export function sweepXs(g: GraphSettings, integer = false): number[] {
  const n = Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(g.points)))
  const xs: number[] = []
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1)
    let x =
      g.xScale === 'log'
        ? Math.exp(Math.log(g.xMin) + f * (Math.log(g.xMax) - Math.log(g.xMin)))
        : g.xMin + f * (g.xMax - g.xMin)
    if (integer) x = Math.round(x)
    if (xs.length === 0 || x !== xs[xs.length - 1]) xs.push(x)
  }
  return xs
}

export interface SweepResult {
  x: number[]
  /** 出力のキー → 各点の値。計算できない点は null（線が途切れる） */
  y: Record<string, (number | null)[]>
}

export function runSweep(def: SimDefinition, inputs: Inputs, g: GraphSettings): SweepResult {
  const p = def.inputs.find((q): q is NumberParam => q.key === g.x && q.kind === 'number')
  const xs = graphRangeProblem(g) ? [] : sweepXs(g, p?.integer)
  const y: Record<string, (number | null)[]> = Object.fromEntries(g.y.map((k) => [k, []]))
  for (const x of xs) {
    const r = evaluate(def, { ...inputs, [g.x]: x })
    for (const k of g.y) {
      const out = r.outputs[k]
      const ok = r.errors.length === 0 && out?.kind === 'number' && Number.isFinite(out.value)
      y[k].push(ok ? (out as { value: number }).value : null)
    }
  }
  return { x: xs, y }
}
