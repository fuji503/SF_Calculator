import { describe, expect, it } from 'vitest'
import { SOLAR_CONSTANT_1AU, SUN_RADIANCE } from '../../core/physics/constants.ts'
import { computeSolar, type SolarInputs, type SolarOutputs } from './model.ts'

const URAD = 1e-6
const DEG = Math.PI / 180

/** 仕様書の期待値（有効数字4桁）と比べる */
function expect4(actual: number, expected: number) {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(6e-4)
}

function base(over: Partial<SolarInputs> = {}): SolarInputs {
  return {
    d_sun: 1,
    I_sun_auto: true,
    I_sun: 1361,
    atm_case: 'space',
    tau: 0.5,
    z_sun: 30 * DEG,
    z_t: 30 * DEG,
    D: 10,
    N: 1,
    is_concave: true,
    rho: 0.9,
    sigma_slope: 0,
    sigma_point: 0,
    d: 100e3,
    theta_i: 0,
    ...over,
  }
}

function outputsOf(p: SolarInputs): SolarOutputs {
  const r = computeSolar(p)
  expect(r.errors).toEqual([])
  return r.outputs!
}

describe('仕様書 §8 のテストケース', () => {
  it('T1：1 AU、凹面鏡、D=10 m、d=100 km', () => {
    const o = outputsOf(base())
    expect4(o.D_spot, 930.0)
    expect4(o.P_spot, 9.62e4)
    expect4(o.E_target, 0.1416)
    expect4(o.suns, 1.041e-4)
  })

  it('T2：平面鏡、d=100 m（平面鏡1枚は 1 sun を超えない）', () => {
    const o = outputsOf(base({ is_concave: false, d: 100 }))
    expect4(o.D_spot, 10.93)
    expect4(o.P_spot, 9.62e4)
    expect4(o.E_target, 1025)
    expect4(o.suns, 0.7534)
    expect(o.suns).toBeLessThan(1)
  })

  it('T3：1.52 AU、N=10,000、θi=0.2 rad、σ=100 µrad、d=1,000 km', () => {
    const o = outputsOf(
      base({
        d_sun: 1.52,
        D: 100,
        N: 10_000,
        theta_i: 0.2,
        sigma_slope: 100 * URAD,
        sigma_point: 100 * URAD,
        d: 1000e3,
      }),
    )
    expect4(o.D_spot, 6222)
    expect4(o.P_spot, 4.081e10)
    expect4(o.E_target, 1342)
    expect4(o.suns, 2.278)
  })

  it('T4：鏡が地表、τ=0.5、zsun=0.7 rad、zt=0.5 rad', () => {
    const o = outputsOf(
      base({
        d_sun: 1.52,
        D: 50,
        N: 1000,
        theta_i: 0.3,
        sigma_slope: 200 * URAD,
        sigma_point: 100 * URAD,
        d: 20e3,
        atm_case: 'mirror_surface',
        tau: 0.5,
        z_sun: 0.7,
        z_t: 0.5,
      }),
    )
    expect4(o.D_spot, 127.5)
    expect4(o.P_spot, 2.926e8)
    expect4(o.E_target, 2.292e4)
    expect4(o.suns, 38.91)
  })
})

describe('物理的な性質', () => {
  it('遠方・誤差なしでは仕様書2の式 ρ L A cosθi / d² と一致する', () => {
    const p = base({ d: 1e9, theta_i: 0.1 })
    const o = outputsOf(p)
    const old = (p.rho * SUN_RADIANCE * o.A_total * Math.cos(p.theta_i)) / p.d ** 2
    expect(o.E_target / old).toBeCloseTo(1, 3)
  })

  it('鏡1枚の照度は理論限界より小さい', () => {
    const o = outputsOf(base({ d: 1e3, N: 1 }))
    expect(o.E_target).toBeLessThan(o.E_max)
  })

  it('理論限界は 1 AU で約 46,250 suns（ρ=1、真空）', () => {
    const o = outputsOf(base({ rho: 1 }))
    expect(o.E_max / SOLAR_CONSTANT_1AU).toBeCloseTo(46_250, -2)
  })

  it('目標が地表のときは復路だけ大気を通る', () => {
    const o = outputsOf(base({ atm_case: 'target_surface', tau: 1, z_t: 0 }))
    expect(o.T_atm).toBeCloseTo(Math.exp(-1), 12)
  })

  it('太陽定数を手で入れると、Suns の基準もその値になる', () => {
    const o = outputsOf(base({ I_sun_auto: false, I_sun: 1000 }))
    expect(o.I_sun).toBe(1000)
    expect(o.E_target / o.suns).toBeCloseTo(1000, 9)
  })

  it('凹面鏡を極端に多く近くに並べると、理論限界を超えるのでエラーにする', () => {
    const r = computeSolar(base({ N: 1e9, d: 1e5 }))
    expect(r.errors.map((e) => e.code)).toContain('over-limit')
  })
})

describe('入力チェック（§6）', () => {
  const codes = (p: Partial<SolarInputs>) => {
    const r = computeSolar(base(p))
    return [...r.errors, ...r.warnings].map((m) => m.code)
  }

  it('エラー', () => {
    expect(codes({ D: 0 })).toContain('positive')
    expect(codes({ rho: 1.1 })).toContain('rho-range')
    expect(codes({ theta_i: Math.PI / 2 })).toContain('theta-i-range')
    expect(codes({ atm_case: 'target_surface', z_t: Math.PI / 2 })).toContain('zenith-range')
  })

  it('宇宙→宇宙では天頂角を見ない', () => {
    expect(codes({ atm_case: 'space', z_t: Math.PI })).toEqual([])
  })

  it('警告', () => {
    expect(codes({ atm_case: 'target_surface', z_t: 80 * DEG })).toContain('low-elevation')
    expect(codes({ d: 50 })).toContain('too-close')
    expect(codes({ theta_i: 40 * DEG })).toContain('oblique-concave')
    expect(codes({ atm_case: 'target_surface', tau: 5 })).toContain('opaque-atmosphere')
  })
})
