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
}

export interface SolarOutputs {
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

  // --- 入力チェック（§6）
  if (!(p.D > 0)) errors.push({ code: 'positive', keys: ['D'] })
  if (!(p.d > 0)) errors.push({ code: 'positive', keys: ['d'] })
  if (!(p.N >= 1)) errors.push({ code: 'positive', keys: ['N'] })
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
  const D_spot = p.is_concave ? p.d * theta_eff : p.D + p.d * theta_eff
  const A_spot = (Math.PI / 4) * D_spot ** 2

  // --- §4.3 大気透過率
  let T_atm = 1
  for (const k of zenithKeys) T_atm *= atmTransmission(p.tau, p[k])

  // --- §4.4 到達電力と放射照度（エネルギー保存）
  const A_total = p.N * (Math.PI / 4) * p.D ** 2
  const cos_theta_i = Math.cos(p.theta_i)
  const P_spot = p.rho * I_sun * A_total * cos_theta_i * T_atm
  const E_target = P_spot / A_spot
  const suns = E_target / I_sun

  // --- §4.5 理論限界
  const E_max = p.rho * Math.PI * SUN_RADIANCE * T_atm

  if (E_target > E_max) errors.push({ code: 'over-limit', keys: ['E_target'] })
  for (const k of zenithKeys) {
    if (p[k] > 75 * DEG) warnings.push({ code: 'low-elevation', keys: [k] })
  }
  if (p.D > 0.1 * p.d) warnings.push({ code: 'too-close', keys: ['D', 'd'] })
  if (p.is_concave && p.theta_i > 30 * DEG) warnings.push({ code: 'oblique-concave', keys: ['theta_i'] })
  if (T_atm < 0.01) warnings.push({ code: 'opaque-atmosphere', keys: ['T_atm'], level: 'info' })

  return {
    outputs: {
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
