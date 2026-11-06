/**
 * 原子炉・遮蔽モジュールのデータ（仕様書1(新規) §3、§4.1）。
 * 単位は SI（m、kg、W、s、J）。表の値は仕様書の表示単位から直してある。
 */

const MEV = 1.602176634e-13
const DAY = 86_400

// ---------------------------------------------------------------------------
// §4.1 基本量

/** 核分裂1回で取り出せるエネルギー [J]（200 MeV） */
export const E_FISSION = 200 * MEV
/** 核分裂1回あたりのガンマ線のエネルギー [J]（即発 7 MeV＋崩壊 7 MeV） */
export const E_GAMMA = 14 * MEV
/** 中性子のフルエンスから線量当量への換算 [Sv·m²]（3.85×10⁻¹⁰ Sv·cm²） */
export const H_N = 3.85e-14
/** 2 MeV のガンマ線の質量エネルギー吸収係数 [m²/kg]：人体（水で代用）、シリコン */
export const MU_EN = { human: 0.002601, electronics: 0.002336 } as const
/** 中性子の質量 [kg] */
export const M_NEUTRON = 1.6749e-27
/** 原子質量単位 [kg] */
export const AMU = 1.66054e-27
export { MEV }

// ---------------------------------------------------------------------------
// §3.2 核分裂する物質

export type FuelId = 'u235' | 'u233' | 'pu239'

export interface FuelData {
  label: string
  /** 原子量 */
  A: number
  /** 核分裂1回あたりの中性子の数（熱中性子） */
  nu: number
  /** 捕獲と核分裂の比（熱中性子） */
  alpha_c: number
  /** 捕獲と核分裂の比（高速炉の中性子のエネルギーで平均、参考値） */
  alpha_c_fast: number
}

export const FUELS: Record<FuelId, FuelData> = {
  u235: { label: 'ウラン235', A: 235.04, nu: 2.43, alpha_c: 0.169, alpha_c_fast: 0.292 },
  u233: { label: 'ウラン233（トリウムサイクル）', A: 233.04, nu: 2.49, alpha_c: 0.085, alpha_c_fast: 0.1 },
  pu239: { label: 'プルトニウム239', A: 239.05, nu: 2.88, alpha_c: 0.362, alpha_c_fast: 0.248 },
}

/** 中性子のエネルギーに合わせた捕獲と核分裂の比 */
export const alphaFor = (fuel: FuelData, spectrum: 'fast' | 'thermal') => (spectrum === 'fast' ? fuel.alpha_c_fast : fuel.alpha_c)

// ---------------------------------------------------------------------------
// §3.3 冷却材

export type CoolantId = 'water' | 'helium' | 'sodium' | 'na_heatpipe' | 'nak' | 'lead' | 'pbbi' | 'lithium'

export interface CoolantData {
  label: string
  /** 融点 [K]。なければ undefined */
  T_melt?: number
  /** 沸点（1気圧） [K]。加圧して使う・気体の冷却材は undefined */
  T_boil?: number
  /** 出口温度の目安 [K] */
  T_out: number
  /** 放射化の割合 */
  f_act: number
  /** 放射化でできる物質の半減期 [s]。ガンマ線を出さないものは 0 */
  half_life: number
  /** 1回の崩壊あたりのガンマ線のエネルギー [J] */
  E_decay: number
}

export const COOLANTS: Record<CoolantId, CoolantData> = {
  water: { label: '水（加圧水）', T_out: 600, f_act: 1e-5, half_life: 7.13, E_decay: 4.5 * MEV },
  helium: { label: 'ヘリウム', T_out: 1223, f_act: 0, half_life: 0, E_decay: 0 },
  sodium: { label: 'ナトリウム', T_melt: 371, T_boil: 1156, T_out: 823, f_act: 3e-3, half_life: 15.0 * 3600, E_decay: 4.12 * MEV },
  // Kilopower のヒートパイプ。出口温度の目安は KRUSTY 試験の運転温度（約1073 K）に余裕を見た値（参考値）
  na_heatpipe: {
    label: 'ナトリウム（ヒートパイプ）※参考値',
    T_melt: 371,
    T_boil: 1156,
    T_out: 1123,
    f_act: 3e-3,
    half_life: 15.0 * 3600,
    E_decay: 4.12 * MEV,
  },
  nak: { label: 'ナトリウムカリウム合金（NaK-78）', T_melt: 261, T_boil: 1058, T_out: 811, f_act: 1e-3, half_life: 15.0 * 3600, E_decay: 4.12 * MEV },
  lead: { label: '鉛', T_melt: 601, T_boil: 2022, T_out: 813, f_act: 0, half_life: 0, E_decay: 0 },
  pbbi: { label: '鉛ビスマス', T_melt: 398, T_boil: 1943, T_out: 773, f_act: 0, half_life: 0, E_decay: 0 },
  lithium: { label: 'リチウム', T_melt: 454, T_boil: 1615, T_out: 1350, f_act: 0, half_life: 0, E_decay: 0 },
}

// ---------------------------------------------------------------------------
// §3.2 炉のクラス

export type ReactorClass = 'kilopower' | 'sp100' | 'naval' | 'nuscale' | 'bwrx' | 'large' | 'sfr' | 'lfr' | 'htgr'

export interface ClassPreset {
  label: string
  spectrum: 'fast' | 'thermal'
  coolant: CoolantId
  /** 炉心の平均の出力密度 [W/m³] */
  q: number
  /** 臨界に必要な最小の体積 [m³] */
  V_min: number
  HD: number
  /** 反射体などの厚さ [m] */
  t_ref: number
  /** 体積あたりの重金属 [kg/m³] */
  rho_HM: number
  fuel: FuelId
  e: number
  /** 燃焼度の上限 [J/kg]。0 は未設定 */
  Bu_max: number
  f_n: number
  f_g: number
  T_hot: number
  /** [kg/W] */
  alpha_r: number
}

/** GWd/t → J/kg */
const GWD_T = (1e9 * DAY) / 1e3

export const CLASSES: Record<ReactorClass, ClassPreset> = {
  // Kilopower の出力密度は臨界で決まるので、目安として SP-100 と同じ値を置く（参考値）
  kilopower: {
    label: '宇宙用超小型炉（Kilopower）※参考値',
    spectrum: 'fast',
    coolant: 'na_heatpipe',
    q: 70e6,
    V_min: 2.54e-3,
    HD: 1.8,
    t_ref: 0.1,
    rho_HM: 15.9e3,
    fuel: 'u235',
    e: 0.93,
    Bu_max: 0,
    f_n: 0.3,
    f_g: 0.05,
    T_hot: 1073,
    alpha_r: 7e-3,
  },
  sp100: {
    label: '宇宙用小型炉（SP-100）※参考値',
    spectrum: 'fast',
    coolant: 'lithium',
    q: 70e6,
    V_min: 0,
    HD: 1.0,
    t_ref: 0.1,
    rho_HM: 6.0e3,
    fuel: 'u235',
    e: 0.93,
    Bu_max: 0,
    f_n: 0.3,
    f_g: 0.05,
    T_hot: 1350,
    alpha_r: 0.3e-3,
  },
  naval: {
    label: '艦船用炉 ※参考値',
    spectrum: 'thermal',
    coolant: 'water',
    q: 100e6,
    V_min: 0,
    HD: 1.1,
    t_ref: 0,
    rho_HM: 2.7e3,
    fuel: 'u235',
    e: 0.07,
    Bu_max: 50 * GWD_T,
    f_n: 1e-3,
    f_g: 0.05,
    T_hot: 560,
    alpha_r: 2.5e-3,
  },
  nuscale: {
    label: '小型モジュール炉（NuScale、250 MWt）',
    spectrum: 'thermal',
    coolant: 'water',
    q: 74e6,
    V_min: 0,
    HD: 1.35,
    t_ref: 0,
    rho_HM: 2.7e3,
    fuel: 'u235',
    e: 0.0495,
    Bu_max: 50 * GWD_T,
    f_n: 1e-3,
    f_g: 0.05,
    T_hot: 560,
    alpha_r: 2.5e-3,
  },
  bwrx: {
    label: '小型モジュール炉（BWRX-300、870 MWt）※参考値',
    spectrum: 'thermal',
    coolant: 'water',
    q: 41e6,
    V_min: 0,
    HD: 1.8,
    t_ref: 0,
    rho_HM: 2.0e3,
    fuel: 'u235',
    e: 0.0495,
    Bu_max: 50 * GWD_T,
    f_n: 1e-3,
    f_g: 0.05,
    T_hot: 560,
    alpha_r: 2.5e-3,
  },
  large: {
    label: '大型発電炉（加圧水型炉、3400 MWt）',
    spectrum: 'thermal',
    coolant: 'water',
    q: 104e6,
    V_min: 0,
    HD: 1.1,
    t_ref: 0,
    rho_HM: 2.73e3,
    fuel: 'u235',
    e: 0.045,
    Bu_max: 50 * GWD_T,
    f_n: 1e-3,
    f_g: 0.05,
    T_hot: 560,
    alpha_r: 0.6e-3,
  },
  sfr: {
    label: 'ナトリウム冷却高速炉 ※参考値',
    spectrum: 'fast',
    coolant: 'sodium',
    q: 300e6,
    V_min: 0,
    HD: 1.0,
    t_ref: 0,
    rho_HM: 3.0e3,
    fuel: 'pu239',
    e: 0.2,
    Bu_max: 100 * GWD_T,
    f_n: 1e-3,
    f_g: 0.05,
    T_hot: 823,
    alpha_r: 0,
  },
  lfr: {
    label: '鉛冷却高速炉 ※参考値',
    spectrum: 'fast',
    coolant: 'lead',
    q: 100e6,
    V_min: 0,
    HD: 1.0,
    t_ref: 0,
    rho_HM: 3.0e3,
    fuel: 'pu239',
    e: 0.15,
    Bu_max: 100 * GWD_T,
    f_n: 1e-3,
    f_g: 0.05,
    T_hot: 813,
    alpha_r: 0,
  },
  htgr: {
    label: '高温ガス炉 ※参考値',
    spectrum: 'thermal',
    coolant: 'helium',
    q: 6.5e6,
    V_min: 0,
    HD: 1.0,
    t_ref: 0,
    rho_HM: 0.1e3,
    fuel: 'u235',
    e: 0.15,
    Bu_max: 100 * GWD_T,
    f_n: 1e-3,
    f_g: 0.05,
    T_hot: 1123,
    alpha_r: 0,
  },
}

// ---------------------------------------------------------------------------
// §3.5 遮蔽材

export type ComponentId = 'regolith' | 'cement' | 'water' | 'sulfur' | 'resin'

export const COMPONENTS: Record<ComponentId, { label: string; sigmaR: number }> = {
  // 質量あたりの除去断面積 [m²/kg]（cm²/g × 0.1）
  regolith: { label: 'レゴリス', sigmaR: 0.00322 },
  cement: { label: 'セメント', sigmaR: 0.00322 },
  water: { label: '水', sigmaR: 0.0103 },
  sulfur: { label: '硫黄', sigmaR: 0.00287 },
  resin: { label: '樹脂', sigmaR: 0.00929 },
}

export type MaterialId =
  | 'lih'
  | 'tungsten'
  | 'water'
  | 'hdpe'
  | 'concrete'
  | 'iron'
  | 'lead'
  | 'b4c'
  | 'regolith'
  | 'reg_concrete'
  | 'sulfur_concrete'
  | 'polymer_concrete'

export interface Material {
  label: string
  /** 密度 [kg/m³] */
  rho: number
  /** 除去断面積 [1/m] */
  sigmaR: number
  /** 線減衰係数 [1/m]（2 MeV） */
  mu: number
  /** 水素を含む（除去断面積の計算が成り立つ） */
  hydrogen: boolean
  /** 厚さの上限 [m] */
  t_max: number
  /** 成分と質量の割合（レゴリスを使う材料だけ）。ほかの材料は地球から運ぶ */
  components?: Partial<Record<ComponentId, number>>
}

/** 混合材料の除去断面積 [1/m]：密度 × Σ(成分の割合 × 成分の質量あたりの除去断面積)（§4.7） */
export function mixSigmaR(rho: number, components: Partial<Record<ComponentId, number>>): number {
  return rho * Object.entries(components).reduce((s, [c, w]) => s + (w ?? 0) * COMPONENTS[c as ComponentId].sigmaR, 0)
}

/**
 * 遮蔽材。除去断面積は §3.5 の表の値（有効数字3桁）を使う。
 * 混合材料の表の値は §4.7 の式で計算した値と一致する（テストで確かめる）
 */
function material(
  label: string,
  rho: number,
  sigmaR_cm: number,
  muRho_cm2g: number,
  hydrogen: boolean,
  t_max: number,
  components?: Partial<Record<ComponentId, number>>,
): Material {
  return { label, rho, sigmaR: sigmaR_cm * 100, mu: muRho_cm2g * 0.1 * rho, hydrogen, t_max, components }
}

export const MATERIALS: Record<MaterialId, Material> = {
  lih: material('水素化リチウム（LiH）', 780, 0.112, 0.0448, true, 5),
  tungsten: material('タングステン', 19300, 0.197, 0.0442, false, 5),
  water: material('水', 1000, 0.103, 0.0494, true, 5),
  hdpe: material('高密度ポリエチレン', 950, 0.122, 0.049, true, 5),
  concrete: material('普通コンクリート', 2300, 0.089, 0.0446, true, 10),
  iron: material('鉄（鋼）', 7870, 0.157, 0.0426, false, 5),
  lead: material('鉛', 11350, 0.118, 0.0461, false, 5),
  b4c: material('炭化ホウ素（B₄C）', 2520, 0.144, 0.0418, false, 5),
  regolith: material('レゴリス（月、締め固め）', 1800, 0.058, 0.0445, false, 10, { regolith: 1 }),
  reg_concrete: material('レゴリスのコンクリート（水とセメント）', 2400, 0.0892, 0.0446, true, 10, { regolith: 0.78, cement: 0.15, water: 0.07 }),
  sulfur_concrete: material('サルファコンクリート（硫黄とレゴリス）', 2300, 0.0712, 0.0446, false, 10, { regolith: 0.65, sulfur: 0.35 }),
  polymer_concrete: material('ポリマーコンクリート（樹脂とレゴリス）', 2100, 0.0867, 0.0446, true, 10, { regolith: 0.85, resin: 0.15 }),
}

/** 地盤の種類（地表の配置）。密度は水を含めた値、含水率は全体の質量に対する水の割合 */
export const GROUNDS: Record<'moon' | 'mars' | 'earth', { label: string; rho: number; w: number }> = {
  moon: { label: '月のレゴリス（乾燥、締め固め）', rho: 1800, w: 0 },
  mars: { label: '火星のレゴリス（水 2%）※参考値', rho: 1600, w: 0.02 },
  earth: { label: '地球の湿った土（水 15%）※参考値', rho: 1900, w: 0.15 },
}

/** 水素を含むとみなす含水率（これより乾いた地盤では精度の警告を出す） */
export const GROUND_W_HYDROGEN = 0.01

/**
 * 地盤の材料：乾いたレゴリスと水の混合（§4.7 の混合の式）。
 * 乾いた部分は月のレゴリスの表の値を質量あたりにして使うので、含水率 0・密度 1800 kg/m³ で表の値と一致する
 */
export function groundMaterial(rho: number, w: number): Material {
  const reg = MATERIALS.regolith
  const water = MATERIALS.water
  return {
    label: '地盤と同じ土',
    rho,
    sigmaR: rho * ((1 - w) * (reg.sigmaR / reg.rho) + w * COMPONENTS.water.sigmaR),
    mu: rho * ((1 - w) * (reg.mu / reg.rho) + w * (water.mu / water.rho)),
    hydrogen: w >= GROUND_W_HYDROGEN,
    t_max: reg.t_max,
    // 掘り出した土を使うので、調達はレゴリスと同じ扱い（現地）にする
    components: { regolith: 1 },
  }
}

// ---------------------------------------------------------------------------
// §3.4 線量の基準

export type CriteriaId = 'public' | 'occupational' | 'astronaut' | 'electronics'

export interface CriteriaPreset {
  label: string
  target: 'human' | 'electronics'
  /** 人：1年あたりの上限 [Sv] */
  H_lim?: number
  /** 人：1年のうちその場所にいる時間 [s] */
  t_occ?: number
  /** 電子機器：中性子のフルエンスの上限 [1/m²] */
  Phi_lim?: number
  /** 電子機器：ガンマ線の吸収線量の上限 [Gy] */
  D_lim?: number
}

export const CRITERIA: Record<CriteriaId, CriteriaPreset> = {
  public: { label: '一般公衆（1 mSv/年）', target: 'human', H_lim: 1e-3, t_occ: 8760 * 3600 },
  occupational: { label: '職業被ばく（20 mSv/年、2000 時間/年）', target: 'human', H_lim: 20e-3, t_occ: 2000 * 3600 },
  astronaut: { label: '宇宙飛行士（原子炉による分、50 mSv/年）※参考値', target: 'human', H_lim: 50e-3, t_occ: 8760 * 3600 },
  electronics: { label: '電子機器（SP-100 の設計基準）', target: 'electronics', Phi_lim: 1e13 * 1e4, D_lim: 5000 },
}

/** NASA の生涯の上限 [Sv]（NASA-STD-3001、2022 年） */
export const NASA_LIFETIME = 0.6

// ---------------------------------------------------------------------------
// §3.6 ブームとケーブル

export const CONDUCTORS: Record<'aluminum' | 'copper', { label: string; rho_m: number; rho_e: number }> = {
  aluminum: { label: 'アルミニウム', rho_m: 2700, rho_e: 2.82e-8 },
  copper: { label: '銅', rho_m: 8960, rho_e: 1.68e-8 },
}
