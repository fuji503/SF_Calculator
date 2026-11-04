import { describe, expect, it } from 'vitest'
import { solarBeaming } from '../sims/solar-beaming/definition.ts'
import { defaultInputs } from './evaluate.ts'
import { defaultGraph, defaultXRange, graphRangeProblem, runSweep, sweepXs, xCandidates, yCandidates } from './sweep.ts'

const DEG = Math.PI / 180

describe('軸の候補', () => {
  it('出力になっている入力は X軸に選べず、Y軸に選べる', () => {
    const inputs = defaultInputs(solarBeaming) // 太陽定数は自動 → 出力
    expect(xCandidates(solarBeaming, inputs).map((p) => p.key)).not.toContain('I_sun')
    const manual = { ...inputs, I_sun_auto: false }
    expect(xCandidates(solarBeaming, manual).map((p) => p.key)).toContain('I_sun')
    // I_sun は出力の定義にもあるので、Y軸の候補に重ねて入れない
    expect(yCandidates(solarBeaming, inputs).filter((o) => o.key === 'I_sun')).toHaveLength(1)
  })

  it('表示されていない入力は X軸に選べない', () => {
    const inputs = defaultInputs(solarBeaming) // 宇宙→宇宙
    expect(xCandidates(solarBeaming, inputs).map((p) => p.key)).not.toContain('tau')
  })
})

describe('X軸の範囲', () => {
  const theta = solarBeaming.inputs.find((p) => p.key === 'theta_i')!
  const sigma = solarBeaming.inputs.find((p) => p.key === 'sigma_slope')!

  it('現在値の 1/10〜10倍、上限で切る', () => {
    if (theta.kind !== 'number' || sigma.kind !== 'number') throw new Error()
    expect(defaultXRange(sigma, 1e-4)).toEqual({ xMin: 1e-5, xMax: 1e-3, xScale: 'log' })
    const r = defaultXRange(theta, 30 * DEG)
    expect(r.xMax).toBeCloseTo(90 * DEG, 12)
  })

  it('現在値が 0 のときは初期値をもとにする', () => {
    if (sigma.kind !== 'number') throw new Error()
    expect(defaultXRange(sigma, 0)).toEqual({ xMin: 1e-5, xMax: 1e-3, xScale: 'log' })
  })

  it('不正な範囲を見つける', () => {
    const g = defaultGraph(solarBeaming, defaultInputs(solarBeaming))
    expect(graphRangeProblem(g)).toBeNull()
    expect(graphRangeProblem({ ...g, xMin: 5, xMax: 1 })).not.toBeNull()
    expect(graphRangeProblem({ ...g, xMin: 0 })).not.toBeNull()
    expect(graphRangeProblem({ ...g, xMin: 0, xScale: 'linear' })).toBeNull()
  })
})

describe('sweepXs', () => {
  it('対数は等比、線形は等差で、両端を含む', () => {
    const log = sweepXs({ ...defaultGraph(solarBeaming, {}), xMin: 1, xMax: 100, points: 3, xScale: 'log' })
    expect(log[0]).toBe(1)
    expect(log[1]).toBeCloseTo(10, 12)
    expect(log[2]).toBeCloseTo(100, 12)
    const lin = sweepXs({ ...defaultGraph(solarBeaming, {}), xMin: 0, xMax: 1, points: 5, xScale: 'linear' })
    expect(lin).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('整数のパラメータは丸めて重なりを除く', () => {
    const xs = sweepXs({ ...defaultGraph(solarBeaming, {}), xMin: 1, xMax: 5, points: 50, xScale: 'linear' }, true)
    expect(xs).toEqual([1, 2, 3, 4, 5])
  })
})

describe('runSweep', () => {
  it('遠くでは E ∝ 1/d²', () => {
    const inputs = defaultInputs(solarBeaming)
    const g = { ...defaultGraph(solarBeaming, inputs), xMin: 1e8, xMax: 1e9, points: 2 }
    const r = runSweep(solarBeaming, inputs, g)
    const [e1, e2] = r.y.E_target as number[]
    expect(e1 / e2).toBeCloseTo(100, 0)
  })

  it('計算できない点は null', () => {
    const inputs = defaultInputs(solarBeaming)
    const g = { ...defaultGraph(solarBeaming, inputs, 'rho'), xMin: 0.5, xMax: 1.5, points: 3, xScale: 'linear' as const }
    const r = runSweep(solarBeaming, inputs, g)
    expect(r.y.E_target[0]).not.toBeNull()
    expect(r.y.E_target[2]).toBeNull()
  })

  it('50点の計算は 200 ms 以内（WebApp仕様書 §9）', () => {
    const inputs = defaultInputs(solarBeaming)
    const t0 = performance.now()
    runSweep(solarBeaming, inputs, defaultGraph(solarBeaming, inputs))
    expect(performance.now() - t0).toBeLessThan(200)
  })
})
