import { describe, expect, it } from 'vitest'
import { defaultInputs, enumDisplayValue, evaluate, messageText, selectEnum } from '../../core/evaluate.ts'
import { xCandidates, yCandidates } from '../../core/sweep.ts'
import type { EnumParam, Inputs } from '../types.ts'
import { sunshade } from './definition.ts'

const enumParam = (key: string) => sunshade.inputs.find((p) => p.key === key) as EnumParam
const pick = (inputs: Inputs, key: string, value: string) => selectEnum(enumParam(key), value, inputs)
const num = (r: ReturnType<typeof evaluate>, key: string) => {
  const v = r.outputs[key]
  return v?.kind === 'number' ? v.value : Number.NaN
}

describe('定義', () => {
  it('キーが重複せず、まとまりがすべて定義されている', () => {
    const inputs = sunshade.inputs.map((p) => p.key)
    expect(new Set(inputs).size).toBe(inputs.length)
    const outputs = sunshade.outputs.map((o) => o.key)
    expect(new Set(outputs).size).toBe(outputs.length)
    const groups = new Set(sunshade.groups.map((g) => g.id))
    for (const p of sunshade.inputs) expect(groups.has(p.group!)).toBe(true)
  })

  it('グラフの初期の軸が選べる', () => {
    const i = defaultInputs(sunshade)
    expect(xCandidates(sunshade, i).map((p) => p.key)).toContain(sunshade.defaultGraph.x)
    expect(yCandidates(sunshade, i).map((o) => o.key)).toContain(sunshade.defaultGraph.y)
  })
})

describe('シナリオ（§3.9）', () => {
  it('新しいカードは「地球 L1 の標準」で始まり、T4（Angel 2006）の結果になる', () => {
    const i = defaultInputs(sunshade)
    expect(enumDisplayValue(enumParam('scenario'), i)).toBe('earth_l1')
    const r = evaluate(sunshade, i)
    expect(r.errors).toEqual([])
    expect(num(r, 'd') / 1.83e9).toBeCloseTo(1, 3)
    expect(num(r, 'A_req') / 4.662e12).toBeCloseTo(1, 3)
    expect(num(r, 'M_station') / 1.958e10).toBeCloseTo(1, 3)
    expect(r.outputs.series_build?.kind).toBe('series')
  })

  it('「火星向けの即応」は T9 の結果になる', () => {
    const i = pick(defaultInputs(sunshade), 'scenario', 'mars_rapid')
    const r = evaluate(sunshade, i)
    expect(r.errors).toEqual([])
    expect(num(r, 'A_req') / 3.095e15).toBeCloseTo(1, 3)
    expect(num(r, 't_min') / 86_400).toBeCloseTo(101.9, 0)
    expect(num(r, 'M_total') / 3.824e13).toBeCloseTo(1, 3)
    expect(r.outputs.series_standby?.kind).toBe('series')
    // 値を変えると「自由に設定」
    expect(enumDisplayValue(enumParam('scenario'), { ...i, f_target: 0.02 })).toBe('custom')
  })
})

describe('プリセットとメッセージ', () => {
  it('対象天体を変えると、公転軌道間の Δv も入れ直す', () => {
    let i = pick(defaultInputs(sunshade), 'dv_preset', 'orbit')
    expect(i.dv_tr).toBe(0)
    i = pick(i, 'target', 'mars')
    expect(Number(i.dv_tr)).toBeCloseTo(5660, -1)
    expect(enumDisplayValue(enumParam('dv_preset'), i)).toBe('orbit')
  })

  it('メッセージに計算した数値が入る', () => {
    const i = { ...pick(defaultInputs(sunshade), 'scenario', 'mars_rapid'), sigma_film: 3.8e-3 }
    const r = evaluate(sunshade, i)
    expect(messageText(sunshade, r.errors[0])).toBe('シェードが重すぎます。この位置で止まるには、機体全体の面密度を 2.162 g/m² 以下にしてください')
  })

  it('構成から性能を出すときだけ、機数を入力にする', () => {
    const i = pick(defaultInputs(sunshade), 'scenario', 'mars_rapid')
    const nRap = sunshade.inputs.find((p) => p.key === 'N_rap')!
    expect(nRap.kind === 'number' && nRap.role!(i)).toBe('output')
    expect(nRap.kind === 'number' && nRap.role!({ ...i, solve: 'perf' })).toBe('input')
    expect(nRap.kind === 'number' && nRap.role!({ ...i, solve: 'perf', by_ratio: true })).toBe('output')
  })
})
