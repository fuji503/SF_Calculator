/**
 * サンシェード・展開軌道モジュールの計算（仕様書3(検証版) §4）。
 * 単位はすべて SI（m、kg、s、W）。
 */
import { AU, C_LIGHT, G0, GM_SUN, L_SUN, R_SUN, YEAR } from '../../core/physics/constants.ts'
import type { Message } from '../types.ts'

const DAY = 86_400

/** 太陽に正面を向けた膜で β = k σ0 / σ になる面密度 σ0 = L⊙ / (4π c GM⊙) [kg/m²]（§4.1） */
export const SIGMA_0 = L_SUN / (4 * Math.PI * C_LIGHT * GM_SUN)

export type PositionMode = 'l1' | 'balance' | 'rs' | 'd'
export type Propulsion = 'sail' | 'ep' | 'sail_ep' | 'power_sail'
export type Operation = 'build' | 'standby'
export type Transport = 'self' | 'carrier'
export type Solve = 'goal' | 'perf'

// ---------------------------------------------------------------------------
// プリセット（§3.1、§3.4）

export interface TargetPreset {
  R_p: number
  a_p: number
  GM_p: number
}

export const TARGET_PRESETS: Record<'earth' | 'mars' | 'venus', TargetPreset> = {
  earth: { R_p: 6371e3, a_p: 1.0 * AU, GM_p: 4.035e14 },
  mars: { R_p: 3389.5e3, a_p: 1.5237 * AU, GM_p: 4.2828e13 },
  venus: { R_p: 6051.8e3, a_p: 0.7233 * AU, GM_p: 3.24859e14 },
}

/** ほかの惑星の軌道との交差の判定に使う惑星（§3.1） */
export const PLANETS: readonly { name: string; a: number; GM: number }[] = [
  { name: '水星', a: 0.3871 * AU, GM: 2.2032e13 },
  { name: '金星', a: 0.7233 * AU, GM: 3.24859e14 },
  { name: '地球', a: 1.0 * AU, GM: 4.035e14 },
  { name: '火星', a: 1.5237 * AU, GM: 4.2828e13 },
  { name: '木星', a: 5.2034 * AU, GM: 1.26687e17 },
]

/** 面密度のプリセット [kg/m²] */
export const SIGMA_PRESETS: Record<string, number> = {
  ikaros: 70e-3,
  polyimide: 10.7e-3,
  cruiser: 3.8e-3,
  angel: 4.2e-3,
  okeanos: 800e-3,
  future105: 2.0e-3,
  future13: 3.5e-3,
}

export interface OpticsPreset {
  R_s: number
  A_s: number
  T_s: number
  k_min: number
}

export const OPTICS_PRESETS: Record<'reflective' | 'absorptive' | 'refractive', OpticsPreset> = {
  reflective: { R_s: 0.9, A_s: 0.1, T_s: 0, k_min: 1.0 },
  absorptive: { R_s: 0, A_s: 1.0, T_s: 0, k_min: 1.0 },
  refractive: { R_s: 0.045, A_s: 0, T_s: 0.1, k_min: 0.07 },
}

/** 機体全体で、現在の技術（実績・構想）の面密度の下限の目安 [kg/m²]（§6） */
export const CURRENT_TECH_SIGMA = 4e-3

// ---------------------------------------------------------------------------
// 入力と出力

export interface SunshadeInputs {
  R_p: number
  a_p: number
  GM_p: number
  f_target: number
  position: PositionMode
  r_s: number
  d: number
  A_unit: number
  sigma_film: number
  m_bus: number
  R_s: number
  A_s: number
  T_s: number
  k_min: number
  f_cell: number
  sigma_cell: number
  eta_cell: number
  propulsion: Propulsion
  Isp: number
  eta_ep: number
  alpha_ep: number
  alpha_thr: number
  a_ep_des: number
  /** true なら帆の横向きの力の割合を自動で決める */
  steer_auto: boolean
  eta_steer: number
  operation: Operation
  // 建設展開
  transport: Transport
  dv_tr: number
  t_tr: number
  T_deploy: number
  T_keep: number
  /** m/s/年 */
  dv_sk: number
  mu_c: number
  // 待機・応答
  solve: Solve
  t1: number
  F1: number
  t2: number
  F2: number
  t_rap_goal: number
  /** 構成から性能を出すとき、総機数と即応群の比率で入力する */
  by_ratio: boolean
  N_rap: number
  N_res: number
  N_total: number
  rap_ratio: number
  m_gap: number
  /** true なら追加群の待機軌道の半径は r_s と同じ */
  park_same: boolean
  r_park: number
  t_unf: number
  /** 1/s */
  lambda_mm: number
  T_sim: number
}

export interface Series {
  t: number[]
  F: number[]
}

export interface SunshadeOutputs {
  // 光学と位置
  k: number
  b: number
  eta_steer: number
  sigma_tot: number
  beta_u: number
  beta_req: number
  sigma_max: number
  k_eff: number
  a_hold: number
  d: number
  r_s: number
  d_L1: number
  rho: number
  eta_geom: number
  A_req: number
  N_req: number
  area_vs_L1: number
  m_dry: number
  M_ep: number
  P_ep: number
  // 建設展開
  a_sail: number
  dv_sail: number
  dv_ep: number
  dv_keep: number
  F_ep: number
  m_prop: number
  m0: number
  prop_fraction: number
  M_station: number
  M_depart: number
  // 待機・応答
  s: number
  a_lat: number
  t_rap: number
  m_rap: number
  V: number
  a_br_sail: number
  a_br_ep: number
  t_min: number
  dv_ep_br: number
  m0_res: number
  N_rap: number
  N_res: number
  res_ratio: number
  total_ratio: number
  rap_share: number
  F_t1: number
  F_t2: number
  /** 達成しないときは NaN */
  t_F1: number
  t_F2: number
  t_F100: number
  A_rap: number
  A_all: number
  M_total: number
  replenish: number
  replenish_rap: number
  r_park: number
  series: Series
}

export interface SunshadeResult {
  outputs: SunshadeOutputs | null
  warnings: Message[]
  errors: Message[]
}

// ---------------------------------------------------------------------------
// 力のつり合い（§4.2）

export interface Frame {
  a_p: number
  GM_p: number
  mu: number
  n_p: number
}

export function frameOf(a_p: number, GM_p: number): Frame {
  return { a_p, GM_p, mu: GM_p / (GM_SUN + GM_p), n_p: Math.sqrt((GM_SUN + GM_p) / a_p ** 3) }
}

/** 天体から太陽側に d の点での加速度（太陽と反対向きが正） */
export function netAccel(f: Frame, d: number, beta: number): number {
  const r = f.a_p - d
  return -(1 - beta) * GM_SUN / r ** 2 + f.GM_p / d ** 2 + f.n_p ** 2 * ((1 - f.mu) * f.a_p - d)
}

/**
 * a_net(d, β) = 0 を満たす d を二分法で解く。天体の近くでは正（天体の重力）、
 * 太陽の近くでは負（β < 1 のとき）なので、その間に解がある。β ≥ 1 では解がない
 */
export function balanceDistance(f: Frame, beta: number): number | null {
  if (!(beta < 1)) return null
  let lo = f.a_p * 1e-12
  let hi = f.a_p * (1 - 1e-12)
  if (netAccel(f, lo, beta) <= 0 || netAccel(f, hi, beta) >= 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (netAccel(f, mid, beta) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** 距離 d で止まるのに必要な β */
export function betaRequired(f: Frame, d: number): number {
  return (-netAccel(f, d, 0) * (f.a_p - d) ** 2) / GM_SUN
}

/** 遮光の幾何（§4.4）。必要な膜の総面積 */
export function shadeGeometry(R_p: number, f_target: number, b: number, d: number, r_s: number) {
  const rho = (d * R_SUN) / r_s
  const eta_geom = Math.min(1, (R_p / rho) ** 2)
  const A_req = (f_target * Math.PI * R_p ** 2) / (eta_geom * b)
  return { rho, eta_geom, A_req }
}

/** 太陽からの距離 r での日射 [W/m²] */
export const solarFlux = (r: number) => L_SUN / (4 * Math.PI * r ** 2)

/** Hill 半径 */
export const hillRadius = (a: number, GM: number) => a * Math.cbrt(GM / (3 * GM_SUN))

// ---------------------------------------------------------------------------
// 計算

export function computeSunshade(p: SunshadeInputs): SunshadeResult {
  const errors: Message[] = []
  const warnings: Message[] = []
  const fail = (code: string, keys?: string[], params?: Message['params']): SunshadeResult => ({
    outputs: null,
    warnings,
    errors: [...errors, { code, keys, params }],
  })
  const warn = (code: string, keys?: string[], params?: Message['params']) => warnings.push({ code, keys, params })
  const info = (code: string, keys?: string[], params?: Message['params']) => warnings.push({ code, keys, params, level: 'info' })

  const build = p.operation === 'build'
  const carrier = build && p.transport === 'carrier'
  const powerSail = p.propulsion === 'power_sail'
  const hasSail = p.propulsion !== 'ep'
  const hasEp = p.propulsion !== 'sail'
  const f_cell = powerSail ? p.f_cell : 0

  // ---- 入力の組み合わせのチェック（§6）
  if (p.R_s + p.A_s + p.T_s > 1 + 1e-12) errors.push({ code: 'optics-sum', keys: ['R_s'] })
  if (build && p.t_tr >= p.T_deploy) errors.push({ code: 'deploy-range', keys: ['T_deploy'] })
  if (!build && p.F1 > p.F2) errors.push({ code: 'goal-order', keys: ['F1'] })
  if (p.position === 'rs' && p.r_s >= p.a_p) errors.push({ code: 'rs-range', keys: ['r_s'] })
  if (p.position === 'd' && p.d >= p.a_p) errors.push({ code: 'd-range', keys: ['d'] })
  if (errors.length > 0) return { outputs: null, warnings, errors }

  // ---- §4.1 光圧の基本量
  const k = (1 - f_cell) * (2 * p.R_s + p.A_s) + f_cell
  const b = 1 - p.T_s
  const eta_steer = !hasSail ? 0 : p.steer_auto ? (0.385 * (1 - f_cell) * 2 * p.R_s) / k : p.eta_steer
  const v_e = G0 * p.Isp
  const frame = frameOf(p.a_p, p.GM_p)
  const d_L1 = balanceDistance(frame, 0)!
  const m_film = (p.sigma_film + f_cell * p.sigma_cell) * p.A_unit + p.m_bus

  /** 乾燥質量から、機能位置と光圧の調整を決める（§4.2） */
  const place = (m_dry: number) => {
    const beta_u = (k * SIGMA_0 * p.A_unit) / m_dry
    let d: number
    if (p.position === 'balance') {
      const dd = balanceDistance(frame, beta_u)
      if (dd === null) return { error: 'no-balance' as const, beta_u }
      d = dd
    } else if (p.position === 'l1') d = d_L1
    else if (p.position === 'rs') d = p.a_p - p.r_s
    else d = p.d
    const beta_req = p.position === 'balance' ? beta_u : p.position === 'l1' ? 0 : betaRequired(frame, d)
    let k_eff = k
    let a_hold = 0
    if (p.position === 'l1') {
      // 光圧は反射率の調整では 0 にできないので、その分を電気推進で押し続ける
      a_hold = Math.abs(netAccel(frame, d, beta_u))
    } else if (p.position !== 'balance') {
      if (beta_u >= beta_req) k_eff = (k * beta_req) / beta_u
      else a_hold = Math.abs(netAccel(frame, d, beta_u))
    }
    return { d, r_s: p.a_p - d, beta_u, beta_req, k_eff, a_hold }
  }

  /** 機能位置の結果のチェック。問題があればエラーのメッセージ */
  const checkPlace = (pl: ReturnType<typeof place>, canHold: boolean): Message | null => {
    if ('error' in pl) return { code: 'no-balance', keys: ['sigma_film'] }
    if (pl.k_eff < p.k_min) return { code: 'keff-below-min', keys: ['k_min'] }
    if (pl.a_hold > 0 && !canHold) {
      if (carrier) return { code: 'carrier-hold', keys: ['position'] }
      if (p.position === 'l1') return { code: 'l1-needs-ep', keys: ['position'] }
      return { code: 'too-heavy', keys: ['sigma_film'], params: { sigma: ((k * SIGMA_0) / pl.beta_req) * 1e3 } }
    }
    return null
  }

  let pl: Exclude<ReturnType<typeof place>, { error: string }>
  let m_dry = m_film
  let M_ep = 0
  let P_ep = 0
  // 建設展開
  let a_sail = 0
  let dv_sail = 0
  let dv_ep = 0
  let dv_keep = 0
  let F_ep = 0
  let m_prop = 0
  let m0 = m_film
  // 待機・応答
  let s = 0
  let a_lat = 0
  let t_rap = 0
  let m_rap = 0
  let V = 0
  let a_br_sail = 0
  let a_br_ep = 0
  let t_min = 0
  let dv_ep_br = 0
  let m0_res = 0
  let N_rap = 0
  let N_res = 0
  let r_park = 0
  let geometry: ReturnType<typeof shadeGeometry>
  let N_req: number

  /** 電気推進の電力 P から、質量 m の機体に出せる加速度 */
  const epAccel = (P: number, m: number) => (hasEp && P > 0 ? (2 * p.eta_ep * P) / (v_e * m) : 0)

  if (build && !carrier) {
    // ---- §4.6 (a) 各機が自力で移動する。出発時の質量 m0 を繰り返し計算する
    let converged = false
    let placed: ReturnType<typeof place> | null = null
    for (let i = 0; i < 500; i++) {
      m_dry = m_film + M_ep
      placed = place(m_dry)
      const bad = checkPlace(placed, hasEp)
      if (bad) return fail(bad.code, bad.keys, bad.params)
      const cur = placed as typeof pl
      a_sail = hasSail ? ((eta_steer * k * SIGMA_0 * p.A_unit) / m0) * (GM_SUN / p.a_p ** 2) : 0
      dv_sail = Math.min(p.dv_tr, a_sail * p.t_tr)
      dv_ep = p.dv_tr - dv_sail
      if (!hasEp && dv_ep > 0) {
        return fail('sail-too-slow', ['t_tr'], { days: a_sail > 0 ? p.dv_tr / a_sail / DAY : Infinity })
      }
      dv_keep = hasEp ? cur.a_hold * p.T_keep + (p.dv_sk * p.T_keep) / YEAR : 0
      const a_need = Math.max(dv_ep / p.t_tr, cur.a_hold)
      if (powerSail) {
        P_ep = p.eta_cell * f_cell * p.A_unit * solarFlux(cur.r_s)
        M_ep = p.alpha_thr * P_ep
        F_ep = (2 * p.eta_ep * P_ep) / v_e
        if (F_ep < m0 * a_need * (1 - 1e-9)) return fail('ep-too-weak', ['f_cell'])
      } else if (hasEp) {
        F_ep = m0 * a_need
        P_ep = (F_ep * v_e) / (2 * p.eta_ep)
        M_ep = p.alpha_ep * P_ep
      }
      m_prop = hasEp ? m0 * (1 - Math.exp(-(dv_ep + dv_keep) / v_e)) : 0
      const next = m_film + M_ep + m_prop
      if (!Number.isFinite(next) || next > 1e6 * m_film) return fail('no-convergence')
      if (Math.abs(next - m0) <= 1e-12 * next && Math.abs(m_film + M_ep - m_dry) <= 1e-12 * next) {
        m0 = next
        converged = true
        break
      }
      m0 = next
    }
    if (!converged) return fail('no-convergence')
    m_dry = m_film + M_ep
    pl = place(m_dry) as typeof pl
  } else if (carrier) {
    // ---- §4.6 (b) 輸送機でまとめて運ぶ。シェードは推進器を持たない
    m_dry = m_film
    const placed = place(m_dry)
    const bad = checkPlace(placed, false)
    if (bad) return fail(bad.code, bad.keys, bad.params)
    pl = placed as typeof pl
    m0 = m_dry * (1 + p.mu_c) * Math.exp(p.dv_tr / v_e)
    m_prop = m0 - m_dry * (1 + p.mu_c)
    F_ep = (m0 * p.dv_tr) / p.t_tr
    P_ep = (F_ep * v_e) / (2 * p.eta_ep)
    dv_ep = p.dv_tr
  } else {
    // ---- §4.7 待機・応答。電気推進の電力は、設計加速度か膜の太陽電池で決める
    if (powerSail) {
      // 位置（太陽からの距離）は乾燥質量によるので、繰り返し計算する
      for (let i = 0; i < 200; i++) {
        const placed = place(m_film + M_ep)
        if ('error' in placed) break
        const P = p.eta_cell * f_cell * p.A_unit * solarFlux(placed.r_s)
        const done = Math.abs(P - P_ep) <= 1e-12 * P
        P_ep = P
        M_ep = p.alpha_thr * P_ep
        if (done) break
      }
    } else if (hasEp) {
      const c = (p.alpha_ep * p.a_ep_des * v_e) / (2 * p.eta_ep)
      if (c >= 1) return fail('no-convergence')
      M_ep = (m_film * c) / (1 - c)
      P_ep = M_ep / p.alpha_ep
    }
    m_dry = m_film + M_ep
    const placed = place(m_dry)
    const bad = checkPlace(placed, false)
    if (bad) return fail(bad.code, bad.keys, bad.params)
    pl = placed as typeof pl
  }

  geometry = shadeGeometry(p.R_p, p.f_target, b, pl.d, pl.r_s)
  N_req = Math.ceil(geometry.A_req / p.A_unit)
  const geomL1 = shadeGeometry(p.R_p, p.f_target, b, d_L1, p.a_p - d_L1)
  const sigma_tot = m_dry / p.A_unit
  const sigma_max = pl.beta_req > 0 ? (k * SIGMA_0) / pl.beta_req : Number.NaN

  let F_t1 = Number.NaN
  let F_t2 = Number.NaN
  let t_F1 = Number.NaN
  let t_F2 = Number.NaN
  let t_F100 = Number.NaN
  let series: Series
  const r_s = pl.r_s

  if (build) {
    // ---- §4.8 建設展開の時系列
    const T_end = p.T_deploy + p.T_keep
    const ts = [0, p.t_tr, p.T_deploy, T_end].filter((t, i, a) => i === 0 || t > a[i - 1])
    series = { t: ts, F: ts.map((t) => Math.min(1, Math.max(0, (t - p.t_tr) / (p.T_deploy - p.t_tr)))) }
  } else {
    // ---- §4.7 (a) 即応群
    const y0 = geometry.rho + p.R_p + 2 * p.R_p * p.m_gap
    const y1 = Math.max(0, geometry.rho - p.R_p)
    s = y0 - y1
    const g_s = GM_SUN / r_s ** 2
    const a_ep_dry = epAccel(P_ep, m_dry)
    a_lat = eta_steer * pl.beta_req * g_s + a_ep_dry
    if (!(a_lat > 0)) return fail('no-lateral', ['propulsion'])
    t_rap = 2 * Math.sqrt(s / a_lat)
    const dv_lat = 2 * Math.sqrt(s * a_lat)
    m_rap = m_dry * Math.exp((dv_lat * (a_ep_dry / a_lat)) / v_e)

    // ---- §4.7 (b) 追加群
    r_park = p.park_same ? r_s : p.r_park
    V = Math.abs(Math.sqrt(GM_SUN / r_park) - frame.n_p * r_s)
    if (Math.abs(r_park - r_s) / r_s > 0.02) warn('park-mismatch', ['r_park'])
    m0_res = m_dry
    let converged = false
    for (let i = 0; i < 500; i++) {
      a_br_sail = hasSail ? ((eta_steer * k * SIGMA_0 * p.A_unit) / m0_res) * g_s : 0
      a_br_ep = epAccel(P_ep, m0_res)
      const a_br = a_br_sail + a_br_ep
      if (!(a_br > 0)) return fail('no-lateral', ['propulsion'])
      const t_br = V / a_br
      dv_ep_br = a_br_ep * t_br
      const next = m_dry * Math.exp(dv_ep_br / v_e)
      if (!Number.isFinite(next) || next > 1e6 * m_dry) return fail('no-convergence')
      const done = Math.abs(next - m0_res) <= 1e-12 * next
      m0_res = next
      if (done) {
        converged = true
        break
      }
    }
    if (!converged) return fail('no-convergence')
    a_br_sail = hasSail ? ((eta_steer * k * SIGMA_0 * p.A_unit) / m0_res) * g_s : 0
    a_br_ep = epAccel(P_ep, m0_res)
    t_min = p.t_unf + V / (a_br_sail + a_br_ep)
    const ring = (2 * Math.PI * r_park) / V
    const phi = (t: number) => Math.min(1, Math.max(0, (t - t_min) / ring))

    // ---- §4.7 (d) 構成
    if (p.solve === 'goal') {
      if (t_rap > p.t1) return fail('rap-too-slow', ['t1'], { days: t_rap / DAY })
      if (t_min >= p.t2) return fail('res-too-slow', ['t2'], { days: t_min / DAY })
      N_rap = Math.ceil(p.F1 * N_req)
      N_res = Math.ceil(((p.F2 - p.F1) * N_req) / phi(p.t2))
    } else if (p.by_ratio) {
      N_rap = Math.round(p.N_total * p.rap_ratio)
      N_res = Math.round(p.N_total) - N_rap
    } else {
      N_rap = p.N_rap
      N_res = p.N_res
    }

    // ---- §4.7 (c) 遮光率の時間変化
    const F = (t: number) => Math.min(1, ((t >= t_rap ? N_rap : 0) + N_res * phi(t)) / N_req)
    F_t1 = F(p.t1)
    F_t2 = F(p.t2)
    const reach = (X: number) => {
      if (N_rap / N_req >= X) return t_rap
      if (N_res <= 0) return Number.NaN
      const frac = (X * N_req - N_rap) / N_res
      if (frac > 1) return Number.NaN
      return Math.max(t_rap, t_min + frac * ring)
    }
    t_F1 = reach(p.F1)
    t_F2 = reach(p.F2)
    t_F100 = reach(1)
    if (p.solve === 'perf' && (F_t1 < p.F1 || F_t2 < p.F2)) info('goal-not-met')
    if (t_rap > p.t_rap_goal) warn('rap-goal', ['t_rap_goal'], { days: p.t_rap_goal / DAY })
    if (p.lambda_mm === 0) info('mm-unset', ['lambda_mm'])

    // 時系列：折れ目の時刻と、一様な点を合わせる
    const marks = [0, t_rap, t_min, t_min + ring, p.T_sim]
    const ts = new Set<number>()
    for (let i = 0; i <= 200; i++) ts.add((p.T_sim * i) / 200)
    for (const m of marks) if (m >= 0 && m <= p.T_sim) ts.add(m)
    const sorted = [...ts].sort((a, c) => a - c)
    const t: number[] = []
    const Fv: number[] = []
    for (const x of sorted) {
      // 即応群の到着は階段状なので、直前の値も入れる
      if (x === t_rap && x > 0) {
        t.push(x)
        Fv.push(Math.min(1, (N_res * phi(x)) / N_req))
      }
      t.push(x)
      Fv.push(F(x))
    }
    series = { t, F: Fv }
  }

  // ---- 警告（§6）
  const checkOrbit = (r: number, key: string) => {
    for (const pl of PLANETS) {
      if (Math.abs(pl.a - p.a_p) <= 1e-3 * p.a_p) continue // 対象天体そのもの
      if (Math.abs(r - pl.a) < 5 * hillRadius(pl.a, pl.GM)) warn('near-orbit', [key], { planet: pl.name })
      else if (pl.a > r && pl.a - r <= 0.1 * pl.a) warn('shades-other', [key], { planet: pl.name })
    }
  }
  checkOrbit(r_s, 'position')
  if (!build && Math.abs(r_park - r_s) > 1e-9 * r_s) checkOrbit(r_park, 'r_park')
  if (sigma_tot < CURRENT_TECH_SIGMA) warn('beyond-tech', ['sigma_film'])

  const M_station = N_req * m_dry
  const M_depart = N_req * m0

  return {
    outputs: {
      k,
      b,
      eta_steer,
      sigma_tot,
      beta_u: pl.beta_u,
      beta_req: pl.beta_req,
      sigma_max,
      k_eff: pl.k_eff,
      a_hold: pl.a_hold,
      d: pl.d,
      r_s,
      d_L1,
      rho: geometry.rho,
      eta_geom: geometry.eta_geom,
      A_req: geometry.A_req,
      N_req,
      area_vs_L1: geometry.A_req / geomL1.A_req,
      m_dry,
      M_ep,
      P_ep,
      a_sail,
      dv_sail,
      dv_ep,
      dv_keep,
      F_ep,
      m_prop,
      m0,
      prop_fraction: m0 > 0 ? m_prop / m0 : 0,
      M_station,
      M_depart,
      s,
      a_lat,
      t_rap,
      m_rap,
      V,
      a_br_sail,
      a_br_ep,
      t_min,
      dv_ep_br,
      m0_res,
      N_rap,
      N_res,
      res_ratio: N_res / N_req,
      total_ratio: (N_rap + N_res) / N_req,
      rap_share: N_rap + N_res > 0 ? N_rap / (N_rap + N_res) : 0,
      F_t1,
      F_t2,
      t_F1,
      t_F2,
      t_F100,
      A_rap: N_rap * p.A_unit,
      A_all: (N_rap + N_res) * p.A_unit,
      M_total: build ? M_depart : N_rap * m_rap + N_res * m0_res,
      replenish: p.lambda_mm * YEAR * N_req,
      replenish_rap: p.lambda_mm * YEAR * N_rap,
      r_park,
      series,
    },
    warnings,
    errors,
  }
}
