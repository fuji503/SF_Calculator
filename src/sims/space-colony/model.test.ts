import { describe, expect, it } from 'vitest'
import { LOCATIONS } from './data.ts'
import { arealForDose, computeColony, doseAt, dropDrift, G0, molarMass, pressureAt, radialMember, stayCables, type ColonyInputs } from './model.ts'

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
    E_h: 71.7e9,
    sigma_us: 685e6,
    rho_s: 7850,
    E_s: 205e9,
    f_s: 0,
    N_th: 12,
    s_z: 50,
    hoop_mode: 'membrane',
    axial_mode: 'membrane',
    place: 'A',
    depth_by_m: false,
    k_th: 0.2,
    k_z: 0.2,
    d_th: 20,
    d_z: 10,
    N_hub: 6,
    n_teth: 4,
    r_hub: 5,
    taper: 'const',
    k_tp: 1.2,
    f_t: 0,
    N_t: 8,
    s_t: 10,
    cap: 'hemi',
    n_tie: 3,
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
    expect4(Number(r.errors[0].params!.vmax), 299.2)
    // エラーでも回転の値は出す
    expect4(r.spin!.v, Math.sqrt(G0 * 10_000))
    expect4(r.spin!.R_max!, 9127)
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
    // 添付の例：半径 200 m、0.7 G、一番上の段 0.1 G、2段 → 一番上の段は半径 28.57 m、長さ 395.9 m、約 7.1万 m²
    const e = computeColony(base({ shape: 'sphere', sphere_floor: 'terrace', R_f: 200, g_f: 0.7 * G0, g_min: 0.1 * G0, n_lv: 2, A_f: 100 })).errors[0]
    expect(e.code).toBe('sphere-small')
    expect4(Number(e.params!.r), 200 / 7)
    expect4(Number(e.params!.L), 2 * Math.sqrt(200 ** 2 - (200 / 7) ** 2))
    expect4(Number(e.params!.A), 71_071, 1e-3)
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
    expect(r.errors.map((e) => e.code)).toEqual(['torus-wide'])
    expect4(Number(r.errors[0].params!.w), 131)
    expect4(Number(r.errors[0].params!.d), 130)
    expect4(Number(r.errors[0].params!.A), 2 * Math.PI * 880 * 130)
  })
  it('管が中心軸に届く・上の階が収まらないときは、数値を出す', () => {
    const axis = computeColony(base({ shape: 'torus', R_f: 100, a: 65, A_f: 2 * Math.PI * 100 * 100 })).errors[0]
    expect(axis.code).toBe('torus-axis')
    expect(Number(axis.params!.R)).toBeGreaterThan(100)
    // 床は管の中心から 50 m 外。天井（中心から 65 m 内）まで 115 m → 4 m の階は 28 階まで（29 階目は天井の外）
    const w = 2 * Math.sqrt(65 ** 2 - 50 ** 2)
    const deck = computeColony(base({ shape: 'torus', R_f: 880, A_f: 2 * Math.PI * 880 * w, n_deck: 30 })).errors[0]
    expect(deck.code).toBe('deck-out')
    expect(deck.params!.n).toBe(28)
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

describe('球の重力の下限（1.3）', () => {
  it('基準の床の重力と同じだと、帯の幅が 0 なので専用のエラー', () => {
    for (const sphere_floor of ['band', 'terrace', 'concentric'] as const) {
      const r = computeColony(base({ shape: 'sphere', sphere_floor, g_min: G0 }))
      expect(r.errors.map((e) => e.code)).toEqual(['sphere-gmin'])
      expect(r.spin!.n_rpm).toBeGreaterThan(0)
    }
  })
  it('床面積が大きすぎるときは、床にできる最大の面積を出す', () => {
    const r = computeColony(base({ shape: 'sphere', A_f: 1e7 }))
    expect(r.errors[0].code).toBe('sphere-area')
    expect4(Number(r.errors[0].params!.A), 4 * Math.PI * 250 ** 2 * Math.sqrt(1 - 0.49))
  })
})

describe('T4 スポークの一般式（段階2）', () => {
  const w = Math.sqrt(G0 / 250)
  const sa = 685e6 / 2
  it('応力が一定', () => {
    const m = radialMember(1e6, 0, 250, 7850, sa, w, 'const', 1, 205e9)!
    expect4(m.A_tip, 2.92e-3, 1e-3)
    expect4(m.A_root, 3.003e-3, 1e-3)
    expect4(m.mass, 5839, 1e-3)
    // どこでも許容応力なので、伸びは σ_a L / E
    expect4(m.delta, (sa * 250) / 205e9)
  })
  it('太さが一定・直線', () => {
    const n = radialMember(1e6, 0, 250, 7850, sa, w, 'none', 1, 205e9)!
    expect4(n.A_tip, 3.004e-3, 1e-3)
    expect4(n.mass, 5896, 1e-3)
    const l = radialMember(1e6, 0, 250, 7850, sa, w, 'linear', 1.2, 205e9)!
    expect4(l.A_tip, 2.92e-3, 1e-3)
    expect4(l.A_root, 3.504e-3, 1e-3)
    expect4(l.mass, 6303, 1e-3)
  })
  it('島3号の速さでは、応力が一定の根元と先の比 1.279', () => {
    const wi = Math.sqrt(G0 / 3200)
    const m = radialMember(1e6, 0, 3200, 7850, 500e6, wi, 'const', 1, 205e9)!
    expect4(m.A_root / m.A_tip, 1.279, 1e-3)
  })
  it('速すぎると、太さが一定のスポークは作れない', () => {
    const wf = Math.sqrt(G0 / 10_000)
    expect(radialMember(1e6, 0, 10_000, 7850, sa, wf, 'none', 1, 205e9)).toBeUndefined()
    expect(radialMember(1e6, 0, 10_000, 7850, sa, wf, 'const', 1, 205e9)).toBeDefined()
  })
})

describe('T3 スポークの割合（段階2）', () => {
  it('f_s = 0.5 で外壁は 56.0 mm', () => {
    const o = computeColony(base({ f_s: 0.5 })).outputs!
    expect4(o.t_hull * 1000, 56.0, 2e-3)
    expect4(o.m_hull, 157.4, 2e-3)
    expect(o.n_rows).toBe(8)
    expect(o.members.map((m) => m.label)).toEqual(['スポークの列のリング', 'スポーク'])
    expect(o.members[1].count).toBe(96)
    // 1列の線荷重 × スポークの間隔
    const p_ext = pressureAt(101_325, molarMass(0.2095), 295.15, Math.sqrt(G0 / 250), 250, 250) + 1000 * G0
    expect4(o.F_spoke!, 0.5 * p_ext * (325 / 7) * ((2 * Math.PI * 250) / 12), 1e-3)
    expect(o.dl_spoke).toBeDefined()
  })
  it('スポークが全部受けると、殻は軸方向の張力だけで決まり、作れる速さの上限がなくなる', () => {
    const o = computeColony(base({ f_s: 1 })).outputs!
    expect(o.v_max).toBeUndefined()
    // 側面はスポークで作れるが、端のふたは支えないので作れない
    const r = computeColony(base({ f_s: 1, R_f: 10_000, A_f: 1e8, cap: 'spine' }))
    expect(r.errors.map((e) => e.code)).toEqual(['cap-limit'])
  })
  it('f_s = 0 は段階1と同じ', () => {
    const o = computeColony(base()).outputs!
    expect4(o.t_hull * 1000, 113.6, 1e-3)
    expect(o.members).toEqual([])
    // L/D：全長（半球のふたを含む 325 + 500 m）÷ 直径 500 m
    expect4(o.LD!, (325 + 500) / 500)
    expect4(computeColony(base({ cap: 'spine' })).outputs!.LD!, 325 / 500)
  })
})

describe('端のふたの支え方（段階2）', () => {
  it('中心の軸：ふたが薄くなり、軸の太さを出す', () => {
    const hemi = computeColony(base()).outputs!
    const sp = computeColony(base({ cap: 'spine' })).outputs!
    // ふたの張力 P s_c/√2（s_c = R − r_hub）と、半球の P R/2
    expect(sp.t_cap!).toBeLessThan(hemi.t_cap! * 1.5)
    const ax = sp.members.find((m) => m.label === '中心の軸')!
    const Pc = pressureAt(101_325, molarMass(0.2095), 295.15, Math.sqrt(G0 / 250), 250, 250)
    expect4(ax.A_tip, (Pc * Math.PI * (5 + 245 / 2) ** 2) / (685e6 / 2))
    // 平らなふたは横の軸まわりの慣性モーメントが小さく、回転が安定する
    expect(sp.I_ratio!).toBeGreaterThan(hemi.I_ratio!)
  })
  it('同心の引っ張り材：ふたはさらに薄く、たるみを出す', () => {
    const sp = computeColony(base({ cap: 'spine' })).outputs!
    const ti = computeColony(base({ cap: 'ties', n_tie: 3 })).outputs!
    expect4(ti.t_cap! * 4, sp.t_cap!, 1e-6)
    expect(ti.members.filter((m) => m.label.startsWith('同心')).length).toBe(3)
    // 支点が両端（325 m）のとき、外側の輪（半径 189 m）のたるみ ρω²rs/(8σ_a)
    expect4(ti.tie_sag!, (7850 * (G0 / 250) * (5 + 3 * 61.25) * 325) / (8 * 342.5e6), 1e-3)
  })
  it('たるみが 5% を超えると警告', () => {
    const r = computeColony(base({ cap: 'ties', n_tie: 3, A_f: 2 * Math.PI * 250 * 3000 }))
    expect(r.warnings.map((w) => w.code)).toContain('tie-sag')
  })
})

describe('トーラス・ダンベルの部材（段階2）', () => {
  const w = 2 * Math.sqrt(65 ** 2 - 50 ** 2)
  const stan = { shape: 'torus' as const, R_f: 880, A_f: 2 * Math.PI * 880 * w, g_f: 880 * (2 * Math.PI / 60) ** 2 }
  it('ハブのスポークが輪の遠心力を受けると、管の壁が薄くなる', () => {
    // 床の荷重を大きくして、輪の方向で厚さが決まる場合（スタンフォードの初期値では断面の方向の気圧で決まる）
    const t0 = computeColony(base({ ...stan, m_f: 10_000 })).outputs!
    const t1 = computeColony(base({ ...stan, m_f: 10_000, f_s: 0.8 })).outputs!
    expect(t1.t_hull).toBeLessThan(t0.t_hull)
    expect(t1.members.map((m) => m.label)).toEqual(['ハブのスポーク'])
    expect(t1.members[0].count).toBe(6)
  })
  it('管の中の引っ張り材は、断面の方向の張力を減らす', () => {
    const t1 = computeColony(base({ ...stan, m_f: 0, f_t: 0.5 })).outputs!
    expect(t1.members.map((m) => m.label)).toEqual(['管の中の引っ張り材', '管の引っ張り材のリング'])
  })
  it('ダンベル：テザーの太さと質量', () => {
    const o = computeColony(base({ shape: 'dumbbell', R_f: 230, a_m: 20, shield_rot: true, sigma_sh: 9041, rho_sh: 2600 })).outputs!
    const t = o.members.find((m) => m.label === 'テザー')!
    expect(t.count).toBe(8)
    expect4(o.F_spoke!, o.F_tether! / 4)
    expect4(t.A_tip, o.F_spoke! / (685e6 / 2))
  })
})

describe('T16 外壁を円形に保つ構造（1.6）', () => {
  const run = (over: Partial<ColonyInputs>) => computeColony(base({ f_s: 0.5, ...over }))
  const mass = (o: ReturnType<typeof computeColony>['outputs'], label: string) => {
    const m = o!.members.find((x) => x.label === label)!
    return (m.mass * m.count) / 1000
  }
  it('外壁がふくらむ：ふくらみの深さはスパンの 0.207 倍', () => {
    const o = run({}).outputs!
    expect4(o.bulge_th!, 27.11, 1e-3)
    expect4(o.bulge_z!, 0.20711 * (325 / 7), 1e-3)
    expect(o.d_th).toBeUndefined()
  })
  it('円周の吊り橋型：ケーブル 8058 t・ハンガー 811 t（8列）、スポークは節点まで', () => {
    const r = run({ hoop_mode: 'susp' })
    expect(r.errors).toEqual([])
    const o = r.outputs!
    expect4(mass(o, '円周の吊り橋型のケーブル') / 8, 8058, 1e-3)
    expect4(mass(o, '円周のハンガー（細かく並ぶ）') / 8, 810.5, 2e-3)
    expect4(o.d_th!, 0.2 * ((2 * Math.PI * 250) / 12))
    expect4(o.members.find((m) => m.label === 'スポーク')!.length, 250 - o.d_th! - 5)
    expect(o.R_hull).toBe(250)
    expect(o.bulge_th).toBeUndefined()
  })
  it('円周の斜張橋型：8541 t、圧縮は外壁の張力で打ち消される', () => {
    const o = run({ hoop_mode: 'stay' }).outputs!
    expect4(mass(o, '円周の斜張橋型のケーブル（細かく並ぶ）') / 8, 8541, 1e-3)
    expect4(o.C_th!, 2.556e8, 1e-3)
    expect4(o.T_th!, 6.45e8, 1e-3)
  })
  it('浅い斜張橋型（0.1）は圧縮が張力を超え、警告と圧縮のリング', () => {
    const r = run({ hoop_mode: 'stay', k_th: 0.1 })
    expect(r.warnings.map((w) => w.code)).toContain('stay-compression')
    expect4(r.outputs!.C_th!, 6.854e8, 1e-3)
    const ring = r.outputs!.members.find((m) => m.label === '圧縮のリング（外壁の材料）')!
    expect4(ring.A_tip, (6.854e8 - 6.45e8) / (503e6 / 2), 3e-3)
  })
  it('浅すぎる斜張橋型はエラー（d ≤ ℓ²/(8R)）', () => {
    // ℓ²/(8R) = 8.57 m（スパン 130.9 m）
    expect(run({ hoop_mode: 'stay', depth_by_m: true, d_th: 8 }).errors.map((e) => e.code)).toEqual(['stay-shallow'])
    expect(run({ hoop_mode: 'stay', depth_by_m: true, d_th: 9 }).errors).toEqual([])
    expect(stayCables(1, 130.9, 8.5, 250, 1)).toBeUndefined()
  })
  it('軸の方向：吊り橋型 2.674万 t ＋ 2012 t、斜張橋型 1.861万 t', () => {
    const s = run({ axial_mode: 'susp' }).outputs!
    expect4(mass(s, '軸の方向の吊り橋型のケーブル（細かく並ぶ）'), 26_740, 1e-3)
    expect4(mass(s, '軸の方向のハンガー（細かく並ぶ）'), 2012, 1e-3)
    const st = run({ axial_mode: 'stay' }).outputs!
    expect4(mass(st, '軸の方向の斜張橋型のケーブル（細かく並ぶ）'), 18_610, 1e-3)
    // 軸の方向は外壁がふくらまなくなるので、外壁は円周方向と端のふたの張力だけで決まる
    expect(st.bulge_z).toBeUndefined()
  })
  it('梁は床の下：外壁を梁の高さだけ外へ出す（比で入れると外壁の半径で深さが変わる）', () => {
    const r = run({ hoop_mode: 'beam' })
    expect(r.warnings.map((w) => w.code)).toContain('beam-below')
    const o = r.outputs!
    // R_h = 250 / (1 − 0.2 × 2π/12)
    expect4(o.R_hull, 250 / (1 - (0.2 * 2 * Math.PI) / 12))
    expect4(o.lift!, o.R_hull - 250)
    expect4(o.members[0].A_tip, 1.36, 1e-3)
    expect4(mass(o, '円周の梁（外壁の材料）') / 8, 6705, 1e-3)
    const z = run({ axial_mode: 'beam' }).outputs!
    expect4(z.R_hull, 250 + 0.2 * (325 / 7))
    expect4(z.t_zbeam! * 1000, 8.53, 1e-3)
  })
  it('置き場所 B は外壁を外へ出し、A より重い。m で入れることもできる', () => {
    const a = run({ hoop_mode: 'stay' }).outputs!
    const b = run({ hoop_mode: 'stay', place: 'B' }).outputs!
    expect(b.R_hull).toBeGreaterThan(a.R_hull)
    expect(b.M_total).toBeGreaterThan(a.M_total)
    expect(b.V_air).toBeGreaterThan(a.V_air)
    const m = run({ hoop_mode: 'stay', place: 'B', depth_by_m: true, d_th: 20 }).outputs!
    expect4(m.R_hull, 270)
    expect(m.d_th).toBe(20)
  })
  it('球でも使える（軸の方向は球の曲がりを入れる）', () => {
    const r = computeColony(base({ shape: 'sphere', A_f: 2e5, R_f: 250, f_s: 0.5, hoop_mode: 'stay', axial_mode: 'susp' }))
    expect(r.errors).toEqual([])
    expect(r.outputs!.members.map((m) => m.label)).toEqual(['円周の斜張橋型のケーブル（細かく並ぶ）', '軸の方向の吊り橋型のケーブル（細かく並ぶ）', '軸の方向のハンガー（細かく並ぶ）', 'スポーク'])
  })
})
