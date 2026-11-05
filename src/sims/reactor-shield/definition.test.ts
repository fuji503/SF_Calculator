import { describe, expect, it } from 'vitest'
import { defaultInputs, enumDisplayValue, evaluate, selectEnum, validateInputs } from '../../core/evaluate.ts'
import { xCandidates, yCandidates } from '../../core/sweep.ts'
import type { EnumParam, Inputs, TableParam } from '../types.ts'
import { reactorShield } from './definition.ts'

const enumParam = (key: string) => reactorShield.inputs.find((p) => p.key === key) as EnumParam
const pick = (inputs: Inputs, key: string, value: string) => selectEnum(enumParam(key), value, inputs)
const num = (r: ReturnType<typeof evaluate>, key: string) => {
  const v = r.outputs[key]
  return v?.kind === 'number' ? v.value : Number.NaN
}

describe('構成の例「Kilopower を月面で使う」（T8）', () => {
  it('新しいカードはこの例で始まり、影遮蔽の結果になる', () => {
    const i = defaultInputs(reactorShield)
    expect(enumDisplayValue(enumParam('scenario'), i)).toBe('kilopower_moon')
    const r = evaluate(reactorShield, i)
    expect(r.errors).toEqual([])
    expect(num(r, 'M_shield') / 120.8).toBeCloseTo(1, 2)
    expect(num(r, 'dose_ratio')).toBeLessThanOrEqual(1 + 1e-9)
    expect(num(r, 't_layer_0')).toBeGreaterThan(0.01)
    expect(r.outputs.thickness_text?.kind).toBe('text')
    expect(r.outputs.decay_series?.kind).toBe('series')
  })

  it('全方向遮蔽にすると約20倍重くなる', () => {
    const i = { ...defaultInputs(reactorShield), shield_mode: 'omni' }
    const r = evaluate(reactorShield, i)
    expect(num(r, 'M_shield') / 2453).toBeCloseTo(1, 2)
    expect(enumDisplayValue(enumParam('scenario'), i)).toBe('custom')
  })
})

describe('遮蔽の層の表', () => {
  const table = reactorShield.inputs.find((p) => p.key === 'layers') as TableParam
  const auto = table.columns.find((c) => c.key === 't')!.autoKey!

  it('基準から厚さを出すときは、最後の2層（または1層）の厚さが自動になる', () => {
    const i = defaultInputs(reactorShield)
    expect(auto(0, 2, i)).toBe('t_layer_0')
    expect(auto(1, 2, i)).toBe('t_layer_1')
    const plant = pick(i, 'layer_preset', 'plant')
    expect(auto(0, 3, plant)).toBeNull()
    expect(auto(1, 3, plant)).toBeNull()
    expect(auto(2, 3, plant)).toBe('t_layer_2')
    expect(auto(1, 2, { ...i, solve: false })).toBeNull()
  })

  it('層の例を選ぶと層が入り、変えると「カスタム」', () => {
    const i = pick(defaultInputs(reactorShield), 'layer_preset', 'pool')
    expect(i.layers).toEqual([
      { material: 'iron', t: 0.2 },
      { material: 'water', t: 3.7 },
    ])
    expect(enumDisplayValue(enumParam('layer_preset'), i)).toBe('pool')
    const changed = { ...i, layers: [{ material: 'iron', t: 0.3 }, { material: 'water', t: 3.7 }] }
    expect(enumDisplayValue(enumParam('layer_preset'), changed)).toBe('custom')
  })

  it('厚さを指定するとき、負の厚さは入力エラー', () => {
    const i = { ...defaultInputs(reactorShield), solve: false, layers: [{ material: 'tungsten', t: -0.01 }, { material: 'lih', t: 0.8 }] }
    expect(Object.keys(validateInputs(reactorShield, i))).toContain('layers')
  })
})

describe('地表の配置と調達（T16）', () => {
  it('水とセメントのコンクリートの壁：セメントと水は地球から', () => {
    const i = { ...defaultInputs(reactorShield), shield_mode: 'surface', layout: 'above', wall_mat: 'reg_concrete' }
    const r = evaluate(reactorShield, i)
    expect(r.errors).toEqual([])
    expect(num(r, 't_w')).toBeCloseTo(0.849, 2)
    expect(num(r, 'M_import') / 6015).toBeCloseTo(1, 2)
    const local = evaluate(reactorShield, { ...i, origin_cement: 'local', origin_water: 'local' })
    expect(num(local, 'M_import')).toBe(0)
  })

  it('グラフの軸', () => {
    const i = defaultInputs(reactorShield)
    expect(xCandidates(reactorShield, i).map((p) => p.key)).toContain('L')
    expect(yCandidates(reactorShield, i).map((o) => o.key)).toContain('M_shield')
  })
})
