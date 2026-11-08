import { describe, expect, it } from 'vitest'
import { LOCATIONS } from './data.ts'
import { arealForDose, computeColony, doseAt, dropDrift, G0, molarMass, pressureAt, type ColonyInputs } from './model.ts'

/** 有効数字4桁で一致 */
function expect4(actual: number | undefined, expected: number, rel = 5e-4) {
  expect(actual).toBeDefined()
  expect(Math.abs(actual! / expected - 1)).toBeLessThan(rel)
}

function base(over: Partial<ColonyInputs> = {}): ColonyInputs {
  return {
    shape: 'cylinder',
    A_f: 2 * Math.PI * 250 * 325,
    g_f: G0,
    R_f: 250,
    f_land: 1,
    a: 65,
    a_m: 10,
    w_m: 16,
    sphere_floor: 'band',
    g_min: 0.7 * G0,
    n_lv: 5,
    n_deck: 0,
    h_deck: 4,
    P_f: 101_325,
    f_O2: 0.2095,
    o2_by_pressure: false,
    p_O2: 21_230,
    RH: 0,
    T_in: 295.15,
    sigma_u: 503e6,
    rho: 2810,
    SF: 2,
    m_f: 1000,
    m_deck: 500,
    loc: 'free',
    shield_rot: false,
    shield_mat: 'regolith',
    shield_by_areal: true,
    D_tgt: 0.02,
    sigma_sh: 0,
    rho_sh: 1500,
    g_sh: 1,
    n_max: 2,
    v_rel: 5,
    k_cor: 0.25,
    h_p: 2,
    k_grad: 0.01,
    h_bld: 100,
    r_core: 20,
    ...over,
  }
}

describe('T1 回転', () => {
  it('半径 250 m・1 G', () => {
    const o = computeColony(base()).outputs!
    expect4(o.omega, 0.19806)
    expect4(o.v, 49.51)
    expect4(o.n_rpm, 1.891)
  })
  it('ほかの半径の回転数', () => {
    expect4(computeColony(base({ R_f: 224 })).outputs!.n_rpm, 1.998)
    const o = computeColony(base({ R_f: 895, A_f: 1e6 })).outputs!
    expect4(o.n_rpm, 0.9996)
    expect4(o.v, 93.69)
    const i3 = computeColony(base({ R_f: 3200, A_f: 1e8, sigma_u: 2550e6, rho: 1600 })).outputs!
    expect4(i3.n_rpm, 0.5286)
    expect4(i3.v, 177.1)
  })
})

describe('T2 気圧の分布', () => {
  it('1気圧の空気：中心は床より 1450 Pa 低い', () => {
    const M = molarMass(0.2095)
    expect4(M * 1000, 28.85)
    const o = computeColony(base()).outputs!
    expect4(o.rho_air, 1.191, 1e-3)
    expect(101_325 - o.P_axis!).toBeCloseTo(1450, -1)
  })
  it('探査用の大気：差 822.8 Pa', () => {
    const M = molarMass(0.34)
    const w = Math.sqrt(G0 / 250)
    expect4(56_500 - pressureAt(56_500, M, 295.15, w, 0, 250), 822.8, 2e-3)
  })
})

describe('T3 外壁（シリンダ、アルミ合金 7075、遮蔽なし）', () => {
  it('113.6 mm、319.2 kg/m²', () => {
    const o = computeColony(base()).outputs!
    expect4(o.t_hull * 1000, 113.6, 1e-3)
    expect4(o.m_hull, 319.2, 1e-3)
  })
  it('接線速度の上限と最大の半径', () => {
    const o = computeColony(base()).outputs!
    expect4(o.v_max, 299.2)
    expect4(o.R_max, 9127)
  })
  it('床が速すぎるとエラー', () => {
    const r = computeColony(base({ R_f: 10_000, A_f: 1e8 }))
    expect(r.errors.map((e) => e.code)).toEqual(['hull-limit'])
  })
})

describe('T6 遮蔽（自由空間、20 mSv/年）', () => {
  const free = LOCATIONS.free.tables
  it('目標から面密度', () => {
    expect4(arealForDose(free.poly!, 0.02)! / 1000, 6.091, 1e-3)
    expect4(arealForDose(free.water!, 0.02)! / 1000, 6.565, 1e-3)
    expect4(arealForDose(free.regolith!, 0.02)! / 1000, 10.29, 1e-3)
  })
  it('面密度 5 t/m² の線量', () => {
    expect4(doseAt(free.poly!, 5000)! * 1000, 35)
    expect4(doseAt(free.regolith!, 5000)! * 1000, 149)
  })
  it('低軌道 500 km は遮蔽なしで満たす（情報）', () => {
    const r = computeColony(base({ loc: 'leo500', shield_mat: 'poly', shield_by_areal: false }))
    expect(r.outputs!.sigma_sh).toBe(0)
    expect(r.warnings.map((w) => w.code)).toContain('leo500')
  })
  it('表がない組み合わせはエラー', () => {
    const r = computeColony(base({ loc: 'leo700', shield_mat: 'regolith', shield_by_areal: false }))
    expect(r.errors.map((e) => e.code)).toEqual(['no-table'])
  })
  it('自転させる遮蔽は、外壁を厚くする', () => {
    const plain = computeColony(base()).outputs!
    const rot = computeColony(base({ shield_by_areal: false, shield_rot: true })).outputs!
    // 10.29 t/m² の遠心力は約 1 気圧分の荷重なので、厚さは約2倍
    expect4(rot.t_hull * 1000, 222.8, 2e-3)
    expect(rot.t_hull).toBeGreaterThan(plain.t_hull * 1.9)
    expect4(rot.t_sh, 10_290 / 1500, 1e-3)
  })
})

describe('T11 球の帯', () => {
  it('半径 256 m、帯の端 0.7 G で 5.881×10⁵ m²：床面積が大きすぎるとエラー', () => {
    const A = 4 * Math.PI * 256 ** 2 * Math.sin(Math.acos(0.7))
    expect4(A, 5.881e5)
    expect(computeColony(base({ shape: 'sphere', R_f: 256, A_f: A * 0.999 })).errors).toEqual([])
    expect(computeColony(base({ shape: 'sphere', R_f: 256, A_f: A * 1.01 })).errors.map((e) => e.code)).toEqual(['sphere-area'])
  })
  it('帯を狭めたときの端の重力', () => {
    const A = 4 * Math.PI * 256 ** 2 * 0.5
    const o = computeColony(base({ shape: 'sphere', R_f: 256, A_f: A })).outputs!
    expect4(o.g_edge! / G0, Math.cos(Math.asin(0.5)))
  })
  it('段々の床：段の面積の合計が床面積になる', () => {
    const o = computeColony(base({ shape: 'sphere', sphere_floor: 'terrace', A_f: 1e6 })).outputs!
    expect4(o.A_total, 1e6)
    expect(o.R_s!).toBeGreaterThan(250)
    const c = computeColony(base({ shape: 'sphere', sphere_floor: 'concentric', A_f: 2e6 })).outputs!
    expect4(c.A_total, 2e6)
  })
  it('段々の床：床面積が小さすぎるとエラー', () => {
    const r = computeColony(base({ shape: 'sphere', sphere_floor: 'terrace', A_f: 3e5 }))
    expect(r.errors.map((e) => e.code)).toEqual(['sphere-small'])
  })
})

describe('T12 トーラスの管の壁', () => {
  it('内側の赤道の係数 67.76 m を使う', () => {
    const R_c = 830
    expect4((65 * (2 * R_c - 65)) / (2 * (R_c - 65)), 67.76)
    // 床に何も載せず、空気を薄くして、断面の方向で決まる場合
    const w = 2 * Math.sqrt(65 ** 2 - 50 ** 2)
    const o = computeColony(base({ shape: 'torus', R_f: 880, A_f: 2 * Math.PI * 880 * w, g_f: 880 * (2 * Math.PI / 60) ** 2, m_f: 0 })).outputs!
    expect4(o.R_c!, 830)
    const Pw = pressureAt(101_325, molarMass(0.2095), 295.15, 2 * Math.PI / 60, 895, 880)
    expect4(o.t_hull, (Pw * 67.76) / (503e6 / 2), 1e-3)
  })
  it('床の幅が管の直径以上ならエラー', () => {
    const r = computeColony(base({ shape: 'torus', R_f: 880, A_f: 2 * Math.PI * 880 * 131 }))
    expect(r.errors.map((e) => e.code)).toEqual(['too-wide'])
  })
})

describe('T13 落とした物のずれ', () => {
  it('半径 250 m、高さ 100 m で 101.5 m', () => {
    expect4(dropDrift(250, 100), 101.5, 1e-3)
  })
  it('高さの表に、中心の軸・建物の上・外壁を出す', () => {
    const o = computeColony(base()).outputs!
    const labels = o.heights.map((h) => h.label)
    expect(labels).toEqual(['中心の軸', '中心付近の設備', '建物の上', '基準の床', '外壁', '遮蔽の外面'])
    expect(o.heights[0].drift).toBe(Infinity)
    expect(o.heights.at(-1)!.P).toBeUndefined()
  })
})

describe('質量と回転', () => {
  it('合計は内訳の和、回るものは自転させない遮蔽を除く', () => {
    const o = computeColony(base({ sigma_sh: 5000 })).outputs!
    const sum = o.masses.reduce((s, m) => s + m.mass, 0)
    expect4(o.M_total, sum)
    expect4(o.M_rot, sum - o.M_shield)
    expect4(o.E_rot, 0.5 * o.I * o.omega ** 2)
  })
  it('短い円筒は回転が安定、長い円筒は情報を出す', () => {
    // 半球のふたは横の軸まわりの慣性モーメントを増やすので、カルパナ・ワンの長さ（325 m）では 1.07
    expect(computeColony(base()).outputs!.I_ratio!).toBeCloseTo(1.074, 3)
    expect(computeColony(base({ A_f: 2 * Math.PI * 250 * 100 })).outputs!.I_ratio!).toBeGreaterThan(1.2)
    const long = computeColony(base({ A_f: 2 * Math.PI * 250 * 3000 }))
    expect(long.warnings.map((w) => w.code)).toContain('stability')
  })
  it('ダンベル：テザーの張力と床の端の傾き', () => {
    const o = computeColony(base({ shape: 'dumbbell', R_f: 230, a_m: 16.5, shield_rot: true, sigma_sh: 9041, rho_sh: 2600 })).outputs!
    expect(o.F_tether!).toBeGreaterThan(0)
    expect(o.L_m!).toBeCloseTo((2 * Math.PI * 250 * 325) / 32, 6)
  })
})

describe('大気の組成（1.2）', () => {
  it('分圧を入れると、気圧を下げても酸素分圧を保ち、割合が上がる', () => {
    const o = computeColony(base({ P_f: 50_000, o2_by_pressure: true, p_O2: 21_230 })).outputs!
    expect4(o.p_O2, 21_230)
    expect4(o.f_O2, 21_230 / 50_000)
  })
  it('割合を入れると、分圧は気圧に比例する', () => {
    const o = computeColony(base({ P_f: 50_000 })).outputs!
    expect4(o.p_O2, 0.2095 * 50_000)
  })
  it('湿度：22℃・50% で水蒸気圧 1.32 kPa、露点 約 11℃。酸素と窒素はその分減る', () => {
    const o = computeColony(base({ RH: 0.5 })).outputs!
    expect4(o.p_H2O, 1322, 3e-3)
    expect(o.T_dew! - 273.15).toBeCloseTo(11.1, 0)
    expect4(o.p_O2, 0.2095 * (101_325 - o.p_H2O))
    // 水蒸気は軽いので、空気の平均の分子量が小さくなる
    expect(o.M_mol).toBeLessThan(molarMass(0.2095))
  })
  it('酸素分圧が低いと警告、酸素の割合が 34% を超えると警告', () => {
    expect(computeColony(base({ P_f: 60_000 })).warnings.map((w) => w.code)).toContain('hypoxia')
    expect(computeColony(base({ P_f: 51_700, o2_by_pressure: true, p_O2: 22_700 })).warnings.map((w) => w.code)).toContain('o2-fire')
  })
  it('酸素分圧が気圧を超えるとエラー', () => {
    const r = computeColony(base({ P_f: 20_000, o2_by_pressure: true, p_O2: 21_230 }))
    expect(r.errors.map((e) => e.code)).toEqual(['o2-high'])
  })
})
