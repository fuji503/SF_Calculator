import { describe, expect, it } from 'vitest'
import {
  computePower,
  CONVERTER_PRESETS,
  LOCATION_PRESETS,
  REACTOR_PRESETS,
  TES_MEDIUM_PRESETS,
  type ConverterType,
  type Engine,
  type LocationId,
  type PowerInputs,
  type PowerOutputs,
  type ReactorClass,
} from './model.ts'

const KW = 1e3
const WH = 3600
const HOUR = 3600

/** 仕様書の期待値（有効数字4桁）と比べる */
function expect4(actual: number | undefined, expected: number) {
  expect(actual).toBeDefined()
  expect(Math.abs(actual! - expected) / Math.abs(expected)).toBeLessThan(6e-4)
}

const engine = (type: ConverterType, over: Partial<Engine> = {}): Engine => {
  const c = CONVERTER_PRESETS[type]
  return { converter: type, T_cold: c.T_cold, eta_mech: c.eta_mech, alpha_conv: c.alpha_conv, ...over }
}

/** §9 の共通の値。場所はプリセット、月面は仕様書に書かれた丸めた値 */
function base(loc: LocationId, over: Partial<PowerInputs> = {}): PowerInputs {
  const l = LOCATION_PRESETS[loc]
  // 月面の昼は T_sink が 300 K なので、ミッション機器用ラジエータは 330 K（T3 と同じ）にする
  const lunar = loc === 'lunar' ? { T_cyc: 2.551e6, t_ecl: 1.276e6 } : {}
  const regolith = TES_MEDIUM_PRESETS.regolith
  return {
    I_sun: l.I_sun,
    T_cyc: l.T_cyc,
    t_ecl: l.t_ecl,
    T_sink: l.T_sink,
    T_sink_ecl: l.T_sink_ecl,
    T_env: l.T_env ?? 0,
    h_c: l.h_c,
    ...lunar,
    P_peak: 20 * KW,
    t_peak: 600,
    P_idle: 5 * KW,
    t_idle: 3000,
    Q_pl_same: true,
    Q_pl_peak: 0,
    Q_pl_idle: 0,
    T_payload: loc === 'lunar' ? 330 : 300,
    payload_design: 'peak',
    buf_medium: 'water',
    c_buf: 4180,
    dT_buf: 10,
    L_buf: 0,
    rho_buf: 1000,
    e_bat: 150 * WH,
    v_bat: 250 * WH * 1000,
    eta_bat: 0.9,
    DoD: 0.8,
    sun_source: 'pv',
    reactor: 'none',
    beam: 'none',
    night_buffer: 'battery',
    eta_pv: 0.3,
    f_deg: 0.85,
    rho_pv: 2,
    reactor_class: 'kilopower',
    Q_r: 40 * KW,
    T_hot_r: 1073,
    alpha_r: 7e-3,
    shield_include: true,
    alpha_s: 12.6e-3,
    f_store: 0,
    eta_conc: 0.85,
    rho_conc: 2,
    T_hot_s: 1100,
    P_beam: 0,
    eng_r: engine('stirling'),
    eng_s: engine('brayton_hexe'),
    eng_tes: engine('brayton_hexe'),
    c_tes: regolith.c,
    rho_tes: regolith.rho,
    L_tes: 0,
    T_melt: 900,
    T_max: regolith.T_max,
    T_min: regolith.T_min,
    T_lim: regolith.T_lim,
    tes_origin: 'local',
    tes_charge: 'heater',
    eta_heat: 0.98,
    alpha_heat: 1e-3,
    dT_hx: 50,
    lambda_tes: 0.01 / 86_400,
    alpha_hx: 0,
    eps: 0.9,
    rho_rad: 5,
    n_side: 2,
    eta_fin: 0.9,
    ...over,
  }
}

/** 一定の負荷（ピークと待機が同じ） */
const constant = (P: number, Q_pl: number | 'same' = 'same'): Partial<PowerInputs> => ({
  P_peak: P,
  P_idle: P,
  ...(Q_pl === 'same' ? { Q_pl_same: true } : { Q_pl_same: false, Q_pl_peak: Q_pl, Q_pl_idle: Q_pl }),
})

/** 日照中の電源なし＋原子炉（熱出力を自動で決める） */
const autoReactor = (cls: ReactorClass, over: Partial<PowerInputs> = {}): Partial<PowerInputs> => {
  const r = REACTOR_PRESETS[cls]
  return {
    sun_source: 'none',
    reactor: 'auto',
    reactor_class: cls,
    T_hot_r: r.T_hot,
    alpha_r: r.alpha_r,
    alpha_s: r.alpha_s,
    eng_r: engine(r.converter),
    ...over,
  }
}

function outputsOf(p: PowerInputs): PowerOutputs {
  const r = computePower(p)
  expect(r.errors).toEqual([])
  return r.outputs!
}

const mass = (o: PowerOutputs, key: string) => o.masses.find((m) => m.key === key)!.mass

describe('仕様書 §9 のテストケース', () => {
  it('T1：Kilopower 相当', () => {
    const o = outputsOf(base('deep_space', { ...constant(10 * KW, 0), ...autoReactor('kilopower') }))
    expect4(o.eta_r, 0.2509)
    expect4(o.Q_r, 39.86 * KW)
    expect4(o.P_r, 10 * KW)
    expect4(o.radiators.r!.A, 12.7)
    expect4(mass(o, 'M_reactor'), 279.0)
    expect4(mass(o, 'M_shield'), 502.2)
    expect4(mass(o, 'M_conv_r'), 900)
    expect4(o.M_total, 1745)
    expect(o.P_gen).toBe(0)
  })

  it('T2：地球低軌道の太陽電池（平均で設計）', () => {
    const o = outputsOf(base('leo', { payload_design: 'average' }))
    expect4(o.P_base, 7.727 * KW)
    expect4(o.E_ecl, 5500 * WH)
    expect4(o.E_bn, 5500 * WH)
    expect4(o.P_gen, 14.21 * KW)
    expect4(o.A_pv, 40.93)
    expect4(o.C_bat, 6875 * WH)
    expect4(o.M_bat, 45.83)
    expect4(o.Q_pl, 7.5 * KW)
    expect4(o.radiators.pl!.A, 13.26)
    expect4(o.E_buf, 7.5e6)
    expect4(o.M_buf, 179.4)
    expect4(o.V_buf, 0.1794)
    expect4(o.M_total, 373.4)
  })

  it('T3：月面赤道の太陽電池', () => {
    const o = outputsOf(base('lunar', { ...constant(10 * KW), T_payload: 330 }))
    expect4(o.E_ecl, 3.544e6 * WH)
    expect4(o.P_gen, 21.12 * KW)
    expect4(o.C_bat, 4.431e6 * WH)
    expect4(o.M_bat, 2.954e4)
    expect4(o.radiators.pl!.A, 28.96)
    expect(o.radiators.pl!.by).toBe('sun')
    expect4(o.M_total, 2.98e4)
  })

  it('T4：火星表面の原子炉', () => {
    const o = outputsOf(
      base('mars_surface', {
        ...autoReactor('kilopower'),
        P_peak: 40 * KW,
        t_peak: HOUR,
        P_idle: 20 * KW,
        t_idle: 5 * HOUR,
        Q_pl_same: false,
        Q_pl_peak: 30 * KW,
        Q_pl_idle: 15 * KW,
        T_payload: 320,
      }),
    )
    expect4(o.P_r, 23.64 * KW)
    expect4(o.Q_r, 94.21 * KW)
    expect(o.E_bn).toBe(0)
    expect4(o.C_bat, 2.045e4 * WH)
    expect4(o.radiators.r!.A, 24.43)
    expect4(o.radiators.pl!.A, 24.75)
    expect4(o.radiators.pl!.q_rad, 816.2)
    expect4(o.radiators.pl!.q_conv, 396.0)
    expect4(o.M_total, 4356)
  })

  it('T5：タイタン表面の原子炉（対流が支配的）', () => {
    const o = outputsOf(base('titan', { ...autoReactor('kilopower'), ...constant(10 * KW) }))
    expect4(o.radiators.r!.A, 2.235)
    expect4(o.radiators.pl!.A, 1.227)
    expect4(o.radiators.pl!.q_rad, 736.9)
    expect4(o.radiators.pl!.q_conv, 7416)
    expect4(o.M_total, 1699)
  })

  it('T6：小型モジュール炉を宇宙で使う', () => {
    const o = outputsOf(
      base('deep_space', {
        ...autoReactor('smr', { T_hot_r: 560, alpha_r: 2.5e-3, shield_include: false, eng_r: engine('rankine', { T_cold: 400 }) }),
        ...constant(77e6, 0),
      }),
    )
    expect4(o.eta_r, 0.2)
    expect4(o.Q_r, 385e6)
    expect4(o.radiators.r!.A, 1.31e5)
    expect4(mass(o, 'M_reactor'), 9.625e5)
    expect4(o.M_rad, 6.549e5)
    expect4(o.M_total, 1.848e6)
  })

  it('T7：地球低軌道の太陽熱', () => {
    const o = outputsOf(base('leo', { payload_design: 'average', sun_source: 'solar_thermal' }))
    expect4(o.eta_s, 0.2545)
    expect4(o.Q_s, 55.81 * KW)
    expect4(o.A_conc, 48.24)
    expect4(o.radiators.s!.A, 19.15)
    expect4(o.M_buf, 179.4)
    expect4(o.M_total, 767.9)
  })

  it('T8：SP-100 相当', () => {
    const o = outputsOf(base('deep_space', { ...constant(100 * KW, 0), ...autoReactor('sp100') }))
    expect4(o.eta_r, 0.04074)
    expect4(o.Q_r, 2.455e6)
    expect4(o.radiators.r!.A, 62.58)
    expect4(mass(o, 'M_reactor'), 736.4)
    expect4(mass(o, 'M_shield'), 1473)
    expect4(o.M_total, 3722)
  })

  it('T9：排熱できない場合', () => {
    const r = computePower(base('lunar', { T_payload: 250 }))
    expect(r.errors.map((m) => m.code)).toContain('cannot-reject')
  })

  it('T10：地球表面の太陽電池', () => {
    const o = outputsOf(base('earth', { ...constant(10 * KW), T_payload: 330 }))
    expect4(o.P_gen, 21.11 * KW)
    expect4(o.A_pv, 165.6)
    expect4(o.C_bat, 1.5e5 * WH)
    expect4(o.M_bat, 1000)
    expect4(o.radiators.pl!.q_rad + o.radiators.pl!.q_conv, 1320)
    expect4(o.radiators.pl!.q_rad, 564.0)
    expect4(o.radiators.pl!.q_conv, 756.0)
    expect4(o.radiators.pl!.A, 7.576)
    expect4(o.M_total, 1369)
  })

  it('T11：月面で太陽電池＋蓄熱体（電気ヒータ）', () => {
    const o = outputsOf(base('lunar', { ...constant(10 * KW), T_payload: 330, night_buffer: 'tes' }))
    expect4(o.P_tes, 10 * KW)
    expect4(o.eta_tes_avg, 0.206)
    expect4(o.eta_tes_min, 0.1333)
    expect4(o.eta_ret, 0.8628)
    expect4(o.E_tes, 7.178e10)
    expect4(o.M_tes, 1.436e5)
    expect4(o.V_tes, 71.78)
    expect4(o.P_chg, 57.45 * KW)
    expect4(o.P_gen, 67.45 * KW)
    expect4(o.A_pv, 194.3)
    expect4(o.radiators.tes!.A, 27.75)
    expect(o.radiators.tes!.by).toBe('ecl')
    expect4(o.radiators.pl!.A, 28.96)
    expect(o.C_bat).toBe(0)
    expect4(o.eta_rt, 0.1742)
    expect4(o.M_launch, 929.7)
    expect4(o.M_local, 1.436e5)
  })

  const t12: Partial<PowerInputs> = { ...constant(20 * KW, 0), reactor: 'fixed', Q_r: 40 * KW }

  it('T12：月面で太陽電池＋原子炉＋蓄電池', () => {
    const o = outputsOf(base('lunar', t12))
    expect4(o.P_r, 10.04 * KW)
    expect4(o.E_bn, 3.532e6 * WH)
    expect4(o.P_gen, 21.05 * KW)
    expect4(o.A_pv, 60.64)
    expect4(o.C_bat, 4.415e6 * WH)
    expect4(o.M_bat, 2.943e4)
    expect4(o.radiators.r!.A, 18.64)
    expect(o.radiators.r!.by).toBe('sun')
    expect4(o.M_total, 3.133e4)
    const noReactor = outputsOf(base('lunar', { ...t12, reactor: 'none' }))
    expect4(noReactor.M_total, 5.932e4)
  })

  const t13: Partial<PowerInputs> = { ...t12, night_buffer: 'tes', f_store: 1, T_max: 1000 }

  it('T13：月面で太陽電池＋原子炉の熱を直接ためる蓄熱体', () => {
    const o = outputsOf(base('lunar', t13))
    expect(o.P_c_sun).toBe(0)
    expect4(o.P_tes, 9.965 * KW)
    expect4(o.eta_tes_avg, 0.1957)
    expect4(o.E_tes, 7.532e10)
    expect4(o.M_tes, 1.883e5)
    expect4(o.E_dir, 5.1e10)
    expect4(o.P_chg, 19.46 * KW)
    expect4(o.P_gen, 39.46 * KW)
    expect4(o.A_pv, 113.7)
    expect4(o.radiators.r!.A, 12.79)
    expect(o.radiators.r!.by).toBe('ecl')
    expect4(o.radiators.tes!.A, 27.65)
    expect4(o.M_launch, 2336)
    expect4(o.M_local, 1.883e5)
  })

  it('T14：原子炉の出口より熱くためようとした場合', () => {
    const r = computePower(base('lunar', { ...t13, T_max: 1100 }))
    expect(r.errors.map((m) => m.code)).toContain('tmax-above-reactor')
  })

  it('T15：月面で太陽電池＋太陽炉で加熱する蓄熱体（太陽塩、地球から輸送）', () => {
    const salt = TES_MEDIUM_PRESETS.solar_salt
    const o = outputsOf(
      base('lunar', {
        ...constant(10 * KW, 0),
        night_buffer: 'tes',
        tes_charge: 'solar_furnace',
        c_tes: salt.c,
        rho_tes: salt.rho,
        T_max: salt.T_max,
        T_min: salt.T_min,
        T_lim: salt.T_lim,
        tes_origin: 'earth',
      }),
    )
    expect4(o.eta_tes_avg, 0.1686)
    expect4(o.eta_tes_min, 0.1158)
    expect4(o.E_tes, 8.773e10)
    expect4(o.M_tes, 2.127e5)
    expect4(o.Q_sf, 68.81 * KW)
    expect4(o.A_sf, 59.48)
    expect4(o.P_gen, 10 * KW)
    expect4(o.A_pv, 28.81)
    expect4(o.radiators.tes!.A, 32.59)
    expect4(o.M_launch, 2.132e5)
  })

  it('T16：作動流体の比較（宇宙）', () => {
    const common = { T_hot_r: 823, alpha_r: 2.5e-3, shield_include: false }
    const a = outputsOf(base('deep_space', { ...constant(1e6, 0), ...autoReactor('sfr', { ...common, eng_r: engine('brayton_sco2') }) }))
    expect4(a.eta_r, 0.4532)
    expect4(a.Q_r, 2.207e6)
    expect4(a.radiators.r!.A, 1518)
    expect4(mass(a, 'M_conv_r'), 3000)
    expect4(a.M_total, 1.611e4)
    const b = outputsOf(base('deep_space', { ...constant(1e6, 0), ...autoReactor('sfr', { ...common, eng_r: engine('brayton_hexe') }) }))
    expect4(b.eta_r, 0.2056)
    expect4(b.Q_r, 4.864e6)
    expect4(b.radiators.r!.A, 1643)
    expect4(mass(b, 'M_conv_r'), 2e4)
    expect4(b.M_total, 4.038e4)
  })

  it('T17：高温ガス炉とヘリウムのタービン（地上、空冷）', () => {
    const r = computePower(base('earth', { ...constant(100e6, 0), ...autoReactor('htgr') }))
    expect(r.errors).toEqual([])
    const o = r.outputs!
    expect4(o.eta_r, 0.4764)
    expect4(o.Q_r, 209.9e6)
    expect4(o.radiators.r!.q_rad + o.radiators.r!.q_conv, 434.7)
    expect4(o.radiators.r!.q_rad, 218.7)
    expect4(o.radiators.r!.q_conv, 216.0)
    expect4(o.radiators.r!.A, 2.529e5)
    expect4(o.M_total, 1.564e6)
    expect(r.warnings.map((m) => m.code)).toContain('alpha-r-unset')
  })
})

describe('物理的な性質', () => {
  it('一定の電源がないとき、蓄電池から出す量は日陰中の負荷と同じ', () => {
    const o = outputsOf(base('leo'))
    expect(o.E_bn).toBeCloseTo(o.E_ecl, 6)
  })

  it('ラジエータは両面にすると面積が半分', () => {
    const two = outputsOf(base('lunar', constant(10 * KW)))
    const one = outputsOf(base('lunar', { ...constant(10 * KW), n_side: 1 }))
    expect(one.radiators.pl!.A).toBeCloseTo(2 * two.radiators.pl!.A, 9)
  })

  it('損失のない蓄熱体の往復効率は η_heat × 平均効率', () => {
    const o = outputsOf(base('lunar', { ...constant(10 * KW), night_buffer: 'tes', lambda_tes: 0 }))
    expect(o.eta_ret).toBe(1)
    expect(o.eta_rt).toBeCloseTo(0.98 * o.eta_tes_avg, 12)
  })

  it('融解熱を使う場合は、融解の温度での効率で仕事が増える', () => {
    const p = { ...constant(10 * KW), night_buffer: 'tes' as const }
    const a = outputsOf(base('lunar', p))
    const b = outputsOf(base('lunar', { ...p, L_tes: 300e3, T_melt: 900 }))
    expect(b.M_tes).toBeLessThan(a.M_tes)
  })

  it('常時の外部電源があると、日陰中に蓄電池から出す量が減る', () => {
    const a = outputsOf(base('lunar', constant(10 * KW)))
    const b = outputsOf(base('lunar', { ...constant(10 * KW), beam: 'always', P_beam: 4 * KW }))
    expect(b.E_bn).toBeCloseTo(a.E_bn * 0.6, 0)
  })

  it('ほかの電源だけで足りるときは余りを出す', () => {
    const r = computePower(base('deep_space', { ...constant(10 * KW, 0), beam: 'always', P_beam: 15 * KW }))
    expect(r.outputs!.P_gen).toBe(0)
    expect(r.outputs!.P_surplus).toBeCloseTo(5 * KW, 6)
    expect(r.warnings.map((m) => m.code)).toContain('surplus')
  })
})

describe('入力チェック（§6）', () => {
  const codes = (loc: LocationId, over: Partial<PowerInputs>) => {
    const r = computePower(base(loc, over))
    return [...r.errors, ...r.warnings].map((m) => m.code)
  }

  it('エラー', () => {
    expect(codes('leo', { eng_s: engine('brayton_hexe', { T_cold: 1200 }), sun_source: 'solar_thermal' })).toContain('cold-above-hot')
    expect(codes('leo', { I_sun: 0 })).toContain('no-sun')
    expect(codes('lunar', { ...constant(20 * KW), sun_source: 'none', reactor: 'fixed', Q_r: 40 * KW })).toContain('insufficient')
    expect(codes('lunar', { reactor: 'auto' })).toContain('auto-needs-no-sun')
    expect(codes('leo', { sun_source: 'none' })).toContain('no-source')
    expect(codes('leo', { P_idle: 30 * KW })).toContain('idle-above-peak')
    expect(codes('lunar', { night_buffer: 'tes', T_max: 500 })).toContain('tmax-below-tmin')
    expect(codes('lunar', { night_buffer: 'tes', T_min: 400 })).toContain('tmin-below-cold')
    expect(codes('lunar', { night_buffer: 'tes', L_tes: 1e5, T_melt: 1200 })).toContain('melt-range')
    expect(codes('leo', { t_ecl: 6000 })).toContain('ecl-range')
  })

  it('使わない設定は見ない', () => {
    // 蓄熱体を使わないときは、蓄熱体の温度を見ない
    expect(codes('lunar', { ...constant(10 * KW), T_max: 100 })).toEqual([])
    // 太陽熱を使わないときは、太陽熱用の熱機関を見ない
    expect(codes('leo', { DoD: 0.3, eng_s: engine('brayton_hexe', { T_cold: 2000 }) })).toEqual([])
  })

  it('警告と情報', () => {
    expect(codes('titan', {})).toContain('weak-sun')
    expect(codes('leo', { payload_design: 'average', T_payload: 380 })).toContain('water-phase')
    expect(codes('leo', { payload_design: 'average', T_payload: 380, buf_medium: 'custom' })).not.toContain('water-phase')
    expect(codes('lunar', { night_buffer: 'tes', T_lim: 1000 })).toContain('above-tlim')
    expect(codes('lunar', { night_buffer: 'tes' })).toContain('hx-unset')
    expect(codes('deep_space', { night_buffer: 'tes' })).toContain('tes-unneeded')
    expect(codes('lunar', { ...t12direct(), f_store: 1, T_max: 1000, Q_r: 60 * KW })).toContain('direct-surplus')
    expect(codes('deep_space', { ...autoReactor('sfr', { eng_r: engine('brayton_sco2', { T_cold: 290 }) }) })).toContain('below-co2-critical')
    expect(codes('deep_space', { ...autoReactor('smr') })).toContain('alpha-s-unset')
    expect(codes('deep_space', { ...autoReactor('smr', { shield_include: false }) })).not.toContain('alpha-s-unset')
    expect(codes('leo', {})).toContain('dod-cycles')
    expect(codes('lunar', constant(10 * KW))).not.toContain('dod-cycles')
    // 月面の昼（T_sink 300 K）に 290 K のラジエータは、放射では熱を受け取るが対流で捨てられる
    expect(codes('lunar', { T_payload: 295, h_c: 50, T_env: 200 })).toContain('reverse-flux')
  })
})

function t12direct(): Partial<PowerInputs> {
  return { ...constant(20 * KW, 0), reactor: 'fixed', night_buffer: 'tes' }
}
