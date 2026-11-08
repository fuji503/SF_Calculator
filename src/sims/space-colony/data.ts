import type { Inputs } from '../types.ts'

/** 形（仕様書 §3.1） */
export type Shape = 'cylinder' | 'torus' | 'sphere' | 'dumbbell'
/** 球の床の配置（§3.2） */
export type SphereFloor = 'band' | 'terrace' | 'concentric'

// ---------------------------------------------------------------------------
// 大気（§3.3）

export interface AtmPreset {
  label: string
  P: number
  /** 乾いた空気のうちの酸素の割合 */
  fO2: number
  /** 酸素分圧 [Pa] */
  pO2: number
}

export const ATMOSPHERES: Record<string, AtmPreset> = {
  air: { label: '1気圧の空気（地球の海面、酸素分圧 21.2 kPa）※検証済み', P: 101_325, fO2: 0.2095, pO2: 21_230 },
  exploration: { label: '探査用の大気（56.5 kPa、酸素 34%、酸素分圧 19.2 kPa。NASA）※検証済み', P: 56_500, fO2: 0.34, pO2: 19_210 },
  // NASA SP-413：酸素分圧 22.7 kPa、窒素 26.6 kPa、合計 51.7 kPa（残りは水蒸気・二酸化炭素）。割合は乾いた空気（酸素と窒素）のうち
  stanford: { label: 'スタンフォード・トーラス（51.7 kPa、酸素分圧 22.7 kPa）※参考値', P: 51_700, fO2: 22.7 / (22.7 + 26.6), pO2: 22_700 },
}

// ---------------------------------------------------------------------------
// 構造材（§3.4）

export interface Material {
  label: string
  /** 強さ（金属は耐力、繊維は引張強さ）[Pa] */
  sigma_u: number
  /** 密度 [kg/m³] */
  rho: number
}

export const MATERIALS: Record<string, Material> = {
  ht780: { label: '高張力鋼（HT780）※検証済み', sigma_u: 685e6, rho: 7850 },
  al7075: { label: 'アルミ合金 7075-T6 ※検証済み', sigma_u: 503e6, rho: 2810 },
  al2219: { label: 'アルミ合金 2219-T87 ※検証済み', sigma_u: 393e6, rho: 2840 },
  ti64: { label: 'チタン合金 Ti-6Al-4V ※検証済み', sigma_u: 880e6, rho: 4430 },
  cfrp: { label: '炭素繊維複合材（一方向、T700 級）※参考値', sigma_u: 2550e6, rho: 1600 },
  kevlar: { label: 'アラミド繊維（ケブラー49）※参考値', sigma_u: 3620e6, rho: 1440 },
  uhmwpe: { label: '超高分子量ポリエチレン繊維（SK75 級）※参考値', sigma_u: 3600e6, rho: 975 },
}

// ---------------------------------------------------------------------------
// 放射線遮蔽（§3.8、§4.12）

export type ShieldMat = 'poly' | 'water' | 'regolith'

/** 遮蔽材のかさ密度 [kg/m³]（参考値） */
export const SHIELD_DENSITY: Record<ShieldMat, number> = { poly: 950, water: 1000, regolith: 1500 }

/** 面密度 [kg/m²] と年間の線量当量 [Sv/年] の表 */
export type DoseTable = readonly (readonly [number, number])[]

const t = (rows: [number, number][]): DoseTable => rows.map(([s, d]) => [s * 1000, d * 1e-3] as const)

/** Globus & Strout（2017）の OLTARIS の計算値（太陽活動が弱い時期） */
const FREE: Record<ShieldMat, DoseTable> = {
  // 表2（自由空間）
  poly: t([[1, 194], [2, 137], [3, 91], [4, 57], [5, 35], [6, 21.0], [7, 12.3]]),
  water: t([[1, 200], [2, 147], [3, 101], [4, 67], [5, 43], [6, 26.5], [7, 16.1]]),
  regolith: t([[1, 281], [2, 275], [3, 240], [4, 194], [5, 149], [6, 109], [7, 77], [8, 52], [9, 34.9], [10, 22.8], [11, 14.5]]),
}

// 表4（赤道上の低軌道 500 km・600 km、ポリエチレン。0 は遮蔽なしの代わりのごく薄い層）
const LEO500_POLY = t([
  [0, 17.7], [0.01, 17.1], [0.025, 16.4], [0.05, 15.3], [0.075, 14.4], [0.1, 13.7], [0.15, 12.7], [0.2, 12.0],
  [0.25, 11.7], [0.5, 11.9], [0.75, 12.7], [1, 13.3], [1.25, 13.6], [1.5, 13.8], [1.75, 13.7], [2, 13.5],
])
// 600 km：0〜2 t/m² は表4、3〜5 t/m² は表3（1、2 t/m² は両方の表で一致）
const LEO600_POLY = t([
  [0, 40.1], [0.01, 29.8], [0.025, 24.4], [0.05, 19.8], [0.075, 17.4], [0.1, 15.9], [0.15, 14.1], [0.2, 13.1],
  [0.25, 12.6], [0.5, 12.6], [0.75, 13.4], [1, 14.0], [1.25, 14.3], [1.5, 14.4], [1.75, 14.4], [2, 14.1],
  [3, 12.2], [4, 9.6], [5, 7.0],
])
// 表5（600 km、傾斜 0°、水）
const LEO600_WATER = t([[0.25, 14.6], [0.5, 12.1], [1, 13.2], [2, 14.0], [3, 12.6], [4, 10.3], [5, 7.9], [6, 5.7]])
// 表3（ポリエチレン）
const leo3 = (d: number[]) => t(d.map((v, i) => [i + 1, v]))

export interface Location {
  label: string
  /** 太陽からの距離 [AU] */
  d_sun: number
  /** 低軌道の高さ [m]（低軌道でなければ 0） */
  h_leo: number
  /** 材料ごとの線量の表（ないものは計算できない） */
  tables: Partial<Record<ShieldMat, DoseTable>>
}

export const LOCATIONS: Record<string, Location> = {
  free: { label: '自由空間（L5、月の近くなど。地球の磁場の外）※検証済み', d_sun: 1, h_leo: 0, tables: FREE },
  leo500: { label: '赤道上の低軌道 500 km ※検証済み', d_sun: 1, h_leo: 500e3, tables: { poly: LEO500_POLY } },
  leo600: { label: '赤道上の低軌道 600 km ※検証済み', d_sun: 1, h_leo: 600e3, tables: { poly: LEO600_POLY, water: LEO600_WATER } },
  leo700: { label: '赤道上の低軌道 700 km ※検証済み', d_sun: 1, h_leo: 700e3, tables: { poly: leo3([25.3, 18.3, 14.5, 10.9, 7.8]) } },
  leo800: { label: '赤道上の低軌道 800 km ※検証済み', d_sun: 1, h_leo: 800e3, tables: { poly: leo3([113, 39.3, 23.4, 14.8, 9.5]) } },
  leo900: { label: '赤道上の低軌道 900 km ※検証済み', d_sun: 1, h_leo: 900e3, tables: { poly: leo3([247, 72, 37, 21, 12.0]) } },
  leo1000: { label: '赤道上の低軌道 1000 km ※検証済み', d_sun: 1, h_leo: 1000e3, tables: { poly: leo3([425, 116, 55, 29, 15.7]) } },
  mars: { label: '火星の軌道（自由空間の表を使う）※参考値', d_sun: 1.524, h_leo: 0, tables: FREE },
}

// ---------------------------------------------------------------------------
// 構成の例（§9）

export interface ColonyPreset {
  label: string
  values: Inputs
}

const G0 = 9.80665

export const COLONY_PRESETS: Record<string, ColonyPreset> = {
  // Globus ほか（2007）：半径 250 m、長さ 325 m、約 2 rpm
  kalpana: {
    label: 'カルパナ・ワン（シリンダ、半径 250 m）※参考値',
    values: { shape: 'cylinder', A_f: 2 * Math.PI * 250 * 325, g_f: G0, R_f: 250, f_land: 1, atm: 'air', P_f: 101_325, f_O2: 0.2095, p_O2: 21_230, loc: 'free', shield_rot: true, shield_mat: 'regolith', shield_by: false, rho_sh: 1500 },
  },
  // NASA SP-413：外径 1790 m、管の直径 130 m、1 rpm、遮蔽は自転させない月の土 1.7 m（4.5 t/m²）。
  // 床の位置は推定：管の中心（半径 830 m）から 50 m 外の弦（幅 83 m、半径 880 m、0.98 G）
  stanford: {
    label: 'スタンフォード・トーラス（外径 1.79 km、1 rpm）※参考値',
    values: {
      shape: 'torus', A_f: 2 * Math.PI * 880 * 2 * Math.sqrt(65 ** 2 - 50 ** 2), g_f: 880 * (2 * Math.PI / 60) ** 2, R_f: 880, a: 65, n_deck: 0,
      atm: 'stanford', P_f: 51_700, f_O2: 22.7 / (22.7 + 26.6), p_O2: 22_700, loc: 'free', shield_rot: false, shield_mat: 'regolith', shield_by: true, sigma_sh: 4500, rho_sh: 4500 / 1.7,
    },
  },
  // O'Neill（1977）：直径 約 500 m、1.9 rpm、赤道で 1 G
  island1: {
    label: '島1号（バナール球、直径 約 500 m）※参考値',
    values: { shape: 'sphere', sphere_floor: 'band', A_f: 4 * Math.PI * 250 ** 2 * Math.sin(Math.acos(0.7)), g_f: G0, R_f: 250, g_min: 0.7 * G0, atm: 'air', P_f: 101_325, f_O2: 0.2095, p_O2: 21_230, loc: 'free', shield_rot: false, shield_mat: 'regolith', shield_by: false, rho_sh: 1500 },
  },
  // O'Neill（1974）：直径 6.4 km、長さ 32 km、陸と窓が3本ずつ
  island3: {
    label: '島3号（オニールの円筒、直径 6.4 km）※参考値',
    values: { shape: 'cylinder', A_f: 2 * Math.PI * 3200 * 32_000 * 0.5, g_f: G0, R_f: 3200, f_land: 0.5, atm: 'exploration', P_f: 56_500, f_O2: 0.34, p_O2: 19_210, loc: 'free', shield_rot: true, shield_mat: 'regolith', shield_by: false, rho_sh: 1500 },
  },
  // Janhunen（2020）：回転半径 230 m、2 rpm、遮蔽 9.04 t/m²（密度 2600）。元は内径 33 m の球の10階建て。ここでは、遮蔽の内側の半径が 16.5 m の円筒のモジュールで近似する
  dumbbell: {
    label: 'L5 の遮蔽付きダンベル（回転半径 230 m）※参考値',
    values: {
      shape: 'dumbbell', A_f: 2 * 16 * 40, g_f: G0, R_f: 230, a_m: 20, w_m: 16, n_deck: 8, h_deck: 3,
      atm: 'air', P_f: 101_325, f_O2: 0.2095, p_O2: 21_230, loc: 'free', shield_rot: true, shield_mat: 'regolith', shield_by: true, sigma_sh: 9041, rho_sh: 2600,
    },
  },
}
