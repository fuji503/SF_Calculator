import { describe, expect, it } from 'vitest'
import { defaultInputs, enumDisplayValue, evaluate, isVisible, selectEnum } from '../../core/evaluate.ts'
import type { EnumParam, Inputs } from '../types.ts'
import { crater } from './definition.ts'

const enumParam = (key: string) => crater.inputs.find((p) => p.key === key) as EnumParam
const pick = (inputs: Inputs, key: string, value: string) => selectEnum(enumParam(key), value, inputs)
const num = (r: ReturnType<typeof evaluate>, k: string) => {
  const v = r.outputs[k]
  return v?.kind === 'number' ? v.value : undefined
}

describe('初期値', () => {
  it('新しいカードは月の海のレゴリスに石質の隕石を落とし、エラーなく計算できる', () => {
    const r = evaluate(crater, defaultInputs(crater))
    expect(r.errors).toEqual([])
    expect(num(r, 'D_rim')).toBeGreaterThan(10)
    expect(r.outputs.hazard_table?.kind).toBe('table')
    expect(r.outputs.thickness?.kind).toBe('series')
  })

  it('初期値の質量は、初期値の直径と密度に合う', () => {
    const r = evaluate(crater, defaultInputs(crater))
    expect(num(r, 'm_i')).toBeCloseTo((Math.PI / 6) * 3000 * 1000, -2)
  })
})

describe('天体と地盤のプリセット', () => {
  it('天体を選ぶと、重力・大気・速さと、その天体の地盤が入る', () => {
    const i = pick(defaultInputs(crater), 'body', 'earth')
    expect(i.g).toBe(9.81)
    expect(i.P0).toBe(101_300)
    expect(i.v0).toBe(11_200)
    expect(i.ground_earth).toBe('alluvium')
    expect(i.ground_class).toBe('dry_soil')
    expect(i.rho_t).toBe(1700)
  })

  it('地盤の選択欄は、選んだ天体のものだけを出す', () => {
    const i = pick(defaultInputs(crater), 'body', 'mars')
    const shown = crater.inputs.filter((p) => p.key.startsWith('ground_') && p.key !== 'ground_class' && isVisible(p, i)).map((p) => p.key)
    expect(shown).toEqual(['ground_mars'])
  })

  it('地盤の値を変えると「カスタム」の表示になる', () => {
    const i = { ...defaultInputs(crater), rho_t: 1234 }
    expect(enumDisplayValue(enumParam('ground_moon'), i)).toBe('custom')
  })
})

describe('入力と出力の切り替え', () => {
  it('核爆発の逆算では、出力と起爆の深さが計算結果になる', () => {
    const i = { ...pick(defaultInputs(crater), 'source', 'nuclear'), solve: true, D_goal: 300 }
    const r = evaluate(crater, i)
    expect(r.errors).toEqual([])
    expect(num(r, 'W')).toBeGreaterThan(0)
    expect(num(r, 'z_b')).toBeGreaterThan(0)
    expect(num(r, 'D_rim')).toBeCloseTo(300, 6)
  })

  it('地球の核爆発（地表）では、爆風・熱放射・ベースサージを出す', () => {
    const i = { ...pick(pick(defaultInputs(crater), 'body', 'earth'), 'source', 'nuclear'), dob_optimal: false, z_b: 0 }
    const r = evaluate(crater, i)
    expect(num(r, 'r_p1')).toBeGreaterThan(0)
    expect(num(r, 'r_thermal')).toBeGreaterThan(0)
    expect(num(r, 'R_B')).toBeCloseTo(1000, 6)
  })
})
