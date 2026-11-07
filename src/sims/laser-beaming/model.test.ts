import { describe, expect, it } from 'vitest'
import { computeLaser, LASER_PRESETS, type LaserInputs, type LaserOutputs, type LaserType } from './model.ts'

const URAD = 1e-6

/** 仕様書の期待値（有効数字4桁）と比べる */
function expect4(actual: number | undefined, expected: number) {
  expect(actual).toBeDefined()
  expect(Math.abs(actual! - expected) / Math.abs(expected)).toBeLessThan(6e-4)
}

function base(type: LaserType, over: Partial<LaserInputs> = {}): LaserInputs {
  const pre = LASER_PRESETS[type]
  return {
    laser_type: type,
    lambda: pre.lambda,
    D: 1,
    M2: pre.M2,
    sigma_jitter: 0.1 * URAD,
    eta: pre.eta,
    E_chem: pre.E_chem ?? 10e6,
    f_exhaust: pre.f_exhaust ?? 0.9,
    k_aux: pre.k_aux ?? 0.05,
    t_op: 3600,
    d_sun: 1,
    I_sun_auto: true,
    I_sun: 1361,
    P_opt: 1e6,
    solve: false,
    goal_by_irradiance: false,
    P_goal: 1e6,
    E_goal: 1361,
    d: 10_000e3,
    atmosphere: 'vacuum',
    placement: 'emitter_surface',
    tau: 0,
    z: 0,
    theta_turb: 0,
    k_rx: 1,
    ...over,
  }
}

function outputsOf(p: LaserInputs): LaserOutputs {
  const r = computeLaser(p)
  expect(r.errors).toEqual([])
  return r.outputs!
}

describe('仕様書 §8 のテストケース', () => {
  it('T1：ファイバー、D=1 m、1 MW、10,000 km、真空', () => {
    const o = outputsOf(base('fiber'))
    expect4(o.D_spot, 31.58)
    expect4(o.E_target, 1104)
    expect4(o.P_in, 2.5e6)
    expect4(o.Q_waste, 1.5e6)
  })

  it('T2：CO2（波長が10倍でスポットは約12倍、照度は約1/150）', () => {
    const o = outputsOf(base('co2'))
    expect4(o.D_spot, 388.0)
    expect4(o.E_target, 7.314)
    expect4(o.P_in, 6.667e6)
    expect4(o.Q_waste, 5.667e6)
  })

  it('T3：FEL、地球の地表から 36,000 km（大気ゆらぎが支配的）', () => {
    const o = outputsOf(
      base('fel', {
        D: 10,
        P_opt: 10e6,
        sigma_jitter: 0.05 * URAD,
        d: 36_000e3,
        atmosphere: 'earth',
        placement: 'emitter_surface',
        tau: 0.1,
        z: 0.5,
        theta_turb: 5 * URAD,
      }),
    )
    expect4(o.D_diff, 14.05)
    expect4(o.D_jitter, 7.2)
    expect4(o.D_turb, 180)
    expect4(o.D_spot, 180.7)
    expect4(o.T_atm, 0.8923)
    expect4(o.E_target, 300.9)
    expect4(o.P_in, 100e6)
    expect4(o.Q_waste, 90e6)
  })

  it('T4：化学（DF）', () => {
    const o = outputsOf(base('chemical', { eta: 0.02, D: 2, sigma_jitter: 0.2 * URAD, d: 1000e3 }))
    expect4(o.D_spot, 9.306)
    expect4(o.E_target, 1.271e4)
    expect4(o.m_dot, 5)
    expect4(o.Q_chem_total, 49e6)
    expect4(o.Q_waste, 4.9e6)
    expect4(o.P_in, 50e3)
  })

  it('T5：太陽光励起、1.52 AU', () => {
    const o = outputsOf(base('solar_pumped', { P_opt: 100e3, d: 1000e3, d_sun: 1.52 }))
    expect4(o.D_spot, 25.87)
    expect4(o.E_target, 164.5)
    expect4(o.A_collector, 5659)
    expect4(o.Q_waste, 3.233e6)
    expect(o.P_in).toBe(0)
  })

  it('T6：ファイバー、D=10 m、σ=1 µrad（ジッターの係数4）', () => {
    const o = outputsOf(base('fiber', { D: 10, sigma_jitter: 1 * URAD }))
    expect4(o.D_spot, 40.12)
    expect4(o.E_target, 683.9)
  })
})

describe('物理的な性質', () => {
  it('目標が地表のときは大気ゆらぎを入れない', () => {
    const o = outputsOf(base('fiber', { atmosphere: 'earth', placement: 'target_surface', tau: 0.15, theta_turb: 5 * URAD }))
    expect(o.D_turb).toBe(0)
  })

  it('真空では τ を見ない', () => {
    const o = outputsOf(base('fiber', { tau: 10 }))
    expect(o.T_atm).toBe(1)
  })

  it('光の遅延時間は d/c（1 AU で約 499 s）', () => {
    const o = outputsOf(base('fiber', { d: 1.495978707e11 }))
    expect(o.t_delay).toBeCloseTo(499.0, 0)
  })

  it('電気駆動ではエネルギーが保存する（P_in = P_opt + Q_waste）', () => {
    const o = outputsOf(base('co2'))
    expect(o.P_in).toBeCloseTo(1e6 + o.Q_waste, 6)
  })
})

describe('入力チェック（§6）', () => {
  const codes = (type: LaserType, p: Partial<LaserInputs>) => {
    const r = computeLaser(base(type, p))
    return [...r.errors, ...r.warnings].map((m) => m.code)
  }

  it('エラー', () => {
    expect(codes('fiber', { P_opt: 0 })).toContain('positive')
    expect(codes('fiber', { eta: 0 })).toContain('eta-range')
    expect(codes('fiber', { M2: 0.9 })).toContain('m2-range')
    expect(codes('chemical', { f_exhaust: 1.2 })).toContain('chem-range')
    expect(codes('fiber', { atmosphere: 'earth', z: Math.PI / 2 })).toContain('zenith-range')
  })

  it('化学以外では化学の入力を見ない', () => {
    expect(codes('fiber', { E_chem: -1, f_exhaust: 5 })).toEqual([])
  })

  it('警告と情報', () => {
    expect(codes('fiber', { atmosphere: 'earth', z: 80 * Math.PI / 180, tau: 0.15 })).toContain('low-elevation')
    expect(codes('fiber', { d: 5 })).toContain('too-close')
    expect(codes('fiber', { atmosphere: 'earth', tau: 0.15, lambda: 1.5e-6 })).toContain('wavelength-changed')
    expect(codes('fiber', { lambda: 1.5e-6 })).not.toContain('wavelength-changed')
    expect(codes('co2', { atmosphere: 'mars', tau: 50 })).toContain('opaque-atmosphere')
    expect(codes('fiber', { D: 10, atmosphere: 'earth', tau: 0.15, theta_turb: 5 * URAD })).toContain('turbulence-dominant')
  })
})

describe('届けたい量からの逆算（§4.6）', () => {
  // T3 の条件（地表から静止軌道へ、大気を通す）
  const t3: Partial<LaserInputs> = {
    lambda: 1.6e-6, M2: 1.0, D: 10, eta: 0.1, sigma_jitter: 0.05 * URAD, d: 36_000e3,
    atmosphere: 'earth', placement: 'emitter_surface', tau: 0.1, z: 0.5, theta_turb: 5 * URAD,
  }

  it('届く光の合計から逆算すると、順方向の計算に戻る（T3）', () => {
    const fwd = outputsOf(base('fel', { ...t3, P_opt: 10e6 }))
    const inv = outputsOf(base('fel', { ...t3, solve: true, P_goal: fwd.P_rx }))
    expect(inv.P_opt).toBeCloseTo(10e6, 0)
    expect4(inv.E_target, 300.9)
    expect4(inv.P_in, 100e6)
    expect4(inv.Q_waste, 90e6)
  })

  it('到達放射照度から逆算すると、スポット直径は変わらず、目標光出力が決まる（T1）', () => {
    const inv = outputsOf(base('fiber', { solve: true, goal_by_irradiance: true, E_goal: 1104 }))
    expect4(inv.D_spot, 31.58)
    expect4(inv.E_target, 1104)
    expect4(inv.P_opt, 1e6)
  })

  it('化学レーザの燃料消費率も、逆算した出力から出す（T4）', () => {
    const t4 = { lambda: 3.8e-6, M2: 2.0, eta: 0.02, D: 2, sigma_jitter: 0.2 * URAD, d: 1_000e3 }
    const inv = outputsOf(base('chemical', { ...t4, solve: true, P_goal: 1e6 * (1 - Math.exp(-2)) }))
    expect4(inv.m_dot!, 5)
    expect4(inv.M_fuel!, 18_000)
    expect4(inv.E_target, 1.271e4)
  })

  it('逆算では目標光出力の入力を見ず、目標の値を確かめる', () => {
    const codes = (type: LaserType, p: Partial<LaserInputs>) => {
      const r = computeLaser(base(type, p))
      return [...r.errors, ...r.warnings].map((m) => m.code)
    }
    expect(codes('fiber', { solve: true, P_opt: 0 })).toEqual([])
    expect(codes('fiber', { solve: true, P_goal: 0 })).toContain('positive')
    expect(codes('fiber', { solve: true, goal_by_irradiance: true, E_goal: -1 })).toContain('positive')
    expect(codes('fiber', { solve: true, atmosphere: 'earth', tau: 1e6 })).toContain('no-light')
  })
})

describe('受光面に入る割合（§4.7）', () => {
  it('実効スポットと同じ直径では約86%が入り、中心は平均の約2.3倍（T1）', () => {
    const o = outputsOf(base('fiber'))
    expect4(o.f_rx, 0.8647)
    expect4(o.P_target, 1e6)
    expect4(o.P_rx, 8.647e5)
    expect4(o.E_peak, 2553)
    expect4(o.E_peak / o.E_target, 2.313)
    expect4(o.k_peak, 2.313)
  })

  it('受光面を大きくするほど多く拾えるが、平均の強さは下がる', () => {
    const fractions = [0.5, 1.25, 1.5, 2].map((k) => outputsOf(base('fiber', { k_rx: k })).f_rx)
    expect4(fractions[0], 0.3935)
    expect4(fractions[1], 0.9561)
    expect4(fractions[2], 0.9889)
    expect4(fractions[3], 0.9997)
    const o = outputsOf(base('fiber', { k_rx: 1.5 }))
    expect4(o.D_rx, 1.5 * 31.58)
    expect4(o.E_target, (0.9889 * 1e6) / o.A_rx)
    expect(o.E_target).toBeLessThan(outputsOf(base('fiber')).E_target)
  })

  it('逆算では、受光面に届けたい量から、こぼれる分も見込んで目標光出力を出す', () => {
    const o = outputsOf(base('fiber', { solve: true, P_goal: 1e6, k_rx: 1.5 }))
    expect4(o.P_opt, 1e6 / 0.98889)
  })

  it('受光面の直径は正の値', () => {
    expect(computeLaser(base('fiber', { k_rx: 0 })).errors.map((m) => m.code)).toContain('positive')
  })
})

describe('化学レーザのプリセット（DF と COIL）', () => {
  it('DF：燃料1 kg（ヘリウムを含む）から 100 kJ の光', () => {
    const o = outputsOf(base('chemical'))
    expect4(o.m_dot!, 10)
    expect4(o.M_fuel!, 36_000)
  })

  it('COIL：反応式から、燃料1 kg あたり約 105 kJ の光（化学効率 25%）', () => {
    const pre = LASER_PRESETS.coil
    expect4(pre.eta * pre.E_chem!, 1.047e5)
    const o = outputsOf(base('coil'))
    expect4(o.m_dot!, 9.555)
    expect(o.P_in).toBeCloseTo(0.05 * 1e6, 6)
  })
})
