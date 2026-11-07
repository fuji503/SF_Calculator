import { describe, expect, it } from 'vitest'
import { defaultInputs, evaluate, paramRole, selectEnum } from '../../core/evaluate.ts'
import { defaultGraph, xCandidates, yCandidates } from '../../core/sweep.ts'
import type { EnumParam, Inputs } from '../types.ts'
import { laserBeaming } from './definition.ts'

const enumParam = (key: string) => laserBeaming.inputs.find((p) => p.key === key) as EnumParam
const pick = (inputs: Inputs, key: string, value: string) => selectEnum(enumParam(key), value, inputs)

describe('プリセット（§3.4）', () => {
  it('方式を選ぶと波長・効率・M² が入る', () => {
    const i = pick(defaultInputs(laserBeaming), 'laser_type', 'co2')
    expect(i.lambda).toBe(10.6e-6)
    expect(i.eta).toBe(0.15)
    expect(i.M2).toBe(1.5)
  })

  it('τ は方式と大気の組み合わせで決まる（どちらを先に選んでも同じ）', () => {
    const a = pick(pick(defaultInputs(laserBeaming), 'laser_type', 'co2'), 'atmosphere', 'mars')
    const b = pick(pick(defaultInputs(laserBeaming), 'atmosphere', 'mars'), 'laser_type', 'co2')
    expect(a.tau).toBe(50)
    expect(b.tau).toBe(50)
    expect(a.theta_turb).toBe(2e-6)
  })

  it('火星の大気は CO2 レーザをほとんど通さない', () => {
    const i = pick(pick(defaultInputs(laserBeaming), 'laser_type', 'co2'), 'atmosphere', 'mars')
    const r = evaluate(laserBeaming, i)
    expect(r.errors).toEqual([])
    expect(r.warnings.map((m) => m.code)).toContain('opaque-atmosphere')
  })

  it('真空を選んでも τ は変えない（隠すだけ）', () => {
    const i = pick(pick(defaultInputs(laserBeaming), 'atmosphere', 'titan'), 'atmosphere', 'vacuum')
    expect(i.tau).toBe(2)
  })

  it('化学レーザを選ぶと燃料消費率を出す', () => {
    const i = pick(defaultInputs(laserBeaming), 'laser_type', 'chemical')
    const r = evaluate(laserBeaming, i)
    expect(r.outputs.m_dot).toEqual({ kind: 'number', value: 5 })
  })
})

describe('届けたい量からの逆算', () => {
  const pOpt = laserBeaming.inputs.find((p) => p.key === 'P_opt')!

  it('逆算では目標光出力が計算結果になり、グラフは距離と目標光出力になる', () => {
    const i = { ...defaultInputs(laserBeaming), solve: true, P_goal: 2e6 }
    expect(paramRole(pOpt, i)).toBe('output')
    const r = evaluate(laserBeaming, i)
    expect(r.errors).toEqual([])
    expect(r.outputs.P_opt).toEqual({ kind: 'number', value: 2e6 })
    expect(defaultGraph(laserBeaming, i)).toMatchObject({ x: 'd', y: ['P_opt'] })
  })

  it('どのモードでも、初期値の軸を選べる', () => {
    const modes: Inputs[] = [{}, { solve: true }, { solve: true, goal_by_irradiance: true }]
    for (const over of modes) {
      const i = { ...defaultInputs(laserBeaming), ...over }
      const g = defaultGraph(laserBeaming, i)
      expect(xCandidates(laserBeaming, i).map((p) => p.key)).toContain(g.x)
      expect(yCandidates(laserBeaming, i).map((o) => o.key)).toContain(g.y[0])
    }
  })
})
