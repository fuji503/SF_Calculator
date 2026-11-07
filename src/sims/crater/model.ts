/**
 * クレータ造成モジュールの計算（クレータ造成モジュール仕様書1(新規) §4）。
 * UI に依存しない純粋関数。単位は SI（出力の W はジュール）。
 */
import type { Message } from '../types.ts'
import {
  CLASSES,
  EJECTA,
  FC_CURVE,
  G_EARTH,
  HUGONIOT,
  IGNITION,
  IMPACTORS,
  KT_TNT,
  N1,
  NU,
  NUCLEAR_CURVES,
  P_EARTH,
  SIZE_EXPONENTS,
  type ClassConstants,
  type GroundClass,
  type HugoniotId,
  type ImpactorId,
} from './data.ts'

export type Source = 'impact' | 'nuclear'

export interface CraterInputs {
  source: Source
  /** 目標のクレータから逆算する */
  solve: boolean
  /** 逆算で、目標をクレータの深さにする（false は直径） */
  goal_by_depth: boolean
  D_goal: number
  /** 目標のクレータの深さ（縁から底まで） [m] */
  d_goal: number
  /** 天体の ID（'custom' を含む）。熱放射（地球のみ）と警告に使う */
  body: string
  g: number
  R_p: number
  rho_a0: number
  H: number
  P0: number
  c0: number
  D_c: number
  /** 選んだ地盤のプリセットの ID（警告に使う） */
  ground: string
  ground_class: GroundClass
  rho_t: number
  Y: number
  t_reg: number
  impactor: ImpactorId
  delta: number
  /** true なら質量で入力する */
  by_mass: boolean
  L0: number
  m_i: number
  v0: number
  /** 衝突の角度（水平から） [rad] */
  theta: number
  /** 出力 [J] */
  W: number
  /** true なら、直径が最大になる深さで起爆する */
  dob_optimal: boolean
  z_b: number
  t_bury: number
  /** 飛来物の大きさ [m]（一覧の行の順） */
  frags: number[]
  rho_f: number
  q: number
  p1: number
  p2: number
  ignition: string
}

export interface FragRange {
  size: number
  /** 中心からの距離 [m]。天体から出ていくときは Infinity */
  range: number
  /** いちばん大きい行を1個としたときの個数（平均、少ない側、多い側の指数） */
  ratio: [number, number, number]
}

export interface CraterOutputs {
  E: number
  v_esc: number
  L0: number
  m_i: number
  W: number
  z_b: number
  // 大気への突入
  z_star?: number
  z_burst?: number
  airburst: boolean
  v_i?: number
  L_ground?: number
  // クレータ
  crater: boolean
  D_rim: number
  d_rim: number
  h_rim: number
  D_tc?: number
  d_tc?: number
  V: number
  V_ej: number
  regime?: 'gravity' | 'strength'
  // 衝突体
  P_peak?: number
  impactor_state?: string
  V_melt?: number
  // 核爆発
  lam?: number
  lam_opt?: number
  Fc?: number
  R_B?: number
  // 噴出物
  r_bury: number
  thickness?: { r: number[]; t: number[] }
  v_ej_max?: number
  r_ej_max?: number
  frags: FragRange[]
  M_orbit?: number
  M_escape?: number
  // 地震、爆風、熱放射
  M_seis?: number
  seis_kind: 'M' | 'mb'
  r_mmi?: [number, number, number]
  r_p1?: number
  r_p2?: number
  r_thermal?: number
}

export interface CraterResult {
  outputs: CraterOutputs | null
  warnings: Message[]
  errors: Message[]
}

const DEG = Math.PI / 180
const CD_ENTRY = 2
const CD_FRAG = 1

// ---------------------------------------------------------------------------
// 部品

function interp(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]) return ys[0]
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1])
  }
  return ys[ys.length - 1]
}

/** 単調な関数 f(x) = 0 の根（[lo, hi] で符号が変わること） */
function bisect(f: (x: number) => number, lo: number, hi: number, geometric = false, n = 200): number {
  let flo = f(lo)
  for (let i = 0; i < n; i++) {
    const mid = geometric ? Math.sqrt(lo * hi) : (lo + hi) / 2
    const fm = f(mid)
    if (fm === 0) return mid
    if (fm > 0 === flo > 0) {
      lo = mid
      flo = fm
    } else hi = mid
  }
  return geometric ? Math.sqrt(lo * hi) : (lo + hi) / 2
}

// ---------------------------------------------------------------------------
// §4.1 大気への突入（Collins 2005）

export interface EntryResult {
  intact: boolean
  airburst: boolean
  z_star?: number
  z_burst?: number
  v_i: number
  L_ground: number
}

export function atmosphericEntry(L0: number, delta: number, v0: number, theta: number, rho0: number, H: number, g: number): EntryResult {
  const s = Math.sin(theta)
  const rho = (z: number) => rho0 * Math.exp(-z / H)
  const vIntact = (z: number) => v0 * Math.exp((-3 * rho(z) * CD_ENTRY * H) / (4 * delta * L0 * s))
  const terminal = (L: number) => Math.sqrt((4 * delta * L * g) / (3 * CD_ENTRY * rho0))
  const Yi = 10 ** (2.107 + 0.0624 * Math.sqrt(Math.min(delta, 8000)))
  const If = (4.07 * CD_ENTRY * H * Yi) / (delta * L0 * v0 ** 2 * s)
  const intact = (): EntryResult => ({ intact: true, airburst: false, v_i: Math.min(v0, Math.max(vIntact(0), terminal(L0))), L_ground: L0 })
  if (If >= 1) return intact()
  const z_star = -H * (Math.log(Yi / (rho0 * v0 ** 2)) + 1.308 - 0.314 * If - 1.303 * Math.sqrt(1 - If))
  if (!(z_star > 0)) return intact()
  const l = L0 * s * Math.sqrt(delta / (CD_ENTRY * rho(z_star)))
  const L = (z: number) => L0 * Math.sqrt(1 + (2 * H / l) ** 2 * (Math.exp((z_star - z) / (2 * H)) - 1) ** 2)
  const z_burst = z_star - 2 * H * Math.log(1 + (l / (2 * H)) * Math.sqrt(7 ** 2 - 1))
  if (z_burst > 0) {
    return { intact: false, airburst: true, z_star, z_burst, v_i: 0, L_ground: L(z_burst) }
  }
  // 砕けた破片の群れの地表での速さ（式17。積分はシンプソン則）
  const n = 400
  const h = z_star / n
  let I = 0
  for (let i = 0; i <= n; i++) {
    const z = i * h
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2
    I += w * Math.exp((z_star - z) / H) * L(z) ** 2
  }
  I *= h / 3
  const v = vIntact(z_star) * Math.exp((-0.75 * CD_ENTRY * rho(z_star) * I) / (delta * L0 ** 3 * s))
  return { intact: false, airburst: false, z_star, z_burst, v_i: Math.min(v0, Math.max(v, terminal(L0 / 2))), L_ground: L(0) }
}

// ---------------------------------------------------------------------------
// §4.2 Holsapple の π スケーリング

export interface ImpactCrater {
  V: number
  R: number
  d_t: number
  D_rim: number
  h_rim: number
  d_rim: number
  regime: 'gravity' | 'strength'
}

export function impactCrater(c: ClassConstants, rho_t: number, Y: number, delta: number, a: number, U: number, g: number): ImpactCrater {
  const m = (4 / 3) * Math.PI * delta * a ** 3
  const r = rho_t / delta
  const tg = ((g * a) / U ** 2) * r ** ((6 * NU - 2 - c.mu) / (3 * c.mu))
  const ts = (c.K2 * (Y / (rho_t * U ** 2)) * r ** ((6 * NU - 2) / (3 * c.mu))) ** ((2 + c.mu) / 2)
  const piV = c.K1 * (tg + ts) ** ((-3 * c.mu) / (2 + c.mu))
  const V = (piV * m) / rho_t
  const R = c.Kr * V ** (1 / 3)
  const d_t = c.Kd * V ** (1 / 3)
  const D_rim = 1.3 * 2 * R
  const h_rim = 0.036 * D_rim
  return { V, R, d_t, D_rim, h_rim, d_rim: Math.min(0.2 * D_rim, d_t + h_rim), regime: tg >= ts ? 'gravity' : 'strength' }
}

// ---------------------------------------------------------------------------
// §4.3 核爆発のクレータ

export function gravityFactor(g: number, mu: number): number {
  return (g / G_EARTH) ** (-mu / (2 + mu))
}

export interface NuclearCrater {
  lam: number
  lam_opt: number
  z_opt: number
  R_a: number
  d_a: number
  /** 曲線の最大の換算半径 */
  r_max: number
  /** 直径が最大になる深さでの、縁から底までの換算深さ（d_a + 縁の高さ 0.1 R_a） */
  q_rim_opt: number
}

export function nuclearCrater(curve: 'soil' | 'rock', W_kt: number, z: number | null, f: number): NuclearCrater {
  const pts = NUCLEAR_CURVES[curve]
  const lams = pts.map((p) => p.lam)
  const top = pts.reduce((a, b) => (b.r > a.r ? b : a))
  const s = W_kt ** (1 / 3.4)
  const z_opt = top.lam * s * f
  const lam = (z ?? z_opt) / (s * f)
  return {
    lam,
    lam_opt: top.lam,
    z_opt,
    R_a: interp(lams, pts.map((p) => p.r), lam) * s * f,
    d_a: interp(lams, pts.map((p) => p.q), lam) * s * f,
    r_max: top.r,
    q_rim_opt: top.q + 0.1 * top.r,
  }
}

export function ventedFraction(lam: number): number {
  return Math.exp(interp(FC_CURVE.map((p) => p.lam), FC_CURVE.map((p) => Math.log(p.fc)), lam))
}

// ---------------------------------------------------------------------------
// §4.4 衝突の最大の圧力（インピーダンス整合）

export function peakPressure(impactor: HugoniotId, target: HugoniotId, U: number): number {
  const i = HUGONIOT[impactor]
  const t = HUGONIOT[target]
  const ut = bisect((u) => t.rho * (t.C + t.s * u) * u - i.rho * (i.C + i.s * (U - u)) * (U - u), 0, U)
  return t.rho * (t.C + t.s * ut) * ut
}

function impactorState(id: ImpactorId, P: number): string | undefined {
  const th = IMPACTORS[id].thresholds
  if (!th) return undefined
  if (P >= th[2]) return '一部が蒸発する'
  if (P >= th[1]) return 'すべて溶ける'
  if (P >= th[0]) return '一部が溶ける（前の方）'
  return '固体のまま砕ける'
}

// ---------------------------------------------------------------------------
// §4.7 噴出物の速さと届く距離

interface EjectaModel {
  v: (x: number) => number
  M: (x: number) => number
  x_min: number
  x_max: number
}

function ejectaModel(set: 'soil' | 'rock', regime: 'gravity' | 'strength', R: number, x_min: number, g: number, Y: number, rho_t: number): EjectaModel {
  const e = EJECTA[set][regime]
  const H = e.H * ((4 * Math.PI) / 3) ** (1 / 3)
  const vs = regime === 'gravity' ? e.C1 * H ** (-(2 + e.mu) / (2 * e.mu)) * Math.sqrt(g * R) : e.C1 * H ** (-1 / e.mu) * Math.sqrt(Y / rho_t)
  const x_max = e.n2 * R
  return {
    v: (x) => vs * (x / R) ** (-1 / e.mu) * Math.max(0, 1 - x / x_max) ** e.p,
    M: (x) => e.k * rho_t * Math.max(0, x ** 3 - x_min ** 3),
    x_min,
    x_max,
  }
}

/** 大気がないときの、45° で飛び出した噴出物の飛ぶ距離（天体の丸みを含む）。出ていくときは Infinity */
export function vacuumRange(v: number, g: number, R_p: number): number {
  const v2 = v * v
  if (v2 >= 2 * g * R_p) return Infinity
  return R_p * 2 * Math.atan(v2 / (2 * g * R_p - v2))
}

/** 大気があるときの飛ぶ距離（直径 s、密度 ρf の球、45°、平らな地面と一定の重力で数値積分） */
export function airRange(v: number, s: number, rho_f: number, g: number, rho0: number, H: number, R_p: number): number {
  const k = (3 * CD_FRAG) / (4 * rho_f * s)
  let x = 0
  let y = 0
  let vx = v * Math.SQRT1_2
  let vy = v * Math.SQRT1_2
  const dtMax = Math.max(1e-4, (2 * v * Math.SQRT1_2) / g / 2000)
  for (let i = 0; i < 400_000; i++) {
    const sp = Math.hypot(vx, vy)
    const drag = k * rho0 * Math.exp(-Math.max(0, y) / H) * sp
    const dt = Math.min(dtMax, 0.05 / Math.max(drag, 1e-12))
    // 半陰的な積分（抵抗で速さが反転しないように）
    vx = vx / (1 + drag * dt)
    vy = (vy - g * dt) / (1 + drag * dt)
    x += vx * dt
    y += vy * dt
    if (y < 0) return x
    if (x > Math.PI * R_p) return Infinity
  }
  return x
}

// ---------------------------------------------------------------------------
// §4.9 爆風（Collins 2005、1 kt での当てはめ）

function overpressure1kt(r1: number, zb1: number): number {
  const px = 75_000
  if (zb1 <= 0) {
    const rx = 290
    return ((px * rx) / (4 * r1)) * (1 + 3 * (rx / r1) ** 1.3)
  }
  const rm1 = zb1 < 550 ? (550 * zb1) / (1.2 * (550 - zb1)) : Infinity
  if (r1 < rm1) {
    const p0 = 3.14e11 * zb1 ** -2.6
    const beta = 34.87 * zb1 ** -1.73
    return p0 * Math.exp(-beta * r1)
  }
  const rx = 289 + 0.65 * zb1
  return ((px * rx) / (4 * r1)) * (1 + 3 * (rx / r1) ** 1.3)
}

/** 過圧が p_thr 以上になる、地上の最も遠い距離（ザックスの換算で気圧を補正） */
export function blastRange(E: number, zb: number, P0: number, p_thr: number): number {
  const E_kt = E / KT_TNT
  const kl = (P_EARTH / P0) ** (1 / 3) * E_kt ** (1 / 3)
  const kp = P0 / P_EARTH
  const p = (r: number) => kp * overpressure1kt(r / kl, zb / kl)
  // 外側へ順に調べて、基準を超える最も外側の点を探してから詰める（空中爆発では単調でないことがある）
  const rs = Array.from({ length: 401 }, (_, i) => kl * 10 ** (-1 + i * 0.02))
  let last = -1
  rs.forEach((r, i) => {
    if (p(r) >= p_thr) last = i
  })
  if (last < 0) return 0
  if (last === rs.length - 1) return rs[last]
  return bisect((x) => p(x) - p_thr, rs[last], rs[last + 1])
}

// ---------------------------------------------------------------------------
// 本体

export function computeCrater(p: CraterInputs): CraterResult {
  const errors: Message[] = []
  const warnings: Message[] = []
  const warn = (code: string, keys?: string[], params?: Message['params']) => warnings.push({ code, keys, params })
  const info = (code: string, keys?: string[], params?: Message['params']) => warnings.push({ code, keys, level: 'info', params })
  const impact = p.source === 'impact'
  const cls = CLASSES[p.ground_class]
  const hasAir = p.rho_a0 > 0 && p.P0 > 0

  // ---- 入力チェック
  const positive: (keyof CraterInputs)[] = ['g', 'R_p', 'rho_t', 't_bury', 'rho_f']
  if (hasAir) positive.push('H', 'c0')
  if (p.solve) positive.push(p.goal_by_depth ? 'd_goal' : 'D_goal')
  if (impact) {
    positive.push('delta', 'v0')
    if (!p.solve) positive.push(p.by_mass ? 'm_i' : 'L0')
  } else if (!p.solve) positive.push('W')
  for (const k of positive) if (!(Number(p[k]) > 0)) errors.push({ code: 'range', keys: [k] })
  for (const k of ['rho_a0', 'P0', 'Y', 't_reg', 'D_c'] as const) if (!(p[k] >= 0)) errors.push({ code: 'range', keys: [k] })
  if (impact && !(p.theta > 0 && p.theta <= Math.PI / 2)) errors.push({ code: 'range', keys: ['theta'] })
  if (!impact && !p.dob_optimal && !p.solve && !(p.z_b >= 0)) errors.push({ code: 'range', keys: ['z_b'] })
  if (!(p.q > 0 && p.q < 1)) errors.push({ code: 'range', keys: ['q'] })
  if (p.frags.length === 0 || p.frags.some((s) => !(s > 0))) errors.push({ code: 'range', keys: ['frags'] })
  if (hasAir && !(p.p1 > 0 && p.p2 > 0)) errors.push({ code: 'range', keys: ['p1', 'p2'] })
  if (errors.length > 0) return { outputs: null, warnings, errors }

  const v_esc = Math.sqrt(2 * p.g * p.R_p)

  // ---- 逆算（§4.12）
  let L0 = p.by_mass ? (6 * p.m_i / (Math.PI * p.delta)) ** (1 / 3) : p.L0
  let W = p.W
  const f_nuc = gravityFactor(p.g, cls.mu)
  if (p.solve) {
    const goal = p.goal_by_depth ? p.d_goal : p.D_goal
    const goalKey = p.goal_by_depth ? 'd_goal' : 'D_goal'
    if (impact) {
      // 直径と深さは、衝突体が大きいほど大きい（空中爆発する大きさでは 0）
      const size = (L: number) => {
        const c = impactPart(L).crater
        return c ? (p.goal_by_depth ? c.d_rim : c.D_rim) : 0
      }
      if (size(1e5) < goal) return { outputs: null, warnings, errors: [{ code: 'no-solution', keys: [goalKey] }] }
      L0 = bisect((L) => size(L) - goal, 1e-4, 1e5, true)
    } else {
      // 直径が最大になる深さでの直径・深さは、出力の 1/3.4 乗に比例する
      const top = nuclearCrater(cls.nuclear, 1, null, f_nuc)
      const perKt = (p.goal_by_depth ? top.q_rim_opt : 2 * top.r_max) * f_nuc
      W = (goal / perKt) ** 3.4 * KT_TNT
    }
  }
  const m_i = (Math.PI / 6) * p.delta * L0 ** 3

  /** 衝突の計算（大気への突入とクレータ）。逆算でも使う */
  function impactPart(L: number) {
    const entry = hasAir ? atmosphericEntry(L, p.delta, p.v0, p.theta, p.rho_a0, p.H, p.g) : null
    if (entry?.airburst) return { entry, crater: null as ImpactCrater | null, v_i: 0 }
    const v_i = entry ? entry.v_i : p.v0
    const crater = impactCrater(cls, p.rho_t, p.Y, p.delta, L / 2, v_i * Math.sin(p.theta), p.g)
    return { entry, crater, v_i }
  }

  const out: CraterOutputs = {
    E: 0,
    v_esc,
    L0,
    m_i,
    W,
    z_b: 0,
    airburst: false,
    crater: false,
    D_rim: 0,
    d_rim: 0,
    h_rim: 0,
    V: 0,
    V_ej: 0,
    r_bury: 0,
    frags: [],
    seis_kind: 'M',
  }

  // 噴出物の計算に使う値
  let R_ej = 0
  let x_min = 0
  let regime: 'gravity' | 'strength' = 'gravity'
  let blastZ = 0
  let blastE = 0
  let thermalEta = 0

  if (impact) {
    const r = impactPart(L0)
    out.E = 0.5 * m_i * p.v0 ** 2
    if (r.entry) {
      out.z_star = r.entry.z_star
      out.z_burst = r.entry.z_burst
      out.L_ground = r.entry.L_ground
    }
    if (p.v0 < v_esc * (1 - 1e-9)) info('below-escape', ['v0'], { v: v_esc / 1000 })
    if (r.entry?.airburst) {
      out.airburst = true
      info('airburst', ['z_burst'], { z: r.entry.z_burst! / 1000 })
      blastZ = r.entry.z_burst!
      blastE = out.E
    } else if (r.crater) {
      const c = r.crater
      out.v_i = r.v_i
      out.crater = true
      out.D_rim = c.D_rim
      out.d_rim = c.d_rim
      out.h_rim = c.h_rim
      out.D_tc = 2 * c.R
      out.d_tc = c.d_t
      out.V = c.V
      out.V_ej = 0.8 * c.V
      out.regime = c.regime
      out.E = 0.5 * m_i * r.v_i ** 2
      regime = c.regime
      R_ej = c.R
      x_min = N1 * (L0 / 2)
      blastE = out.E
      // 衝突体（§4.4、§4.5）
      const U = r.v_i * Math.sin(p.theta)
      out.P_peak = peakPressure(IMPACTORS[p.impactor].hugoniot, cls.hugoniot, U)
      out.impactor_state = impactorState(p.impactor, out.P_peak)
      if (r.v_i >= 12e3) out.V_melt = 8.9e-12 * out.E * Math.sin(p.theta) * (p.ground_class === 'ice' ? 10 : 1)
      else {
        out.V_melt = 0
        info('no-melt', ['V_melt'])
      }
      if (r.v_i >= 15e3) thermalEta = 3e-3
      if (r.entry && !r.entry.intact && r.entry.L_ground / Math.sin(p.theta) >= 0.5 * c.D_rim) info('crater-field', ['L_ground'])
      if (r.v_i < 1000) warn('slow', ['v0'])
      if (p.theta < 12 * DEG) warn('elliptical', ['theta'])
      if (p.theta < 15 * DEG) warn('ricochet', ['theta'])
    }
  } else {
    out.E = W
    const W_kt = W / KT_TNT
    const nc = nuclearCrater(cls.nuclear, W_kt, p.dob_optimal || p.solve ? null : p.z_b, f_nuc)
    out.z_b = p.dob_optimal || p.solve ? nc.z_opt : p.z_b
    out.lam = nc.lam
    out.lam_opt = nc.lam_opt
    out.Fc = ventedFraction(nc.lam)
    if (p.body === 'earth') out.R_B = 1000 * W_kt ** 0.3
    info('fallout')
    if (p.body !== 'earth') warn('nuclear-offworld')
    if (nc.R_a > 0) {
      out.crater = true
      out.D_rim = 2 * nc.R_a
      out.h_rim = 0.1 * nc.R_a
      out.d_rim = nc.d_a + out.h_rim
      out.V = (Math.PI / 2) * nc.R_a ** 2 * nc.d_a
      out.V_ej = out.V
      R_ej = nc.R_a
      x_min = 0.1 * nc.R_a
    } else warn('contained', ['z_b'])
    if (nc.lam < 1) {
      blastE = W
      thermalEta = 0.18
    } else if (hasAir) info('buried-blast')
  }

  // ---- クレータの形の警告
  if (out.crater) {
    if (out.D_rim > p.D_c) warn('complex', ['D_rim'])
    if (p.t_reg > 0 && out.D_rim > 4 * p.t_reg) warn('layered', ['D_rim', 't_reg'])
    if (p.body === 'mars' && p.ground === 'ice_rich') warn('rampart')
  }
  if (p.body === 'mars' && p.ground === 'polar_cap') warn('mars-polar')

  // ---- §4.6 噴出物の厚さ
  if (out.crater) {
    const Rr = out.D_rim / 2
    out.r_bury = out.h_rim > p.t_bury ? Rr * (out.h_rim / p.t_bury) ** (1 / 3) : Rr
    const rEnd = Math.max(2 * out.r_bury, 4 * Rr)
    const rs = Array.from({ length: 61 }, (_, i) => Rr * (rEnd / Rr) ** (i / 60))
    out.thickness = { r: rs, t: rs.map((r) => out.h_rim * (Rr / r) ** 3) }
  }

  // ---- §4.7 噴出物の速さと届く距離
  const sizes = p.frags
  const sMax = Math.max(...sizes)
  const ratioOf = (s: number): [number, number, number] => [
    (s / sMax) ** -SIZE_EXPONENTS.mean,
    (s / sMax) ** -SIZE_EXPONENTS.low,
    (s / sMax) ** -SIZE_EXPONENTS.high,
  ]
  if (out.crater && R_ej > 0) {
    const ej = ejectaModel(cls.ejecta, regime, R_ej, Math.min(x_min, 0.5 * R_ej), p.g, p.Y, p.rho_t)
    const range = (v: number, s: number) => (hasAir ? airRange(v, s, p.rho_f, p.g, p.rho_a0, p.H, p.R_p) : vacuumRange(v, p.g, p.R_p))
    const M_tot = ej.M(ej.x_max)
    const x_q = Math.min(ej.x_max, Math.cbrt((p.q * M_tot) / (EJECTA[cls.ejecta][regime].k * p.rho_t) + ej.x_min ** 3))
    const xs = Array.from({ length: 40 }, (_, i) => x_q * (ej.x_max / x_q) ** (i / 40))
    out.frags = sizes.map((s) => ({ size: s, range: Math.max(...xs.map((x) => x + range(ej.v(x), s))), ratio: ratioOf(s) }))
    out.v_ej_max = ej.v(ej.x_min)
    out.r_ej_max = ej.x_min + range(out.v_ej_max, sMax)
    const massAbove = (v: number) => (v >= out.v_ej_max! ? 0 : ej.M(bisect((x) => ej.v(x) - v, ej.x_min, ej.x_max)))
    out.M_escape = massAbove(v_esc)
    if (!hasAir) out.M_orbit = massAbove(Math.sqrt(p.g * p.R_p))
    if (out.M_escape > 0) info('escape-ejecta', ['M_escape'], { t: out.M_escape / 1000 })
    else if ((out.M_orbit ?? 0) > 0) info('orbit-ejecta', ['M_orbit'])
  } else out.frags = sizes.map((s) => ({ size: s, range: 0, ratio: ratioOf(s) }))

  // ---- §4.8 地震
  if (impact) {
    if (out.crater) out.M_seis = 0.67 * Math.log10(out.E) - 5.87
  } else {
    out.seis_kind = 'mb'
    out.M_seis = 4.0 + 0.8 * Math.log10(W / KT_TNT) - (cls.dryPorous ? 0.5 : 0)
  }
  const M_seis = out.M_seis
  if (p.body === 'earth' && M_seis !== undefined) {
    const dist = (level: number) => {
      const r60 = (M_seis - level) / 0.0238
      if (r60 <= 0) return 0
      if (r60 <= 60) return r60 * 1000
      return Math.min(700, Math.max(60, (M_seis - 1.1644 - level) / 0.0048)) * 1000
    }
    out.r_mmi = [dist(4), dist(5), dist(6)]
  }

  // ---- §4.9 爆風、§4.10 熱放射
  if (hasAir && blastE > 0) {
    out.r_p1 = blastRange(blastE, blastZ, p.P0, p.p1)
    out.r_p2 = blastRange(blastE, blastZ, p.P0, p.p2)
  }
  if (p.body === 'earth' && thermalEta > 0) {
    const phi = (IGNITION[p.ignition] ?? IGNITION.burn3).phi1Mt * (blastE / (1000 * KT_TNT)) ** (1 / 6)
    out.r_thermal = Math.sqrt((thermalEta * blastE) / (2 * Math.PI * phi))
  }
  if (p.body !== 'earth' && thermalEta > 0) info('no-thermal')

  info('approx')
  return { outputs: out, warnings, errors }
}
