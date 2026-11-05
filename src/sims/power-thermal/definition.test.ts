import { describe, expect, it } from 'vitest'
import { defaultInputs, enumDisplayValue, evaluate, selectEnum } from '../../core/evaluate.ts'
import { xCandidates, yCandidates } from '../../core/sweep.ts'
import type { EnumParam, Inputs } from '../types.ts'
import { powerThermal } from './definition.ts'

const enumParam = (key: string) => powerThermal.inputs.find((p) => p.key === key) as EnumParam
const pick = (inputs: Inputs, key: string, value: string) => selectEnum(enumParam(key), value, inputs)
const num = (r: ReturnType<typeof evaluate>, key: string) => {
  const v = r.outputs[key]
  return v?.kind === 'number' ? v.value : Number.NaN
}

describe('定義', () => {
  it('キーが重複しない', () => {
    const inputs = powerThermal.inputs.map((p) => p.key)
    expect(new Set(inputs).size).toBe(inputs.length)
    const outputs = powerThermal.outputs.map((o) => o.key)
    expect(new Set(outputs).size).toBe(outputs.length)
  })

  it('入力のまとまりはすべて定義されている', () => {
    const groups = new Set(powerThermal.groups.map((g) => g.id))
    for (const p of powerThermal.inputs) expect(groups.has(p.group!)).toBe(true)
    for (const g of powerThermal.groups) if (g.parent) expect(groups.has(g.parent)).toBe(true)
  })

  it('初期値で計算でき、出す出力はすべて値がある', () => {
    const i = defaultInputs(powerThermal)
    const r = evaluate(powerThermal, i)
    expect(r.errors).toEqual([])
    for (const o of powerThermal.outputs) {
      if (o.visibleWhen && !o.visibleWhen(i)) continue
      expect(r.outputs[o.key], o.key).toBeDefined()
    }
  })

  it('グラフの初期の軸が選べる', () => {
    const i = defaultInputs(powerThermal)
    expect(xCandidates(powerThermal, i).map((p) => p.key)).toContain(powerThermal.defaultGraph.x)
    expect(yCandidates(powerThermal, i).map((o) => o.key)).toContain(powerThermal.defaultGraph.y)
  })
})

describe('プリセットと「カスタム」の表示', () => {
  it('炉のクラスを選ぶと、原子炉用の変換方式とその値も入る', () => {
    const i = pick(defaultInputs(powerThermal), 'reactor_class', 'sp100')
    expect(i.T_hot_r).toBe(1350)
    expect(i.converter_r).toBe('thermoelectric')
    expect(i.T_cold_r).toBe(800)
    expect(i.eta_mech_r).toBe(0.1)
  })

  it('入った値を手で変えると「カスタム」、戻すとプリセットの表示', () => {
    const i = pick(defaultInputs(powerThermal), 'tes_medium', 'solar_salt')
    expect(enumDisplayValue(enumParam('tes_medium'), i)).toBe('solar_salt')
    const changed = { ...i, c_tes: 1600 }
    expect(enumDisplayValue(enumParam('tes_medium'), changed)).toBe('custom')
    expect(enumDisplayValue(enumParam('tes_medium'), { ...changed, c_tes: 1500 })).toBe('solar_salt')
  })

  it('低温側の温度を変えると変換方式は「カスタム」になるが、炉のクラスはそのまま', () => {
    const i = { ...pick(defaultInputs(powerThermal), 'reactor_class', 'kilopower'), T_cold_r: 450 }
    expect(enumDisplayValue(enumParam('converter_r'), i)).toBe('custom')
    expect(enumDisplayValue(enumParam('reactor_class'), i)).toBe('kilopower')
  })

  it('調達先を変えても蓄熱材の種類は「カスタム」にしない', () => {
    const i = { ...defaultInputs(powerThermal), tes_origin: 'earth' }
    expect(enumDisplayValue(enumParam('tes_medium'), i)).toBe('regolith')
  })

  it('熱出力の自動決定は、日照中の電源が「なし」のときだけ選べる', () => {
    const auto = enumParam('reactor').options.find((o) => o.value === 'auto')!
    const i = defaultInputs(powerThermal)
    expect(auto.disabledWhen!(i)).toBe(true)
    expect(auto.disabledWhen!({ ...i, sun_source: 'none' })).toBe(false)
  })

  it('排熱は「電力と同じ」なら自動で、電力と同じ値になる', () => {
    const i = { ...defaultInputs(powerThermal), P_peak: 30e3 }
    const r = evaluate(powerThermal, i)
    expect(num(r, 'Q_pl_peak')).toBe(30e3)
  })
})

describe('構成の例（§3.10）', () => {
  it('月面の太陽電池＋原子炉（Kilopower 級）＋蓄電池は T12 の結果になる', () => {
    const i = pick(defaultInputs(powerThermal), 'scenario', 't12')
    const r = evaluate(powerThermal, i)
    expect(r.errors).toEqual([])
    // T12 は月面の周期を丸めた値（2.551×10⁶ s）で計算しているので、有効数字3桁で比べる
    expect(num(r, 'P_r')).toBeCloseTo(10.04e3, -1)
    expect(num(r, 'A_pv') / 60.64).toBeCloseTo(1, 3)
    expect(num(r, 'M_bat') / 2.943e4).toBeCloseTo(1, 3)
    expect(num(r, 'M_total') / 3.133e4).toBeCloseTo(1, 3)
    expect(r.outputs.A_rad_r_by).toEqual({ kind: 'text', value: '日照中で決まる' })
    expect(enumDisplayValue(enumParam('scenario'), i)).toBe('t12')
    expect(enumDisplayValue(enumParam('scenario'), { ...i, Q_r: 50e3 })).toBe('custom')
  })
})
