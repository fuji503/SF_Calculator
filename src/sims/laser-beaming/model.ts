/**
 * レーザ発振・送電モジュールの計算（レーザ発振・送電モジュール仕様書4(検証版) §4）。
 * UI に依存しない純粋関数。長さは m、角度は rad、太陽距離だけ AU。
 */
import { C_LIGHT, SOLAR_CONSTANT_1AU } from '../../core/physics/constants.ts'
import type { Message } from '../types.ts'

export type LaserType = 'fiber' | 'co2' | 'chemical' | 'fel' | 'solar_pumped'
export type Atmosphere = 'vacuum' | 'earth' | 'mars' | 'titan'
export type Placement = 'emitter_surface' | 'target_surface'

export interface LaserInputs {
  laser_type: LaserType
  /** 波長 [m] */
  lambda: number
  /** 送光望遠鏡の口径 [m] */
  D: number
  /** ビーム品質係数 */
  M2: number
  /** 指向ジッター（1σ、1軸あたり） [rad] */
  sigma_jitter: number
  /** 変換効率 */
  eta: number
  /** 反応エネルギー密度 [J/kg]（化学のみ） */
  E_chem: number
  /** 排気で捨てる排熱の割合（化学のみ） */
  f_exhaust: number
  /** 補機電力比（化学のみ） */
  k_aux: number
  /** 発振器の太陽からの距離 [AU]（太陽光励起のみ） */
  d_sun: number
  I_sun_auto: boolean
  /** 太陽定数 [W/m²]（太陽光励起で手入力のとき） */
  I_sun: number
  /** 目標光出力 [W]（逆算のときは使わない） */
  P_opt: number
  /** 目標に届けたい量から目標光出力を逆算する */
  solve: boolean
  /** 逆算の目標を到達放射照度にする（false なら届く光の合計） */
  goal_by_irradiance: boolean
  /** 目標に届けたい光の合計 [W] */
  P_goal: number
  /** 目標に届けたい到達放射照度 [W/m²] */
  E_goal: number
  /** 発振器から目標までの距離 [m] */
  d: number
  atmosphere: Atmosphere
  placement: Placement
  /** 大気の光学的厚さ（鉛直） */
  tau: number
  /** 送光路の天頂角 [rad] */
  z: number
  /** 大気ゆらぎによる広がり角（直径） [rad] */
  theta_turb: number
  /** 受光面の直径（実効スポット直径の何倍か） */
  k_rx: number
}

export interface LaserOutputs {
  /** 目標光出力（逆算のときは計算結果） */
  P_opt: number
  E_target: number
  D_spot: number
  P_in: number
  Q_waste: number
  /** 大気を通ったあと目標に届く光の合計（受光面の外へこぼれる分を含む） */
  P_target: number
  /** 受光面に入る光の合計 */
  P_rx: number
  /** 受光面に入る光の割合 */
  f_rx: number
  D_rx: number
  A_rx: number
  /** スポット中心の到達放射照度 */
  E_peak: number
  /** 中心の強さ（受光面の平均の何倍か） */
  k_peak: number
  lambda_out: number
  t_delay: number
  sun_ratio: number
  T_atm: number
  D_diff: number
  D_jitter: number
  D_turb: number
  A_spot: number
  /** 化学のみ */
  m_dot?: number
  Q_chem_total?: number
  /** 太陽光励起のみ */
  A_collector?: number
  I_sun?: number
}

export interface LaserResult {
  outputs: LaserOutputs | null
  warnings: Message[]
  errors: Message[]
}

const DEG = Math.PI / 180

/** 発振器の方式ごとのプリセット（§3.4） */
export const LASER_PRESETS: Record<
  LaserType,
  { lambda: number; eta: number; M2: number; E_chem?: number; f_exhaust?: number; k_aux?: number }
> = {
  fiber: { lambda: 1.07e-6, eta: 0.4, M2: 1.2 },
  co2: { lambda: 10.6e-6, eta: 0.15, M2: 1.5 },
  chemical: { lambda: 3.8e-6, eta: 0.02, M2: 2.0, E_chem: 10e6, f_exhaust: 0.9, k_aux: 0.05 },
  fel: { lambda: 1.6e-6, eta: 0.1, M2: 1.0 },
  solar_pumped: { lambda: 1.06e-6, eta: 0.03, M2: 10 },
}

/** 大気の光学的厚さ τ（鉛直、晴天時）のプリセット（§3.4） */
export const TAU_PRESETS: Record<Exclude<Atmosphere, 'vacuum'>, Record<LaserType, number>> = {
  earth: { fiber: 0.15, co2: 1.0, chemical: 0.3, fel: 0.1, solar_pumped: 0.15 },
  mars: { fiber: 0.5, co2: 50, chemical: 0.3, fel: 0.45, solar_pumped: 0.5 },
  titan: { fiber: 2, co2: 3, chemical: 5, fel: 2, solar_pumped: 2 },
}

/** 大気ゆらぎによる広がり角 θ_turb のプリセット（発振器が地表、補償光学なし。§3.4） */
export const TURB_PRESETS: Record<Exclude<Atmosphere, 'vacuum'>, number> = {
  earth: 5e-6,
  mars: 2e-6,
  titan: 5e-6,
}

export function computeLaser(p: LaserInputs): LaserResult {
  const errors: Message[] = []
  const warnings: Message[] = []
  const chemical = p.laser_type === 'chemical'
  const solar = p.laser_type === 'solar_pumped'
  const inAir = p.atmosphere !== 'vacuum'

  // --- 入力チェック（§6）
  const goalKey = !p.solve ? 'P_opt' : p.goal_by_irradiance ? 'E_goal' : 'P_goal'
  for (const k of [goalKey, 'lambda', 'D', 'd', 'k_rx'] as const) {
    if (!(p[k] > 0)) errors.push({ code: 'positive', keys: [k] })
  }
  if (!(p.eta > 0 && p.eta <= 1)) errors.push({ code: 'eta-range', keys: ['eta'] })
  if (!(p.M2 >= 1)) errors.push({ code: 'm2-range', keys: ['M2'] })
  if (!(p.sigma_jitter >= 0)) errors.push({ code: 'non-negative', keys: ['sigma_jitter'] })
  if (chemical) {
    if (!(p.E_chem > 0)) errors.push({ code: 'chem-range', keys: ['E_chem'] })
    if (!(p.f_exhaust >= 0 && p.f_exhaust <= 1)) errors.push({ code: 'chem-range', keys: ['f_exhaust'] })
    if (!(p.k_aux >= 0)) errors.push({ code: 'non-negative', keys: ['k_aux'] })
  }
  if (solar) {
    if (!(p.d_sun > 0)) errors.push({ code: 'positive', keys: ['d_sun'] })
    if (!p.I_sun_auto && !(p.I_sun > 0)) errors.push({ code: 'positive', keys: ['I_sun'] })
  }
  const turbulent = inAir && p.placement === 'emitter_surface'
  if (inAir) {
    if (!(p.tau >= 0)) errors.push({ code: 'non-negative', keys: ['tau'] })
    if (!(p.z >= 0 && p.z < Math.PI / 2)) errors.push({ code: 'zenith-range', keys: ['z'] })
    if (turbulent && !(p.theta_turb >= 0)) errors.push({ code: 'non-negative', keys: ['theta_turb'] })
  }
  if (errors.length > 0) return { outputs: null, warnings, errors }

  // --- §4.2 スポット直径（エネルギーの約84〜86%が入る直径をそろえて二乗和）
  const D_diff = (2.44 * p.M2 * p.lambda * p.d) / p.D
  const D_jitter = 4 * p.sigma_jitter * p.d
  const D_turb = turbulent ? p.theta_turb * p.d : 0
  const D_spot = Math.sqrt(D_diff ** 2 + D_jitter ** 2 + D_turb ** 2)
  const A_spot = (Math.PI / 4) * D_spot ** 2

  // --- §4.7 受光面に入る割合（ビームの形をガウス分布で近似。直径 4σ の円に 1 − e⁻² ≈ 86%）
  const D_rx = p.k_rx * D_spot
  const A_rx = (Math.PI / 4) * D_rx ** 2
  const f_rx = 1 - Math.exp(-2 * p.k_rx ** 2)

  // --- §4.3 大気透過率、§4.4 到達電力と放射照度、§4.5 遅延時間
  const T_atm = inAir ? Math.exp(-p.tau / Math.cos(p.z)) : 1
  // §4.6 逆算：届けたい量から目標光出力を決める（スポット直径・透過率・割合は目標光出力によらない）
  const P_rx = !p.solve ? p.P_opt * T_atm * f_rx : p.goal_by_irradiance ? p.E_goal * A_rx : p.P_goal
  const P_opt = p.solve ? P_rx / (T_atm * f_rx) : p.P_opt
  const P_target = P_opt * T_atm
  const E_target = P_rx / A_rx
  // ガウス分布の中心の強さ：P/(2πσ²)、D_spot = 4σ
  const E_peak = (2 * P_target) / A_spot
  const t_delay = p.d / C_LIGHT
  if (p.solve && !(T_atm > 0)) return { outputs: null, warnings, errors: [{ code: 'no-light', keys: ['tau'] }] }

  // --- §4.1 リソース消費と排熱
  let P_in: number
  let Q_waste: number
  let m_dot: number | undefined
  let Q_chem_total: number | undefined
  let A_collector: number | undefined
  let I_sun: number | undefined
  if (chemical) {
    m_dot = P_opt / (p.eta * p.E_chem)
    Q_chem_total = P_opt / p.eta - P_opt
    Q_waste = (1 - p.f_exhaust) * Q_chem_total
    P_in = p.k_aux * P_opt
  } else if (solar) {
    I_sun = p.I_sun_auto ? SOLAR_CONSTANT_1AU / p.d_sun ** 2 : p.I_sun
    A_collector = P_opt / (p.eta * I_sun)
    Q_waste = A_collector * I_sun - P_opt
    P_in = 0
  } else {
    P_in = P_opt / p.eta
    Q_waste = P_in - P_opt
  }

  // --- 警告と情報（§6）
  if (inAir && p.z > 75 * DEG) warnings.push({ code: 'low-elevation', keys: ['z'] })
  if (p.D > 0.1 * p.d) warnings.push({ code: 'too-close', keys: ['D', 'd'] })
  if (inAir && Math.abs(p.lambda / LASER_PRESETS[p.laser_type].lambda - 1) > 1e-9) {
    warnings.push({ code: 'wavelength-changed', keys: ['lambda', 'tau'], level: 'info' })
  }
  if (T_atm < 0.01) warnings.push({ code: 'opaque-atmosphere', keys: ['T_atm'], level: 'info' })
  if (D_turb > 3 * D_diff) warnings.push({ code: 'turbulence-dominant', keys: ['theta_turb'], level: 'info' })

  return {
    outputs: {
      P_opt,
      E_target,
      D_spot,
      P_in,
      Q_waste,
      P_target,
      P_rx,
      f_rx,
      D_rx,
      A_rx,
      E_peak,
      k_peak: E_peak / E_target,
      lambda_out: p.lambda,
      t_delay,
      sun_ratio: E_target / SOLAR_CONSTANT_1AU,
      T_atm,
      D_diff,
      D_jitter,
      D_turb,
      A_spot,
      m_dot,
      Q_chem_total,
      A_collector,
      I_sun,
    },
    warnings,
    errors,
  }
}
