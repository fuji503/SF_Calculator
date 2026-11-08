import type { Message } from '../types.ts'
import { LOCATIONS, type DoseTable, type Shape, type ShieldMat, type SphereFloor } from './data.ts'

/** スペースコロニー設計の計算（仕様書1(新規) §4。段階1：§4.1〜4.4、4.5（スポークなし）、4.7（半球）、4.9〜4.13、4.18） */

export const G0 = 9.80665
const R_GAS = 8.314462618
const M_O2 = 31.998e-3
const M_N2 = 28.014e-3

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
  f_O2: number
  T_in: number
  sigma_u: number
  rho: number
  SF: number
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
  v_max: number
  R_max: number
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

export interface ColonyResult {
  outputs?: ColonyOutputs
  warnings: Message[]
  errors: Message[]
}

// ---------------------------------------------------------------------------
// 部品

/** 平均の分子量 [kg/mol]（酸素と窒素） */
export function molarMass(fO2: number): number {
  return fO2 * M_O2 + (1 - fO2) * M_N2
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

/** 慣性モーメントの部品（回転軸まわり I_z と、重心を通る横の軸まわり I_x） */
interface Inertia {
  z: number
  x: number
}

// ---------------------------------------------------------------------------

export function computeColony(p: ColonyInputs): ColonyResult {
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
  const M = molarMass(p.f_O2)
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
        errors.push({ code: 'deck-out', keys: ['n_deck', 'h_deck'] })
        return false
      }
      floors.push({ label: `上の階 ${k}`, r, area: length(r) * 2 * Math.sqrt(a_i ** 2 - dk ** 2), m: p.m_deck })
    }
    return true
  }

  const tooThick = () => errors.push({ code: 'hull-limit', keys: ['sigma_u', 'rho', 'SF', 'R_f'] })
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
      const den = sa - p.rho * vHull ** 2
      if (den <= 0) {
        tooThick()
        return { warnings, errors }
      }
      // §4.4 外向きの荷重：気圧、床に載るもの（陸の帯の値で保守的に）、自転させる遮蔽
      const p_ext = P(R_h) + p.m_f * w2 * p.R_f * (p.R_f / R_h) + (p.shield_rot ? sigma_sh * w2 * r_sh * (r_sh / R_h) : 0)
      const t_theta = (p_ext * R_h) / den
      const t_z = (P(R_h) * R_h) / 2 / sa
      t_hull = Math.max(t_theta, t_z)
      const t_cap = ((P(R_h) * R_h) / 2) / den
      const A_side = 2 * Math.PI * R_h * L
      const A_cap = 4 * Math.PI * R_h ** 2
      m_hull = p.rho * t_hull
      const M_side = m_hull * A_side
      const M_cap = p.rho * t_cap * A_cap
      push('外壁（側面）', M_side, true)
      push('端のふた（半球）', M_cap, true)
      inertia.push(cylShell(M_side, R_h, L), hemiShells(M_cap, R_h, L))
      R_hull = R_h
      A_hull = A_side + A_cap
      V_air = Math.PI * p.R_f ** 2 * L + (4 / 3) * Math.PI * p.R_f ** 3
      const M_air = rho_air * V_air
      inertia.push(airCylinder(rho_air, p.R_f, L))
      out.M_air = M_air
      if (p.shield_rot) {
        const As = 2 * Math.PI * r_sh * L
        const Ac = 4 * Math.PI * r_sh ** 2
        A_shield = As + Ac
        push('遮蔽（自転させる）', sigma_sh * A_shield, true)
        inertia.push(cylShell(sigma_sh * As, r_sh, L), hemiShells(sigma_sh * Ac, r_sh, L))
        rOuter = R_h + t_hull
      } else {
        const r_mid = R_h + t_hull + p.g_sh + t_sh / 2
        nonRotShield(r_mid, 2 * Math.PI * r_mid * L + 4 * Math.PI * r_mid ** 2)
      }
      const M_fl = p.m_f * p.A_f
      inertia.push({ z: M_fl * p.R_f ** 2, x: M_fl * (p.R_f ** 2 / 2 + L ** 2 / 12) })
      selfMax = sa / p.rho
      out.L = L
      out.t_cap = t_cap
      pHi = R_h
      break
    }

    case 'torus': {
      const a_i = p.a - tsr
      const w = p.A_f / (2 * Math.PI * p.R_f)
      if (!(a_i > 0) || w >= 2 * a_i) return { warnings, errors: [{ code: 'too-wide', keys: ['a', 'A_f'] }] }
      const d = Math.sqrt(a_i ** 2 - w ** 2 / 4)
      const R_c = p.R_f - d
      if (R_c - p.a <= 0) return { warnings, errors: [{ code: 'torus-axis', keys: ['a', 'R_f'] }] }
      if (!decks(a_i, d, (r) => 2 * Math.PI * r)) return { warnings, errors }
      V_air = 2 * Math.PI ** 2 * R_c * a_i ** 2
      const M_air = rho_air * V_air
      const r_m = p.a - tsr / 2
      const M_shr = p.shield_rot ? sigma_sh * 4 * Math.PI ** 2 * R_c * r_m : 0
      // §4.9 輪の遠心力（管の壁以外）
      const sumMR = floors.reduce((s, f) => s + f.m * f.area * f.r, 0) + M_shr * R_c + M_air * R_c
      const Pw = P(R_c + p.a)
      vHull = omega * R_c
      const den = sa - p.rho * vHull ** 2
      if (den <= 0) {
        tooThick()
        return { warnings, errors }
      }
      const t_phi = (Pw * p.a * (2 * R_c - p.a)) / (2 * (R_c - p.a)) / sa
      const t_theta = ((Pw * p.a) / 2 + (w2 * sumMR) / (4 * Math.PI ** 2 * p.a)) / den
      t_hull = Math.max(t_phi, t_theta)
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
      out.M_air = M_air
      out.R_c = R_c
      out.w = w
      airLo = R_c - a_i
      airHi = R_c + a_i
      pLo = R_c - p.a
      pHi = R_c + p.a
      extraRows.push({ label: '管の内側の壁', r: R_c - p.a }, { label: '管の外側の壁', r: R_c + p.a })
      selfMax = sa / p.rho
      break
    }

    case 'sphere': {
      let R_s: number
      let zMax: number
      if (p.sphere_floor === 'band') {
        R_s = p.R_f
        const c = Math.min(1, p.g_min / p.g_f)
        const A_max = 4 * Math.PI * R_s ** 2 * Math.sqrt(1 - c ** 2)
        if (p.A_f > A_max) return { warnings, errors: [{ code: 'sphere-area', keys: ['A_f', 'g_min'] }] }
        const s = p.A_f / (4 * Math.PI * R_s ** 2)
        const phi = Math.asin(s)
        zMax = R_s * s
        out.g_edge = p.g_f * Math.cos(phi)
        // 帯の床の、遠心力の平均の半径と、慣性モーメントの平均の半径の2乗
        floors[0] = { label: '基準の床（赤道）', r: (R_s * (phi + s * Math.cos(phi))) / (2 * s), area: p.A_f, m: p.m_f, r2: R_s ** 2 * (1 - s ** 2 / 3) }
        extraRows.push({ label: '帯の端', r: R_s * Math.cos(phi) })
      } else {
        const n = Math.round(p.n_lv)
        if (!(n >= 2) || !(p.g_min > 0 && p.g_min < p.g_f)) return { warnings, errors: [{ code: 'range', keys: ['n_lv', 'g_min'] }] }
        const rk = Array.from({ length: n }, (_, k) => p.R_f * (1 - (k * (1 - p.g_min / p.g_f)) / (n - 1)))
        const areas = (Rs: number) => {
          const z = rk.map((r) => Math.sqrt(Math.max(0, Rs ** 2 - r ** 2)))
          return p.sphere_floor === 'terrace' ? rk.map((r, k) => 4 * Math.PI * r * (z[k] - (k ? z[k - 1] : 0))) : rk.map((r, k) => 4 * Math.PI * r * z[k])
        }
        const total = (Rs: number) => areas(Rs).reduce((s, x) => s + x, 0)
        // 球の半径は基準の床の半径より小さくできないので、床面積には下限がある
        if (total(p.R_f) > p.A_f) return { warnings, errors: [{ code: 'sphere-small', keys: ['A_f', 'n_lv', 'g_min'], params: { A: total(p.R_f) } }] }
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
      const den = sa - p.rho * vHull ** 2
      if (den <= 0) {
        tooThick()
        return { warnings, errors }
      }
      // §4.10 床の遠心力を、床のある範囲の殻が受ける等価な圧力
      const A_band = 4 * Math.PI * R_h * zMax
      const q_eq = (w2 * floors.reduce((s, f) => s + f.m * f.area * f.r, 0)) / A_band + (p.shield_rot ? sigma_sh * w2 * r_sh * (r_sh / R_h) : 0)
      t_hull = ((P(R_h) * R_h) / 2 + q_eq * R_h) / den
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
      out.M_air = M_air
      out.R_s = R_s
      airHi = R_s
      pHi = R_h
      selfMax = sa / p.rho
      break
    }

    case 'dumbbell': {
      const a_i = p.a_m - tsr
      if (!(a_i > 0) || !(p.w_m > 0) || p.w_m >= 2 * a_i) return { warnings, errors: [{ code: 'too-wide', keys: ['a_m', 'w_m'] }] }
      const d = Math.sqrt(a_i ** 2 - p.w_m ** 2 / 4)
      const R_cm = p.R_f - d
      if (R_cm - p.a_m <= 0) return { warnings, errors: [{ code: 'dumbbell-axis', keys: ['a_m', 'R_f'] }] }
      const L_m = p.A_f / (2 * p.w_m)
      if (!decks(a_i, d, () => 2 * L_m)) return { warnings, errors }
      const Pw = P(R_cm + p.a_m)
      // §4.11 モジュールの壁（円周方向）と、両端の半球
      t_hull = (Pw * p.a_m) / sa
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
      const M_mod = (M_wall + M_air + M_shr + floors.reduce((s, f) => s + f.m * f.area, 0)) / 2
      out.F_tether = M_mod * w2 * R_cm
      inertia.push({ z: (M_wall + M_air + M_shr) * R_cm ** 2, x: 0 })
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
      P_axis: axisInside ? P(0) : undefined,
      floors,
      A_total: floors.reduce((s, f) => s + f.area, 0),
      V_air: V_air!,
      M_air: out.M_air!,
      R_hull: R_hull!,
      A_hull: A_hull!,
      t_hull: t_hull!,
      m_hull: m_hull!,
      v_max: Math.sqrt(selfMax!),
      R_max: selfMax! / p.g_f,
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

/** シリンダと両端の半球の中の空気（中身の詰まった円柱と半球） */
function airCylinder(rho: number, R: number, L: number): Inertia {
  const Mc = rho * Math.PI * R ** 2 * L
  const Mh = rho * (4 / 3) * Math.PI * R ** 3
  const zc = (3 * R) / 8
  return {
    z: 0.5 * Mc * R ** 2 + 0.4 * Mh * R ** 2,
    x: Mc * (R ** 2 / 4 + L ** 2 / 12) + Mh * (0.4 * R ** 2 - zc ** 2 + (L / 2 + zc) ** 2),
  }
}
