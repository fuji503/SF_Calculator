import type { Message } from '../types.ts'
import { LOCATIONS, type DoseTable, type Shape, type ShieldMat, type SphereFloor } from './data.ts'

/** スペースコロニー設計の計算（仕様書1(新規) §4。段階1：§4.1〜4.4、4.9〜4.13、4.18。段階2：§4.5〜4.7（スポーク、リング、テザー、引っ張り材、端のふたの支え）） */

export const G0 = 9.80665
const R_GAS = 8.314462618
const M_O2 = 31.998e-3
const M_N2 = 28.014e-3
const M_H2O = 18.015e-3
/** 酸素分圧の下限の目安：標高 2500 m の空気の酸素分圧（74.7 kPa × 20.95%） */
export const P_O2_LOW = 15_650
/** 酸素の割合の上限の目安：NASA の探査用の大気の 34% */
export const F_O2_FIRE = 0.34

export type Taper = 'none' | 'const' | 'linear'
export type Cap = 'hemi' | 'spine' | 'ties'

export interface ColonyInputs {
  shape: Shape
  A_f: number
  g_f: number
  R_f: number
  f_land: number
  a: number
  a_m: number
  w_m: number
  sphere_floor: SphereFloor
  g_min: number
  n_lv: number
  n_deck: number
  h_deck: number
  P_f: number
  /** 乾いた空気のうちの酸素の割合 */
  f_O2: number
  /** true：酸素分圧を入れる（気圧を変えても吸う酸素の量を保つ）。false：割合を入れる */
  o2_by_pressure: boolean
  p_O2: number
  /** 相対湿度 */
  RH: number
  T_in: number
  sigma_u: number
  rho: number
  /** 外壁のヤング率（スポークの長さの調整量に使う） */
  E_h: number
  SF: number
  /** スポーク・テザー・引っ張り材・リング・中心の軸の材料 */
  sigma_us: number
  rho_s: number
  E_s: number
  /** スポークが受ける割合（シリンダ・球・トーラス） */
  f_s: number
  N_th: number
  s_z: number
  N_hub: number
  n_teth: number
  r_hub: number
  taper: Taper
  k_tp: number
  /** 管・モジュールの中の引っ張り材が受ける割合（トーラス・ダンベル） */
  f_t: number
  N_t: number
  s_t: number
  cap: Cap
  n_tie: number
  m_f: number
  m_deck: number
  loc: string
  shield_rot: boolean
  shield_mat: ShieldMat | 'custom'
  /** true：面密度を入れる。false：線量の目標から決める */
  shield_by_areal: boolean
  D_tgt: number
  sigma_sh: number
  rho_sh: number
  g_sh: number
  /** 回転数の上限 [rpm] */
  n_max: number
  v_rel: number
  k_cor: number
  h_p: number
  k_grad: number
  h_bld: number
  r_core: number
}

/** 床（基準の床、上の階、球の段・層） */
export interface Floor {
  label: string
  /** 中心からの距離 */
  r: number
  area: number
  /** 載るものの面密度 */
  m: number
  /** 慣性モーメントに使う半径の2乗の平均（球の赤道の帯。省略時は r²） */
  r2?: number
}

/** 高さの表の1行 */
export interface HeightRow {
  label: string
  r: number
  g: number
  /** 気圧（空気のない位置は undefined） */
  P?: number
  v: number
  /** 落とした物のずれ（床より上だけ。中心の軸は Infinity） */
  drift?: number
}

/** スポークなどの部材（出力の一覧の1行） */
export interface Member {
  label: string
  count: number
  /** 1本の先と根元の断面積 */
  A_tip: number
  A_root: number
  /** 1本の質量 */
  mass: number
  /** 1本の長さ */
  length: number
}

export interface MassItem {
  label: string
  mass: number
  rotating: boolean
}

export interface ColonyOutputs {
  omega: number
  n_rpm: number
  period: number
  v: number
  dg_dr: number
  grad: number
  coriolis: number
  R_min_rpm: number
  v_min_cor: number
  /** 回転の安定（シリンダ）：回転軸まわりと横の軸まわりの慣性モーメントの比 */
  I_ratio?: number
  M_mol: number
  rho_air: number
  /** 酸素分圧と、乾いた空気のうちの酸素の割合（入れなかった方は計算で決まる） */
  p_O2: number
  f_O2: number
  /** 全体の気圧に対する酸素の割合 */
  x_O2: number
  p_N2: number
  p_H2O: number
  /** 露点（湿度 0 では undefined） */
  T_dew?: number
  P_axis?: number
  floors: Floor[]
  A_total: number
  V_air: number
  M_air: number
  // 寸法
  L?: number
  R_c?: number
  w?: number
  R_s?: number
  g_edge?: number
  L_m?: number
  g_end?: number
  tilt?: number
  R_hull: number
  A_hull: number
  // 構造
  t_hull: number
  m_hull: number
  t_cap?: number
  /** スポーク・テザー・引っ張り材・リング・中心の軸 */
  members: Member[]
  /** スポークの列の数と実際の間隔（シリンダ・球） */
  n_rows?: number
  s_zr?: number
  /** スポーク・テザー1本の先の力 */
  F_spoke?: number
  /** スポークの長さの調整量（正：その分だけ短く作って初めの張力をかける） */
  dl_spoke?: number
  /** 同心の引っ張り材のたるみの比（支点の間隔に対する） */
  tie_sag?: number
  /** 作れる接線速度の上限と最大の半径（スポークが全部受けるときは上限なし） */
  v_max?: number
  R_max?: number
  F_tether?: number
  // 遮蔽
  sigma_sh: number
  t_sh: number
  M_shield: number
  dose?: number
  A_shield: number
  // 質量
  masses: MassItem[]
  M_total: number
  M_rot: number
  I: number
  E_rot: number
  L_ang: number
  heights: HeightRow[]
  g_profile: { r: number[]; y: number[] }
  P_profile: { r: number[]; y: number[] }
}

/** 回転（形や材料に依らない）。構造などでエラーになっても出す */
export interface SpinOutputs {
  omega: number
  n_rpm: number
  period: number
  v: number
  /** 殻の材料で決まる、作れる接線速度の上限と最大の半径（ダンベルは出さない） */
  v_max?: number
  R_max?: number
}

export interface ColonyResult {
  outputs?: ColonyOutputs
  /** エラーのときも出す回転の値 */
  spin?: SpinOutputs
  warnings: Message[]
  errors: Message[]
}

// ---------------------------------------------------------------------------
// 部品

/** 乾いた空気の平均の分子量 [kg/mol]（酸素と窒素） */
export function molarMass(fO2: number): number {
  return fO2 * M_O2 + (1 - fO2) * M_N2
}

/** 水の飽和水蒸気圧 [Pa]（Magnus の式、Alduchov & Eskridge 1996 の係数。-40〜50℃） */
export function saturationPressure(T: number): number {
  const c = T - 273.15
  return 610.94 * Math.exp((17.625 * c) / (c + 243.04))
}

/** 水蒸気圧 [Pa] から露点 [K] */
export function dewPoint(p_w: number): number {
  const l = Math.log(p_w / 610.94)
  return 273.15 + (243.04 * l) / (17.625 - l)
}

/** 空気の組成（§4.2）。水蒸気は相対湿度から、酸素は割合か分圧から決める */
export function airComposition(P: number, T: number, RH: number, o2: { f?: number; p?: number }) {
  const p_H2O = RH * saturationPressure(T)
  const dry = P - p_H2O
  const p_O2 = o2.p ?? (o2.f ?? 0) * dry
  const p_N2 = dry - p_O2
  const M = (p_O2 * M_O2 + p_N2 * M_N2 + p_H2O * M_H2O) / P
  return { p_H2O, p_O2, p_N2, f_O2: p_O2 / dry, M }
}

/** 空気も一緒に回るときの、半径 r の気圧（§4.2） */
export function pressureAt(P_f: number, M: number, T: number, omega: number, r: number, R_f: number): number {
  return P_f * Math.exp((M * omega ** 2 * (r ** 2 - R_f ** 2)) / (2 * R_GAS * T))
}

/** 高さ h から落とした物の、真下からのずれ（回転と逆の向き。§4.1） */
export function dropDrift(R_f: number, h: number): number {
  const r0 = R_f - h
  if (r0 <= 0) return Infinity
  const l = Math.sqrt(R_f ** 2 - r0 ** 2)
  return R_f * (l / r0 - Math.atan(l / r0))
}

/** 線量の表を、線量の対数を面密度について直線で補間する（表の外は undefined） */
export function doseAt(tab: DoseTable, sigma: number): number | undefined {
  if (sigma < tab[0][0] || sigma > tab[tab.length - 1][0]) return undefined
  for (let i = 1; i < tab.length; i++) {
    const [x0, y0] = tab[i - 1]
    const [x1, y1] = tab[i]
    if (sigma <= x1) {
      const f = (sigma - x0) / (x1 - x0)
      return Math.exp(Math.log(y0) + f * (Math.log(y1) - Math.log(y0)))
    }
  }
  return undefined
}

/**
 * 線量が初めて目標以下になる面密度（§4.12）。表は単調とは限らないので、小さい方から見る。
 * 表の最初の点で満たせばその点、表の範囲で届かなければ undefined
 */
export function arealForDose(tab: DoseTable, D: number): number | undefined {
  if (tab[0][1] <= D) return tab[0][0]
  for (let i = 1; i < tab.length; i++) {
    const [x0, y0] = tab[i - 1]
    const [x1, y1] = tab[i]
    if (y1 <= D) {
      const f = (Math.log(D) - Math.log(y0)) / (Math.log(y1) - Math.log(y0))
      return x0 + f * (x1 - x0)
    }
  }
  return undefined
}

/** 単調に増える f について f(x) = target を二分法で解く */
function solveIncreasing(f: (x: number) => number, target: number, lo: number): number {
  let hi = lo * 2
  for (let i = 0; i < 200 && f(hi) < target; i++) hi *= 2
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface RadialMember {
  A_tip: number
  A_root: number
  mass: number
  /** 回転軸まわりの慣性モーメント */
  I: number
  /** 伸び（ヤング率 E のとき） */
  delta: number
}

/**
 * 半径 r_in から r_out までの放射状の部材（スポーク・テザー）が、先に力 F を受け、自分の遠心力も受けるときの、
 * 応力がどこでも許容応力 sa 以下になる最小の太さ（§4.6）。作れなければ undefined
 */
export function radialMember(
  F: number,
  r_in: number,
  r_out: number,
  rho: number,
  sa: number,
  omega: number,
  taper: Taper,
  k_tp: number,
  E: number,
): RadialMember | undefined {
  const len = r_out - r_in
  if (!(len > 0) || !(F >= 0) || !(sa > 0)) return undefined
  const w2 = omega ** 2
  const k = (rho * w2) / (2 * sa)
  // 先の断面積に対する形 a(r)（応力が一定は解析解、ほかは決めた形）
  const shape = (r: number) => (taper === 'const' ? Math.exp(k * (r_out ** 2 - r ** 2)) : taper === 'linear' ? 1 + (k_tp - 1) * ((r_out - r) / len) : 1)
  const n = 2000
  const h = len / n
  // 先から根元へ：G(r) = ρω²∫_r^{r_out} a(s) s ds / a(r)（先の断面積に依らない応力の部分）
  let acc = 0
  let need = 0
  const G: number[] = []
  for (let i = 0; i <= n; i++) {
    const r = r_out - i * h
    if (i > 0) acc += 0.5 * (shape(r) * r + shape(r + h) * (r + h)) * h
    const g = (rho * w2 * acc) / shape(r)
    G.push(g)
    if (taper !== 'const') {
      if (g >= sa) return undefined
      need = Math.max(need, F / (shape(r) * (sa - g)))
    }
  }
  const A_tip = taper === 'const' ? F / sa : need
  let mass = 0
  let I = 0
  let delta = 0
  for (let i = 1; i <= n; i++) {
    const r1 = r_out - (i - 1) * h
    const r0 = r_out - i * h
    mass += 0.5 * (shape(r0) + shape(r1)) * h
    I += 0.5 * (shape(r0) * r0 ** 2 + shape(r1) * r1 ** 2) * h
    const s0 = taper === 'const' ? sa : F / (A_tip * shape(r0)) + G[i]
    const s1 = taper === 'const' ? sa : F / (A_tip * shape(r1)) + G[i - 1]
    delta += (0.5 * (s0 + s1) * h) / E
  }
  return { A_tip, A_root: A_tip * shape(r_in), mass: rho * A_tip * mass, I: rho * A_tip * I, delta }
}

/** 慣性モーメントの部品（回転軸まわり I_z と、重心を通る横の軸まわり I_x） */
interface Inertia {
  z: number
  x: number
}

// ---------------------------------------------------------------------------

export function computeColony(p: ColonyInputs): ColonyResult {
  const r = computeAll(p)
  if (r.outputs || !(p.g_f > 0 && p.R_f > 0)) return r
  const omega = Math.sqrt(p.g_f / p.R_f)
  const fs = p.shape === 'dumbbell' ? 0 : Math.min(Math.max(p.f_s || 0, 0), 1)
  const self = p.sigma_u > 0 && p.rho > 0 && p.SF > 0 && p.shape !== 'dumbbell' && fs < 1 ? p.sigma_u / p.SF / p.rho / (1 - fs) : undefined
  return {
    ...r,
    spin: {
      omega,
      n_rpm: (60 * omega) / (2 * Math.PI),
      period: (2 * Math.PI) / omega,
      v: omega * p.R_f,
      v_max: self === undefined ? undefined : Math.sqrt(self),
      R_max: self === undefined ? undefined : self / p.g_f,
    },
  }
}

function computeAll(p: ColonyInputs): ColonyResult {
  const warnings: Message[] = []
  const errors: Message[] = []
  const positive: (keyof ColonyInputs)[] = ['A_f', 'g_f', 'R_f', 'P_f', 'T_in', 'sigma_u', 'rho', 'SF']
  for (const k of positive) {
    if (!(Number(p[k]) > 0)) errors.push({ code: 'range', keys: [k] })
  }
  if (errors.length) return { warnings, errors }

  // §4.1 回転
  const omega = Math.sqrt(p.g_f / p.R_f)
  const w2 = omega ** 2
  const v = omega * p.R_f
  const n_rpm = (60 * omega) / (2 * Math.PI)

  // §4.2 空気
  if (!(p.RH >= 0 && p.RH <= 1)) return { warnings, errors: [{ code: 'range', keys: ['RH'] }] }
  const air = airComposition(p.P_f, p.T_in, p.RH, p.o2_by_pressure ? { p: p.p_O2 } : { f: p.f_O2 })
  if (air.p_H2O >= p.P_f) return { warnings, errors: [{ code: 'humid', keys: ['RH', 'P_f', 'T_in'] }] }
  if (!(air.p_O2 >= 0) || air.p_N2 < 0) return { warnings, errors: [{ code: 'o2-high', keys: [p.o2_by_pressure ? 'p_O2' : 'f_O2', 'P_f'] }] }
  const M = air.M
  const x_O2 = air.p_O2 / p.P_f
  if (air.p_O2 < P_O2_LOW) warnings.push({ code: 'hypoxia', keys: ['p_O2', 'f_O2', 'P_f'], params: { p: air.p_O2 / 1000 } })
  if (x_O2 > F_O2_FIRE) warnings.push({ code: 'o2-fire', keys: ['p_O2', 'f_O2', 'P_f'], params: { f: x_O2 * 100 } })
  const P = (r: number) => pressureAt(p.P_f, M, p.T_in, omega, r, p.R_f)
  const rho_air = (p.P_f * M) / (R_GAS * p.T_in)
  const sa = p.sigma_u / p.SF

  // §4.12 遮蔽の面密度（形に依らない）
  const loc = LOCATIONS[p.loc] ?? LOCATIONS.free
  const tab = p.shield_mat === 'custom' ? undefined : loc.tables[p.shield_mat]
  let sigma_sh = p.sigma_sh
  if (!p.shield_by_areal) {
    if (!tab) return { warnings, errors: [{ code: 'no-table', keys: ['shield_mat', 'loc'] }] }
    const s = arealForDose(tab, p.D_tgt)
    if (s === undefined) return { warnings, errors: [{ code: 'shield-unreachable', keys: ['D_tgt'] }] }
    sigma_sh = s
  } else if (!(sigma_sh >= 0)) {
    return { warnings, errors: [{ code: 'range', keys: ['sigma_sh'] }] }
  }
  if (!(p.rho_sh > 0)) return { warnings, errors: [{ code: 'range', keys: ['rho_sh'] }] }
  const dose = tab ? doseAt(tab, sigma_sh) : undefined
  const t_sh = sigma_sh / p.rho_sh
  if (loc.h_leo === 500e3) warnings.push({ code: 'leo500', level: 'info' })
  if (p.shape === 'dumbbell' && !p.shield_rot) return { warnings, errors: [{ code: 'dumbbell-shield', keys: ['shield_rot'] }] }
  const tsr = p.shield_rot ? t_sh : 0

  // 段階2：スポークと引っ張り材
  const fs = p.shape === 'dumbbell' ? 0 : p.f_s
  if (!(fs >= 0 && fs <= 1)) return { warnings, errors: [{ code: 'range', keys: ['f_s'] }] }
  if (!(p.f_t >= 0 && p.f_t <= 1)) return { warnings, errors: [{ code: 'range', keys: ['f_t'] }] }
  const usesMembers = fs > 0 || p.shape === 'dumbbell' || (p.shape === 'torus' && p.f_t > 0) || (p.shape === 'cylinder' && p.cap !== 'hemi')
  const sas = p.sigma_us / p.SF
  if (usesMembers) {
    for (const k of ['sigma_us', 'rho_s', 'E_s'] as const) if (!(p[k] > 0)) return { warnings, errors: [{ code: 'range', keys: [k] }] }
    if (!(p.r_hub >= 0)) return { warnings, errors: [{ code: 'range', keys: ['r_hub'] }] }
    if (p.taper === 'linear' && !(p.k_tp >= 1)) return { warnings, errors: [{ code: 'range', keys: ['k_tp'] }] }
  }
  if (fs > 0 && (p.shape === 'cylinder' || p.shape === 'sphere')) {
    for (const k of ['N_th', 's_z'] as const) if (!(p[k] > 0)) return { warnings, errors: [{ code: 'range', keys: [k] }] }
    if (!(p.E_h > 0)) return { warnings, errors: [{ code: 'range', keys: ['E_h'] }] }
  }
  const members: Member[] = []
  /** 部材を一覧・質量・慣性モーメントに足す */
  const addMember = (label: string, count: number, m: { A_tip: number; A_root: number; mass: number; I?: number }, length: number) => {
    members.push({ label, count, A_tip: m.A_tip, A_root: m.A_root, mass: m.mass, length })
    push(label, m.mass * count, true)
    if (m.I) inertia.push({ z: m.I * count, x: 0 })
  }
  /** スポーク・テザー（作れなければエラーを足して undefined） */
  const spoke = (F: number, r_in: number, r_out: number) => {
    if (!(r_out > r_in)) {
      errors.push({ code: 'hub-out', keys: ['r_hub'] })
      return undefined
    }
    const m = radialMember(F, r_in, r_out, p.rho_s, sas, omega, p.taper, p.k_tp, p.E_s)
    if (!m) errors.push({ code: 'spoke-limit', keys: ['taper', 'sigma_us', 'rho_s'], params: { v: omega * r_out } })
    return m
  }
  /** スポークの列の外側のリング（スポークの間で外にふくらむ円弧。自分の遠心力を含む） */
  const ring = (T: number, r: number, rows: number, label: string): boolean => {
    const den = sas - p.rho_s * (omega * r) ** 2
    if (den <= 0) {
      errors.push({ code: 'ring-limit', keys: ['sigma_us', 'rho_s'], params: { v: omega * r } })
      return false
    }
    const A = T / den
    const m = p.rho_s * A * 2 * Math.PI * r
    addMember(label, rows, { A_tip: A, A_root: A, mass: m, I: m * r ** 2 }, 2 * Math.PI * r)
    return true
  }
  /** 管・モジュールの中の引っ張り材（自分の遠心力は無視する。§7）と、壁側のリング */
  const tubeTies = (a: number, lengthAlong: number, label: string) => {
    const rows = Math.max(1, Math.round(lengthAlong / p.s_t))
    const st = lengthAlong / rows
    const F = (p.f_t * Pw0 * 2 * Math.PI * a * st) / p.N_t
    const A = F / sas
    addMember(`${label}の中の引っ張り材`, p.N_t * rows, { A_tip: A, A_root: A, mass: p.rho_s * A * a }, a)
    const T = (p.f_t * Pw0 * st * ((2 * Math.PI * a) / p.N_t)) / Math.SQRT2
    const Ar = T / sas
    addMember(`${label}の引っ張り材のリング`, rows, { A_tip: Ar, A_root: Ar, mass: p.rho_s * Ar * 2 * Math.PI * a }, 2 * Math.PI * a)
    return st
  }
  /** 管・モジュールの壁の位置の気圧（引っ張り材に使う） */
  let Pw0 = p.P_f

  const floors: Floor[] = [{ label: '基準の床', r: p.R_f, area: p.A_f, m: p.m_f }]
  /** 高さの表に足す、形ごとの位置 */
  const extraRows: { label: string; r: number }[] = []
  const inertia: Inertia[] = []
  const masses: MassItem[] = []
  const push = (label: string, mass: number, rotating: boolean) => masses.push({ label, mass, rotating })
  /** 気圧の分布を出す範囲（空気のある範囲） */
  let airLo = 0
  let airHi = p.R_f
  /** 高さの表で気圧を出す範囲（外壁にかかる気圧まで） */
  let pLo = 0
  let pHi: number
  /** 一番外の面 */
  let rOuter: number
  let R_hull: number
  let A_hull: number
  let t_hull: number
  let m_hull: number
  let V_air: number
  let A_shield: number
  let vHull: number
  let selfMax: number
  const out: Partial<ColonyOutputs> = {}

  /** 上の階（トーラス・ダンベル）：a_i の円の中の、中心から d の弦の床から k 階上 */
  const decks = (a_i: number, d: number, length: (r: number) => number): boolean => {
    for (let k = 1; k <= p.n_deck; k++) {
      const r = p.R_f - k * p.h_deck
      const dk = d - k * p.h_deck
      if (Math.abs(dk) >= a_i) {
        // 管・モジュールの天井（中心から a_i 上）に届かない階の数
        errors.push({ code: 'deck-out', keys: ['n_deck', 'h_deck'], params: { n: Math.max(0, Math.ceil((d + a_i) / p.h_deck) - 1) } })
        return false
      }
      floors.push({ label: `上の階 ${k}`, r, area: length(r) * 2 * Math.sqrt(a_i ** 2 - dk ** 2), m: p.m_deck })
    }
    return true
  }

  // 殻の速さが、材料の強さ ÷ 密度で決まる上限を超える（自分の重さの遠心力だけで許容応力に達する）
  const tooThick = () =>
    errors.push({
      code: 'hull-limit',
      keys: ['sigma_u', 'rho', 'SF', 'R_f'],
      params: { v: vHull, vmax: Math.sqrt(sa / p.rho / (1 - fs)), R: sa / p.rho / (1 - fs) / p.g_f / 1000 },
    })
  const nonRotShield = (r_mid: number, area: number) => {
    A_shield = area
    rOuter = r_mid + t_sh / 2
    push('遮蔽（自転させない）', sigma_sh * area, false)
    extraRows.push({ label: '遮蔽の外面', r: rOuter })
  }

  switch (p.shape) {
    case 'cylinder': {
      if (!(p.f_land > 0 && p.f_land <= 1)) return { warnings, errors: [{ code: 'range', keys: ['f_land'] }] }
      const L = p.A_f / (2 * Math.PI * p.R_f * p.f_land)
      const R_h = p.R_f + tsr
      const r_sh = p.R_f + tsr / 2
      vHull = omega * R_h
      const den = sa - (1 - fs) * p.rho * vHull ** 2
      const denCap = sa - p.rho * vHull ** 2
      if (den <= 0) {
        tooThick()
        return { warnings, errors }
      }
      // 端のふたはスポークで支えないので、自分の重さの遠心力をそのまま受ける
      if (denCap <= 0) return { warnings, errors: [{ code: 'cap-limit', keys: ['sigma_u', 'rho', 'SF', 'R_f'], params: { v: vHull, vmax: Math.sqrt(sa / p.rho) } }] }
      const Pc = P(R_h)
      // §4.4 外向きの荷重：気圧、床に載るもの（陸の帯の値で保守的に）、自転させる遮蔽
      const p_ext = Pc + p.m_f * w2 * p.R_f * (p.R_f / R_h) + (p.shield_rot ? sigma_sh * w2 * r_sh * (r_sh / R_h) : 0)
      // §4.7 端のふた：半球の殻、中心の軸、中心の軸と同心の引っ張り材
      const hemi = p.cap === 'hemi'
      const nTie = p.cap === 'ties' ? Math.max(1, Math.round(p.n_tie)) : 0
      const s_c = hemi ? 0 : (R_h - p.r_hub) / (nTie + 1)
      if (!hemi && !(s_c > 0)) return { warnings, errors: [{ code: 'hub-out', keys: ['r_hub'] }] }
      // 殻が受けるふたの環の内側の半径（軸・引っ張り材が内側を受ける）
      const r_e = hemi ? 0 : R_h - s_c / 2
      const T_zcap = (Pc * (R_h ** 2 - r_e ** 2)) / (2 * R_h)
      const t_cap = hemi ? (Pc * R_h) / 2 / denCap : (Pc * s_c) / Math.SQRT2 / denCap
      // §4.5 スポークの列
      let n_r = 0
      let s_zr = L
      if (fs > 0) {
        n_r = Math.max(2, Math.round(L / p.s_z) + 1)
        s_zr = L / (n_r - 1)
      }
      const t_theta = ((1 - fs) * p_ext * R_h) / den
      t_hull = Math.max(t_theta, Math.max(T_zcap, (fs * p_ext * s_zr) / Math.SQRT2) / sa)
      const A_side = 2 * Math.PI * R_h * L
      // ふたの面積：半球、または軸と外周の間の環が 90° の円弧でふくらむ形（弦に対する弧の長さ π/(2√2)）
      const A_cap = hemi ? 4 * Math.PI * R_h ** 2 : 2 * (Math.PI / (2 * Math.SQRT2)) * Math.PI * (R_h ** 2 - p.r_hub ** 2)
      m_hull = p.rho * t_hull
      const M_side = m_hull * A_side
      const M_cap = p.rho * t_cap * A_cap
      push('外壁（側面）', M_side, true)
      push(hemi ? '端のふた（半球）' : '端のふた（軸で支える平らに近い形）', M_cap, true)
      inertia.push(cylShell(M_side, R_h, L), hemi ? hemiShells(M_cap, R_h, L) : diskPair(M_cap, R_h, L))
      R_hull = R_h
      A_hull = A_side + (hemi ? 4 : 2) * Math.PI * R_h ** 2
      V_air = Math.PI * p.R_f ** 2 * L + (hemi ? (4 / 3) * Math.PI * p.R_f ** 3 : 0)
      const M_air = rho_air * V_air
      inertia.push(airCylinder(rho_air, p.R_f, L, hemi))
      out.M_air = M_air
      if (p.shield_rot) {
        const As = 2 * Math.PI * r_sh * L
        const Ac = (hemi ? 4 : 2) * Math.PI * r_sh ** 2
        A_shield = As + Ac
        push('遮蔽（自転させる）', sigma_sh * A_shield, true)
        inertia.push(cylShell(sigma_sh * As, r_sh, L), hemi ? hemiShells(sigma_sh * Ac, r_sh, L) : diskPair(sigma_sh * Ac, r_sh, L))
        rOuter = R_h + t_hull
      } else {
        const r_mid = R_h + t_hull + p.g_sh + t_sh / 2
        nonRotShield(r_mid, 2 * Math.PI * r_mid * L + (hemi ? 4 : 2) * Math.PI * r_mid ** 2)
      }
      const M_fl = p.m_f * p.A_f
      inertia.push({ z: M_fl * p.R_f ** 2, x: M_fl * (p.R_f ** 2 / 2 + L ** 2 / 12) })

      // 中心の軸と同心の引っ張り材（材料はスポークと同じ。気圧は外壁の位置の値で保守的に）
      if (!hemi) {
        const F_ax = Pc * Math.PI * (p.r_hub + s_c / 2) ** 2
        const A_ax = F_ax / sas
        addMember('中心の軸', 1, { A_tip: A_ax, A_root: A_ax, mass: p.rho_s * A_ax * L }, L)
        let sag = 0
        for (let j = 1; j <= nTie; j++) {
          const r_j = p.r_hub + j * s_c
          // 両隣との中間の半径の間の環（幅 s_c）を受ける。1つの輪を N_θ 本（スポークがなければ12本）に分ける
          const nPer = fs > 0 ? Math.round(p.N_th) : 12
          const A_j = (2 * Math.PI * Pc * r_j * s_c) / sas / nPer
          const m = p.rho_s * A_j * L
          addMember(`同心の引っ張り材（半径 ${Math.round(r_j)} m）`, nPer, { A_tip: A_j, A_root: A_j, mass: m, I: m * r_j ** 2 }, L)
          // 自分の遠心力によるたるみ：支点はスポークの列（なければ両端）
          sag = Math.max(sag, (p.rho_s * w2 * r_j * (fs > 0 ? s_zr : L)) / (8 * sas))
        }
        if (nTie > 0) {
          out.tie_sag = sag
          if (sag > 0.05) warnings.push({ code: 'tie-sag', keys: ['n_tie', 's_z'], params: { k: sag * 100 } })
        }
      }

      // スポークとリング（§4.5）
      if (fs > 0) {
        const w_r = fs * p_ext * s_zr
        const s_th = (2 * Math.PI * R_h) / p.N_th
        if (!ring((w_r * s_th) / Math.SQRT2, R_h, n_r, 'スポークの列のリング')) return { warnings, errors }
        const F = w_r * s_th
        const m = spoke(F, p.r_hub, R_h)
        if (!m) return { warnings, errors }
        addMember('スポーク', Math.round(p.N_th) * n_r, m, R_h - p.r_hub)
        // 長さの調整量：殻の半径の伸び − スポークの伸び
        const sigma_theta = ((1 - fs) * (p_ext * R_h + p.rho * t_hull * vHull ** 2)) / t_hull
        out.dl_spoke = (R_h * sigma_theta) / p.E_h - m.delta
        out.F_spoke = F
        out.n_rows = n_r
        out.s_zr = s_zr
      }
      selfMax = fs < 1 ? sa / p.rho / (1 - fs) : Infinity
      out.L = L
      out.t_cap = t_cap
      pHi = R_h
      break
    }

    case 'torus': {
      const a_i = p.a - tsr
      const w = p.A_f / (2 * Math.PI * p.R_f)
      if (!(a_i > 0)) return { warnings, errors: [{ code: 'tube-shield', keys: ['a', 'sigma_sh', 'rho_sh'], params: { t: tsr } }] }
      if (w >= 2 * a_i) {
        // 床は管の断面の弦なので、内側の直径より広くできない（床の幅 = 床面積 ÷ 床の円周）
        return { warnings, errors: [{ code: 'torus-wide', keys: ['a', 'A_f', 'R_f'], params: { w, d: 2 * a_i, A: 2 * Math.PI * p.R_f * 2 * a_i, a: w / 2 + tsr } }] }
      }
      const d = Math.sqrt(a_i ** 2 - w ** 2 / 4)
      const R_c = p.R_f - d
      if (R_c - p.a <= 0) return { warnings, errors: [{ code: 'torus-axis', keys: ['a', 'R_f'], params: { Rc: R_c, a: p.a, R: p.a + d } }] }
      if (!decks(a_i, d, (r) => 2 * Math.PI * r)) return { warnings, errors }
      V_air = 2 * Math.PI ** 2 * R_c * a_i ** 2
      const M_air = rho_air * V_air
      const r_m = p.a - tsr / 2
      const M_shr = p.shield_rot ? sigma_sh * 4 * Math.PI ** 2 * R_c * r_m : 0
      // §4.9 輪の遠心力（管の壁以外）
      const sumMR = floors.reduce((s, f) => s + f.m * f.area * f.r, 0) + M_shr * R_c + M_air * R_c
      const Pw = P(R_c + p.a)
      Pw0 = Pw
      vHull = omega * R_c
      const den = sa - (1 - fs) * p.rho * vHull ** 2
      if (den <= 0) {
        tooThick()
        return { warnings, errors }
      }
      // §4.9 断面の方向は管の中の引っ張り材が f_t を受ける。輪の方向はハブのスポークが輪の遠心力の f_s を受ける
      if (p.f_t > 0) for (const k of ['N_t', 's_t'] as const) if (!(p[k] > 0)) return { warnings, errors: [{ code: 'range', keys: [k] }] }
      const t_phi = ((1 - p.f_t) * Pw * p.a * (2 * R_c - p.a)) / (2 * (R_c - p.a)) / sa
      const X = Math.max((Pw * p.a) / 2 + ((1 - fs) * w2 * sumMR) / (4 * Math.PI ** 2 * p.a), p.f_t > 0 ? (p.f_t * Pw * p.s_t) / Math.SQRT2 : 0)
      t_hull = Math.max(t_phi, X / den)
      R_hull = p.a
      A_hull = 4 * Math.PI ** 2 * R_c * p.a
      m_hull = p.rho * t_hull
      const M_wall = m_hull * A_hull
      push('管の壁', M_wall, true)
      inertia.push({ z: M_wall * (R_c ** 2 + 1.5 * p.a ** 2), x: 0 })
      inertia.push({ z: M_air * (R_c ** 2 + 0.75 * a_i ** 2), x: 0 })
      if (p.shield_rot) {
        A_shield = 4 * Math.PI ** 2 * R_c * r_m
        push('遮蔽（自転させる）', M_shr, true)
        inertia.push({ z: M_shr * (R_c ** 2 + 1.5 * r_m ** 2), x: 0 })
        rOuter = R_c + p.a + t_hull
      } else {
        const r_mid = p.a + t_hull + p.g_sh + t_sh / 2
        nonRotShield(R_c + r_mid, 4 * Math.PI ** 2 * R_c * r_mid)
      }
      if (p.f_t > 0) tubeTies(p.a, 2 * Math.PI * R_c, '管')
      // ハブのスポーク：輪の遠心力（壁を含むすべての回る質量）の f_s を N_hub 本で受ける
      if (fs > 0) {
        if (!(p.N_hub > 0)) return { warnings, errors: [{ code: 'range', keys: ['N_hub'] }] }
        const sumAll = masses.filter((m) => m.rotating).reduce((s2, m) => s2 + m.mass, 0) * R_c + floors.reduce((s2, f) => s2 + f.m * f.area * f.r, 0) + M_air * R_c
        const F = (fs * w2 * sumAll) / p.N_hub
        const m = spoke(F, p.r_hub, R_c - p.a)
        if (!m) return { warnings, errors }
        addMember('ハブのスポーク', Math.round(p.N_hub), m, R_c - p.a - p.r_hub)
        out.F_spoke = F
        warnings.push({ code: 'torus-bending', level: 'info' })
      }
      out.M_air = M_air
      out.R_c = R_c
      out.w = w
      airLo = R_c - a_i
      airHi = R_c + a_i
      pLo = R_c - p.a
      pHi = R_c + p.a
      extraRows.push({ label: '管の内側の壁', r: R_c - p.a }, { label: '管の外側の壁', r: R_c + p.a })
      selfMax = fs < 1 ? sa / p.rho / (1 - fs) : Infinity
      break
    }

    case 'sphere': {
      let R_s: number
      let zMax: number
      if (p.sphere_floor === 'band') {
        R_s = p.R_f
        // 球の内面は、赤道から離れるほど回転軸に近づき重力が弱くなる。帯の端で g_min
        if (!(p.g_min > 0 && p.g_min < p.g_f)) return { warnings, errors: [{ code: 'sphere-gmin', keys: ['g_min', 'g_f'] }] }
        const c = p.g_min / p.g_f
        const A_max = 4 * Math.PI * R_s ** 2 * Math.sqrt(1 - c ** 2)
        if (p.A_f > A_max) return { warnings, errors: [{ code: 'sphere-area', keys: ['A_f', 'g_min', 'R_f'], params: { A: A_max } }] }
        const s = p.A_f / (4 * Math.PI * R_s ** 2)
        const phi = Math.asin(s)
        zMax = R_s * s
        out.g_edge = p.g_f * Math.cos(phi)
        // 帯の床の、遠心力の平均の半径と、慣性モーメントの平均の半径の2乗
        floors[0] = { label: '基準の床（赤道）', r: (R_s * (phi + s * Math.cos(phi))) / (2 * s), area: p.A_f, m: p.m_f, r2: R_s ** 2 * (1 - s ** 2 / 3) }
        extraRows.push({ label: '帯の端', r: R_s * Math.cos(phi) })
      } else {
        const n = Math.round(p.n_lv)
        if (!(p.g_min > 0 && p.g_min < p.g_f)) return { warnings, errors: [{ code: 'sphere-gmin', keys: ['g_min', 'g_f'] }] }
        if (!(n >= 2)) return { warnings, errors: [{ code: 'range', keys: ['n_lv'] }] }
        const rk = Array.from({ length: n }, (_, k) => p.R_f * (1 - (k * (1 - p.g_min / p.g_f)) / (n - 1)))
        const areas = (Rs: number) => {
          const z = rk.map((r) => Math.sqrt(Math.max(0, Rs ** 2 - r ** 2)))
          return p.sphere_floor === 'terrace' ? rk.map((r, k) => 4 * Math.PI * r * (z[k] - (k ? z[k - 1] : 0))) : rk.map((r, k) => 4 * Math.PI * r * z[k])
        }
        const total = (Rs: number) => areas(Rs).reduce((s, x) => s + x, 0)
        // 球の半径は基準の床の半径より小さくできないので、床面積には下限がある
        if (total(p.R_f) > p.A_f) {
          return { warnings, errors: [{ code: 'sphere-small', keys: ['A_f', 'R_f', 'g_min'], params: { A: total(p.R_f), r: rk[n - 1], L: 2 * Math.sqrt(p.R_f ** 2 - rk[n - 1] ** 2) } }] }
        }
        R_s = solveIncreasing(total, p.A_f, p.R_f)
        const A = areas(R_s)
        const name = p.sphere_floor === 'terrace' ? '段' : '層'
        floors.length = 0
        rk.forEach((r, k) => floors.push({ label: k ? `${name} ${k + 1}` : `基準の床（${name} 1）`, r, area: A[k], m: k ? p.m_deck : p.m_f }))
        zMax = Math.sqrt(R_s ** 2 - rk[n - 1] ** 2)
      }
      const R_h = R_s + tsr
      const r_sh = R_s + tsr / 2
      vHull = omega * R_h
      const den = sa - (1 - fs) * p.rho * vHull ** 2
      if (den <= 0) {
        tooThick()
        return { warnings, errors }
      }
      // §4.10 床の遠心力を、床のある範囲の殻が受ける等価な圧力。スポークはこの分の f_s を受ける（気圧の分は殻が受ける）
      const A_band = 4 * Math.PI * R_h * zMax
      const q_eq = (w2 * floors.reduce((s, f) => s + f.m * f.area * f.r, 0)) / A_band + (p.shield_rot ? sigma_sh * w2 * r_sh * (r_sh / R_h) : 0)
      let n_r = 0
      let s_zr = 2 * zMax
      if (fs > 0) {
        n_r = Math.max(2, Math.round((2 * zMax) / p.s_z) + 1)
        s_zr = (2 * zMax) / (n_r - 1)
      }
      const Ps = P(R_h)
      t_hull = Math.max(((Ps * R_h) / 2 + (1 - fs) * q_eq * R_h) / den, ((Ps * R_h) / 2 + (fs * q_eq * s_zr) / Math.SQRT2) / sa)
      R_hull = R_h
      A_hull = 4 * Math.PI * R_h ** 2
      m_hull = p.rho * t_hull
      const M_wall = m_hull * A_hull
      push('外壁（球の殻）', M_wall, true)
      inertia.push({ z: (2 / 3) * M_wall * R_h ** 2, x: 0 })
      V_air = (4 / 3) * Math.PI * R_s ** 3
      const M_air = rho_air * V_air
      inertia.push({ z: 0.4 * M_air * R_s ** 2, x: 0 })
      if (p.shield_rot) {
        A_shield = 4 * Math.PI * r_sh ** 2
        push('遮蔽（自転させる）', sigma_sh * A_shield, true)
        inertia.push({ z: (2 / 3) * sigma_sh * A_shield * r_sh ** 2, x: 0 })
        rOuter = R_h + t_hull
      } else {
        const r_mid = R_h + t_hull + p.g_sh + t_sh / 2
        nonRotShield(r_mid, 4 * Math.PI * r_mid ** 2)
      }
      // スポークとリング：床のある範囲（軸方向に ±zMax）に列を並べる。長さは保守的に殻の半径まで
      if (fs > 0) {
        const w_r = fs * q_eq * s_zr
        const s_th = (2 * Math.PI * R_h) / p.N_th
        if (!ring((w_r * s_th) / Math.SQRT2, R_h, n_r, 'スポークの列のリング')) return { warnings, errors }
        const F = w_r * s_th
        const m = spoke(F, p.r_hub, R_h)
        if (!m) return { warnings, errors }
        addMember('スポーク', Math.round(p.N_th) * n_r, m, R_h - p.r_hub)
        const sigma_theta = ((Ps * R_h) / 2 + (1 - fs) * (q_eq * R_h + p.rho * t_hull * vHull ** 2)) / t_hull
        out.dl_spoke = (R_h * sigma_theta) / p.E_h - m.delta
        out.F_spoke = F
        out.n_rows = n_r
        out.s_zr = s_zr
      }
      out.M_air = M_air
      out.R_s = R_s
      airHi = R_s
      pHi = R_h
      selfMax = fs < 1 ? sa / p.rho / (1 - fs) : Infinity
      break
    }

    case 'dumbbell': {
      const a_i = p.a_m - tsr
      if (!(a_i > 0)) return { warnings, errors: [{ code: 'tube-shield', keys: ['a_m', 'sigma_sh', 'rho_sh'], params: { t: tsr } }] }
      if (!(p.w_m > 0) || p.w_m >= 2 * a_i) return { warnings, errors: [{ code: 'dumbbell-wide', keys: ['a_m', 'w_m'], params: { w: p.w_m, d: 2 * a_i } }] }
      const d = Math.sqrt(a_i ** 2 - p.w_m ** 2 / 4)
      const R_cm = p.R_f - d
      if (R_cm - p.a_m <= 0) return { warnings, errors: [{ code: 'dumbbell-axis', keys: ['a_m', 'R_f'] }] }
      const L_m = p.A_f / (2 * p.w_m)
      if (!decks(a_i, d, () => 2 * L_m)) return { warnings, errors }
      const Pw = P(R_cm + p.a_m)
      Pw0 = Pw
      if (p.f_t > 0) for (const k of ['N_t', 's_t'] as const) if (!(p[k] > 0)) return { warnings, errors: [{ code: 'range', keys: [k] }] }
      // §4.11 モジュールの壁（円周方向は引っ張り材が f_t を受ける）と、両端の半球
      t_hull = Math.max(((1 - p.f_t) * Pw * p.a_m) / sa, Math.max((Pw * p.a_m) / 2, p.f_t > 0 ? (p.f_t * Pw * p.s_t) / Math.SQRT2 : 0) / sa)
      const t_end = (Pw * p.a_m) / 2 / sa
      R_hull = p.a_m
      const A_side = 2 * 2 * Math.PI * p.a_m * L_m
      const A_end = 2 * 4 * Math.PI * p.a_m ** 2
      A_hull = A_side + A_end
      m_hull = p.rho * t_hull
      const M_wall = m_hull * A_side + p.rho * t_end * A_end
      push('モジュールの壁', M_wall, true)
      V_air = 2 * (Math.PI * a_i ** 2 * L_m + (4 / 3) * Math.PI * a_i ** 3)
      const M_air = rho_air * V_air
      const r_m = p.a_m - tsr / 2
      A_shield = 2 * (2 * Math.PI * r_m * L_m + 4 * Math.PI * r_m ** 2)
      const M_shr = sigma_sh * A_shield
      push('遮蔽（自転させる）', M_shr, true)
      inertia.push({ z: (M_wall + M_air + M_shr) * R_cm ** 2, x: 0 })
      if (p.f_t > 0) {
        tubeTies(p.a_m, 2 * L_m, 'モジュール')
        for (const m of members) inertia.push({ z: m.mass * m.count * R_cm ** 2, x: 0 })
      }
      // テザー：モジュール1つ（テザーを除く）の遠心力を n_teth 本で受ける。ハブからモジュールの上の壁まで
      const M_mod = (masses.reduce((s2, m) => s2 + m.mass, 0) + M_air + floors.reduce((s2, f) => s2 + f.m * f.area, 0)) / 2
      out.F_tether = M_mod * w2 * R_cm
      if (!(p.n_teth > 0)) return { warnings, errors: [{ code: 'range', keys: ['n_teth'] }] }
      const F = out.F_tether / p.n_teth
      const mt = spoke(F, p.r_hub, R_cm - p.a_m)
      if (!mt) return { warnings, errors }
      addMember('テザー', 2 * Math.round(p.n_teth), mt, R_cm - p.a_m - p.r_hub)
      out.F_spoke = F
      out.M_air = M_air
      out.L_m = L_m
      out.g_end = (p.g_f * Math.hypot(p.R_f, L_m / 2)) / p.R_f
      out.tilt = Math.atan(L_m / 2 / p.R_f)
      if (out.tilt > (5 * Math.PI) / 180) warnings.push({ code: 'tilt', keys: ['A_f', 'w_m'], params: { deg: (out.tilt * 180) / Math.PI } })
      vHull = omega * R_cm
      rOuter = R_cm + p.a_m + t_hull
      airLo = R_cm - a_i
      airHi = R_cm + a_i
      pLo = R_cm - p.a_m
      pHi = R_cm + p.a_m
      extraRows.push({ label: 'モジュールの上の壁', r: R_cm - p.a_m }, { label: 'モジュールの下の壁', r: R_cm + p.a_m })
      selfMax = Infinity
      break
    }
  }

  // 床に載るもの
  const M_floor = floors[0].m * floors[0].area
  const M_decks = floors.slice(1).reduce((s, f) => s + f.m * f.area, 0)
  push('床に載るもの（基準の床）', M_floor, true)
  if (floors.length > 1) push(p.shape === 'sphere' ? '床に載るもの（ほかの段・層）' : '上の階に載るもの', M_decks, true)
  push('空気', out.M_air!, true)
  for (const f of floors) {
    const r2 = f.r2 ?? f.r ** 2
    if (p.shape !== 'cylinder' || f !== floors[0]) inertia.push({ z: f.m * f.area * r2, x: 0 })
  }

  // §4.18 回転のエネルギー
  const I = inertia.reduce((s, c) => s + c.z, 0)
  const M_total = masses.reduce((s, m) => s + m.mass, 0)
  const M_rot = masses.filter((m) => m.rotating).reduce((s, m) => s + m.mass, 0)

  // §4.13 快適さ
  const grad = p.h_p / p.R_f
  const coriolis = (2 * p.v_rel) / v
  const omegaMax = (p.n_max * 2 * Math.PI) / 60
  if (n_rpm > p.n_max) warnings.push({ code: 'rpm', keys: ['n_max', 'R_f', 'g_f'], params: { n: n_rpm } })
  if (coriolis > p.k_cor) warnings.push({ code: 'coriolis', keys: ['k_cor', 'v_rel'], params: { k: coriolis * 100 } })
  if (grad > p.k_grad) warnings.push({ code: 'gradient', keys: ['k_grad', 'h_p'], params: { k: grad * 100 } })
  let I_ratio: number | undefined
  if (p.shape === 'cylinder') {
    const Ix = inertia.reduce((s, c) => s + c.x, 0)
    I_ratio = I / Ix
    if (I_ratio < 1.2) warnings.push({ code: 'stability', level: 'info', params: { k: I_ratio } })
  }

  // §4.1 高さの表
  const rowsAt: { label: string; r: number }[] = []
  const axisInside = p.shape === 'cylinder' || p.shape === 'sphere'
  rowsAt.push({ label: '中心の軸', r: 0 })
  if (axisInside && p.r_core > 0 && p.r_core < p.R_f) rowsAt.push({ label: '中心付近の設備', r: p.r_core })
  if (p.h_bld > 0 && p.R_f - p.h_bld > airLo) rowsAt.push({ label: '建物の上', r: p.R_f - p.h_bld })
  for (const f of floors.slice(1)) rowsAt.push({ label: f.label, r: f.r })
  rowsAt.push({ label: floors[0].label, r: p.R_f })
  if (axisInside) rowsAt.push({ label: '外壁', r: R_hull! })
  rowsAt.push(...extraRows)
  rowsAt.sort((x, y) => x.r - y.r)
  const heights: HeightRow[] = rowsAt.map(({ label, r }) => ({
    label,
    r,
    g: w2 * r,
    P: r >= pLo - 1e-9 && r <= pHi! + 1e-9 ? P(r) : undefined,
    v: omega * r,
    drift: r < p.R_f - 1e-9 ? dropDrift(p.R_f, p.R_f - r) : undefined,
  }))

  // グラフ
  const N = 101
  const gx = Array.from({ length: N }, (_, i) => (rOuter! * i) / (N - 1))
  const px = Array.from({ length: N }, (_, i) => airLo + ((airHi - airLo) * i) / (N - 1))

  return {
    outputs: {
      ...out,
      omega,
      n_rpm,
      period: (2 * Math.PI) / omega,
      v,
      dg_dr: w2,
      grad,
      coriolis,
      R_min_rpm: p.g_f / omegaMax ** 2,
      v_min_cor: (2 * p.v_rel) / p.k_cor,
      I_ratio,
      M_mol: M,
      rho_air,
      p_O2: air.p_O2,
      f_O2: air.f_O2,
      x_O2,
      p_N2: air.p_N2,
      p_H2O: air.p_H2O,
      T_dew: air.p_H2O > 0 ? dewPoint(air.p_H2O) : undefined,
      P_axis: axisInside ? P(0) : undefined,
      floors,
      members,
      A_total: floors.reduce((s, f) => s + f.area, 0),
      V_air: V_air!,
      M_air: out.M_air!,
      R_hull: R_hull!,
      A_hull: A_hull!,
      t_hull: t_hull!,
      m_hull: m_hull!,
      v_max: Number.isFinite(selfMax!) ? Math.sqrt(selfMax!) : undefined,
      R_max: Number.isFinite(selfMax!) ? selfMax! / p.g_f : undefined,
      sigma_sh,
      t_sh,
      M_shield: sigma_sh * A_shield!,
      dose,
      A_shield: A_shield!,
      masses,
      M_total,
      M_rot,
      I,
      E_rot: 0.5 * I * w2,
      L_ang: I * omega,
      heights,
      g_profile: { r: gx, y: gx.map((r) => w2 * r) },
      P_profile: { r: px, y: px.map(P) },
    },
    warnings,
    errors,
  }
}

/** シリンダの側面（薄い殻）。横の軸は重心を通る */
function cylShell(M: number, R: number, L: number): Inertia {
  return { z: M * R ** 2, x: M * (R ** 2 / 2 + L ** 2 / 12) }
}

/** 両端の半球の殻（合計の質量 M）。球の中心が軸方向に ±L/2 */
function hemiShells(M: number, R: number, L: number): Inertia {
  // 半球の殻の重心は球の中心から R/2。直径まわり 2/3 MR² を重心に移し、全体の重心へ移す
  return { z: (2 / 3) * M * R ** 2, x: M * ((2 / 3) * R ** 2 - R ** 2 / 4 + (L / 2 + R / 2) ** 2) }
}

/** 両端の平らな円板（合計の質量 M）。軸方向に ±L/2 */
function diskPair(M: number, R: number, L: number): Inertia {
  return { z: 0.5 * M * R ** 2, x: M * (R ** 2 / 4 + (L / 2) ** 2) }
}

/** シリンダと両端の半球（hemi のとき）の中の空気（中身の詰まった円柱と半球） */
function airCylinder(rho: number, R: number, L: number, hemi = true): Inertia {
  const Mc = rho * Math.PI * R ** 2 * L
  const Mh = hemi ? rho * (4 / 3) * Math.PI * R ** 3 : 0
  const zc = (3 * R) / 8
  return {
    z: 0.5 * Mc * R ** 2 + 0.4 * Mh * R ** 2,
    x: Mc * (R ** 2 / 4 + L ** 2 / 12) + Mh * (0.4 * R ** 2 - zc ** 2 + (L / 2 + zc) ** 2),
  }
}
