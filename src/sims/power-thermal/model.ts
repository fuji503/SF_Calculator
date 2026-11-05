/**
 * 電源・排熱モジュールの計算（仕様書3(検証版) §4）。
 * 単位はすべて SI（W、J、K、s、kg、m²）。
 */
import { SIGMA_SB } from '../../core/physics/constants.ts'
import type { Message } from '../types.ts'

export type SunSource = 'none' | 'pv' | 'solar_thermal'
export type ReactorMode = 'none' | 'auto' | 'fixed'
export type BeamMode = 'none' | 'always' | 'sun_only'
export type NightBuffer = 'battery' | 'tes'
export type PayloadDesign = 'peak' | 'average'
export type TesCharge = 'heater' | 'solar_furnace'
export type TesOrigin = 'local' | 'earth'
export type ConverterType = 'stirling' | 'brayton_hexe' | 'brayton_sco2' | 'brayton_he' | 'thermoelectric' | 'rankine'
export type ReactorClass = 'kilopower' | 'sp100' | 'naval' | 'smr' | 'large' | 'htgr' | 'sfr' | 'lfr'
export type LocationId = 'deep_space' | 'leo' | 'mars_leo' | 'lunar' | 'mars_surface' | 'titan' | 'earth'

const MIN = 60
const HOUR = 3600
const DAY = 86_400

/** 二酸化炭素の臨界温度 [K] */
export const CO2_CRITICAL_T = 304.13

// ---------------------------------------------------------------------------
// プリセット（§3.1、§3.6 (b)、§3.7、§3.8）

export interface LocationPreset {
  I_sun: number
  T_cyc: number
  t_ecl: number
  T_sink: number
  T_sink_ecl: number
  /** 大気がない場所では入れない */
  T_env?: number
  h_c: number
}

export const LOCATION_PRESETS: Record<LocationId, LocationPreset> = {
  deep_space: { I_sun: 1361, T_cyc: DAY, t_ecl: 0, T_sink: 4, T_sink_ecl: 4, h_c: 0 },
  leo: { I_sun: 1361, T_cyc: 92.6 * MIN, t_ecl: 36 * MIN, T_sink: 210, T_sink_ecl: 210, h_c: 0 },
  mars_leo: { I_sun: 589, T_cyc: 118 * MIN, t_ecl: 41.5 * MIN, T_sink: 150, T_sink_ecl: 150, h_c: 0 },
  lunar: { I_sun: 1361, T_cyc: 29.53 * DAY, t_ecl: 14.77 * DAY, T_sink: 300, T_sink_ecl: 100, h_c: 0 },
  mars_surface: { I_sun: 230, T_cyc: 24.66 * HOUR, t_ecl: 12.33 * HOUR, T_sink: 200, T_sink_ecl: 200, T_env: 210, h_c: 2 },
  titan: { I_sun: 1.1, T_cyc: 15.95 * DAY, t_ecl: 7.97 * DAY, T_sink: 94, T_sink_ecl: 94, T_env: 94, h_c: 20 },
  earth: { I_sun: 500, T_cyc: 24 * HOUR, t_ecl: 12 * HOUR, T_sink: 275, T_sink_ecl: 275, T_env: 288, h_c: 10 },
}

export interface ConverterPreset {
  eta_mech: number
  T_cold: number
  /** kg/W（電気出力あたり） */
  alpha_conv: number
}

export const CONVERTER_PRESETS: Record<ConverterType, ConverterPreset> = {
  stirling: { eta_mech: 0.4, T_cold: 400, alpha_conv: 90e-3 },
  brayton_hexe: { eta_mech: 0.4, T_cold: 400, alpha_conv: 20e-3 },
  brayton_sco2: { eta_mech: 0.72, T_cold: 305, alpha_conv: 3e-3 },
  brayton_he: { eta_mech: 0.65, T_cold: 300, alpha_conv: 3e-3 },
  thermoelectric: { eta_mech: 0.1, T_cold: 800, alpha_conv: 12e-3 },
  rankine: { eta_mech: 0.7, T_cold: 310, alpha_conv: 3e-3 },
}

export interface ReactorPreset {
  T_hot: number
  /** kg/W（熱出力あたり）。0 は未設定 */
  alpha_r: number
  /** kg/W（熱出力あたり）。0 は未設定 */
  alpha_s: number
  converter: ConverterType
}

export const REACTOR_PRESETS: Record<ReactorClass, ReactorPreset> = {
  kilopower: { T_hot: 1073, alpha_r: 7e-3, alpha_s: 12.6e-3, converter: 'stirling' },
  sp100: { T_hot: 1350, alpha_r: 0.3e-3, alpha_s: 0.6e-3, converter: 'thermoelectric' },
  naval: { T_hot: 560, alpha_r: 2.5e-3, alpha_s: 0, converter: 'rankine' },
  smr: { T_hot: 560, alpha_r: 2.5e-3, alpha_s: 0, converter: 'rankine' },
  large: { T_hot: 560, alpha_r: 0.6e-3, alpha_s: 0, converter: 'rankine' },
  htgr: { T_hot: 1123, alpha_r: 0, alpha_s: 0, converter: 'brayton_he' },
  sfr: { T_hot: 823, alpha_r: 0, alpha_s: 0, converter: 'rankine' },
  lfr: { T_hot: 813, alpha_r: 0, alpha_s: 0, converter: 'rankine' },
}

/** 原子炉の比質量が未設定のクラス（§6 の情報） */
export const ALPHA_R_UNSET: ReadonlySet<string> = new Set(['htgr', 'sfr', 'lfr'])
/** 遮蔽の比質量が未設定のクラス（§6 の情報） */
export const ALPHA_S_UNSET: ReadonlySet<string> = new Set(['naval', 'smr', 'large', 'htgr', 'sfr', 'lfr'])

export interface TesMediumPreset {
  c: number
  rho: number
  L: number
  T_max: number
  T_min: number
  T_lim: number
  origin: TesOrigin
}

export const TES_MEDIUM_PRESETS: Record<'regolith' | 'solar_salt', TesMediumPreset> = {
  regolith: { c: 1000, rho: 2000, L: 0, T_max: 1100, T_min: 600, T_lim: 1300, origin: 'local' },
  solar_salt: { c: 1500, rho: 1850, L: 0, T_max: 838, T_min: 563, T_lim: 873, origin: 'earth' },
}

/** 断熱の条件ごとの1日あたりの損失率（割合/日） */
export const TES_INSULATION_PRESETS: Record<'ideal' | 'large_tank' | 'lunar_buried' | 'simple', number> = {
  ideal: 0,
  large_tank: 0.004,
  lunar_buried: 0.01,
  simple: 0.05,
}

/** 排熱バッファの蓄熱材（液体の水） */
export const WATER_BUFFER = { c_buf: 4180, dT_buf: 10, L_buf: 0, rho_buf: 1000 }

// ---------------------------------------------------------------------------
// 入力と出力

export interface Engine {
  converter: string
  T_cold: number
  eta_mech: number
  alpha_conv: number
}

export interface PowerInputs {
  // §3.1 環境
  I_sun: number
  T_cyc: number
  t_ecl: number
  T_sink: number
  T_sink_ecl: number
  T_env: number
  h_c: number
  // §3.2 負荷
  P_peak: number
  t_peak: number
  P_idle: number
  t_idle: number
  /** true なら、ミッション機器の排熱は電力と同じ */
  Q_pl_same: boolean
  Q_pl_peak: number
  Q_pl_idle: number
  T_payload: number
  payload_design: PayloadDesign
  // §3.3 排熱バッファ
  buf_medium: string
  c_buf: number
  dT_buf: number
  L_buf: number
  rho_buf: number
  // §3.4 蓄電池
  e_bat: number
  v_bat: number
  eta_bat: number
  DoD: number
  // §3.5 構成
  sun_source: SunSource
  reactor: ReactorMode
  beam: BeamMode
  night_buffer: NightBuffer
  // §3.6 電源
  eta_pv: number
  f_deg: number
  rho_pv: number
  reactor_class: string
  Q_r: number
  T_hot_r: number
  alpha_r: number
  shield_include: boolean
  alpha_s: number
  f_store: number
  eta_conc: number
  rho_conc: number
  T_hot_s: number
  P_beam: number
  // §3.7 熱機関
  eng_r: Engine
  eng_s: Engine
  eng_tes: Engine
  // §3.8 蓄熱体
  c_tes: number
  rho_tes: number
  L_tes: number
  T_melt: number
  T_max: number
  T_min: number
  T_lim: number
  tes_origin: TesOrigin
  tes_charge: TesCharge
  eta_heat: number
  alpha_heat: number
  dT_hx: number
  /** 1/s */
  lambda_tes: number
  alpha_hx: number
  // §3.9 ラジエータ
  eps: number
  rho_rad: number
  n_side: 1 | 2
  eta_fin: number
}

export type RadiatorId = 'r' | 's' | 'tes' | 'pl'

export interface RadiatorResult {
  /** 面積（パネルの片面の面積） */
  A: number
  /** 面積を決めた時間帯 */
  by: 'sun' | 'ecl'
  /** 面積を決めた時間帯の、1 m² あたりの放射と対流の放熱 */
  q_rad: number
  q_conv: number
}

export interface MassItem {
  key: string
  label: string
  mass: number
  origin: 'earth' | 'local'
}

export interface PowerOutputs {
  P_avg: number
  P_base: number
  Q_pl_peak: number
  Q_pl_idle: number
  Q_pl: number
  E_ecl: number
  // 一定の電源
  Q_r: number
  P_r: number
  eta_r: number
  carnot_r: number
  P_c_sun: number
  P_c_ecl: number
  // 日陰中のバッファ
  E_bn: number
  E_shave: number
  P_chg: number
  P_tes: number
  eta_tes_avg: number
  eta_tes_min: number
  eta_ret: number
  E_tes: number
  M_tes: number
  V_tes: number
  E_dir: number
  Q_sf: number
  A_sf: number
  Q_tes_max: number
  eta_rt: number
  // 日照中の電源
  P_gen: number
  P_surplus: number
  A_pv: number
  Q_s: number
  eta_s: number
  carnot_s: number
  A_conc: number
  // 蓄電池
  C_bat: number
  M_bat: number
  V_bat: number
  // 排熱バッファ
  E_buf: number
  M_buf: number
  V_buf: number
  // ラジエータ
  radiators: Partial<Record<RadiatorId, RadiatorResult>>
  A_rad: number
  M_rad: number
  // 質量
  masses: MassItem[]
  M_launch: number
  M_local: number
  M_total: number
}

export interface PowerResult {
  outputs: PowerOutputs | null
  warnings: Message[]
  errors: Message[]
}

// ---------------------------------------------------------------------------
// 計算

/** 熱機関の効率 η(T_h) = η_mech (1 − T_c/T_h) */
export function engineEfficiency(e: Engine, T_hot: number): number {
  return e.eta_mech * (1 - e.T_cold / T_hot)
}

/** ラジエータのパネル 1 m² あたりの放熱（§4.8）。放射と対流に分けて返す */
export function radiatorFlux(p: PowerInputs, T: number, T_sk: number): { q: number; q_rad: number; q_conv: number } {
  const k = p.n_side * p.eta_fin
  const q_rad = k * p.eps * SIGMA_SB * (T ** 4 - T_sk ** 4)
  const q_conv = k * p.h_c * (T - p.T_env)
  return { q: q_rad + q_conv, q_rad, q_conv }
}

/**
 * 蓄熱材 1 kg を T_max から T_min まで使い切るときの仕事と熱（§4.4 (b)）。
 * 効率が温度とともに下がることを積分で扱う
 */
export function tesWork(p: PowerInputs): { w: number; e: number } {
  const e = p.c_tes * (p.T_max - p.T_min) + p.L_tes
  const sensible = p.c_tes * (p.T_max - p.T_min - p.eng_tes.T_cold * Math.log(p.T_max / p.T_min))
  const latent = p.L_tes > 0 ? p.L_tes * (1 - p.eng_tes.T_cold / p.T_melt) : 0
  return { w: p.eng_tes.eta_mech * (sensible + latent), e }
}

/** 負荷のサイクルを日陰の最悪の場合（ピークの始まりと重なる）で数える（§4.2） */
function eclipseSum(p: PowerInputs, f: (P: number) => number): number {
  const T_load = p.t_peak + p.t_idle
  const n = Math.floor(p.t_ecl / T_load)
  const r = p.t_ecl - n * T_load
  return (
    n * (f(p.P_peak) * p.t_peak + f(p.P_idle) * p.t_idle) +
    f(p.P_peak) * Math.min(r, p.t_peak) +
    f(p.P_idle) * Math.max(0, r - p.t_peak)
  )
}

export function computePower(p: PowerInputs): PowerResult {
  const errors: Message[] = []
  const warnings: Message[] = []
  const err = (code: string, keys?: string[]) => errors.push({ code, keys })
  const warn = (code: string, keys?: string[]) => warnings.push({ code, keys })
  const info = (code: string, keys?: string[]) => warnings.push({ code, keys, level: 'info' })

  const hasSun = p.sun_source !== 'none'
  const useReactor = p.reactor !== 'none'
  const useBeam = p.beam !== 'none'
  const hasEcl = p.t_ecl > 0
  const tes = p.night_buffer === 'tes' && hasEcl
  const furnace = tes && p.tes_charge === 'solar_furnace'
  const solarThermal = p.sun_source === 'solar_thermal'

  // ---- 入力の組み合わせのチェック（§6）
  if (p.t_ecl >= p.T_cyc) err('ecl-range', ['t_ecl'])
  if (p.P_idle > p.P_peak) err('idle-above-peak', ['P_idle'])
  if (!hasSun && !useReactor && !useBeam) err('no-source', ['sun_source'])
  if (p.reactor === 'auto' && hasSun) err('auto-needs-no-sun', ['reactor'])
  if ((hasSun || furnace) && p.I_sun <= 0) err('no-sun', ['I_sun'])
  if (useReactor && p.eng_r.T_cold >= p.T_hot_r) err('cold-above-hot', ['T_cold_r'])
  if (solarThermal && p.eng_s.T_cold >= p.T_hot_s) err('cold-above-hot', ['T_cold_s'])
  const f_store = tes && p.reactor === 'fixed' ? p.f_store : 0
  if (tes) {
    if (p.T_max <= p.T_min) err('tmax-below-tmin', ['T_max'])
    else if (p.T_min <= p.eng_tes.T_cold) err('tmin-below-cold', ['T_min'])
    if (f_store > 0 && p.T_max > p.T_hot_r - p.dT_hx) err('tmax-above-reactor', ['T_max'])
    if (p.L_tes > 0 && (p.T_melt < p.T_min || p.T_melt > p.T_max)) err('melt-range', ['T_melt'])
  }
  if (errors.length > 0) return { outputs: null, warnings, errors }

  const t_sun = p.T_cyc - p.t_ecl

  // ---- §4.1 負荷の平均と排熱の設計値
  const T_load = p.t_peak + p.t_idle
  const Q_pl_peak = p.Q_pl_same ? p.P_peak : p.Q_pl_peak
  const Q_pl_idle = p.Q_pl_same ? p.P_idle : p.Q_pl_idle
  const P_avg = (p.P_peak * p.t_peak + p.P_idle * p.t_idle) / T_load
  const Q_pl_avg = (Q_pl_peak * p.t_peak + Q_pl_idle * p.t_idle) / T_load
  const average = p.payload_design === 'average'
  const Q_pl = average ? Q_pl_avg : Q_pl_peak
  const E_buf = average ? (Q_pl_peak - Q_pl_avg) * p.t_peak : 0

  // ---- §4.2 負荷を平らにした電力
  const P_base = (p.P_peak * p.t_peak + p.eta_bat * p.P_idle * p.t_idle) / (p.t_peak + p.eta_bat * p.t_idle)
  const E_ecl = hasEcl ? eclipseSum(p, (P) => P) : 0

  // ---- §4.3 一定の出力を出す電源
  const P_beam_sun = useBeam ? p.P_beam : 0
  const P_beam_ecl = p.beam === 'always' ? p.P_beam : 0
  const carnot_r = useReactor ? 1 - p.eng_r.T_cold / p.T_hot_r : 0
  const eta_r = useReactor ? engineEfficiency(p.eng_r, p.T_hot_r) : 0
  let Q_r = 0
  if (p.reactor === 'fixed') Q_r = p.Q_r
  else if (p.reactor === 'auto') Q_r = Math.max(0, P_base - (hasEcl ? P_beam_ecl : P_beam_sun)) / eta_r
  const P_r = eta_r * Q_r
  const P_c_sun = (1 - f_store) * P_r + P_beam_sun
  const P_c_ecl = P_r + P_beam_ecl

  // ---- §4.4 日陰中のバッファ
  let E_bn = 0
  let P_chg = 0
  let P_tes = 0
  let eta_tes_avg = 0
  let eta_tes_min = 0
  let eta_ret = 0
  let E_tes = 0
  let M_tes = 0
  let V_tes = 0
  let E_dir = 0
  let Q_sf = 0
  let A_sf = 0
  let Q_tes_max = 0
  let Q_rej_tes = 0
  let eta_rt = 0
  if (p.night_buffer === 'battery' && hasEcl && P_c_ecl < P_base) {
    const d = (P: number) => (P >= P_c_ecl ? P - P_c_ecl : p.eta_bat * (P - P_c_ecl))
    E_bn = Math.max(0, eclipseSum(p, d))
    P_chg = E_bn / (p.eta_bat * t_sun)
  }
  if (tes) {
    P_tes = Math.max(0, P_base - P_c_ecl)
    const { w, e } = tesWork(p)
    eta_tes_avg = w / e
    eta_tes_min = engineEfficiency(p.eng_tes, p.T_min)
    eta_ret = Math.exp(-p.lambda_tes * p.T_cyc / 2)
    E_tes = (P_tes * p.t_ecl) / eta_tes_avg / eta_ret
    M_tes = E_tes / e
    V_tes = M_tes / p.rho_tes
    E_dir = f_store * Q_r * t_sun
    const E_rem = Math.max(0, E_tes - E_dir)
    if (furnace) {
      Q_sf = E_rem / t_sun
      A_sf = Q_sf / (p.eta_conc * p.I_sun)
    } else {
      P_chg = E_rem / (p.eta_heat * t_sun)
    }
    Q_tes_max = P_tes / eta_tes_min
    Q_rej_tes = Q_tes_max - P_tes
    eta_rt = p.eta_heat * eta_ret * eta_tes_avg
    if (P_tes === 0) info('tes-unneeded')
    if (E_dir > E_tes && P_tes > 0) info('direct-surplus', ['f_store'])
    if (p.alpha_hx === 0 && P_tes > 0) info('hx-unset', ['alpha_hx'])
    if (p.T_max > p.T_lim) warn('above-tlim', ['T_max'])
  } else if (p.night_buffer === 'tes') {
    info('tes-unneeded')
  }

  // ---- §4.5 日照中の電源
  let P_gen = P_base - P_c_sun + P_chg
  let P_surplus = 0
  // 自動で決めた原子炉で、丸めの誤差だけ足りない場合は 0 とみなす
  if (Math.abs(P_gen) <= 1e-9 * Math.max(P_base, 1)) P_gen = 0
  if (P_gen < 0) {
    P_surplus = -P_gen
    P_gen = 0
    info('surplus')
  }
  if (!hasSun && P_gen > 0) {
    err('insufficient', ['sun_source'])
    return { outputs: null, warnings, errors }
  }
  let A_pv = 0
  let Q_s = 0
  let Q_rej_s = 0
  let A_conc = 0
  const carnot_s = solarThermal ? 1 - p.eng_s.T_cold / p.T_hot_s : 0
  const eta_s = solarThermal ? engineEfficiency(p.eng_s, p.T_hot_s) : 0
  if (p.sun_source === 'pv') {
    A_pv = P_gen / (p.eta_pv * p.f_deg * p.I_sun)
    if (p.I_sun < 10) warn('weak-sun', ['I_sun'])
  } else if (solarThermal) {
    Q_s = P_gen / eta_s
    Q_rej_s = Q_s - P_gen
    A_conc = Q_s / (p.eta_conc * p.I_sun)
  }

  // ---- §4.6 蓄電池
  const E_shave = Math.max(0, p.P_peak - P_base) * p.t_peak
  const C_bat = Math.max(E_bn, E_shave) / p.DoD
  const M_bat = C_bat / p.e_bat
  const V_bat = C_bat / p.v_bat
  // 1日に何度も充放電する使い方（地球低軌道の越夜や、短い負荷サイクルのピークの補い）
  const cyclesPerDay = (E_bn > 0 ? DAY / p.T_cyc : 0) + (E_shave > 0 ? DAY / T_load : 0)
  if (C_bat > 0 && cyclesPerDay > 1 && p.DoD > 0.4) info('dod-cycles', ['DoD'])

  // ---- §4.7 熱機関・原子炉・排熱バッファ
  const e_buf = p.c_buf * p.dT_buf + p.L_buf
  const M_buf = average ? E_buf / e_buf : 0
  const V_buf = M_buf / p.rho_buf
  if (average && p.buf_medium === 'water' && (p.T_payload < 273 || p.T_payload > 373)) warn('water-phase', ['T_payload'])

  // ---- §4.8 ラジエータ
  const radiators: Partial<Record<RadiatorId, RadiatorResult>> = {}
  const radiator = (id: RadiatorId, T: number, Q_sun: number, Q_ecl: number, key: string) => {
    if (Q_sun <= 0 && Q_ecl <= 0) return
    const sun = radiatorFlux(p, T, p.T_sink)
    const ecl = radiatorFlux(p, T, p.T_sink_ecl)
    const periods = [
      { by: 'sun' as const, Q: Q_sun, f: sun },
      { by: 'ecl' as const, Q: hasEcl ? Q_ecl : 0, f: ecl },
    ].filter((x) => x.Q > 0)
    let best: RadiatorResult | null = null
    for (const x of periods) {
      if (x.f.q <= 0) {
        err('cannot-reject', [key])
        return
      }
      if (x.f.q_rad < 0 || x.f.q_conv < 0) warn('reverse-flux', [key])
      const A = x.Q / x.f.q
      if (!best || A > best.A) best = { A, by: x.by, q_rad: x.f.q_rad, q_conv: x.f.q_conv }
    }
    if (best) radiators[id] = best
  }
  if (useReactor) radiator('r', p.eng_r.T_cold, (1 - f_store) * Q_r * (1 - eta_r), Q_r * (1 - eta_r), 'T_cold_r')
  if (solarThermal) radiator('s', p.eng_s.T_cold, Q_rej_s, 0, 'T_cold_s')
  if (tes) radiator('tes', p.eng_tes.T_cold, 0, Q_rej_tes, 'T_cold_tes')
  radiator('pl', p.T_payload, Q_pl, Q_pl, 'T_payload')
  if (errors.length > 0) return { outputs: null, warnings: dedupe(warnings), errors }
  const A_rad = Object.values(radiators).reduce((s, r) => s + r.A, 0)
  const M_rad = A_rad * p.rho_rad

  // 変換方式のチェック
  const engines: [boolean, Engine, string][] = [
    [useReactor, p.eng_r, 'T_cold_r'],
    [solarThermal, p.eng_s, 'T_cold_s'],
    [tes, p.eng_tes, 'T_cold_tes'],
  ]
  for (const [used, e, key] of engines) {
    if (used && e.converter === 'brayton_sco2' && e.T_cold < CO2_CRITICAL_T) warn('below-co2-critical', [key])
  }
  if (useReactor && ALPHA_R_UNSET.has(p.reactor_class) && p.alpha_r === 0) info('alpha-r-unset', ['alpha_r'])
  if (useReactor && p.shield_include && ALPHA_S_UNSET.has(p.reactor_class) && p.alpha_s === 0) info('alpha-s-unset', ['alpha_s'])

  // ---- §4.9 総質量
  const masses: MassItem[] = [
    { key: 'M_pv', label: '太陽電池', mass: A_pv * p.rho_pv, origin: 'earth' },
    { key: 'M_conc', label: '集光鏡（発電用）', mass: A_conc * p.rho_conc, origin: 'earth' },
    { key: 'M_reactor', label: '原子炉', mass: p.alpha_r * Q_r, origin: 'earth' },
    { key: 'M_shield', label: '遮蔽', mass: p.shield_include ? p.alpha_s * Q_r : 0, origin: 'earth' },
    { key: 'M_conv_r', label: '変換系（原子炉用）', mass: p.eng_r.alpha_conv * P_r, origin: 'earth' },
    { key: 'M_conv_s', label: '変換系（太陽熱用）', mass: solarThermal ? p.eng_s.alpha_conv * P_gen : 0, origin: 'earth' },
    { key: 'M_conv_tes', label: '変換系（蓄熱体用）', mass: p.eng_tes.alpha_conv * P_tes, origin: 'earth' },
    { key: 'M_heat', label: '電気ヒータ', mass: tes && !furnace ? p.alpha_heat * P_chg : 0, origin: 'earth' },
    { key: 'M_hx', label: '熱交換器・断熱・容器', mass: p.alpha_hx * Q_tes_max, origin: 'earth' },
    { key: 'M_sf', label: '集光鏡（太陽炉）', mass: A_sf * p.rho_conc, origin: 'earth' },
    { key: 'M_bat', label: '蓄電池', mass: M_bat, origin: 'earth' },
    { key: 'M_buf', label: '排熱バッファ', mass: M_buf, origin: 'earth' },
    { key: 'M_rad', label: 'ラジエータ', mass: M_rad, origin: 'earth' },
    { key: 'M_tes', label: '蓄熱材', mass: M_tes, origin: p.tes_origin === 'local' ? 'local' : 'earth' },
  ]
  const M_launch = masses.filter((m) => m.origin === 'earth').reduce((s, m) => s + m.mass, 0)
  const M_local = masses.filter((m) => m.origin === 'local').reduce((s, m) => s + m.mass, 0)

  return {
    outputs: {
      P_avg,
      P_base,
      Q_pl_peak,
      Q_pl_idle,
      Q_pl,
      E_ecl,
      Q_r,
      P_r,
      eta_r,
      carnot_r,
      P_c_sun,
      P_c_ecl,
      E_bn,
      E_shave,
      P_chg,
      P_tes,
      eta_tes_avg,
      eta_tes_min,
      eta_ret,
      E_tes,
      M_tes,
      V_tes,
      E_dir,
      Q_sf,
      A_sf,
      Q_tes_max,
      eta_rt,
      P_gen,
      P_surplus,
      A_pv,
      Q_s,
      eta_s,
      carnot_s,
      A_conc,
      C_bat,
      M_bat,
      V_bat,
      E_buf,
      M_buf,
      V_buf,
      radiators,
      A_rad,
      M_rad,
      masses,
      M_launch,
      M_local,
      M_total: M_launch + M_local,
    },
    warnings: dedupe(warnings),
    errors,
  }
}

/** 同じ警告を1つにまとめる（関係する入力のキーは合わせる） */
function dedupe(ms: Message[]): Message[] {
  const out: Message[] = []
  for (const m of ms) {
    const same = out.find((x) => x.code === m.code)
    if (same) same.keys = [...new Set([...(same.keys ?? []), ...(m.keys ?? [])])]
    else out.push({ ...m, keys: m.keys ? [...m.keys] : undefined })
  }
  return out
}
