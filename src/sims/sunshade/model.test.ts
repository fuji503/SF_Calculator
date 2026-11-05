import { describe, expect, it } from 'vitest'
import { AU, G0, YEAR } from '../../core/physics/constants.ts'
import {
  balanceDistance,
  computeSunshade,
  frameOf,
  OPTICS_PRESETS,
  shadeGeometry,
  SIGMA_0,
  TARGET_PRESETS,
  type SunshadeInputs,
  type SunshadeOutputs,
} from './model.ts'

const DAY = 86_400
const KM = 1e3
const G = 1e-3 // g/m² → kg/m²

/** 仕様書の期待値（有効数字4桁）と比べる */
function expect4(actual: number | undefined, expected: number, tol = 6e-4) {
  expect(actual).toBeDefined()
  expect(Math.abs(actual! - expected) / Math.abs(expected)).toBeLessThan(tol)
}

/** §9 の共通の値：目標減光率 1%、反射型、Isp 3000 s、η 0.6、α 30 kg/kW、α_thr 5 kg/kW */
function base(target: keyof typeof TARGET_PRESETS, over: Partial<SunshadeInputs> = {}): SunshadeInputs {
  return {
    ...TARGET_PRESETS[target],
    f_target: 0.01,
    position: 'balance',
    r_s: 1.05 * AU,
    d: 1.5e9,
    A_unit: 1e4,
    sigma_film: 10 * G,
    m_bus: 0,
    ...OPTICS_PRESETS.reflective,
    f_cell: 0,
    sigma_cell: 35 * G,
    eta_cell: 0.1,
    propulsion: 'sail',
    Isp: 3000,
    eta_ep: 0.6,
    alpha_ep: 30e-3,
    alpha_thr: 5e-3,
    a_ep_des: 1e-4,
    steer_auto: true,
    eta_steer: 0,
    operation: 'build',
    transport: 'self',
    dv_tr: 1000,
    t_tr: YEAR,
    T_deploy: 10 * YEAR,
    T_keep: 10 * YEAR,
    dv_sk: 4,
    mu_c: 1,
    solve: 'goal',
    t1: 30 * DAY,
    F1: 0.3,
    t2: 180 * DAY,
    F2: 0.8,
    t_rap_goal: 7 * DAY,
    by_ratio: false,
    N_rap: 0,
    N_res: 0,
    N_total: 0,
    rap_ratio: 0,
    m_gap: 0.1,
    park_same: true,
    r_park: 1.05 * AU,
    t_unf: 1 * DAY,
    lambda_mm: 0,
    T_sim: 365 * DAY,
    ...over,
  }
}

function outputsOf(p: SunshadeInputs): SunshadeOutputs {
  const r = computeSunshade(p)
  expect(r.errors).toEqual([])
  return r.outputs!
}

const codes = (p: SunshadeInputs) => {
  const r = computeSunshade(p)
  return [...r.errors, ...r.warnings].map((m) => m.code)
}

/** L1 の幾何（T1〜T3） */
function l1Geometry(target: keyof typeof TARGET_PRESETS, b = 1) {
  const t = TARGET_PRESETS[target]
  const d = balanceDistance(frameOf(t.a_p, t.GM_p), 0)!
  return { d, ...shadeGeometry(t.R_p, 0.01, b, d, t.a_p - d) }
}

describe('光圧の基本量', () => {
  it('σ0 = 0.7657 g/m²', () => {
    expect4(SIGMA_0 / G, 0.7657)
  })
})

describe('仕様書 §9：L1 と光圧（建設展開）', () => {
  it('T1：地球の L1', () => {
    const g = l1Geometry('earth')
    expect4(g.d / KM, 1.498e6)
    expect4(g.rho / KM, 7035)
    expect4(g.eta_geom, 0.8201)
    expect4(g.A_req / 1e6, 1.555e6)
  })

  it('T2：火星の L1', () => {
    const g = l1Geometry('mars')
    expect4(g.d / KM, 1.082e6)
    expect4(g.rho / KM, 3319)
    expect(g.eta_geom).toBe(1)
    expect4(g.A_req / 1e6, 3.609e5)
  })

  it('T3：金星の L1', () => {
    const g = l1Geometry('venus')
    expect4(g.d / KM, 1.008e6)
    expect4(g.rho / KM, 6542)
    expect4(g.eta_geom, 0.8559)
    expect4(g.A_req / 1e6, 1.344e6)
  })

  it('T4：Angel 2006 の再現', () => {
    const o = outputsOf(
      base('earth', {
        f_target: 0.018,
        ...OPTICS_PRESETS.refractive,
        A_unit: Math.PI * 0.3 ** 2,
        sigma_film: 4.2 * G,
        transport: 'carrier',
        Isp: 20_000 / G0,
      }),
    )
    expect4(o.beta_u, 0.01641)
    expect4(o.d / KM, 1.83e6)
    expect4(o.eta_geom, 0.5471)
    expect4(o.A_req / 1e6, 4.662e6)
    expect4(o.M_station, 1.958e10)
    expect4(o.prop_fraction, 0.04877)
    expect4(o.M_depart, 4.116e10)
  })

  it('T5：軽い反射膜のつり合い点', () => {
    const o = outputsOf(base('earth', { transport: 'carrier' }))
    expect4(o.beta_u, 0.1455)
    expect4(o.d / KM, 7.695e6)
    expect4(o.eta_geom, 0.02852)
    expect4(o.A_req / 1e6, 4.471e7)
    expect(o.area_vs_L1).toBeCloseTo(28.75, 0)
  })

  it('T6：反射膜を L1 に電気推進で留める', () => {
    const o = outputsOf(base('earth', { position: 'l1', propulsion: 'ep', T_keep: YEAR }))
    expect4(o.beta_u, 0.07064)
    expect4(o.a_hold, 4.274e-4)
    expect4(o.dv_keep, 1.349e4)
    expect4(o.P_ep, 3531)
    expect4(o.M_ep, 105.9)
    expect4(o.m_prop, 131.1)
    expect4(o.m0, 337.0)
    expect4(o.N_req, 1.555e8)
    expect4(o.M_depart, 5.24e10)
  })

  const t7 = { sigma_film: 20 * G, m_bus: 50, propulsion: 'sail_ep' as const, t_tr: 60 * DAY }

  it('T7：太陽帆＋電気推進で自力移動', () => {
    const o = outputsOf(base('earth', t7))
    expect4(o.eta_steer, 0.3647)
    expect4(o.beta_u, 0.05489)
    expect4(o.d / KM, 3.134e6)
    expect4(o.a_sail, 1.17e-4)
    expect4(o.dv_sail, 606.4)
    expect4(o.dv_ep, 393.6)
    expect4(o.F_ep, 0.02042)
    expect4(o.P_ep, 500.7)
    expect4(o.M_ep, 15.02)
    expect4(o.m_prop, 3.935)
    expect4(o.m0, 269.0)
    expect4(o.N_req, 6.96e8)
    expect4(o.M_depart, 1.872e11)
  })

  it('T8：太陽帆だけでは間に合わない（最短 92 日）', () => {
    const r = computeSunshade(base('earth', { ...t7, propulsion: 'sail' }))
    expect(r.errors[0].code).toBe('sail-too-slow')
    expect(Number(r.errors[0].params!.days)).toBeCloseTo(92, 0)
  })
})

/** §9 の火星向けの共通の条件 */
const mars = (over: Partial<SunshadeInputs> = {}) =>
  base('mars', { operation: 'standby', position: 'rs', A_unit: 1e6, sigma_film: 2.0 * G, ...over })

describe('仕様書 §9：火星向けの遠い機能位置（待機・応答）', () => {
  it('T9：1.05 AU、太陽帆', () => {
    const o = outputsOf(mars())
    expect4(o.beta_req, 0.6728)
    expect4(o.sigma_max / G, 2.162)
    expect4(o.beta_u, 0.7274)
    expect4(o.k_eff, 1.757)
    expect4(o.d / KM, 7.086e7)
    expect4(o.rho / KM, 3.139e5)
    expect4(o.eta_geom, 1.166e-4)
    expect4(o.A_req / 1e6, 3.095e9)
    expect(o.area_vs_L1).toBeCloseTo(8576, -2)
    expect4(o.s / KM, 7457)
    expect4(o.a_lat, 1.32e-3)
    expect4(o.t_rap / DAY, 1.74, 3e-3)
    expect4(o.V / KM, 12.44)
    expect4(o.a_br_sail, 1.427e-3)
    expect4(o.t_min / DAY, 101.9)
    expect4(o.N_rap, 9.284e8)
    expect4(o.N_res, 1.819e10)
    expect4(o.res_ratio, 5.879)
    expect4(o.total_ratio, 6.179)
    expect4(o.t_F100 / DAY, 211.2)
    expect4(o.A_all / 1e6, 1.912e10)
    expect4(o.M_total, 3.824e13)
  })

  it('T10：1.3 AU、太陽帆', () => {
    const o = outputsOf(mars({ r_s: 1.3 * AU, sigma_film: 3.5 * G }))
    expect4(o.beta_req, 0.3789)
    expect4(o.sigma_max / G, 3.839)
    expect4(o.A_req / 1e6, 4.502e8)
    expect4(o.t_rap / DAY, 2.87, 3e-3)
    expect4(o.V / KM, 5.536)
    expect4(o.t_min / DAY, 121.5)
    expect4(o.res_ratio, 21.82)
    expect4(o.total_ratio, 22.12)
    expect4(o.t_F100 / DAY, 203.4)
    expect4(o.M_total, 3.485e13)
  })

  it('T11：構成から性能を出す', () => {
    const r = computeSunshade(mars({ solve: 'perf', N_rap: 1e9, N_res: 5e9 }))
    expect(r.errors).toEqual([])
    const o = r.outputs!
    expect4(o.F_t1, 0.3231)
    expect4(o.F_t2, 0.4605)
    expect4(o.t_F2 / DAY, 372.9)
    expect4(o.t_F100 / DAY, 486.6)
    expect(r.warnings.map((m) => m.code)).toContain('goal-not-met')
  })

  it('T11：総機数と即応群の比率でも同じ結果', () => {
    const o = outputsOf(mars({ solve: 'perf', by_ratio: true, N_total: 6e9, rap_ratio: 1 / 6 }))
    expect(o.N_rap).toBe(1e9)
    expect(o.N_res).toBe(5e9)
    expect4(o.F_t2, 0.4605)
  })

  it('T12：ソーラー電力セイル', () => {
    const p = { propulsion: 'power_sail' as const, sigma_film: 1.5 * G, f_cell: 0.001 }
    const o = outputsOf(mars(p))
    expect4(o.k, 1.899)
    expect4(o.sigma_tot / G, 2.152)
    expect4(o.P_ep, 123.5e3)
    expect4(o.M_ep, 617.3)
    expect4(o.t_rap / DAY, 1.045)
    expect4(o.a_br_sail, 1.011e-3)
    expect4(o.a_br_ep, 1.786e-3)
    expect4(o.t_min / DAY, 52.47)
    expect4(o.dv_ep_br, 7942)
    expect4(o.m0_res, 2819)
    expect4(o.res_ratio, 3.6)
    expect4(o.total_ratio, 3.9)
    expect4(o.t_F100 / DAY, 231.0)
    expect4(o.M_total, 3.343e13)
    const heavy = computeSunshade(mars({ ...p, f_cell: 0.003 }))
    expect(heavy.errors[0].code).toBe('too-heavy')
  })

  it('T13：現在の膜では重すぎる', () => {
    const r = computeSunshade(mars({ sigma_film: 3.8 * G }))
    expect(r.errors[0].code).toBe('too-heavy')
    expect(Number(r.errors[0].params!.sigma)).toBeCloseTo(2.162, 3)
  })

  it('T14：待機と機能の距離が違う', () => {
    const r = computeSunshade(mars({ r_s: 1.3 * AU, sigma_film: 3.5 * G, park_same: false, r_park: 1.0 * AU }))
    expect(r.errors[0].code).toBe('res-too-slow')
    expect(Number(r.errors[0].params!.days)).toBeCloseTo(201.1, 1)
    expect(r.warnings.map((m) => m.code)).toContain('park-mismatch')
    const o = outputsOf(mars({ r_s: 1.3 * AU, sigma_film: 3.5 * G, park_same: false, r_park: 1.0 * AU, t2: 300 * DAY }))
    expect4(o.V / KM, 9.198)
  })

  it('T15：地球の軌道と交差', () => {
    const r = computeSunshade(mars({ r_s: 1.0 * AU }))
    expect(r.errors).toEqual([])
    const near = r.warnings.find((m) => m.code === 'near-orbit')
    expect(near?.params?.planet).toBe('地球')
    const o = r.outputs!
    expect4(o.A_req / 1e6, 4.17e9)
    expect4(o.t_min / DAY, 103.6)
    expect4(o.total_ratio, 5.406)
  })
})

describe('入力チェック（§6）', () => {
  it('エラー', () => {
    expect(codes(base('earth', { sigma_film: 0.5 * G, transport: 'carrier' }))).toContain('no-balance')
    expect(codes(base('earth', { position: 'l1', transport: 'carrier' }))).toContain('carrier-hold')
    expect(codes(base('earth', { t_tr: 20 * YEAR }))).toContain('deploy-range')
    expect(codes(mars({ F1: 0.9 }))).toContain('goal-order')
    expect(codes(base('earth', { R_s: 0.9, A_s: 0.2 }))).toContain('optics-sum')
    expect(codes(mars({ t1: 1 * DAY }))).toContain('rap-too-slow')
    expect(codes(mars({ propulsion: 'ep', a_ep_des: 1 }))).toContain('no-convergence')
    // 反射率を下げきっても光圧が強すぎる（吸収型は k_min = 1）
    expect(codes(mars({ ...OPTICS_PRESETS.absorptive, sigma_film: 0.5 * G }))).toContain('keff-below-min')
  })

  it('警告と情報', () => {
    expect(codes(mars())).toContain('beyond-tech')
    expect(codes(mars())).toContain('mm-unset')
    expect(codes(mars({ lambda_mm: 0.01 / YEAR }))).not.toContain('mm-unset')
    expect(codes(mars({ r_s: 1.3 * AU, sigma_film: 3.5 * G, t_rap_goal: 1 * DAY }))).toContain('rap-goal')
    // 地球向けの L1 付近では、地球自身の軌道は警告しない
    expect(codes(base('earth', { transport: 'carrier' }))).not.toContain('near-orbit')
  })
})

describe('物理的な性質', () => {
  it('影が天体より大きいとき、必要な面積は f π ρ² / b（元の仕様書の式 f Ω d² / b と同じ）', () => {
    const o = outputsOf(base('earth', { transport: 'carrier' }))
    expect(o.rho).toBeGreaterThan(6371e3)
    expect(o.A_req / ((0.01 * Math.PI * o.rho ** 2) / o.b)).toBeCloseTo(1, 12)
  })

  it('減光率の時系列は 0 から始まり、展開が終わると 1 になる（建設展開）', () => {
    const o = outputsOf(base('earth', { transport: 'carrier' }))
    expect(o.series.F[0]).toBe(0)
    expect(o.series.F.at(-1)).toBe(1)
  })

  it('待機・応答の時系列は、即応群の到着で階段状に上がる', () => {
    const o = outputsOf(mars())
    const i = o.series.t.indexOf(o.t_rap)
    expect(o.series.F[i]).toBe(0)
    expect(o.series.F[i + 1]).toBeCloseTo(o.N_rap / o.N_req, 9)
  })
})
