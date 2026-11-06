import { describe, expect, it } from 'vitest'
import { YEAR } from '../../core/physics/constants.ts'
import { alphaFor, CLASSES, COOLANTS, CRITERIA, FUELS, GROUNDS, groundMaterial, MATERIALS, mixSigmaR, type CriteriaId, type ReactorClass } from './data.ts'
import {
  cableMass,
  computeReactor,
  coreSize,
  decayFraction,
  neutronSpeed,
  WATT_MEAN,
  wattAbove,
  type Layer,
  type ReactorInputs,
  type ReactorOutputs,
} from './model.ts'

const MW = 1e6
const KW = 1e3
const CM = 0.01
const MEV = 1.602176634e-13
const HOUR = 3600

/** 仕様書の期待値（有効数字4桁）と比べる */
function expect4(actual: number | undefined, expected: number, tol = 6e-4) {
  expect(actual).toBeDefined()
  expect(Math.abs(actual! - expected) / Math.abs(expected)).toBeLessThan(tol)
}
/** 厚さは ±1 mm（§9） */
const expectT = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1.05e-3)
/** 遮蔽の質量は ±0.5%（§9） */
const expectM = (actual: number, expected: number) => expect4(actual, expected, 5e-3)

function criteria(id: CriteriaId) {
  const c = CRITERIA[id]
  return { target: c.target, astronaut: id === 'astronaut', H_lim: c.H_lim ?? 0.05, t_occ: c.t_occ ?? 8760 * HOUR, Phi_lim: c.Phi_lim ?? 1e17, D_lim: c.D_lim ?? 5000 }
}

const layer = (material: Layer['material'], t = 0): Layer => ({ material, t })

function base(cls: ReactorClass, over: Partial<ReactorInputs> = {}): ReactorInputs {
  const c = CLASSES[cls]
  const fuel = FUELS[c.fuel]
  return {
    Q: 43 * KW,
    T_op: 7 * YEAR,
    f_op: 1,
    q: c.q,
    V_min: c.V_min,
    HD: c.HD,
    t_ref: c.t_ref,
    rho_HM: c.rho_HM,
    fuel: c.fuel,
    nu: fuel.nu,
    alpha_c: alphaFor(fuel, c.spectrum),
    CR: 0,
    Bu_max: c.Bu_max,
    f_n: c.f_n,
    f_g: c.f_g,
    coolant: c.coolant,
    T_hot: c.T_hot,
    alpha_r: c.alpha_r,
    f_act: COOLANTS[c.coolant].f_act,
    hx_eval: false,
    f_HX: 0.3,
    t_tr: 2,
    L_HX: 10,
    hx_layers: [layer('concrete')],
    ...criteria('astronaut'),
    L: 1000,
    L_surface: false,
    h_t: 2,
    R_obj: 10,
    shield_mode: 'shadow',
    solve: true,
    layers: [layer('tungsten'), layer('lih')],
    solve_count: 2,
    layout: 'above',
    h_base: 0.5,
    depth: 2,
    r_w: 1,
    H_w: 1.5,
    t_w: 1,
    wall_mat: 'regolith',
    t_top: 0,
    lid_mat: 'regolith',
    cav_gap: 0.3,
    ground_rho: GROUNDS.moon.rho,
    ground_w: GROUNDS.moon.w,
    basis: 'conservative',
    L_up: 1000,
    origin: { regolith: 'local', cement: 'earth', water: 'earth', sulfur: 'earth', resin: 'earth' },
    boom: false,
    optimize_L: false,
    lambda_b: 1,
    P_e: 100 * KW,
    V_tr: 1000,
    f_loss: 0.02,
    conductor: 'aluminum',
    ...over,
  }
}

function outputsOf(p: ReactorInputs): ReactorOutputs {
  const r = computeReactor(p)
  expect(r.errors).toEqual([])
  return r.outputs!
}
const codes = (p: ReactorInputs) => {
  const r = computeReactor(p)
  return [...r.errors, ...r.warnings].map((m) => m.code)
}

/**
 * 総当たり（ガンマ線用の層を 0.2 mm 刻み）で、質量が最小の2層の厚さを求める（§9：実装の確認用）。
 * 中性子用の層は、それぞれのガンマ線用の厚さで基準を満たす最小の厚さ
 */
function bruteForce(mk: (layers: Layer[]) => ReactorInputs, gMat: Layer['material'], nMat: Layer['material'], tgMax = 0.15) {
  let best = { mass: Number.POSITIVE_INFINITY, tg: 0, tn: 0 }
  for (let tg = 0; tg <= tgMax; tg += 0.0002) {
    const r = computeReactor({ ...mk([layer(gMat, tg), layer(nMat)]), solve_count: 1 })
    if (r.outputs && r.outputs.M_shield < best.mass) best = { mass: r.outputs.M_shield, tg, tn: r.outputs.thickness[1] }
  }
  return best
}

/** SP-100 の影遮蔽（T5 の条件） */
const sp100 = (over: Partial<ReactorInputs> = {}) =>
  base('sp100', { Q: 2.5 * MW, ...criteria('electronics'), L: 25, R_obj: 2.25, ...over })

describe('仕様書 §9 のテストケース', () => {
  it('T1：基本量', () => {
    const o = outputsOf(base('sp100', { Q: 1 * MW, alpha_c: 0.169, shield_mode: 'none', L: 100, ...criteria('public') }))
    expect4(o.fission_rate, 3.121e16)
    expect4(o.fission_rate * 2.43, 7.583e16)
    expect4(neutronSpeed(2 * MEV), 1.956e7)
    expect4(neutronSpeed(0.025 * 1.602176634e-19), 2187)
    expect4(WATT_MEAN, 2.031)
    expect4(wattAbove(10), 1.287e-3, 3e-3)
    // 1 MWd あたりのウラン235：核分裂 1.052 g、消費 1.230 g
    expect4((o.m_burn / o.MWd / 1.169) * 1e3, 1.052)
    expect4((o.m_burn / o.MWd) * 1e3, 1.23)
    expect4(o.unshielded_rate.H_n * HOUR * 1e3, 2.51e4, 2e-3)
    expect4(o.unshielded_rate.D_g_human * HOUR * 1e3, 261, 2e-3)
    const far = outputsOf(base('sp100', { Q: 1 * MW, shield_mode: 'none', L: 1000, ...criteria('public') }))
    expect4(far.unshielded_rate.H_n * HOUR * 1e3, 251, 2e-3)
    expect4(far.unshielded_rate.D_g_human * HOUR * 1e3, 2.61, 2e-3)
  })

  it('T2：SP-100 の遮蔽なしのガンマ線（0.3 m で 20.1 Gy/s）', () => {
    const o = outputsOf(sp100({ shield_mode: 'none', L: 0.3 }))
    expect4(o.unshielded_rate.D_g_human, 20.1, 2e-3)
  })

  it('T3：炉心の大きさ', () => {
    const s = coreSize({ Q: 2.5 * MW, ...CLASSES.sp100 })
    expect4(s.V_core, 0.03571)
    expect4(s.D, 0.3569)
    expect4(s.H, 0.3569)
    expect4(s.R0, 0.3043)
    const k = coreSize({ Q: 43 * KW, ...CLASSES.kilopower })
    expect4(k.V_core, 2.54e-3)
    expect4(k.D, 0.1216)
    expect4(k.H, 0.2188)
    expect4(k.R0, 0.1846)
    const large = outputsOf(base('large', { Q: 3400 * MW, shield_mode: 'none' }))
    expect4(large.V_core, 32.69)
    expect4(large.D, 3.357)
    expect4(large.H, 3.693)
    expect4(large.m_HM, 89.25e3)
    expect4(large.t_life / 86_400, 1312)
    const nu = coreSize({ Q: 250 * MW, ...CLASSES.nuscale })
    expect4(nu.V_core, 3.378)
    expect4(nu.D, 1.472)
    expect4(nu.H, 1.987)
    expect4(coreSize({ Q: 870 * MW, ...CLASSES.bwrx }).V_core, 21.22)
  })

  it('T4：Kilopower の燃料（43 kWt、10年）', () => {
    const o = outputsOf(base('kilopower', { T_op: 10 * YEAR, shield_mode: 'none' }))
    expect4(o.MWd, 157.1)
    expect4(o.m_burn, 0.2135)
    expect4(o.Bu / ((1e9 * 86_400) / 1e3), 3.889)
  })

  it('T5：SP-100 の影遮蔽（GES の基準）', () => {
    const o = outputsOf(sp100())
    expect4(o.unshielded.fluence / 1e4, 1.6e17)
    expect4(o.unshielded.gamma, 5.749e5)
    expectT(o.thickness[0], 4.8 * CM)
    expectT(o.thickness[1], 78.0 * CM)
    expectM(o.M_shield, 567.7)
  })

  it('T6：SP-100 級の影遮蔽（別の基準）', () => {
    // 仕様書の値（タングステン 2.80 cm、水素化リチウム 103.3 cm、532.3 kg）より細かい総当たりでは、
    // 少し軽い組（2.86 cm、102.0 cm、530.9 kg）がある。総当たりより重くないこと、質量が仕様書の値と ±0.5% で一致することを確かめる
    const o = outputsOf(sp100({ Phi_lim: 1e12 * 1e4, D_lim: 1e4 }))
    const b = bruteForce((layers) => sp100({ Phi_lim: 1e12 * 1e4, D_lim: 1e4, layers }), 'tungsten', 'lih')
    expect(o.M_shield).toBeLessThanOrEqual(b.mass * 1.0005)
    expect(Math.abs(o.thickness[0] - b.tg)).toBeLessThan(2e-3)
    expect(Math.abs(o.thickness[1] - b.tn)).toBeLessThan(2e-3)
    expectM(o.M_shield, 532.3)
  })

  it('T7：厚さを指定', () => {
    const o = outputsOf(sp100({ solve: false, layers: [layer('tungsten', 5 * CM), layer('lih', 80 * CM)] }))
    expect4(o.shielded.fluence / 1e4, 7.673e12)
    expect4(o.shielded.gamma, 3976)
    expectM(o.M_shield, 587.9)
  })

  it('T8：Kilopower を月面で使う（乗員）', () => {
    const o = outputsOf(base('kilopower'))
    expect4(o.unshielded.year * 1e3, 9.56e4, 3e-3)
    // 影遮蔽：仕様書の値はタングステン 1.60 cm、水素化リチウム 97.0 cm、120.8 kg。
    // 質量は一致するが、細かい総当たりでは水素化リチウムは 97.9 cm になる（仕様書の 97.0 は 98 cm 前後の誤りと考えられる）。
    // 質量の谷が平らなので、厚さは総当たりと ±3 mm で比べる
    const shadow = bruteForce((layers) => base('kilopower', { layers }), 'tungsten', 'lih')
    expect(o.M_shield).toBeLessThanOrEqual(shadow.mass * 1.0005)
    expect(Math.abs(o.thickness[0] - 1.6 * CM)).toBeLessThan(2e-3)
    expect(Math.abs(o.thickness[1] - shadow.tn)).toBeLessThan(3e-3)
    expectM(o.M_shield, 120.8)
    // 中性子の線量（仕様書 1.316 mSv/年）は水素化リチウムの厚さの差（約1 cm）で約1割変わるので、合計が基準以下であることを確かめる
    expect(o.shielded.year).toBeLessThanOrEqual(50e-3 * (1 + 1e-9))
    expect4(o.shielded.year_g * 1e3, 48.68, 0.01)
    // 全方向遮蔽：仕様書の値はタングステン 5.55 cm、水素化リチウム 59.3 cm。細かい総当たりでは 5.54 cm、59.29 cm
    const omni = outputsOf(base('kilopower', { shield_mode: 'omni' }))
    const b = bruteForce((layers) => base('kilopower', { shield_mode: 'omni', layers }), 'tungsten', 'lih')
    expect(omni.M_shield).toBeLessThanOrEqual(b.mass * 1.0005)
    expect(Math.abs(omni.thickness[0] - 5.55 * CM)).toBeLessThan(2e-3)
    expectT(omni.thickness[1], 59.3 * CM)
    expectM(omni.M_shield, 2453)
  })

  const underground = (over: Partial<ReactorInputs> = {}) => base('kilopower', { shield_mode: 'surface', layout: 'under', ...over })

  it('T9：Kilopower を月面に埋設（保守的な評価）', () => {
    expectT(outputsOf(underground({ L: 100 })).t_top, 2.095)
    const o = outputsOf(underground())
    expectT(o.t_top, 1.302)
    expect4(o.depth, 1.487, 1e-3)
  })

  it('T10：大型発電炉の生体遮蔽', () => {
    const o = outputsOf(
      base('large', {
        Q: 3400 * MW,
        shield_mode: 'omni',
        L_surface: true,
        layers: [layer('water', 0.3), layer('iron', 0.2), layer('concrete')],
        solve_count: 1,
        ...criteria('occupational'),
      }),
    )
    expectT(o.thickness[2], 1.997)
    expect4(o.R_out, 4.48, 1e-3)
    expect4(o.shielded_rate.H_n * HOUR * 1e6, 5.353, 0.01)
    expect4(o.shielded_rate.D_g_human * HOUR * 1e6, 4.647, 0.01)
  })

  it('T11：NuScale のプール', () => {
    const o = outputsOf(
      base('nuscale', {
        Q: 250 * MW,
        shield_mode: 'omni',
        L_surface: true,
        layers: [layer('iron', 0.2), layer('water')],
        solve_count: 1,
        ...criteria('occupational'),
      }),
    )
    expectT(o.thickness[1], 3.705)
  })

  it('T12：崩壊熱（運転 7年のあと）', () => {
    const T = 7 * YEAR
    expect4(decayFraction(1, T), 0.06087)
    expect4(decayFraction(3600, T), 0.01076)
    expect4(decayFraction(86_400, T), 0.005071)
    expect4(decayFraction(30 * 86_400, T), 0.001914)
    expect4(decayFraction(YEAR, T), 0.0006698)
  })

  it('T13：守る対象が遮蔽の内側', () => {
    expect(codes(sp100({ L: 0.5 }))).toContain('inside-shield')
  })

  it('T14：ブームの最適化', () => {
    expect4(cableMass(25, 100 * KW, 1000, 0.02, 'aluminum'), 0.9518)
    expect4(cableMass(50, 100 * KW, 1000, 0.02, 'aluminum'), 3.807)
    expect4(cableMass(100, 100 * KW, 1000, 0.02, 'aluminum'), 15.23)
    // 合計の質量は距離に対して非常に平ら（138〜146 m で 0.3 kg しか変わらない）ので、
    // 最適な距離は仕様書の 142 m と少しずれる。合計の質量は仕様書の値と ±0.5%、142 m のときより重くないことを確かめる
    const o = outputsOf(sp100({ boom: true, optimize_L: true }))
    expect(Math.abs(o.L_opt - 142.0)).toBeLessThanOrEqual(5)
    expect4(o.M_total_s, 345.5, 5e-3)
    expect(o.M_total_s).toBeLessThanOrEqual(outputsOf(sp100({ boom: true, L: 142 })).M_total_s + 1e-6)
    expect4(o.M_shield, 172.8, 0.04)
    const fixed = outputsOf(sp100({ boom: true }))
    expect4(fixed.M_total_s, 593.7, 5e-3)
  })

  it('T15：混合材料の除去断面積', () => {
    // §4.7 の式で成分から計算した値が、表の値（有効数字3桁）と一致する
    for (const id of ['regolith', 'reg_concrete', 'sulfur_concrete', 'polymer_concrete'] as const) {
      const m = MATERIALS[id]
      expect4(mixSigmaR(m.rho, m.components!), m.sigmaR, 2e-3)
    }
    expect4(MATERIALS.reg_concrete.sigmaR / 100, 0.0892)
    expect4(MATERIALS.sulfur_concrete.sigmaR / 100, 0.0712)
    expect4(MATERIALS.polymer_concrete.sigmaR / 100, 0.0867)
    expect4(MATERIALS.hdpe.sigmaR / 100, 0.122)
  })

  const above = (over: Partial<ReactorInputs> = {}) => base('kilopower', { shield_mode: 'surface', layout: 'above', ...over })

  it('T16：地上に置いて壁で囲む（材料の比較）', () => {
    const reg = computeReactor(above())
    expect(reg.errors).toEqual([])
    expectT(reg.outputs!.t_w, 1.302)
    expectM(reg.outputs!.M_shield, 36.47e3)
    expect(reg.outputs!.M_import).toBe(0)
    expect(reg.warnings.map((m) => m.code)).toContain('no-lid')

    const conc = outputsOf(above({ wall_mat: 'reg_concrete' }))
    expectT(conc.t_w, 0.849)
    expectM(conc.M_shield, 27.34e3)
    expectM(conc.M_import, 6.015e3)

    const sulfur = outputsOf(above({ wall_mat: 'sulfur_concrete' }))
    expectT(sulfur.t_w, 1.06)
    expectM(sulfur.M_shield, 35.14e3)
    expectM(sulfur.M_import, 12.3e3)
    const sulfurLocal = outputsOf(
      above({ wall_mat: 'sulfur_concrete', origin: { regolith: 'local', cement: 'earth', water: 'earth', sulfur: 'local', resin: 'earth' } }),
    )
    expect(sulfurLocal.M_import).toBe(0)

    const poly = outputsOf(above({ wall_mat: 'polymer_concrete' }))
    expectT(poly.t_w, 0.876)
    expectM(poly.M_shield, 24.92e3)
    expectM(poly.M_import, 3.739e3)
  })

  it('T17：地下（評価のしかたの比較）', () => {
    const o = outputsOf(underground({ solve: false, depth: 2.0 }))
    expect4(o.t_top, 1.815, 1e-3)
    expect(Math.abs(o.ground_path - 499.8)).toBeLessThan(0.5)
    expect(o.direct!.year).toBeLessThan(1e-30)
    expect4(o.conservative!.year * 1e3, 2.537, 2e-3)
    const deeper = outputsOf(underground({ solve: false, depth: 3.0 }))
    expect4(deeper.conservative!.year * 1e3, 0.007661, 3e-3)
  })

  it('T18：半地下', () => {
    const o = outputsOf(above({ layout: 'semi', H_w: 1.0 }))
    expectT(o.t_w, 1.302)
    expectM(o.M_shield, 24.31e3)
  })

  it('T19：冷却材の放射化', () => {
    const o = outputsOf(
      base('sfr', {
        Q: 100 * MW,
        hx_eval: true,
        // 期待値はウラン235 の中性子の数（2.43）で計算されている
        fuel: 'u235',
        nu: 2.43,
        coolant: 'sodium',
        f_act: 3e-3,
        T_hot: 823,
        shield_mode: 'none',
        ...criteria('occupational'),
      }),
    )
    expect4(o.A_sat, 2.275e16)
    expect4(o.A_sat / 3.7e10, 6.149e5)
    expect4(o.hx_unshielded_rate * HOUR, 33.59, 2e-3)
    expectT(o.hx_thickness[0], 1.752)
  })

  it('T20：燃料の種類', () => {
    const perMWd = (fuel: 'u233' | 'pu239', alpha: number) => {
      const o = outputsOf(base('naval', { fuel, alpha_c: alpha, nu: FUELS[fuel].nu, shield_mode: 'none', Q: 1 * MW }))
      return { fission: (o.m_burn / o.MWd / (1 + alpha)) * 1e3, burn: (o.m_burn / o.MWd) * 1e3 }
    }
    const u233 = perMWd('u233', 0.085)
    expect4(u233.fission, 1.043)
    expect4(u233.burn, 1.132)
    const pu = perMWd('pu239', 0.362)
    expect4(pu.fission, 1.07)
    expect4(pu.burn, 1.458)
    expect(codes(base('naval', { fuel: 'u233', shield_mode: 'none' }))).toContain('u233')
  })
})

describe('入力チェックと性質', () => {
  it('冷却材の温度の範囲', () => {
    expect(codes(base('sfr', { T_hot: 1200, shield_mode: 'none' }))).toContain('coolant-temp')
    expect(codes(base('sfr', { T_hot: 900, shield_mode: 'none' }))).toContain('coolant-outlet')
    // Kilopower のヒートパイプは 1073 K でも目安の範囲内
    expect(codes(base('kilopower', { shield_mode: 'none' }))).not.toContain('coolant-outlet')
  })

  it('上限の厚さでも基準を満たせない', () => {
    expect(codes(base('large', { Q: 3400 * MW, L: 10, layers: [layer('water')], solve_count: 1, shield_mode: 'omni', ...criteria('public') }))).toContain(
      'cannot-meet',
    )
  })

  it('燃料の交換が必要になる', () => {
    expect(codes(base('large', { Q: 3400 * MW, shield_mode: 'none' }))).toContain('fuel-life')
  })

  it('宇宙飛行士の基準では、運転年数の合計が NASA の生涯の上限を超えると警告する', () => {
    expect(codes(base('kilopower', { T_op: 7 * YEAR }))).not.toContain('nasa-lifetime')
    expect(codes(base('kilopower', { T_op: 15 * YEAR }))).toContain('nasa-lifetime')
    expect(codes(base('kilopower', { T_op: 15 * YEAR, ...criteria('public') }))).not.toContain('nasa-lifetime')
  })

  it('外側の層に水素がないと精度が下がる', () => {
    expect(codes(base('kilopower', { layers: [layer('lih'), layer('tungsten')] }))).toContain('no-hydrogen')
  })

  it('総当たりと §4.12 の方法の結果が一致する（T5）', () => {
    const o = outputsOf(sp100())
    let best = Number.POSITIVE_INFINITY
    for (let tg = 0; tg <= 0.1; tg += 0.002) {
      const r = computeReactor(sp100({ layers: [layer('tungsten', tg), layer('lih')], solve_count: 1 }))
      if (r.outputs) best = Math.min(best, r.outputs.M_shield)
    }
    expect(o.M_shield).toBeLessThanOrEqual(best * 1.001)
  })
})

describe('地盤の種類と自動の層', () => {
  const underground = (over: Partial<ReactorInputs> = {}) =>
    base('kilopower', { shield_mode: 'surface', layout: 'under', solve: false, depth: 2, basis: 'direct', L: 4, h_t: 1, ...over })

  it('含水率 0・密度 1800 kg/m³ の地盤は、月のレゴリスの表の値と一致する', () => {
    const g = groundMaterial(1800, 0)
    expect4(g.sigmaR, MATERIALS.regolith.sigmaR, 1e-9)
    expect4(g.mu, MATERIALS.regolith.mu, 1e-9)
    expect(g.hydrogen).toBe(false)
  })

  it('地球の湿った土では、地盤を通る中性子の線量が大きく下がる（ガンマ線はほぼ同じ）', () => {
    const moon = outputsOf(underground())
    const earth = outputsOf(underground({ ground_rho: GROUNDS.earth.rho, ground_w: GROUNDS.earth.w }))
    // 中性子の比は、除去断面積の差 × 地盤を通る長さで決まる
    const dSigma = groundMaterial(GROUNDS.earth.rho, GROUNDS.earth.w).sigmaR - MATERIALS.regolith.sigmaR
    expect4(earth.direct!.year_n / moon.direct!.year_n, Math.exp(-dSigma * moon.ground_path), 1e-6)
    expect(earth.direct!.year_n).toBeLessThan(moon.direct!.year_n * 1e-2)
    expect(earth.direct!.year_g).toBeLessThan(moon.direct!.year_g)
    expect(earth.direct!.year_g).toBeGreaterThan(moon.direct!.year_g * 1e-3)
  })

  it('乾いた地盤の地下では精度の警告を出す', () => {
    expect(codes(underground())).toContain('dry-ground')
    expect(codes(underground({ ground_w: GROUNDS.earth.w }))).not.toContain('dry-ground')
  })

  it('「地盤と同じ土」：月ではレゴリスと同じ結果、地球の土では埋め戻しの中性子の線量が下がる', () => {
    const cons = (over: Partial<ReactorInputs> = {}) => underground({ basis: 'conservative', L: 1000, h_t: 2, ...over })
    const reg = outputsOf(cons())
    const moon = outputsOf(cons({ lid_mat: 'ground' }))
    expect4(moon.shielded.year, reg.shielded.year, 1e-9)
    expect4(moon.M_shield, reg.M_shield, 1e-9)
    const earth = outputsOf(cons({ lid_mat: 'ground', ground_rho: GROUNDS.earth.rho, ground_w: GROUNDS.earth.w }))
    expect(earth.shielded.year_n).toBeLessThan(moon.shielded.year_n * 0.1)
    expect(earth.massRows.every((r) => r.origin === 'local')).toBe(true)
  })

  it('内側の層だけで基準を満たすと、自動の層は 0 cm になる', () => {
    const one = outputsOf(base('kilopower', { layers: [layer('lih', 3), layer('lih')], solve_count: 1 }))
    expect(one.thickness[1]).toBe(0)
    const two = outputsOf(base('kilopower', { layers: [layer('lih', 3), layer('tungsten'), layer('lih')], solve_count: 2 }))
    expect(two.thickness[1]).toBeLessThan(1e-4)
    expect(two.thickness[2]).toBeLessThan(1e-4)
  })

  it('コンクリート1層だけの遮蔽も計算できる', () => {
    const o = outputsOf(base('kilopower', { shield_mode: 'omni', layers: [layer('concrete')], solve_count: 1, ...criteria('public') }))
    expect(o.thickness[0]).toBeGreaterThan(0)
    expect(o.shielded.ratio).toBeLessThanOrEqual(1.0001)
  })
})
