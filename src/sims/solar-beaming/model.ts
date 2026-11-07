/**
 * 太陽光集光・送光モジュールの計算（太陽光集光・送光モジュール仕様書3(検証版) §4）。
 * UI に依存しない純粋関数。角度は rad、長さは m、太陽距離だけ AU。
 */
import { SOLAR_CONSTANT_1AU, SUN_ANGULAR_DIAMETER_1AU, SUN_RADIANCE } from '../../core/physics/constants.ts'
import type { Message } from '../types.ts'

export type AtmCase = 'space' | 'mirror_surface' | 'target_surface'

export interface SolarInputs {
  /** 鏡の太陽からの距離 [AU] */
  d_sun: number
  /** 太陽定数を距離から自動で計算する */
  I_sun_auto: boolean
  /** 太陽定数 [W/m²]（I_sun_auto が false のときだけ使う） */
  I_sun: number
  atm_case: AtmCase
  /** 大気の光学的厚さ（鉛直方向） */
  tau: number
  /** 鏡から見た太陽の天頂角 [rad] */
  z_sun: number
  /** 送光路の天頂角 [rad] */
  z_t: number
  /** 鏡1枚の口径 [m] */
  D: number
  /** 基数 */
  N: number
  is_concave: boolean
  /** 実効反射率 */
  rho: number
  /** 面精度（法線の傾きの誤差、1σ） [rad] */
  sigma_slope: number
  /** 指向精度（法線の向きの誤差、1σ） [rad] */
  sigma_point: number
  /** 鏡から受光体までの距離 [m] */
  d: number
  /** 鏡への入射角 [rad] */
  theta_i: number
  /** 届けたい量から逆算する（§4.6） */
  solve: boolean
  /** 逆算の目標を到達放射照度にする（false ならスポットに届く光の合計） */
  goal_by_irradiance: boolean
  /** 逆算で、鏡1枚の口径を決める（false なら基数を決める） */
  solve_diameter: boolean
  /** スポットに届けたい光の合計 [W] */
  P_goal: number
  /** 届けたい到達放射照度 [W/m²] */
  E_goal: number
}

export interface SolarOutputs {
  /** 鏡1枚の口径と基数（逆算のときは計算結果） */
  D: number
  N: number
  /** 逆算で必要な基数（端数を切り上げる前） */
  N_exact: number
  /** 鏡1枚の面積 */
  A_mirror: number
  E_target: number
  suns: number
  D_spot: number
  P_spot: number
  A_spot: number
  theta_eff: number
  cos_theta_i: number
  T_atm: number
  A_total: number
  I_sun: number
  theta_sun: number
  E_max: number
}

export interface SolarResult {
  outputs: SolarOutputs | null
  warnings: Message[]
  errors: Message[]
}

const DEG = Math.PI / 180

/** 大気を1回通るときの透過率 T(z) = exp(−τ / cos z)（§4.3） */
export function atmTransmission(tau: number, z: number): number {
  return Math.exp(-tau / Math.cos(z))
}

export function computeSolar(p: SolarInputs): SolarResult {
  const errors: Message[] = []
  const warnings: Message[] = []

  // --- 入力チェック（§6）。逆算で決める値（口径か基数）は見ない
  const solveD = p.solve && p.solve_diameter
  const solveN = p.solve && !p.solve_diameter
  if (!solveD && !(p.D > 0)) errors.push({ code: 'positive', keys: ['D'] })
  if (!(p.d > 0)) errors.push({ code: 'positive', keys: ['d'] })
  if (!solveN && !(p.N >= 1)) errors.push({ code: 'positive', keys: ['N'] })
  if (p.solve && p.goal_by_irradiance && !(p.E_goal > 0)) errors.push({ code: 'positive', keys: ['E_goal'] })
  if (p.solve && !p.goal_by_irradiance && !(p.P_goal > 0)) errors.push({ code: 'positive', keys: ['P_goal'] })
  if (!(p.d_sun > 0)) errors.push({ code: 'positive', keys: ['d_sun'] })
  if (!p.I_sun_auto && !(p.I_sun > 0)) errors.push({ code: 'positive', keys: ['I_sun'] })
  if (!(p.rho >= 0 && p.rho <= 1)) errors.push({ code: 'rho-range', keys: ['rho'] })
  if (!(p.theta_i >= 0 && p.theta_i < Math.PI / 2)) errors.push({ code: 'theta-i-range', keys: ['theta_i'] })
  if (!(p.sigma_slope >= 0)) errors.push({ code: 'non-negative', keys: ['sigma_slope'] })
  if (!(p.sigma_point >= 0)) errors.push({ code: 'non-negative', keys: ['sigma_point'] })

  const zenithKeys: ('z_sun' | 'z_t')[] =
    p.atm_case === 'mirror_surface' ? ['z_sun', 'z_t'] : p.atm_case === 'target_surface' ? ['z_t'] : []
  if (p.atm_case !== 'space' && !(p.tau >= 0)) errors.push({ code: 'non-negative', keys: ['tau'] })
  for (const k of zenithKeys) {
    if (!(p[k] >= 0 && p[k] < Math.PI / 2)) errors.push({ code: 'zenith-range', keys: [k] })
  }
  if (errors.length > 0) return { outputs: null, warnings, errors }

  // --- §4.1 太陽定数と視直径
  const I_sun = p.I_sun_auto ? SOLAR_CONSTANT_1AU / p.d_sun ** 2 : p.I_sun
  const theta_sun = SUN_ANGULAR_DIAMETER_1AU / p.d_sun

  // --- §4.2 実効スポット角とスポット径（法線の 1σ 誤差 → 反射光の直径相当 8σ）
  const theta_eff = Math.sqrt(theta_sun ** 2 + (8 * p.sigma_slope) ** 2 + (8 * p.sigma_point) ** 2)
  const spotOf = (D: number) => (p.is_concave ? p.d * theta_eff : D + p.d * theta_eff)

  // --- §4.3 大気透過率
  let T_atm = 1
  for (const k of zenithKeys) T_atm *= atmTransmission(p.tau, p[k])

  // --- §4.5 理論限界
  const E_max = p.rho * Math.PI * SUN_RADIANCE * T_atm
  const cos_theta_i = Math.cos(p.theta_i)
  // 鏡 1 m² あたりがスポットに届ける光 [W/m²]
  const k_mirror = p.rho * I_sun * cos_theta_i * T_atm

  // --- §4.6 逆算：届けたい量から、基数か鏡1枚の口径を決める
  let D = p.D
  let N = p.N
  let N_exact = p.N
  if (p.solve) {
    if (!(k_mirror > 0)) return { outputs: null, warnings, errors: [{ code: 'no-light', keys: ['rho'] }] }
    if (p.goal_by_irradiance && p.E_goal > E_max) return { outputs: null, warnings, errors: [{ code: 'goal-over-limit', keys: ['E_goal'] }] }
    if (solveN) {
      const P_need = p.goal_by_irradiance ? p.E_goal * (Math.PI / 4) * spotOf(p.D) ** 2 : p.P_goal
      N_exact = P_need / (k_mirror * (Math.PI / 4) * p.D ** 2)
      // 丸めの誤差で 1 基増えないよう、ごくわずかに小さくしてから切り上げる
      N = Math.max(1, Math.ceil(N_exact * (1 - 1e-12)))
    } else if (!p.goal_by_irradiance || p.is_concave) {
      // 凹面鏡のスポットは口径によらないので、届けたい光の合計が決まる
      const P_need = p.goal_by_irradiance ? p.E_goal * (Math.PI / 4) * spotOf(0) ** 2 : p.P_goal
      D = Math.sqrt(P_need / (k_mirror * p.N * (Math.PI / 4)))
    } else {
      // 平面鏡：E = N k D² / (D + dθ)² は口径とともに N k に近づき、それより強くはならない
      const s = Math.sqrt(p.E_goal / (p.N * k_mirror))
      if (s >= 1) return { outputs: null, warnings, errors: [{ code: 'flat-unreachable', keys: ['E_goal', 'is_concave'] }] }
      D = (s * p.d * theta_eff) / (1 - s)
    }
  }
  const D_spot = spotOf(D)
  const A_spot = (Math.PI / 4) * D_spot ** 2

  // --- §4.4 到達電力と放射照度（エネルギー保存）
  const A_total = N * (Math.PI / 4) * D ** 2
  const P_spot = k_mirror * A_total
  const E_target = P_spot / A_spot
  const suns = E_target / I_sun

  if (E_target > E_max) errors.push({ code: 'over-limit', keys: ['E_target'] })
  for (const k of zenithKeys) {
    if (p[k] > 75 * DEG) warnings.push({ code: 'low-elevation', keys: [k] })
  }
  if (D > 0.1 * p.d) warnings.push({ code: 'too-close', keys: ['D', 'd'] })
  if (p.is_concave && p.theta_i > 30 * DEG) warnings.push({ code: 'oblique-concave', keys: ['theta_i'] })
  if (T_atm < 0.01) warnings.push({ code: 'opaque-atmosphere', keys: ['T_atm'], level: 'info' })

  return {
    outputs: {
      D,
      N,
      N_exact,
      A_mirror: (Math.PI / 4) * D ** 2,
      E_target,
      suns,
      D_spot,
      P_spot,
      A_spot,
      theta_eff,
      cos_theta_i,
      T_atm,
      A_total,
      I_sun,
      theta_sun,
      E_max,
    },
    warnings,
    errors,
  }
}
