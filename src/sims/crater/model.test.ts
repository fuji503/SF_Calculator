import { describe, expect, it } from 'vitest'
import { BODIES, KT_TNT } from './data.ts'
import { airRange, atmosphericEntry, blastRange, computeCrater, peakPressure, vacuumRange, type CraterInputs } from './model.ts'

const DEG = Math.PI / 180

/** 有効数字4桁で一致 */
function expect4(actual: number | undefined, expected: number, rel = 5e-4) {
  expect(actual).toBeDefined()
  expect(Math.abs(actual! / expected - 1)).toBeLessThan(rel)
}

function base(over: Partial<CraterInputs> = {}): CraterInputs {
  return {
    source: 'impact',
    solve: false,
    goal_by_depth: false,
    D_goal: 100,
    d_goal: 20,
    body: 'moon',
    ...BODIES.moon,
    ground: 'mare_regolith',
    ground_class: 'regolith',
    rho_t: 1500,
    Y: 0.01e6,
    t_reg: 5,
    impactor: 'stony',
    delta: 3000,
    by_mass: false,
    L0: 10,
    m_i: 0,
    v0: 2400,
    theta: 45 * DEG,
    W: KT_TNT,
    dob_optimal: true,
    z_b: 0,
    t_bury: 0.1,
    frags: [0.1, 1],
    rho_f: 2700,
    q: 1e-3,
    p1: 6900,
    p2: 22_900,
    ignition: 'burn3',
    ...over,
  }
}

/** 地球の、大気の影響を除いた条件（クレータの式だけを確かめる） */
const earthNoAir = { body: 'earth', ...BODIES.earth, rho_a0: 0, P0: 0 }

function outputsOf(p: CraterInputs) {
  const r = computeCrater(p)
  expect(r.errors).toEqual([])
  return r.outputs!
}

describe('クレータの大きさ（隕石、§4.2）', () => {
  const meteor = (theta: number) =>
    base({ ...earthNoAir, ground: 'sedimentary', ground_class: 'soft_rock', rho_t: 2300, Y: 1e6, t_reg: 0, impactor: 'iron', delta: 7800, L0: 50, v0: 12.8e3, theta })

  it('T1 バリンジャー・クレータ（真上から）', () => {
    const o = outputsOf(meteor(90 * DEG))
    expect(o.regime).toBe('gravity')
    expect4(o.V, 9.399e7)
    expect4(o.D_tc! / 2, 500.1)
    expect4(o.D_rim, 1300)
    expect4(o.h_rim, 46.81)
    expect4(o.d_rim, 260.1)
    expect4(o.E, 4.182e16)
    expect4(o.M_seis, 5.266)
  })

  it('T1b 45° では小さくなる', () => {
    expect4(outputsOf(meteor(45 * DEG)).D_rim, 1120)
  })

  it('T2 アポロ14号の S-IVB（空の段を 2700 kg/m³ の球とみなす）', () => {
    const o = outputsOf(base({ by_mass: true, m_i: 14_016, delta: 2700, v0: 2540, theta: 69 * DEG }))
    expect4(o.L0, 2.148)
    expect4(o.D_rim, 37.69)
  })

  it('T3 LCROSS', () => {
    const o = outputsOf(base({ by_mass: true, m_i: 2305, delta: 2700, v0: 2500, theta: 86 * DEG }))
    expect4(o.D_rim, 23.16)
  })

  it('T11 逆算で、もとの衝突体の直径に戻る', () => {
    const o = outputsOf({ ...meteor(90 * DEG), solve: true, D_goal: 1300.339 })
    expect4(o.L0, 50, 1e-4)
  })

  it('深さからの逆算でも、もとの衝突体の直径に戻る', () => {
    const o = outputsOf({ ...meteor(90 * DEG), solve: true, goal_by_depth: true, d_goal: 260.0678 })
    expect4(o.L0, 50, 1e-4)
  })

  it('T12 衝突の最大の圧力と衝突体の状態', () => {
    expect4(peakPressure('iron', 'sandstone', 12.8e3), 267.3e9)
    expect(outputsOf(meteor(90 * DEG)).impactor_state).toBe('一部が溶ける（前の方）')
  })
})

describe('大気への突入（§4.1）', () => {
  it('T4 チェリャビンスクは空中爆発する', () => {
    const e = atmosphericEntry(19, 3300, 19e3, 18 * DEG, 1, 8000, 9.81)
    expect(e.airburst).toBe(true)
    expect4(e.z_star, 52_740)
    expect4(e.z_burst, 31_420)
    const o = outputsOf(base({ body: 'earth', ...BODIES.earth, ground: 'alluvium', ground_class: 'dry_soil', rho_t: 1700, Y: 0.2e6, t_reg: 0, delta: 3300, L0: 19, v0: 19e3, theta: 18 * DEG, p1: 100 }))
    expect(o.airburst).toBe(true)
    expect(o.crater).toBe(false)
    expect4(o.E / KT_TNT, 511.3)
    // Collins 2005 の式では、高い空中爆発の過圧は小さめ（窓ガラスが割れる 6.9 kPa には届かない）
    expect(o.r_p1).toBeGreaterThan(0)
    expect(o.r_p2).toBe(0)
  })

  it('大きい鉄の隕石は地表に届き、小さいものは空中で砕ける', () => {
    expect(atmosphericEntry(50, 7800, 12.8e3, 45 * DEG, 1, 8000, 9.81).airburst).toBe(false)
    expect(atmosphericEntry(5, 7800, 15e3, 45 * DEG, 1, 8000, 9.81).airburst).toBe(true)
  })
})

describe('核爆発のクレータ（§4.3）', () => {
  const earth = (cls: 'dry_soil' | 'hard_rock', W_kt: number, z: number) =>
    outputsOf(
      base({ ...earthNoAir, source: 'nuclear', ground: cls === 'dry_soil' ? 'alluvium' : 'crystalline', ground_class: cls, rho_t: 2000, t_reg: 0, W: W_kt * KT_TNT, dob_optimal: false, z_b: z }),
    )

  it('T5 Sedan', () => {
    const o = earth('dry_soil', 104, 194)
    expect4(o.lam, 49.49)
    expect4(o.D_rim / 2, 196.0)
    expect4(o.d_rim - o.h_rim, 98.0)
  })

  it('T6 Danny Boy', () => {
    const o = earth('hard_rock', 0.42, 33.5)
    expect4(o.lam, 43.24)
    expect4(o.D_rim / 2, 31.77)
    expect4(o.d_rim - o.h_rim, 17.51)
  })

  it('T7 チャガン（140 kt）', () => {
    const o = earth('hard_rock', 140, 178)
    expect4(o.lam, 41.61)
    expect4(o.D_rim, 375.7)
    expect4(o.d_rim - o.h_rim, 104.1)
  })

  it('T13 月では重力の違いで大きくなる（直径が最大になる深さ）', () => {
    const o = outputsOf(base({ source: 'nuclear', ground_class: 'dry_soil', W: KT_TNT }))
    expect4(o.D_rim / 2, 67.93)
  })

  it('深すぎると地下に閉じ込められ、クレータはできない', () => {
    const r = computeCrater(base({ ...earthNoAir, source: 'nuclear', ground_class: 'hard_rock', dob_optimal: false, z_b: 200 }))
    expect(r.outputs!.crater).toBe(false)
    expect(r.warnings.map((w) => w.code)).toContain('contained')
  })

  it('逆算した出力で、目標の直径・深さになる（直径が最大になる深さで起爆）', () => {
    const o = outputsOf(base({ source: 'nuclear', ground_class: 'dry_soil', solve: true, D_goal: 500, dob_optimal: false }))
    expect4(o.D_rim, 500, 1e-6)
    expect4(o.lam, 49.5, 1e-9)
    const d = outputsOf(base({ source: 'nuclear', ground_class: 'dry_soil', solve: true, goal_by_depth: true, d_goal: 80 }))
    expect4(d.d_rim, 80, 1e-6)
  })
})

describe('噴出物と危険な範囲（§4.6、§4.7）', () => {
  it('T8 埋まる範囲の解析解', () => {
    const o = outputsOf(base({ frags: [1] }))
    expect4(o.r_bury, (o.D_rim / 2) * (o.h_rim / 0.1) ** (1 / 3), 1e-9)
    const D = 100
    expect4((D / 2) * ((0.036 * D) / 0.1) ** (1 / 3), 165.1)
  })

  it('T9 大気のない飛来物の距離', () => {
    expect4(10 + vacuumRange(100, 1.62, 1737.4e3), 6194)
    expect(vacuumRange(2400, 1.62, 1737.4e3)).toBe(Infinity)
  })

  it('大気のない月では、石と岩の範囲が同じ', () => {
    const o = outputsOf(base())
    expect(o.frags[0].range).toBe(o.frags[1].range)
    expect(o.frags[0].range).toBeGreaterThan(o.D_rim)
  })

  it('大気のある地球では、小さい石ほど手前に落ちる', () => {
    expect(airRange(500, 0.1, 2700, 9.81, 1, 8000, 6371e3)).toBeLessThan(airRange(500, 1, 2700, 9.81, 1, 8000, 6371e3))
    expect(airRange(500, 1, 2700, 9.81, 1, 8000, 6371e3)).toBeLessThan(500 ** 2 / 9.81)
  })

  it('T14 大きさごとの個数の割合', () => {
    const o = outputsOf(base())
    expect4(o.frags[0].ratio[0], 5012)
    expect4(o.frags[0].ratio[1], 631.0)
    expect4(o.frags[0].ratio[2], 39_810)
    expect(o.frags[1].ratio[0]).toBe(1)
  })

  it('月の速い衝突では、噴出物の一部が月から出ていく', () => {
    const r = computeCrater(base({ v0: 20e3, L0: 10 }))
    expect(r.outputs!.M_escape).toBeGreaterThan(0)
    expect(r.warnings.map((w) => w.code)).toContain('escape-ejecta')
  })
})

describe('爆風（§4.9）', () => {
  it('T10 地球の 1 kt と、火星のザックスの換算', () => {
    expect4(blastRange(KT_TNT, 0, 101_300, 7007), 1160, 1e-3)
    expect4(blastRange(KT_TNT, 0, 610, 42.19), 6376, 1e-3)
  })

  it('核爆発の地表の爆発では、爆風と熱放射の範囲を出す（地球）', () => {
    const o = outputsOf(base({ body: 'earth', ...BODIES.earth, source: 'nuclear', ground: 'alluvium', ground_class: 'dry_soil', rho_t: 1700, Y: 0.2e6, t_reg: 0, dob_optimal: false, z_b: 0 }))
    expect(o.r_p1).toBeGreaterThan(o.r_p2!)
    expect(o.r_thermal).toBeGreaterThan(0)
  })
})

describe('警告', () => {
  const codes = (p: CraterInputs) => computeCrater(p).warnings.map((w) => w.code)
  it('浅い角度、レゴリスの層、複雑クレータ', () => {
    expect(codes(base({ theta: 10 * DEG }))).toEqual(expect.arrayContaining(['elliptical', 'ricochet']))
    expect(codes(base({ L0: 10 }))).toContain('layered')
    expect(codes(base({ L0: 5000 }))).toContain('complex')
  })
  it('脱出速度より遅い', () => {
    expect(codes(base({ v0: 1000 }))).toContain('below-escape')
  })
  it('範囲外の入力はエラー', () => {
    expect(computeCrater(base({ L0: 0 })).errors[0].code).toBe('range')
    expect(computeCrater(base({ theta: 0 })).errors[0].code).toBe('range')
  })
})
