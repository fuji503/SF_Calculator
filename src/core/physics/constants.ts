/**
 * 物理定数（WebApp仕様書 §3.1）。値はすべてSI単位。
 * モジュール固有の目安値（材料定数など）は各モジュールに置き、ここには共通の定数だけを置く。
 */

/** 光速 [m/s]（定義値。SI 2019） */
export const C_LIGHT = 299_792_458

/** ステファン＝ボルツマン定数 [W/m²/K⁴]（CODATA 2018） */
export const SIGMA_SB = 5.670_374_419e-8

/** 天文単位 [m]（定義値。IAU 2012 決議 B2） */
export const AU = 1.495_978_707e11

/** 1 AU での太陽定数（全放射照度） [W/m²]（Kopp & Lean 2011：1360.8 ± 0.5） */
export const SOLAR_CONSTANT_1AU = 1361

/**
 * 1 AU での太陽の視直径 [rad]。
 * 太陽半径 6.957×10⁸ m（IAU 2015 決議 B3）から 2R⊙/AU = 9.301×10⁻³。
 */
export const SUN_ANGULAR_DIAMETER_1AU = 9.3e-3

/**
 * 太陽の輝度 [W/m²/sr]。太陽を一様な円盤とみなし、
 * L⊙ = I(1AU) / (π (θ/2)²) ≈ 2.004×10⁷。距離によらず一定。
 */
export const SUN_RADIANCE = SOLAR_CONSTANT_1AU / (Math.PI * (SUN_ANGULAR_DIAMETER_1AU / 2) ** 2)

/** 太陽の重力定数 GM⊙ [m³/s²]（IAU 2015 の公称値 1.3271244×10²⁰） */
export const GM_SUN = 1.32712e20

/** 太陽の光度 [W]（IAU 2015 決議 B3 の公称値） */
export const L_SUN = 3.828e26

/** 太陽の半径 [m]（IAU 2015 決議 B3 の公称値） */
export const R_SUN = 6.957e8

/** 標準重力加速度 [m/s²]（定義値） */
export const G0 = 9.80665

/** 1年 [s]（ユリウス年、365.25日） */
export const YEAR = 365.25 * 86_400
