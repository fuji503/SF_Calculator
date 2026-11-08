import { describe, expect, it } from 'vitest'
import { defaultInputs, evaluate, selectEnum } from '../../core/evaluate.ts'
import type { EnumParam, Inputs } from '../types.ts'
import { COLONY_PRESETS } from './data.ts'
import { spaceColony } from './definition.ts'

const enumParam = (key: string) => spaceColony.inputs.find((p) => p.key === key) as EnumParam
const pick = (inputs: Inputs, key: string, value: string) => selectEnum(enumParam(key), value, inputs)
const num = (r: ReturnType<typeof evaluate>, k: string) => {
  const v = r.outputs[k]
  return v?.kind === 'number' ? v.value : undefined
}

describe('初期値', () => {
  it('カルパナ・ワンの大きさで、エラーなく計算できる', () => {
    const r = evaluate(spaceColony, defaultInputs(spaceColony))
    expect(r.errors).toEqual([])
    expect(num(r, 'n_rpm')).toBeCloseTo(1.891, 3)
    expect(num(r, 'sigma_sh')).toBeCloseTo(10_290, -1)
    expect(r.outputs.height_table?.kind).toBe('table')
    expect(r.outputs.mass_table?.kind).toBe('table')
    expect(r.outputs.g_profile?.kind).toBe('series')
  })
})

describe('構成の例', () => {
  for (const id of Object.keys(COLONY_PRESETS)) {
    it(`${id} はエラーなく計算できる`, () => {
      const r = evaluate(spaceColony, pick(defaultInputs(spaceColony), 'preset', id))
      expect(r.errors).toEqual([])
      expect(num(r, 'M_total')).toBeGreaterThan(0)
    })
  }

  it('スタンフォード・トーラスは 1 rpm、遮蔽 4.5 t/m² の線量を出す', () => {
    const r = evaluate(spaceColony, pick(defaultInputs(spaceColony), 'preset', 'stanford'))
    expect(num(r, 'n_rpm')).toBeCloseTo(1, 6)
    expect(num(r, 'dose')! * 1000).toBeGreaterThan(20)
  })

  it('形を変えると「カスタム」の表示になる', () => {
    const i = { ...defaultInputs(spaceColony), R_f: 300 }
    expect(evaluate(spaceColony, i).errors).toEqual([])
  })
})
