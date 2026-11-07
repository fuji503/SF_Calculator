/**
 * クレータ造成モジュールの定数とプリセット（クレータ造成モジュール仕様書1(新規) §3、§4）。
 */

export const KT_TNT = 4.184e12
export const G_EARTH = 9.81
export const P_EARTH = 101_300

// ---------------------------------------------------------------------------
// 天体（§3.2）

export type BodyId = 'earth' | 'moon' | 'mars'

export interface BodyPreset {
  label: string
  g: number
  R_p: number
  rho_a0: number
  H: number
  P0: number
  c0: number
  D_c: number
  /** 衝突の速さの初期値（脱出速度を丸めた値） */
  v0: number
}

export const BODIES: Record<BodyId, BodyPreset> = {
  earth: { label: '地球', g: 9.81, R_p: 6371e3, rho_a0: 1.0, H: 8000, P0: 101_300, c0: 330, D_c: 3200, v0: 11.2e3 },
  moon: { label: '月', g: 1.62, R_p: 1737.4e3, rho_a0: 0, H: 8000, P0: 0, c0: 330, D_c: 15_000, v0: 2.4e3 },
  mars: { label: '火星 ※参考値', g: 3.71, R_p: 3389.5e3, rho_a0: 0.02, H: 11_100, P0: 610, c0: 240, D_c: 7000, v0: 5.0e3 },
}

// ---------------------------------------------------------------------------
// 地盤（§3.3）

export type GroundClass = 'sand' | 'dry_soil' | 'wet_soil' | 'soft_rock' | 'hard_rock' | 'regolith' | 'ice'

export interface ClassConstants {
  label: string
  K1: number
  K2: number
  mu: number
  /** 実効的な強さの初期値 [Pa] */
  Y: number
  Kr: number
  Kd: number
  /** 噴出物の定数の組（μ = 0.41 の土の組か、μ = 0.55 の岩の組） */
  ejecta: 'soil' | 'rock'
  /** 核爆発のクレータの曲線 */
  nuclear: 'soil' | 'rock'
  /** 衝撃の性質の材料 */
  hugoniot: HugoniotId
  /** 地下核実験のマグニチュードを小さくする（乾いてすき間の多い地盤） */
  dryPorous: boolean
  /** 飛来物の密度の初期値 [kg/m³] */
  rho_f: number
}

/** Holsapple の計算ツールの定数表（ν = 0.33。Y は cgs から換算） */
export const CLASSES: Record<GroundClass, ClassConstants> = {
  sand: { label: '乾いた砂', K1: 0.132, K2: 0, mu: 0.41, Y: 0, Kr: 1.4, Kd: 0.35, ejecta: 'soil', nuclear: 'soil', hugoniot: 'dry_sand', dryPorous: true, rho_f: 2700 },
  dry_soil: { label: '乾いた土', K1: 0.132, K2: 0.26, mu: 0.41, Y: 0.2e6, Kr: 1.1, Kd: 0.6, ejecta: 'soil', nuclear: 'soil', hugoniot: 'dry_sand', dryPorous: true, rho_f: 2700 },
  wet_soil: { label: '湿った土', K1: 0.095, K2: 0.35, mu: 0.55, Y: 0.5e6, Kr: 1.1, Kd: 0.6, ejecta: 'rock', nuclear: 'soil', hugoniot: 'permafrost', dryPorous: false, rho_f: 2700 },
  soft_rock: { label: '柔らかい岩', K1: 0.095, K2: 0.215, mu: 0.55, Y: 1e6, Kr: 1.1, Kd: 0.6, ejecta: 'rock', nuclear: 'rock', hugoniot: 'sandstone', dryPorous: false, rho_f: 2700 },
  hard_rock: { label: '硬い岩', K1: 0.095, K2: 0.257, mu: 0.55, Y: 10e6, Kr: 1.1, Kd: 0.6, ejecta: 'rock', nuclear: 'rock', hugoniot: 'granite', dryPorous: false, rho_f: 2700 },
  regolith: { label: 'レゴリス', K1: 0.132, K2: 0.26, mu: 0.41, Y: 0.01e6, Kr: 1.1, Kd: 0.6, ejecta: 'soil', nuclear: 'soil', hugoniot: 'dry_sand', dryPorous: true, rho_f: 2700 },
  ice: { label: '氷', K1: 0.095, K2: 0.351, mu: 0.55, Y: 0.015e6, Kr: 1.1, Kd: 0.6, ejecta: 'rock', nuclear: 'rock', hugoniot: 'ice', dryPorous: false, rho_f: 917 },
}

export const NU = 0.33

export interface GroundPreset {
  label: string
  cls: GroundClass
  rho: number
  /** 表層の厚さ [m]（0 は層なし） */
  t_reg: number
}

export const GROUNDS: Record<BodyId, Record<string, GroundPreset>> = {
  moon: {
    mare_regolith: { label: '海のレゴリス（砂状）', cls: 'regolith', rho: 1500, t_reg: 5 },
    highland_regolith: { label: '高地のレゴリス（砂状）', cls: 'regolith', rho: 1500, t_reg: 10 },
    mare_basalt: { label: '海の玄武岩（溶岩が固まった岩盤）', cls: 'hard_rock', rho: 3000, t_reg: 0 },
    polar_icy: { label: '極域の永久影（氷を含むレゴリス）', cls: 'regolith', rho: 1600, t_reg: 10 },
  },
  mars: {
    dust: { label: '細かいちり・砂丘', cls: 'sand', rho: 1500, t_reg: 0 },
    duricrust: { label: '固まった土（デュリクラスト）', cls: 'dry_soil', rho: 1600, t_reg: 0 },
    basalt: { label: '溶岩平原の玄武岩', cls: 'hard_rock', rho: 2900, t_reg: 0 },
    ice_rich: { label: '氷を多く含む地盤（永久凍土）', cls: 'wet_soil', rho: 1800, t_reg: 0 },
    polar_cap: { label: '極冠（水の氷）', cls: 'ice', rho: 920, t_reg: 0 },
  },
  earth: {
    sand: { label: '乾いた砂', cls: 'sand', rho: 1700, t_reg: 0 },
    alluvium: { label: '乾いた土・砂漠の堆積層（沖積層）', cls: 'dry_soil', rho: 1700, t_reg: 0 },
    wet_soil: { label: '湿った土・粘土', cls: 'wet_soil', rho: 2100, t_reg: 0 },
    sedimentary: { label: '堆積岩（砂岩、石灰岩）', cls: 'soft_rock', rho: 2300, t_reg: 0 },
    crystalline: { label: '花崗岩・玄武岩', cls: 'hard_rock', rho: 2700, t_reg: 0 },
    glacier: { label: '氷河の氷', cls: 'ice', rho: 917, t_reg: 0 },
  },
}

/** 天体ごとの地盤の初期値 */
export const DEFAULT_GROUND: Record<BodyId, string> = { moon: 'mare_regolith', mars: 'duricrust', earth: 'alluvium' }

// ---------------------------------------------------------------------------
// 衝突体（§3.4、§4.4）

export type ImpactorId = 'iron' | 'stony' | 'carbonaceous' | 'icy' | 'ice_ball' | 'concrete' | 'tungsten'

export interface ImpactorPreset {
  label: string
  /** 断面図に書く短い名前 */
  short: string
  delta: number
  hugoniot: HugoniotId
  /** 溶け始め、完全に溶ける、蒸発し始めの圧力 [Pa]。null は資料なし */
  thresholds: [number, number, number] | null
}

export const IMPACTORS: Record<ImpactorId, ImpactorPreset> = {
  iron: { label: '鉄（鉄隕石。鋼の球もほぼ同じ）', short: '鉄', delta: 7800, hugoniot: 'iron', thresholds: [242e9, 389e9, 800e9] },
  stony: { label: '石質（S型小惑星、普通コンドライト）', short: '石質', delta: 3000, hugoniot: 'diabase', thresholds: [135e9, 149e9, 186e9] },
  carbonaceous: { label: '炭素質（C型小惑星）※参考値', short: '炭素質', delta: 1800, hugoniot: 'serpentinite', thresholds: [135e9, 149e9, 186e9] },
  icy: { label: '氷（彗星。すき間が多い）※参考値', short: '彗星の氷', delta: 800, hugoniot: 'ice', thresholds: [0.4e9, 3e9, 4.5e9] },
  ice_ball: { label: '氷球（すき間のない氷）', short: '氷球', delta: 917, hugoniot: 'ice', thresholds: [0.4e9, 3e9, 4.5e9] },
  concrete: { label: 'コンクリート（人工物）※参考値', short: 'コンクリート', delta: 2300, hugoniot: 'concrete', thresholds: null },
  tungsten: { label: 'タングステン球（人工物）', short: 'タングステン球', delta: 19_300, hugoniot: 'tungsten', thresholds: null },
}

export type HugoniotId = 'iron' | 'diabase' | 'serpentinite' | 'ice' | 'concrete' | 'tungsten' | 'dry_sand' | 'permafrost' | 'sandstone' | 'granite'

/** 線形の衝撃波速度の式 Us = C + s·up の値（Melosh 2011 表6.1。タングステンは Marsh 1980、コンクリートは 21 GPa までの実験の当てはめ（参考値）） */
export const HUGONIOT: Record<HugoniotId, { rho: number; C: number; s: number }> = {
  iron: { rho: 7680, C: 3800, s: 1.58 },
  diabase: { rho: 3000, C: 4480, s: 1.19 },
  serpentinite: { rho: 2800, C: 2730, s: 1.76 },
  ice: { rho: 915, C: 1317, s: 1.526 },
  concrete: { rho: 2300, C: 2350, s: 1.66 },
  tungsten: { rho: 19_220, C: 4030, s: 1.24 },
  dry_sand: { rho: 1600, C: 1700, s: 1.31 },
  permafrost: { rho: 1960, C: 2510, s: 1.29 },
  sandstone: { rho: 2000, C: 1500, s: 1.43 },
  granite: { rho: 2630, C: 3680, s: 1.24 },
}

// ---------------------------------------------------------------------------
// 核爆発（§4.3、§4.11）

/** 換算深さ λ [m/kt^(1/3.4)] に対する、換算半径 r_s と換算深さ q_s（地球） */
export const NUCLEAR_CURVES: Record<'soil' | 'rock', { lam: number; r: number; q: number }[]> = {
  soil: [
    { lam: 0, r: 15, q: 5 },
    { lam: 4.9, r: 38, q: 15 },
    { lam: 19, r: 43, q: 37 },
    { lam: 49.5, r: 50, q: 25 },
    { lam: 70, r: 35, q: 15 },
    { lam: 100, r: 0, q: 0 },
  ],
  rock: [
    { lam: 0, r: 12, q: 4 },
    { lam: 4.9, r: 30, q: 12 },
    { lam: 19, r: 34, q: 25 },
    { lam: 41, r: 45, q: 25 },
    { lam: 55, r: 20, q: 10 },
    { lam: 65, r: 0, q: 0 },
  ],
}

/** 地上に漏れ出す放射性物質の割合 F_c（λ に対して log F_c を直線でつなぐ） */
export const FC_CURVE: { lam: number; fc: number }[] = [
  { lam: 0, fc: 0.5 },
  { lam: 20, fc: 0.5 },
  { lam: 45, fc: 0.07 },
  { lam: 57, fc: 0.005 },
  { lam: 108, fc: 0.0005 },
]

// ---------------------------------------------------------------------------
// 噴出物（§4.7。Housen & Holsapple 2011 表3、n1 = 1.2）

export interface EjectaConstants {
  mu: number
  C1: number
  k: number
  H: number
  n2: number
  p: number
}

export const EJECTA: Record<'soil' | 'rock', { gravity: EjectaConstants; strength: EjectaConstants }> = {
  soil: {
    gravity: { mu: 0.41, C1: 0.55, k: 0.3, H: 0.59, n2: 1.3, p: 0.3 },
    strength: { mu: 0.4, C1: 0.55, k: 0.3, H: 0.4, n2: 1, p: 0.3 },
  },
  rock: {
    gravity: { mu: 0.55, C1: 1.5, k: 0.2, H: 0.68, n2: 1.5, p: 0.5 },
    strength: { mu: 0.55, C1: 1.5, k: 0.3, H: 1.1, n2: 1, p: 0.5 },
  },
}
export const N1 = 1.2

/** 岩の大きさの分布の累積のべき指数（Bart & Melosh 2010。平均 3.7、標準偏差 0.9） */
export const SIZE_EXPONENTS = { mean: 3.7, low: 2.8, high: 4.6 }

// ---------------------------------------------------------------------------
// 熱放射（§4.10。Collins 2005 表1、1 Mt での値 [J/m²]）

export const IGNITION: Record<string, { label: string; phi1Mt: number }> = {
  burn3: { label: '第3度のやけど', phi1Mt: 0.42e6 },
  burn2: { label: '第2度のやけど', phi1Mt: 0.25e6 },
  burn1: { label: '第1度のやけど', phi1Mt: 0.13e6 },
  clothing: { label: '衣服が燃える', phi1Mt: 1.0e6 },
  plywood: { label: '合板が燃える', phi1Mt: 0.67e6 },
  grass: { label: '草が燃える', phi1Mt: 0.38e6 },
  trees: { label: '広葉樹が燃える', phi1Mt: 0.25e6 },
}
