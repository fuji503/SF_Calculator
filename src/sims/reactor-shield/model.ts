/**
 * 原子炉・遮蔽モジュールの計算（仕様書1(新規) §4）。
 * 単位はすべて SI（m、kg、W、s、J、Sv、Gy）。
 */
import { YEAR } from '../../core/physics/constants.ts'
import type { Message } from '../types.ts'
import {
  AMU,
  COMPONENTS,
  CONDUCTORS,
  COOLANTS,
  E_FISSION,
  E_GAMMA,
  FUELS,
  groundMaterial,
  H_N,
  MATERIALS,
  MEV,
  MU_EN,
  M_NEUTRON,
  NASA_LIFETIME,
  type ComponentId,
  type CoolantId,
  type FuelId,
  type Material,
  type MaterialId,
} from './data.ts'

/** 地表の配置の壁とふたの材料（「地盤と同じ土」を選べる） */
export type SurfaceMaterialId = MaterialId | 'ground'

export type ShieldMode = 'none' | 'shadow' | 'omni' | 'surface'
export type Layout = 'above' | 'under' | 'semi'
export type Origin = 'earth' | 'local'

export interface Layer {
  material: MaterialId
  /** 厚さ [m]。自動で厚さが決まる層では使わない */
  t: number
}

export interface ReactorInputs {
  // §3.1 運転条件
  Q: number
  T_op: number
  f_op: number
  // §3.2 炉心と燃料
  q: number
  V_min: number
  HD: number
  t_ref: number
  rho_HM: number
  fuel: FuelId
  nu: number
  alpha_c: number
  CR: number
  Bu_max: number
  f_n: number
  f_g: number
  coolant: CoolantId
  T_hot: number
  alpha_r: number
  // §3.3 熱交換器
  /** 放射化の割合 */
  f_act: number
  hx_eval: boolean
  f_HX: number
  t_tr: number
  L_HX: number
  hx_layers: Layer[]
  // §3.4 守る対象と基準
  target: 'human' | 'electronics'
  /** 宇宙飛行士の基準（NASA の生涯の上限を確かめる） */
  astronaut: boolean
  H_lim: number
  t_occ: number
  Phi_lim: number
  D_lim: number
  L: number
  /** 全方向遮蔽で、守る対象を遮蔽のすぐ外側に置く */
  L_surface: boolean
  h_t: number
  R_obj: number
  // §3.5 遮蔽
  shield_mode: ShieldMode
  /** true なら基準から厚さを出す */
  solve: boolean
  layers: Layer[]
  /** 自動で厚さが決まる層の数（最後の1層、または最後の2層） */
  solve_count: 1 | 2
  layout: Layout
  /** 地上：炉心の下端の地面からの高さ */
  h_base: number
  /** 地下：炉心の中心の深さ */
  depth: number
  r_w: number
  H_w: number
  t_w: number
  wall_mat: SurfaceMaterialId
  /** 地上・半地下のふたの厚さ */
  t_top: number
  lid_mat: SurfaceMaterialId
  /** 地下の縦穴の半径 − 炉心の半径 */
  cav_gap: number
  /** 地盤の密度 [kg/m³] と含水率（質量の割合） */
  ground_rho: number
  ground_w: number
  basis: 'conservative' | 'direct'
  L_up: number
  origin: Record<ComponentId, Origin>
  // §3.6 ブームとケーブル
  boom: boolean
  optimize_L: boolean
  lambda_b: number
  P_e: number
  V_tr: number
  f_loss: number
  conductor: 'aluminum' | 'copper'
}

/** 線量の評価（人：Sv/年、電子機器：運転期間の合計） */
export interface DoseResult {
  /** 中性子束 [1/(m²·s)] */
  phi_n: number
  /** 中性子の線量当量率 [Sv/s] */
  H_n: number
  /** ガンマ線の吸収線量率 [Gy/s]（人体、シリコン） */
  D_g_human: number
  D_g_si: number
}

export interface Evaluation {
  /** 人：1年あたりの線量 [Sv]（中性子、ガンマ線、合計） */
  year_n: number
  year_g: number
  year: number
  /** 電子機器：運転期間の中性子のフルエンス [1/m²] とガンマ線の吸収線量 [Gy] */
  fluence: number
  gamma: number
  /** 基準に対する割合（1 以下なら満たす） */
  ratio: number
}

export interface MassRow {
  label: string
  mass: number
  origin: Origin
}

export interface ReactorOutputs {
  // 炉心
  V_core: number
  D: number
  H: number
  R0: number
  M_reactor: number
  // 燃料
  m_HM: number
  fission_rate: number
  m_burn: number
  m_bred: number
  m_net: number
  MWd: number
  Bu: number
  t_life: number
  // 放射線
  S_n: number
  S_g: number
  E_mean: number
  v_mean: number
  v_thermal: number
  frac_above10: number
  spectrum: { E: number[]; chi: number[] }
  // 線量
  unshielded: Evaluation
  unshielded_rate: DoseResult
  shielded: Evaluation
  shielded_rate: DoseResult
  /** 守る対象までの距離（全方向遮蔽で遮蔽のすぐ外側に置くときは遮蔽の外側の半径） */
  L_eval: number
  // 遮蔽
  thickness: number[]
  R_out: number
  M_shield: number
  M_import: number
  M_local: number
  massRows: MassRow[]
  // 地表の配置
  t_w: number
  t_top: number
  depth: number
  wall_path: number
  ground_path: number
  direct: Evaluation | null
  conservative: Evaluation | null
  up_rate: number
  V_exc: number
  M_exc: number
  // ブーム
  L_opt: number
  M_boom: number
  M_cable: number
  M_total_s: number
  // 熱交換器
  A_sat: number
  A_HX: number
  hx_unshielded_rate: number
  hx_thickness: number[]
  M_hx_shield: number
  hx_eval: Evaluation | null
  combined: Evaluation
  // 崩壊熱
  decay: { t: number[]; frac: number[] }
  decay_points: Record<string, number>
}

export interface ReactorResult {
  outputs: ReactorOutputs | null
  warnings: Message[]
  errors: Message[]
}

// ---------------------------------------------------------------------------
// 部品

/** 炉心の大きさ（§4.2） */
export function coreSize(p: Pick<ReactorInputs, 'Q' | 'q' | 'V_min' | 'HD' | 't_ref'>) {
  const V_core = Math.max(p.Q / p.q, p.V_min)
  const D = Math.cbrt((4 * V_core) / (Math.PI * p.HD))
  const R_eq = Math.cbrt((3 * V_core) / (4 * Math.PI))
  return { V_core, D, H: p.HD * D, R0: R_eq + p.t_ref }
}

/** 点の発生源から距離 r、遮蔽の除去断面積の合計 sigma と減衰の合計 mu を通った点の線量率（§4.5） */
export function doseRate(S_n: number, S_g: number, r: number, sigma: number, mu: number): DoseResult {
  const g = 1 / (4 * Math.PI * r * r)
  const phi_n = S_n * g * Math.exp(-sigma)
  const phi_E = S_g * g * (1 + mu) * Math.exp(-mu)
  return { phi_n, H_n: H_N * phi_n, D_g_human: phi_E * MU_EN.human, D_g_si: phi_E * MU_EN.electronics }
}

/** ワットの分布 χ(E)（E は MeV、1/MeV で正規化） */
const WATT_A = 0.988
const WATT_B = 2.249
const WATT_C = (2 / Math.sqrt(Math.PI * WATT_A ** 3 * WATT_B)) * Math.exp((-WATT_A * WATT_B) / 4)
export const watt = (E: number) => WATT_C * Math.exp(-E / WATT_A) * Math.sinh(Math.sqrt(WATT_B * E))
/** ワットの分布の平均 [MeV] = 3a/2 + a²b/4 */
export const WATT_MEAN = 1.5 * WATT_A + (WATT_A ** 2 * WATT_B) / 4

/** E [MeV] より大きいエネルギーの中性子の割合（数値積分） */
export function wattAbove(E0: number): number {
  const n = 20_000
  const hi = 60
  const h = (hi - E0) / n
  let s = watt(E0) + watt(hi)
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * watt(E0 + i * h)
  return (s * h) / 3
}

/** 中性子の速さ [m/s]（E は J） */
export const neutronSpeed = (E: number) => Math.sqrt((2 * E) / M_NEUTRON)

/** 停止後 t 秒の崩壊熱の割合（ウェイ＝ウィグナー、§4.11） */
export const decayFraction = (t: number, T: number) => 0.0622 * (t ** -0.2 - (t + T) ** -0.2)

/** ケーブルの質量（往復2本、§4.9） */
export function cableMass(L: number, P_e: number, V: number, f_loss: number, conductor: 'aluminum' | 'copper'): number {
  const c = CONDUCTORS[conductor]
  return (4 * L * L * c.rho_m * c.rho_e * P_e) / (f_loss * V * V)
}

/** 線分 (x0,z0)-(x1,z1) が箱 [xa,xb]×[za,zb] の中を通る長さ（Liang–Barsky の線分の切り取り） */
export function clipLength(x0: number, z0: number, x1: number, z1: number, xa: number, xb: number, za: number, zb: number): number {
  let t0 = 0
  let t1 = 1
  const dx = x1 - x0
  const dz = z1 - z0
  const edges: [number, number][] = [
    [-dx, x0 - xa],
    [dx, xb - x0],
    [-dz, z0 - za],
    [dz, zb - z0],
  ]
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return 0
      continue
    }
    const r = qq / pp
    if (pp < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return 0
  }
  return (t1 - t0) * Math.hypot(dx, dz)
}

/** 二分法：f(t) が真になる最小の t（f は t とともに単調）。上限でも偽なら null */
function minThickness(f: (t: number) => boolean, hi: number, tol = 1e-4): number | null {
  if (f(0)) return 0
  if (!f(hi)) return null
  let lo = 0
  while (hi - lo > tol / 2) {
    const mid = (lo + hi) / 2
    if (f(mid)) hi = mid
    else lo = mid
  }
  return hi
}

/** まず n 点で調べ、最も小さい点の前後を黄金分割法で詰める（§4.12） */
function minimize(f: (x: number) => number, lo: number, hi: number, n: number, iterations = 40): { x: number; value: number } {
  let best = 0
  const xs = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1))
  const vs = xs.map(f)
  for (let i = 1; i < n; i++) if (vs[i] < vs[best]) best = i
  let a = xs[Math.max(0, best - 1)]
  let b = xs[Math.min(n - 1, best + 1)]
  const g = (Math.sqrt(5) - 1) / 2
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  let fc = f(c)
  let fd = f(d)
  for (let i = 0; i < iterations; i++) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - g * (b - a)
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + g * (b - a)
      fd = f(d)
    }
  }
  const x = (a + b) / 2
  const v = f(x)
  // 端点が最小のこともあるので、最初に調べた点と比べる
  return v <= vs[best] ? { x, value: v } : { x: xs[best], value: vs[best] }
}

// ---------------------------------------------------------------------------
// 計算

export function computeReactor(p: ReactorInputs): ReactorResult {
  const errors: Message[] = []
  const warnings: Message[] = []
  const warn = (code: string, keys?: string[], params?: Message['params']) => warnings.push({ code, keys, params })
  const info = (code: string, keys?: string[], params?: Message['params']) => warnings.push({ code, keys, params, level: 'info' })
  const fail = (code: string, keys?: string[], params?: Message['params']): ReactorResult => ({
    outputs: null,
    warnings,
    errors: [...errors, { code, keys, params }],
  })

  const coolant = COOLANTS[p.coolant]
  if (coolant.T_melt !== undefined && p.T_hot <= coolant.T_melt) {
    return fail('coolant-temp', ['T_hot'], { melt: coolant.T_melt, boil: coolant.T_boil ?? '—' })
  }
  if (coolant.T_boil !== undefined && p.T_hot >= coolant.T_boil) {
    return fail('coolant-temp', ['T_hot'], { melt: coolant.T_melt ?? '—', boil: coolant.T_boil })
  }
  if (p.T_hot > coolant.T_out) warn('coolant-outlet', ['T_hot'], { T: coolant.T_out })

  // ---- §4.2 炉心
  const { V_core, D, H, R0 } = coreSize(p)
  const M_reactor = p.alpha_r * p.Q

  // ---- §4.3 燃料
  const T_run = p.T_op * p.f_op
  const fission_rate = p.Q / E_FISSION
  const m_atom = FUELS[p.fuel].A * AMU
  const m_HM = p.rho_HM * V_core
  const m_burn = fission_rate * (1 + p.alpha_c) * m_atom * T_run
  const m_bred = p.CR * m_burn
  const MWd = (p.Q * T_run) / 1e6 / 86_400
  const Bu = (p.Q * T_run) / m_HM
  const t_life = p.Bu_max > 0 ? (p.Bu_max * m_HM) / p.Q : Number.NaN
  if (p.Bu_max > 0 && t_life < T_run) warn('fuel-life', ['Bu_max'], { years: t_life / YEAR })
  if (p.fuel === 'u233') info('u233')
  if (p.coolant === 'pbbi') info('pbbi')
  if (p.coolant === 'lithium') info('lithium')

  // ---- §4.4 放射線
  const S_n = fission_rate * p.nu * p.f_n
  const S_g = ((p.Q * E_GAMMA) / E_FISSION) * p.f_g
  const Es = Array.from({ length: 201 }, (_, i) => i * 0.05)
  const spectrum = { E: Es, chi: Es.map(watt) }

  // ---- 線量の評価（§4.12 の基準）
  const human = p.target === 'human'
  const evaluate = (r: DoseResult): Evaluation => {
    const year_n = r.H_n * p.t_occ * p.f_op
    const year_g = r.D_g_human * p.t_occ * p.f_op
    const fluence = r.phi_n * T_run
    const gamma = r.D_g_si * T_run
    const ratio = human ? (year_n + year_g) / p.H_lim : Math.max(fluence / p.Phi_lim, gamma / p.D_lim)
    return { year_n, year_g, year: year_n + year_g, fluence, gamma, ratio }
  }
  const ok = (r: DoseResult) => evaluate(r).ratio <= 1

  const unshielded_rate = doseRate(S_n, S_g, p.L, 0, 0)
  const unshielded = evaluate(unshielded_rate)

  // ---- 遮蔽
  let thickness: number[] = []
  let R_out = R0
  let M_shield = 0
  let massRows: MassRow[] = []
  let shielded_rate = unshielded_rate
  let L_eval = p.L
  let t_w = 0
  let t_top = 0
  let depth = 0
  let wall_path = 0
  let ground_path = 0
  let direct: Evaluation | null = null
  let conservative: Evaluation | null = null
  let up_rate = 0
  let V_exc = 0
  let M_exc = 0
  let L_opt = Number.NaN
  let M_boom = 0
  let M_cable = 0

  /** 材料の質量を、成分ごとの調達で分ける */
  const split = (label: string, m: Material, mass: number): MassRow[] => {
    if (mass <= 0) return []
    if (!m.components) return [{ label, mass, origin: 'earth' }]
    return Object.entries(m.components).map(([c, w]) => ({
      label: `${label}：${COMPONENTS[c as ComponentId].label}`,
      mass: mass * (w ?? 0),
      origin: p.origin[c as ComponentId],
    }))
  }

  const materialsUsed: MaterialId[] = []

  if (p.shield_mode === 'shadow' || p.shield_mode === 'omni') {
    const layers = p.layers
    if (layers.length === 0) return fail('no-layers', ['layers'])
    materialsUsed.push(...layers.map((l) => l.material))
    const shadow = p.shield_mode === 'shadow'
    const atSurface = !shadow && p.L_surface
    const nSolve = p.solve ? Math.min(p.solve_count, layers.length) : 0

    /** 層の厚さの並びから、線量と質量を出す */
    const assess = (t: number[], L: number) => {
      let sigma = 0
      let mu = 0
      let mass = 0
      let z = R0
      const rows: MassRow[] = []
      const rz = (zz: number) => R0 + ((p.R_obj - R0) * zz) / L
      layers.forEach((l, i) => {
        const m = MATERIALS[l.material]
        sigma += m.sigmaR * t[i]
        mu += m.mu * t[i]
        const V = shadow
          ? ((Math.PI * t[i]) / 3) * (rz(z) ** 2 + rz(z) * rz(z + t[i]) + rz(z + t[i]) ** 2)
          : ((4 * Math.PI) / 3) * ((z + t[i]) ** 3 - z ** 3)
        mass += V * m.rho
        rows.push(...split(`${i + 1}層目 ${m.label}`, m, V * m.rho))
        z += t[i]
      })
      const Lr = atSurface ? z : L
      return { sigma, mu, mass, rows, R_out: z, L: Lr, rate: doseRate(S_n, S_g, Lr, sigma, mu) }
    }

    /** 距離 L で、基準を満たす層の厚さを決める（§4.12）。満たせなければ null */
    const design = (L: number, ignoreGeometry = false): number[] | null => {
      const t = layers.map((l) => l.t)
      if (nSolve === 0) return t
      const last = layers.length - 1
      const feasible = (tt: number[]) => {
        const a = assess(tt, L)
        return (ignoreGeometry || atSurface || a.R_out < a.L) && ok(a.rate)
      }
      if (nSolve === 1) {
        const tn = minThickness((x) => feasible(t.map((v, i) => (i === last ? x : v))), MATERIALS[layers[last].material].t_max)
        if (tn === null) return null
        t[last] = tn
        return t
      }
      // 2層：ガンマ線用の層の厚さを動かし、それぞれで中性子用の層の最小の厚さを求めて、質量が最小の組を選ぶ
      const g = last - 1
      const tMaxN = MATERIALS[layers[last].material].t_max
      const withG = (tg: number) => {
        const base = t.map((v, i) => (i === g ? tg : v))
        // 質量の変化がなめらかになるように、内側の二分法は細かく詰める（黄金分割法が谷を正しく追えるように）
        const tn = minThickness((x) => feasible(base.map((v, i) => (i === last ? x : v))), tMaxN, 1e-8)
        return tn === null ? null : base.map((v, i) => (i === last ? tn : v))
      }
      const massOf = (tg: number) => {
        const tt = withG(tg)
        return tt ? assess(tt, L).mass : Number.POSITIVE_INFINITY
      }
      const best = minimize(massOf, 0, Math.min(0.5, MATERIALS[layers[g].material].t_max), 11, 30)
      if (!Number.isFinite(best.value)) return null
      return withG(best.x)
    }

    const boomMass = (L: number) =>
      p.boom ? { boom: p.lambda_b * L, cable: cableMass(L, p.P_e, p.V_tr, p.f_loss, p.conductor) } : { boom: 0, cable: 0 }

    let L = p.L
    if (shadow && p.boom && p.optimize_L) {
      // ブームの距離の最適化：距離の対数を 5〜500 m で調べる
      const total = (logL: number) => {
        const LL = Math.exp(logL)
        const t = design(LL)
        if (!t) return Number.POSITIVE_INFINITY
        const b = boomMass(LL)
        return assess(t, LL).mass + b.boom + b.cable
      }
      const best = minimize(total, Math.log(5), Math.log(500), 16, 30)
      if (!Number.isFinite(best.value)) return fail('cannot-meet', ['layers'])
      L = Math.exp(best.x)
      L_opt = L
    }
    if (!atSurface && L <= R0 + (nSolve === 0 ? layers.reduce((s, l) => s + l.t, 0) : 0)) return fail('inside-shield', ['L'])
    const t = design(L)
    // 遮蔽の厚さが守る対象の位置まで届いてしまう場合は、対象が遮蔽の内側にある
    if (!t) return fail(design(L, true) ? 'inside-shield' : 'cannot-meet', design(L, true) ? ['L'] : ['layers'])
    const a = assess(t, L)
    if (a.R_out >= a.L && !atSurface) return fail('inside-shield', ['L'])
    thickness = t
    R_out = a.R_out
    M_shield = a.mass
    massRows = a.rows
    shielded_rate = a.rate
    L_eval = a.L
    const b = boomMass(L)
    M_boom = b.boom
    M_cable = b.cable
    if (!MATERIALS[layers[layers.length - 1].material].hydrogen) warn('no-hydrogen', ['layers'])
    if (layers[0].material === 'sulfur_concrete') warn('sulfur-near-core', ['layers'])
  } else if (p.shield_mode === 'surface') {
    const regolith = groundMaterial(p.ground_rho, p.ground_w)
    /** 壁とふたの材料。「地盤と同じ土」は地盤の種類の値を使う */
    const surfaceMaterial = (id: SurfaceMaterialId) => (id === 'ground' ? regolith : MATERIALS[id])
    const wall = surfaceMaterial(p.wall_mat)
    const lid = surfaceMaterial(p.lid_mat)
    const under = p.layout === 'under'
    const r_cav = R0 + p.cav_gap
    const used = (id: SurfaceMaterialId) => id !== 'ground' && materialsUsed.push(id)
    used(under ? p.lid_mat : p.wall_mat)
    if (!under && p.t_top > 0) used(p.lid_mat)

    /** 断面の直線が通る長さから線量を出す（§4.8） */
    const geometry = (tw: number, ttop: number, dep: number) => {
      const z_c = under ? -dep : p.layout === 'semi' ? 0 : R0 + p.h_base
      const x1 = p.L
      const z1 = p.h_t
      let sigma = 0
      let mu = 0
      let wallLen = 0
      let groundLen = 0
      if (under) {
        groundLen = clipLength(0, z_c, x1, z1, r_cav, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0)
        const lidLen = clipLength(0, z_c, x1, z1, 0, r_cav, -ttop, 0)
        sigma += regolith.sigmaR * groundLen + lid.sigmaR * lidLen
        mu += regolith.mu * groundLen + lid.mu * lidLen
      } else {
        wallLen = clipLength(0, z_c, x1, z1, p.r_w, p.r_w + tw, 0, p.H_w)
        const lidLen = ttop > 0 ? clipLength(0, z_c, x1, z1, 0, p.r_w + tw, p.H_w, p.H_w + ttop) : 0
        const xg = p.layout === 'semi' ? R0 : 0
        groundLen = clipLength(0, z_c, x1, z1, xg, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0)
        sigma += wall.sigmaR * wallLen + lid.sigmaR * lidLen + regolith.sigmaR * groundLen
        mu += wall.mu * wallLen + lid.mu * lidLen + regolith.mu * groundLen
      }
      const r = Math.hypot(x1, z1 - z_c)
      return { rate: doseRate(S_n, S_g, r, sigma, mu), wallLen, groundLen }
    }
    /** 地下の保守的な評価：ふたの厚さだけを通るとして、距離 L の線量 */
    const conservativeRate = (ttop: number) => doseRate(S_n, S_g, p.L, lid.sigmaR * ttop, lid.mu * ttop)

    if (under) {
      let ttop = Math.max(0, p.depth - R0)
      if (p.solve) {
        const f = (x: number) => ok(p.basis === 'conservative' ? conservativeRate(x) : geometry(0, x, R0 + x).rate)
        const sol = minThickness(f, lid.t_max)
        if (sol === null) return fail('cannot-meet', ['depth'])
        ttop = sol
      }
      depth = R0 + ttop
      t_top = ttop
      const g = geometry(0, ttop, depth)
      ground_path = g.groundLen
      direct = evaluate(g.rate)
      const cons = conservativeRate(ttop)
      conservative = evaluate(cons)
      shielded_rate = p.basis === 'conservative' ? cons : g.rate
      const M_lid = Math.PI * r_cav ** 2 * ttop * lid.rho
      V_exc = Math.PI * r_cav ** 2 * (depth + R0)
      M_exc = V_exc * regolith.rho
      M_shield = M_lid
      massRows = split('埋め戻し', lid, M_lid)
      up_rate = (() => {
        const r = doseRate(S_n, S_g, p.L_up, lid.sigmaR * ttop, lid.mu * ttop)
        return human ? r.H_n + r.D_g_human : r.D_g_si
      })()
      if (p.lid_mat === 'sulfur_concrete') warn('sulfur-near-core', ['lid_mat'])
      if (!regolith.hydrogen) warn('dry-ground', ['ground_w'])
    } else {
      let tw = p.t_w
      if (p.solve) {
        const sol = minThickness((x) => ok(geometry(x, p.t_top, 0).rate), wall.t_max)
        if (sol === null) return fail('cannot-meet', ['t_w'])
        tw = sol
      }
      t_w = tw
      t_top = p.t_top
      const g = geometry(tw, p.t_top, 0)
      shielded_rate = g.rate
      wall_path = g.wallLen
      ground_path = g.groundLen
      // 対象への直線が壁の上を越える（壁を通る長さが厚さより短い）
      if (tw > 0 && g.wallLen < tw * 0.999) warn('wall-low', ['H_w'])
      const M_wall = Math.PI * ((p.r_w + tw) ** 2 - p.r_w ** 2) * p.H_w * wall.rho
      const M_lid = Math.PI * (p.r_w + tw) ** 2 * p.t_top * lid.rho
      M_shield = M_wall + M_lid
      massRows = [...split('壁', wall, M_wall), ...split('ふた', lid, M_lid)]
      const upLid = doseRate(S_n, S_g, p.L_up, lid.sigmaR * p.t_top, lid.mu * p.t_top)
      up_rate = human ? upLid.H_n + upLid.D_g_human : upLid.D_g_si
      if (p.t_top <= 0) warn('no-lid', ['t_top'])
      if (!wall.hydrogen) warn('no-hydrogen', ['wall_mat'])
      if (p.layout === 'semi' && !regolith.hydrogen) warn('dry-ground', ['ground_w'])
      if (p.wall_mat === 'sulfur_concrete') warn('sulfur-near-core', ['wall_mat'])
    }
  }

  const M_import = massRows.filter((r) => r.origin === 'earth').reduce((s, r) => s + r.mass, 0)
  const M_local = massRows.filter((r) => r.origin === 'local').reduce((s, r) => s + r.mass, 0)
  if (materialsUsed.includes('lih')) info('lih')
  if (materialsUsed.includes('reg_concrete')) info('reg-concrete-vacuum')
  if (M_shield > 0) info('shield-only')

  // ---- §4.10 冷却材の放射化と熱交換器
  let A_sat = 0
  let A_HX = 0
  let hx_unshielded_rate = 0
  let hx_thickness: number[] = []
  let M_hx_shield = 0
  let hxEval: Evaluation | null = null
  let hxRate: DoseResult | null = null
  if (p.hx_eval) {
    A_sat = fission_rate * p.nu * p.f_act
    A_HX = coolant.half_life > 0 ? A_sat * p.f_HX * Math.exp((-Math.LN2 * p.t_tr) / coolant.half_life) : 0
    const S_hx = A_HX * coolant.E_decay
    const rate0 = doseRate(0, S_hx, p.L_HX, 0, 0)
    hx_unshielded_rate = human ? rate0.D_g_human : rate0.D_g_si
    const layers = p.hx_layers
    const t = layers.map((l) => l.t)
    const rateOf = (tt: number[]) =>
      doseRate(
        0,
        S_hx,
        p.L_HX,
        0,
        layers.reduce((s, l, i) => s + MATERIALS[l.material].mu * tt[i], 0),
      )
    if (p.solve && layers.length > 0 && S_hx > 0) {
      const last = layers.length - 1
      const sol = minThickness((x) => ok(rateOf(t.map((v, i) => (i === last ? x : v)))), MATERIALS[layers[last].material].t_max)
      if (sol === null) return fail('cannot-meet', ['hx_layers'])
      t[last] = sol
    }
    hx_thickness = t
    hxRate = rateOf(t)
    hxEval = evaluate(hxRate)
    // 熱交換器の遮蔽の質量（点の発生源を囲む球殻とする）
    let r = 0.5
    for (let i = 0; i < layers.length; i++) {
      const m = MATERIALS[layers[i].material]
      M_hx_shield += ((4 * Math.PI) / 3) * ((r + t[i]) ** 3 - r ** 3) * m.rho
      r += t[i]
    }
    if (S_hx === 0) info('hx-no-source')
  }

  const shielded = evaluate(shielded_rate)
  const combinedRate: DoseResult = hxRate
    ? {
        phi_n: shielded_rate.phi_n,
        H_n: shielded_rate.H_n,
        D_g_human: shielded_rate.D_g_human + hxRate.D_g_human,
        D_g_si: shielded_rate.D_g_si + hxRate.D_g_si,
      }
    : shielded_rate
  const combined = evaluate(combinedRate)
  if (hxRate && combined.ratio > 1 && shielded.ratio <= 1) warn('combined-exceeds')
  if (human && p.astronaut && combined.year * (p.T_op / YEAR) > NASA_LIFETIME) {
    warn('nasa-lifetime')
  }

  // ---- §4.11 崩壊熱
  const ts = Array.from({ length: 121 }, (_, i) => 10 ** ((i / 120) * Math.log10(YEAR)))
  const decay = { t: ts, frac: ts.map((t) => decayFraction(t, T_run)) }
  const decay_points: Record<string, number> = {
    s1: decayFraction(1, T_run),
    min1: decayFraction(60, T_run),
    h1: decayFraction(3600, T_run),
    d1: decayFraction(86_400, T_run),
    d30: decayFraction(30 * 86_400, T_run),
    y1: decayFraction(YEAR, T_run),
  }

  return {
    outputs: {
      V_core,
      D,
      H,
      R0,
      M_reactor,
      m_HM,
      fission_rate,
      m_burn,
      m_bred,
      m_net: m_burn - m_bred,
      MWd,
      Bu,
      t_life,
      S_n,
      S_g,
      E_mean: WATT_MEAN,
      v_mean: neutronSpeed(WATT_MEAN * MEV),
      v_thermal: neutronSpeed(0.025 * 1.602176634e-19),
      frac_above10: wattAbove(10),
      spectrum,
      unshielded,
      unshielded_rate,
      shielded,
      shielded_rate,
      L_eval,
      thickness,
      R_out,
      M_shield,
      M_import,
      M_local,
      massRows,
      t_w,
      t_top,
      depth,
      wall_path,
      ground_path,
      direct,
      conservative,
      up_rate,
      V_exc,
      M_exc,
      L_opt,
      M_boom,
      M_cable,
      M_total_s: M_shield + M_boom + M_cable,
      A_sat,
      A_HX,
      hx_unshielded_rate,
      hx_thickness,
      M_hx_shield,
      hx_eval: hxEval,
      combined,
      decay,
      decay_points,
    },
    warnings,
    errors,
  }
}
