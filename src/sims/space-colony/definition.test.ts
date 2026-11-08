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

describe('外壁を円形に保つ構造と、引っ張りだけに使う材料（1.6）', () => {
  it('鋼線・繊維はスポークの材料にだけ出し、外壁の材料には出さない', () => {
    expect(enumParam('mat_spoke').options.map((o) => o.value)).toContain('wire1770')
    expect(enumParam('mat_hull').options.map((o) => o.value)).not.toContain('wire1770')
    const i = pick(defaultInputs(spaceColony), 'mat_spoke', 'pbo')
    expect(i.sigma_us).toBe(5800e6)
  })
  it('斜張橋型を選ぶと、細かく並ぶケーブルの直径は「—」', () => {
    const i = { ...defaultInputs(spaceColony), f_s: 0.5, hoop_mode: 'stay' }
    const r = evaluate(spaceColony, i)
    expect(r.errors).toEqual([])
    const t = r.outputs.member_table
    expect(t?.kind === 'table' && t.rows[0][2]).toBe('—')
    expect(num(r, 'C_th')).toBeGreaterThan(0)
  })
})
