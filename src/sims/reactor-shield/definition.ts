import { YEAR } from '../../core/physics/constants.ts'
import { fixedUnit, unitDefs, type UnitDef } from '../../core/physics/units.ts'
import type {
  ComputeResult,
  EnumParam,
  Inputs,
  NumberParam,
  OutputDef,
  OutputValue,
  ParamDef,
  SimDefinition,
  TableParam,
  TableRow,
} from '../types.ts'
import {
  alphaFor,
  CLASSES,
  COMPONENTS,
  CONDUCTORS,
  COOLANTS,
  CRITERIA,
  FUELS,
  GROUNDS,
  MATERIALS,
  type ComponentId,
  type CoolantId,
  type CriteriaId,
  type FuelId,
  type MaterialId,
  type ReactorClass,
} from './data.ts'
import { computeReactor, type Layer, type Layout, type Origin, type ReactorInputs, type ShieldMode, type SurfaceMaterialId } from './model.ts'

const KW = 1e3
const CM = 0.01
const CUSTOM = 'custom'

// 表示単位
const thermal: UnitDef = { ...unitDefs.thermalPower, defaultId: 'kWt' }
const kWe: UnitDef = { options: [{ id: 'W', label: 'We', factor: 1 }, { id: 'kWe', label: 'kWe', factor: 1e3 }, { id: 'MWe', label: 'MWe', factor: 1e6 }], defaultId: 'kWe' }
const years: UnitDef = { ...unitDefs.durationLong, defaultId: 'year' }
const meters: UnitDef = { ...unitDefs.length }
const liters: UnitDef = { ...unitDefs.volume, defaultId: 'L' }
const ratio = unitDefs.fraction
const mass = unitDefs.mass

// 表示の条件
const mode = (i: Inputs) => String(i.shield_mode) as ShieldMode
const hasShield = (i: Inputs) => mode(i) !== 'none'
const isLayers = (i: Inputs) => mode(i) === 'shadow' || mode(i) === 'omni'
const isShadow = (i: Inputs) => mode(i) === 'shadow'
const isSurface = (i: Inputs) => mode(i) === 'surface'
const isUnder = (i: Inputs) => isSurface(i) && i.layout === 'under'
const isWalled = (i: Inputs) => isSurface(i) && i.layout !== 'under'
const isHuman = (i: Inputs) => i.target_type === 'human'
const isElectronics = (i: Inputs) => i.target_type === 'electronics'
const solving = (i: Inputs) => Boolean(i.solve)
const withBoom = (i: Inputs) => isShadow(i) && Boolean(i.boom)
const optimizing = (i: Inputs) => withBoom(i) && Boolean(i.optimize_L)
const hxOn = (i: Inputs) => Boolean(i.hx_eval)
const rowsOf = (i: Inputs, key: string) => (Array.isArray(i[key]) ? (i[key] as TableRow[]) : [])
/** 基準から決める層の数（層の数が少ないときはその数まで） */
const solveCount = (i: Inputs) => Math.min(Number(i.solve_count), rowsOf(i, 'layers').length)

const fraction = (key: string, label: string, def: number, extra: Partial<NumberParam>): NumberParam => ({
  kind: 'number',
  key,
  label,
  unit: ratio,
  default: def,
  min: 0,
  max: 1,
  rangeMessage: '0〜100% で入力してください',
  ...extra,
})

/** 材料の成分の説明（材料の調達） */
const ORIGIN_DESCRIPTIONS: Record<ComponentId, string> = {
  regolith:
    'レゴリスを使う材料の成分ごとに、地球から運ぶか現地で調達するかを選ぶ（ほかの材料はすべて地球から運ぶ）。レゴリスは、3種類のコンクリートでは骨材（砂や砂利の代わり）として使う。レゴリスだけの材料では、締め固めた盛り土として積む（焼き固めたレンガにすると強くなるが、計算は締め固めた密度 1800 kg/m³ で行う）',
  cement:
    '水とセメントのコンクリートの結合材（普通のコンクリートと同じポルトランドセメント）。水と反応して固まり、骨材（レゴリス）をつなぐ接着剤の役割をする。固まるには水が必要（この材料では全体の質量の 7%）。型から外せるまで約1日、設計の強さになるまで約4週間。真空では水が蒸発するので、与圧した空間で固める',
  water: '水とセメントのコンクリートを固めるための水。月の極域の氷などから得られれば、現地で調達できる',
  sulfur:
    'サルファコンクリートの結合材。硫黄を約130〜140 °C で溶かしてレゴリスと混ぜると、冷えて短時間（数時間〜1日）で固まる。水がいらない。月のレゴリスから硫黄を取り出す構想がある。硫黄が溶ける約115〜120 °C より低い温度で使う（月の昼の地表は約120 °C になるので、日よけなどが要る）。真空ではゆっくり昇華して減る（参考値）',
  resin:
    'ポリマーコンクリートの結合材（エポキシ樹脂など）。液体の樹脂と硬化剤をレゴリスと混ぜると、化学反応で固まる（常温で数時間〜数日）。水がいらない。樹脂は地球から運ぶ。耐熱は樹脂の種類によるが、およそ 60〜150 °C で柔らかくなる（参考値）',
}

const materialOptions = (Object.keys(MATERIALS) as MaterialId[]).map((value) => ({ value, label: MATERIALS[value].label }))
/** 地表の配置の壁とふた：地盤と同じ土（掘り出した土）を選べる */
const surfaceMaterialOptions = [{ value: 'ground', label: '地盤と同じ土（地盤の種類の値）' }, ...materialOptions]

// ---------------------------------------------------------------------------
// プリセット

function classPreset(cls: string): Inputs {
  const c = CLASSES[cls as ReactorClass]
  if (!c) return {}
  const fuel = FUELS[c.fuel]
  return {
    spectrum: c.spectrum,
    q: c.q,
    V_min: c.V_min,
    HD: c.HD,
    t_ref: c.t_ref,
    rho_HM: c.rho_HM,
    fuel: c.fuel,
    nu: fuel.nu,
    alpha_c: alphaFor(fuel, c.spectrum),
    e: c.e,
    Bu_max: c.Bu_max,
    f_n: c.f_n,
    f_g: c.f_g,
    coolant: c.coolant,
    f_act: COOLANTS[c.coolant].f_act,
    T_hot: c.T_hot,
    alpha_r: c.alpha_r,
  }
}

const layer = (material: MaterialId, t: number): TableRow => ({ material, t })

/** 層の例（§3.5）。選ぶと層と、基準から決める層の数が入る */
const LAYER_PRESETS: Record<string, { label: string; layers: TableRow[]; solve_count: string }> = {
  space: { label: '宇宙：タングステン＋水素化リチウム', layers: [layer('tungsten', 5 * CM), layer('lih', 80 * CM)], solve_count: '2' },
  plant: {
    label: '地上の発電炉：水 30 cm＋鉄 20 cm＋コンクリート',
    layers: [layer('water', 30 * CM), layer('iron', 20 * CM), layer('concrete', 200 * CM)],
    solve_count: '1',
  },
  pool: { label: 'プール：鉄 20 cm＋水', layers: [layer('iron', 20 * CM), layer('water', 370 * CM)], solve_count: '1' },
}

function criteriaPreset(id: string): Inputs {
  const c = CRITERIA[id as CriteriaId]
  if (!c) return {}
  const out: Inputs = { target_type: c.target }
  if (c.H_lim !== undefined) out.H_lim = c.H_lim
  if (c.t_occ !== undefined) out.t_occ = c.t_occ
  if (c.Phi_lim !== undefined) out.Phi_lim = c.Phi_lim
  if (c.D_lim !== undefined) out.D_lim = c.D_lim
  return out
}

// ---------------------------------------------------------------------------
// 入力（§3）

const layersTable: TableParam = {
  kind: 'table',
  key: 'layers',
  group: 'layers',
  label: '遮蔽の層（炉心に近い側から）',
  description:
    '「基準から厚さを出す」では、「自動で厚さが決まる層」で選んだ最後の1層か2層の厚さを、シミュレータが自動で計算する（「自動」の欄）。それより内側の層は、入力した厚さのまま固定する（原子炉の容器、プールの水など）',
  columns: [
    { key: 'material', label: '材料', kind: 'enum', options: materialOptions },
    {
      key: 't',
      label: '厚さ',
      kind: 'number',
      unit: unitDefs.thickness,
      min: 0,
      autoKey: (r, n, i) => (solving(i) && r >= n - Math.min(Number(i.solve_count), n) ? `t_layer_${r}` : null),
    },
  ],
  minRows: 1,
  maxRows: 4,
  defaultRows: LAYER_PRESETS.space.layers,
  newRow: layer('lih', 50 * CM),
  rowName: '層',
}

const hxTable: TableParam = {
  kind: 'table',
  key: 'hx_layers',
  group: 'hx',
  label: '熱交換器の遮蔽の層',
  description: '「基準から厚さを出す」では、最後の層の厚さを、線量の基準を満たすようにシミュレータが自動で計算する。内側の層だけで基準を満たすときは 0 cm になる',
  columns: [
    { key: 'material', label: '材料', kind: 'enum', options: materialOptions },
    { key: 't', label: '厚さ', kind: 'number', unit: unitDefs.thickness, min: 0, autoKey: (r, n, i) => (solving(i) && r === n - 1 ? `hx_t_${r}` : null) },
  ],
  minRows: 1,
  maxRows: 4,
  defaultRows: [layer('concrete', 100 * CM)],
  newRow: layer('concrete', 50 * CM),
  rowName: '層',
}

const K = CLASSES.kilopower

const baseInputs: ParamDef[] = [
  // §3.1 運転条件
  {
    kind: 'number',
    key: 'Q',
    group: 'op',
    label: '熱出力',
    symbol: 'Q',
    description: '大きいほど放射線が強く、遮蔽が厚く重くなる。目安：Kilopower 4〜43 kWt、SP-100 約2.4 MWt、大型発電炉 約3400 MWt',
    unit: thermal,
    default: 43 * KW,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'T_op',
    group: 'op',
    label: '運転年数',
    symbol: 'T_{op}',
    description: '長いほど燃料の消費と、電子機器が受ける放射線の合計が増える',
    unit: years,
    default: 7 * YEAR,
    min: 0,
    minExclusive: true,
  },
  fraction('f_op', '稼働率（全出力で運転している時間の割合）', 1, { group: 'op', symbol: 'f_{op}' }),

  // §3.2 炉のクラスと燃料
  {
    kind: 'enum',
    key: 'reactor_class',
    group: 'core',
    label: '炉のクラス',
    description: '選ぶと、炉心・燃料・冷却材の値が入る。電源・排熱モジュールと同じ種類にそろえてある',
    options: [...(Object.keys(CLASSES) as ReactorClass[]).map((value) => ({ value, label: CLASSES[value].label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'kilopower',
    presets: (v) => classPreset(v),
    customValue: CUSTOM,
    customKeys: ['spectrum', 'q', 'V_min', 'HD', 't_ref', 'rho_HM', 'fuel', 'e', 'Bu_max', 'f_n', 'f_g', 'coolant', 'T_hot', 'alpha_r'],
  },
  {
    kind: 'enum',
    key: 'spectrum',
    group: 'core',
    label: '中性子のエネルギー',
    description: '高速炉：中性子を減速させずに使う（小型にできる）。熱中性子炉：水や黒鉛で減速させて使う',
    options: [
      { value: 'fast', label: '高速炉' },
      { value: 'thermal', label: '熱中性子炉' },
    ],
    default: K.spectrum,
    presets: (v, i): Inputs => {
      const f = FUELS[i.fuel as FuelId]
      return f ? { alpha_c: alphaFor(f, v === 'fast' ? 'fast' : 'thermal') } : {}
    },
  },
  {
    kind: 'number',
    key: 'q',
    group: 'core',
    label: '炉心の平均の出力密度',
    symbol: "q'''",
    description: '大きいほど炉心が小さい。大型の炉はこれで大きさが決まる',
    unit: unitDefs.powerDensity,
    default: K.q,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'V_min',
    group: 'core',
    label: '臨界に必要な最小の炉心の体積',
    symbol: 'V_{min}',
    description: '小型の炉はこれで大きさが決まる（Kilopower 2.54 L）。0 なら出力密度だけで決める',
    unit: liters,
    default: K.V_min,
    min: 0,
  },
  { kind: 'number', key: 'HD', group: 'core', label: '炉心の高さと直径の比', symbol: 'H/D', unit: unitDefs.none, default: K.HD, min: 0, minExclusive: true },
  {
    kind: 'number',
    key: 't_ref',
    group: 'core',
    label: '反射体などの厚さ（炉心の外側から遮蔽の内側まで）',
    symbol: 't_{ref}',
    unit: unitDefs.thickness,
    default: K.t_ref,
    min: 0,
  },
  {
    kind: 'number',
    key: 'rho_HM',
    group: 'core',
    label: '炉心の体積あたりの重金属の質量',
    symbol: '\\rho_{HM}',
    unit: unitDefs.massDensity,
    default: K.rho_HM,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'enum',
    key: 'fuel',
    group: 'core',
    label: '核分裂する物質',
    description:
      '選ぶと、核分裂1回あたりの中性子の数と、捕獲と核分裂の比が入る。ウラン235：天然のウランに 0.72% 含まれる（残りはほぼウラン238）。ウラン233：天然にはなく、トリウム232 が炉の中で中性子を吸収してできる（トリウムサイクル）。プルトニウム239：天然にはほぼなく、ウラン238 が炉の中で中性子を吸収してできる（使用済み燃料から取り出す）',
    options: (Object.keys(FUELS) as FuelId[]).map((value) => ({ value, label: FUELS[value].label })),
    default: K.fuel,
    presets: (v, i): Inputs => {
      const f = FUELS[v as FuelId]
      return f ? { nu: f.nu, alpha_c: alphaFor(f, i.spectrum === 'fast' ? 'fast' : 'thermal') } : {}
    },
  },
  fraction('e', '濃縮度・富化度（重金属のうち、核分裂する物質の割合）', K.e, {
    group: 'core',
    symbol: 'e',
    description:
      '高いほど小さな炉心で臨界にできる。ウランでは濃縮度（ウラン235 の割合）と呼ぶ。目安：天然ウラン 0.72%、軽水炉 3〜5%、新型の小型炉（HALEU）5〜20%、艦船用・宇宙用の炉 90% 以上（Kilopower 93%）。プルトニウムを使う燃料（ウランとの混合酸化物＝MOX）では富化度（プルトニウムの割合）と呼び、軽水炉で約 5〜10%、高速炉で約 15〜30%（参考値）',
  }),
  {
    kind: 'number',
    key: 'nu',
    group: 'core',
    label: '核分裂1回あたりの中性子の数',
    symbol: '\\nu',
    unit: unitDefs.none,
    default: FUELS.u235.nu,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'alpha_c',
    group: 'core',
    label: '捕獲と核分裂の比',
    symbol: '\\alpha_c',
    description:
      '核分裂せずに中性子を吸収してしまう割合（捕獲の回数 ÷ 核分裂の回数）。大きいほど燃料の消費が増える。選択肢で入る値：熱中性子炉は熱中性子（0.025 eV）の値（ウラン235 0.169、ウラン233 0.085、プルトニウム239 0.362、検証済み）、高速炉は高速炉の中性子のエネルギーでの平均（ウラン235 0.29、ウラン233 0.10、プルトニウム239 0.25、参考値）。軽水炉の中性子のエネルギーで平均すると、ウラン235 約0.18、プルトニウム239 約0.41（参考値）',
    unit: unitDefs.none,
    default: FUELS.u235.alpha_c_fast,
    min: 0,
  },
  {
    kind: 'number',
    key: 'CR',
    group: 'core',
    label: '転換比',
    symbol: 'CR',
    description: '核分裂する物質を1消費するあいだに、親物質（ウラン238、トリウム232）から新たにできる量。1前後なら増殖',
    unit: unitDefs.none,
    default: 0,
    min: 0,
  },
  {
    kind: 'number',
    key: 'Bu_max',
    group: 'core',
    label: '燃焼度の上限',
    symbol: 'Bu_{max}',
    description: '燃料1 tあたり取り出せるエネルギー。大きいほど燃料を長く使える。0 は未設定（宇宙用の炉）。軽水炉で 45〜55 GWd/t',
    unit: unitDefs.burnup,
    default: K.Bu_max,
    min: 0,
  },
  fraction('f_n', '炉心から外に漏れる、線量に効く中性子の割合', K.f_n, {
    group: 'core',
    symbol: 'f_n',
    description: '小さな高速炉では多く漏れる（約0.30）。大型の熱中性子炉では約 0.001（参考値）',
  }),
  fraction('f_g', '炉心から外に出るガンマ線のエネルギーの割合', K.f_g, {
    group: 'core',
    symbol: 'f_\\gamma',
    description: '炉心の中で吸収される分を除いた割合（SP-100 の値に合わせて 0.05）',
  }),
  {
    kind: 'number',
    key: 'alpha_r',
    group: 'core',
    label: '原子炉の比質量',
    symbol: '\\alpha_r',
    description: '熱出力 1 kW あたりの原子炉の質量（電源・排熱モジュールと同じ値）。0 は未設定',
    unit: unitDefs.perThermalPower,
    default: K.alpha_r,
    min: 0,
  },

  // §3.3 冷却材
  {
    kind: 'enum',
    key: 'coolant',
    group: 'coolant',
    label: '冷却材',
    description:
      '炉心から熱を取り出して運ぶ物質。タービンなどを回す物質（作動流体）と同じとは限らない。沸騰水型炉では水がそのままタービンを回すが、加圧水型炉やナトリウム冷却炉、Kilopower（ナトリウムのヒートパイプ）では、熱交換器で別の流体（水蒸気、ヘリウムなどのガス）に熱を渡す。選ぶと放射化の割合が入る。融点・沸点・出口温度の目安で、高温側の温度を確かめる',
    options: (Object.keys(COOLANTS) as CoolantId[]).map((value) => ({ value, label: COOLANTS[value].label })),
    default: K.coolant,
    presets: (v): Inputs => ({ f_act: COOLANTS[v as CoolantId]?.f_act ?? 0 }),
  },
  {
    kind: 'number',
    key: 'T_hot',
    group: 'coolant',
    label: '高温側の温度（電源・排熱モジュールに渡す）',
    symbol: 'T_{hot}',
    unit: unitDefs.temperature,
    default: K.T_hot,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'boolean',
    key: 'hx_eval',
    group: 'coolant',
    label: '熱交換器の線量',
    description: '冷却材が中性子で放射化してできる物質が、炉心の外の熱交換器でガンマ線を出す。宇宙用の炉では通常は評価しない',
    default: false,
    labels: ['評価しない', '評価する'],
  },
  {
    kind: 'number',
    key: 'f_act',
    group: 'hx',
    label: '放射化の割合',
    symbol: 'f_{act}',
    description: '核分裂で出た中性子のうち、冷却材に吸収されてガンマ線を出す物質を作る割合（参考値・推定）',
    unit: unitDefs.none,
    default: COOLANTS[K.coolant].f_act,
    min: 0,
    max: 1,
  },
  fraction('f_HX', '放射化した物質のうち、熱交換器の中にある割合', 0.3, { group: 'hx', symbol: 'f_{HX}' }),
  {
    kind: 'number',
    key: 't_tr',
    group: 'hx',
    label: '冷却材が炉心から熱交換器に着くまでの時間',
    symbol: 't_{tr}',
    description: '長いほど、着くまでに放射能が減る（水の窒素16 は半減期 7.13 秒なので大きく減る）',
    unit: fixedUnit('s'),
    default: 2,
    min: 0,
  },
  {
    kind: 'number',
    key: 'L_HX',
    group: 'hx',
    label: '熱交換器から守る対象までの距離',
    symbol: 'L_{HX}',
    unit: meters,
    default: 10,
    min: 0,
    minExclusive: true,
  },
  hxTable,

  // §3.4 守る対象と線量の基準
  {
    kind: 'enum',
    key: 'criteria',
    group: 'target',
    label: '線量の基準',
    description: '選ぶと、守る対象の種類と線量の上限が入る',
    options: [...(Object.keys(CRITERIA) as CriteriaId[]).map((value) => ({ value, label: CRITERIA[value].label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'astronaut',
    presets: (v) => criteriaPreset(v),
    customValue: CUSTOM,
  },
  {
    kind: 'enum',
    key: 'target_type',
    group: 'target',
    label: '守る対象の種類',
    description: '人：中性子とガンマ線の線量の合計（Sv）で評価する。電子機器：中性子の積算の個数と、ガンマ線の吸収線量を別々に評価する',
    options: [
      { value: 'human', label: '人' },
      { value: 'electronics', label: '電子機器' },
    ],
    default: 'human',
  },
  {
    kind: 'number',
    key: 'H_lim',
    group: 'target',
    label: '人の線量の上限（1年あたり）',
    symbol: 'H_{lim}',
    description: '小さいほど厳しく、遮蔽が厚くなる。一般公衆 1 mSv/年、職業被ばく 20 mSv/年',
    unit: unitDefs.doseYear,
    default: 50e-3,
    min: 0,
    minExclusive: true,
    visibleWhen: isHuman,
  },
  {
    kind: 'number',
    key: 't_occ',
    group: 'target',
    label: '1年のうち、その場所にいる時間',
    symbol: 't_{occ}',
    description: '長いほど1年の線量が増える。一年中いるなら 8760 時間',
    unit: unitDefs.hoursPerYear,
    default: 8760 * 3600,
    min: 0,
    max: 8760 * 3600,
    rangeMessage: '0〜8760 時間/年 で入力してください',
    visibleWhen: isHuman,
  },
  {
    kind: 'number',
    key: 'Phi_lim',
    group: 'target',
    label: '電子機器の中性子のフルエンスの上限（運転期間の合計）',
    symbol: '\\Phi_{lim}',
    unit: unitDefs.fluence,
    default: 1e13 * 1e4,
    min: 0,
    minExclusive: true,
    visibleWhen: isElectronics,
  },
  {
    kind: 'number',
    key: 'D_lim',
    group: 'target',
    label: '電子機器のガンマ線の吸収線量の上限（運転期間の合計）',
    symbol: 'D_{lim}',
    unit: unitDefs.absorbed,
    default: 5000,
    min: 0,
    minExclusive: true,
    visibleWhen: isElectronics,
  },
  {
    kind: 'boolean',
    key: 'L_surface',
    group: 'target',
    label: '守る対象の位置',
    description: '「遮蔽のすぐ外側」は、地上の発電所の建屋のように遮蔽の外面で評価する場合',
    default: false,
    labels: ['距離を指定', '遮蔽のすぐ外側'],
    visibleWhen: (i) => mode(i) === 'omni',
  },
  {
    kind: 'number',
    key: 'L',
    group: 'target',
    label: '炉心の中心から守る対象までの距離',
    symbol: 'L',
    description: '遠いほど線量が距離の2乗に反比例して減る。地表の配置では水平の距離',
    unit: meters,
    default: 1000,
    min: 0,
    minExclusive: true,
    role: (i) => (optimizing(i) || (mode(i) === 'omni' && i.L_surface) ? 'output' : 'input'),
  },
  {
    kind: 'number',
    key: 'h_t',
    group: 'target',
    label: '守る対象の地面からの高さ',
    symbol: 'h_t',
    unit: meters,
    default: 2,
    min: 0,
    visibleWhen: isSurface,
  },
  {
    kind: 'number',
    key: 'R_obj',
    group: 'target',
    label: '守る対象の半径',
    symbol: 'R_{obj}',
    description: '影遮蔽は、炉心とこの大きさの対象を結ぶ円錐の中だけを守る。大きいほど遮蔽が重くなる',
    unit: meters,
    default: 10,
    min: 0,
    minExclusive: true,
    visibleWhen: isShadow,
  },

  // §3.5 遮蔽
  {
    kind: 'enum',
    key: 'shield_mode',
    group: 'shield',
    label: '遮蔽のしかた',
    description:
      '影遮蔽：守る対象の方向だけを円錐台の遮蔽で守る（主に宇宙船・軌道上の施設向け、非常に軽い。天体の表面では影の外を立入禁止にする必要があり、地面や大気で散乱して回り込む放射線は計算しない）。全方向遮蔽：炉の周り全体を球殻で守る（約20倍重い）。地表の配置：天体の表面に、地上・地下・半地下の形で置く',
    options: [
      { value: 'none', label: 'なし' },
      { value: 'shadow', label: '影遮蔽' },
      { value: 'omni', label: '全方向遮蔽' },
      { value: 'surface', label: '地表の配置' },
    ],
    default: 'shadow',
  },
  {
    kind: 'boolean',
    key: 'solve',
    group: 'shield',
    label: '厚さの決め方',
    default: true,
    labels: ['厚さを指定して線量を出す', '基準から厚さを出す'],
    visibleWhen: (i) => hasShield(i) || hxOn(i),
  },
  {
    kind: 'enum',
    key: 'layer_preset',
    group: 'layers',
    label: '層の例',
    description: '選ぶと層と、自動で厚さが決まる層の数が入る',
    options: [...Object.entries(LAYER_PRESETS).map(([value, v]) => ({ value, label: v.label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'space',
    presets: (v): Inputs => {
      const pr = LAYER_PRESETS[v]
      return pr ? { layers: pr.layers.map((r) => ({ ...r })), solve_count: pr.solve_count } : {}
    },
    customValue: CUSTOM,
    customKeys: ['layers', 'solve_count'],
  },
  {
    kind: 'enum',
    key: 'solve_count',
    group: 'layers',
    label: '自動で厚さが決まる層',
    description:
      '線量の基準を満たす厚さを、シミュレータが自動で計算する層。それより内側の層は入力した厚さのまま。最後の2層：2層の厚さの組を、遮蔽の質量が最小になるように決める（典型的には、ガンマ線用の重い金属＋中性子用の水素を含む材料。ただし材料が何でも計算できる）。最後の1層だけ：最後の層の厚さだけを決める。内側の層だけで基準を満たすときは、自動の層は 0 cm になる',
    options: [
      { value: '2', label: '最後の2層が自動で決まる', disabledWhen: (i) => rowsOf(i, 'layers').length < 2 },
      { value: '1', label: '最後の1層だけ自動で決まる' },
    ],
    default: '2',
    visibleWhen: solving,
  },
  layersTable,
  {
    kind: 'enum',
    key: 'layout',
    group: 'surface',
    label: '配置',
    description:
      '地上：周りを壁や盛り土で囲む。地下：縦穴に入れて埋め戻す（横と下は地盤が守る）。半地下：下半分を地面に入れ、上半分を壁で囲む。天体を問わず使える（重力や大気は計算に使わない）。地球・火星・タイタンなど大気のある天体では、空気で散乱して回り込む放射線（スカイシャイン）を計算しないので、線量を低く見積もる。壁は1つの材料だけ（多層の壁は、計算が複雑になるので省いた）',
    options: [
      { value: 'above', label: '地上' },
      { value: 'under', label: '地下' },
      { value: 'semi', label: '半地下' },
    ],
    default: 'above',
    presets: { above: { H_w: 1.5 }, semi: { H_w: 1.0 } },
  },
  {
    kind: 'number',
    key: 'h_base',
    group: 'surface',
    label: '炉心の下端の地面からの高さ',
    unit: meters,
    default: 0.5,
    min: 0,
    visibleWhen: (i) => isSurface(i) && i.layout === 'above',
  },
  {
    kind: 'number',
    key: 'depth',
    group: 'surface',
    label: '炉心の中心の深さ',
    symbol: '|z_c|',
    description: '深いほど上の埋め戻しが厚くなり、線量が減る',
    unit: meters,
    default: 2,
    min: 0,
    visibleWhen: isUnder,
    role: (i) => (solving(i) ? 'output' : 'input'),
  },
  {
    kind: 'enum',
    key: 'ground_type',
    group: 'surface',
    label: '地盤の種類',
    description: '選ぶと、地盤の密度と含水率に目安の値が入る。地盤に含まれる水（水素）で、中性子の遮蔽が大きく変わる',
    options: [...(Object.keys(GROUNDS) as (keyof typeof GROUNDS)[]).map((value) => ({ value, label: GROUNDS[value].label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'moon',
    presets: (v): Inputs => {
      const g = GROUNDS[v as keyof typeof GROUNDS]
      return g ? { ground_rho: g.rho, ground_w: g.w } : {}
    },
    customValue: CUSTOM,
    customKeys: ['ground_rho', 'ground_w'],
    visibleWhen: isSurface,
  },
  {
    kind: 'number',
    key: 'ground_rho',
    group: 'surface',
    label: '地盤の密度（水を含む）',
    symbol: '\\rho_g',
    description: '大きいほど、同じ厚さでガンマ線と中性子をよく止める。目安：月のレゴリス（締め固め）1800 kg/m³、地球の土 1600〜2000 kg/m³',
    unit: unitDefs.massDensity,
    default: GROUNDS.moon.rho,
    min: 0,
    minExclusive: true,
    visibleWhen: isSurface,
  },
  fraction('ground_w', '地盤の含水率（全体の質量に対する水の割合）', GROUNDS.moon.w, {
    group: 'surface',
    symbol: 'w_g',
    description:
      '大きいほど水素が多く、中性子をよく止める。ガンマ線にはほとんど影響しない。目安：月の大部分 0（極域の永久影には氷がある）、火星の赤道付近 約2%、地球の土 10〜30%。1% 未満では、除去断面積による計算の精度が下がる',
    max: 0.5,
    rangeMessage: '0〜50% で入力してください',
    visibleWhen: isSurface,
  }),
  { kind: 'number', key: 'r_w', group: 'surface', label: '壁の内側の半径（炉心の中心軸から）', symbol: 'r_w', unit: meters, default: 1, min: 0, visibleWhen: isWalled },
  {
    kind: 'number',
    key: 'H_w',
    group: 'surface',
    label: '壁の高さ（地面から）',
    symbol: 'H_w',
    description: '低すぎると、守る対象への放射線が壁の上を越えてしまう',
    unit: meters,
    default: 1.5,
    min: 0,
    visibleWhen: isWalled,
  },
  {
    kind: 'enum',
    key: 'wall_mat',
    group: 'surface',
    label: '壁の材料',
    description: '「地盤と同じ土」は、掘り出した土を盛る場合（密度と含水率は地盤の種類の値）',
    options: surfaceMaterialOptions,
    default: 'ground',
    visibleWhen: isWalled,
  },
  {
    kind: 'number',
    key: 't_w',
    group: 'surface',
    label: '壁の厚さ',
    symbol: 't_w',
    unit: meters,
    default: 1,
    min: 0,
    visibleWhen: isWalled,
    role: (i) => (solving(i) ? 'output' : 'input'),
  },
  {
    kind: 'enum',
    key: 'lid_mat',
    group: 'surface',
    label: 'ふた（地下では埋め戻し）の材料',
    description: '地下では、掘り出した土で埋め戻すなら「地盤と同じ土」',
    options: surfaceMaterialOptions,
    default: 'ground',
    visibleWhen: isSurface,
  },
  {
    kind: 'number',
    key: 't_top',
    group: 'surface',
    label: 'ふたの厚さ',
    symbol: 't_{top}',
    description: '0 は上が開いている（着陸機や上空の宇宙機への線量に注意）',
    unit: meters,
    default: 0,
    min: 0,
    visibleWhen: isWalled,
  },
  {
    kind: 'number',
    key: 'cav_gap',
    group: 'surface',
    label: '縦穴と炉心のすき間',
    description: '縦穴の半径 = 炉心の半径 + この値',
    unit: meters,
    default: 0.3,
    min: 0,
    visibleWhen: isUnder,
  },
  {
    kind: 'enum',
    key: 'basis',
    group: 'surface',
    label: '地下の線量の評価のしかた',
    description: '保守的：上へ抜けて回り込む放射線を大きめに見積もる（ふたの厚さだけを通るとする）。直接線のみ：地盤を通る直接の放射線だけ（線量を低く見積もる）。実際はこの間にある',
    options: [
      { value: 'conservative', label: '保守的' },
      { value: 'direct', label: '直接線のみ' },
    ],
    default: 'conservative',
    visibleWhen: isUnder,
  },
  {
    kind: 'number',
    key: 'L_up',
    group: 'surface',
    label: '真上の評価点までの距離（着陸機や上空の宇宙機）',
    symbol: 'L_{up}',
    unit: meters,
    default: 1000,
    min: 0,
    minExclusive: true,
    visibleWhen: isSurface,
  },
  ...(Object.keys(COMPONENTS) as ComponentId[]).map(
    (c): ParamDef => ({
      kind: 'enum',
      key: `origin_${c}`,
      group: 'origin',
      label: COMPONENTS[c].label,
      description: ORIGIN_DESCRIPTIONS[c],
      options: [
        { value: 'local', label: '現地で調達' },
        { value: 'earth', label: '地球から運ぶ' },
      ],
      default: c === 'regolith' ? 'local' : 'earth',
    }),
  ),

  // §3.6 ブームとケーブル
  {
    kind: 'boolean',
    key: 'boom',
    group: 'boom',
    label: 'ブームで炉心を離す',
    description: '炉心を離すほど遮蔽は軽くなるが、ブームと電力ケーブルが重くなる。宇宙船や軌道上の施設向け',
    default: false,
    labels: ['使わない', '使う'],
  },
  {
    kind: 'boolean',
    key: 'optimize_L',
    group: 'boom',
    label: '距離',
    description: '「最適化」では、遮蔽・ブーム・ケーブルの合計が最小になる距離を 5〜500 m で求める',
    default: false,
    labels: ['指定する', '合計が最小になる距離'],
    visibleWhen: withBoom,
  },
  {
    kind: 'number',
    key: 'lambda_b',
    group: 'boom',
    label: 'ブームの長さあたりの質量',
    symbol: '\\lambda_b',
    description: '小さいほど軽い（参考値。軽い展開式のマストで 0.035〜0.093 kg/m、炉を支える構造はこれより重い）',
    unit: fixedUnit('kg/m'),
    default: 1,
    min: 0,
    visibleWhen: withBoom,
  },
  {
    kind: 'number',
    key: 'P_e',
    group: 'boom',
    label: 'ケーブルで送る電力',
    symbol: 'P_e',
    description: '電源・排熱モジュールの発電量を入れる。大きいほどケーブルが太く重くなる',
    unit: kWe,
    default: 100 * KW,
    min: 0,
    minExclusive: true,
    visibleWhen: withBoom,
  },
  {
    kind: 'number',
    key: 'V_tr',
    group: 'boom',
    label: '送電の電圧',
    symbol: 'V_{tr}',
    description: '高いほど電流が減り、ケーブルが細く軽くなる（質量は電圧の2乗に反比例）',
    unit: fixedUnit('V'),
    default: 1000,
    min: 0,
    minExclusive: true,
    visibleWhen: withBoom,
  },
  fraction('f_loss', 'ケーブルでの電力の損失の割合', 0.02, {
    group: 'boom',
    symbol: 'f_{loss}',
    description: '大きくするとケーブルを細くできるが、電力を多く失う',
    min: 0,
    minExclusive: true,
    rangeMessage: '0 より大きく 100% 以下で入力してください',
    visibleWhen: withBoom,
  }),
  {
    kind: 'enum',
    key: 'conductor',
    group: 'boom',
    label: '電線の芯の材質（導体）',
    description:
      '電気を通す金属の芯の材質。アルミニウムは銅より電気を通しにくいが軽いので、同じ損失なら銅の約半分の質量になる。実際の電線は芯の外側を絶縁の被覆で覆うが、計算の質量は芯の金属だけ（被覆は含まない）',
    options: (Object.keys(CONDUCTORS) as ('aluminum' | 'copper')[]).map((value) => ({ value, label: CONDUCTORS[value].label })),
    default: 'aluminum',
    visibleWhen: withBoom,
  },
]

// ---------------------------------------------------------------------------
// 構成の例

const defaultsOf = (params: readonly ParamDef[]): Inputs =>
  Object.fromEntries(params.map((p) => [p.key, p.kind === 'table' ? p.defaultRows.map((r) => ({ ...r })) : p.default]))

/** 新しいカードはこの値で始まる（各入力の初期値と同じ。仕様書 §9 の T8） */
const KILOPOWER_MOON = defaultsOf(baseInputs)

const scenario: EnumParam = {
  kind: 'enum',
  key: 'scenario',
  group: 'scenario',
  label: '構成の例',
  description: '選ぶと、条件がまとめて入る。値を変えると「自由に設定」の表示になる。影遮蔽と全方向遮蔽を切り替えると、重さの違い（約20倍）が分かる',
  options: [
    { value: 'kilopower_moon', label: 'Kilopower を月面で使う（乗員、1 km）※参考値' },
    { value: CUSTOM, label: '（自由に設定）' },
  ],
  default: 'kilopower_moon',
  presets: (v): Inputs => (v === 'kilopower_moon' ? structuredClone(KILOPOWER_MOON) : {}),
  customValue: CUSTOM,
}

// ---------------------------------------------------------------------------
// 出力（§5）

const yearDose = unitDefs.doseYear
const doseRate = unitDefs.doseRate

const outputs: OutputDef[] = [
  { key: 'M_shield', kind: 'number', label: '遮蔽の質量', symbol: 'M_{shield}', unit: mass, primary: true, description: '遮蔽材だけの質量（容器・構造・冷却を含まない）', visibleWhen: hasShield },
  { key: 'M_import', kind: 'number', label: '地球から運ぶ遮蔽の質量', symbol: 'M_{import}', unit: mass, primary: true, visibleWhen: hasShield },
  { key: 'M_local', kind: 'number', label: '現地で調達する遮蔽の質量', symbol: 'M_{local}', unit: mass, primary: true, visibleWhen: hasShield },
  { key: 'thickness_text', kind: 'text', label: '遮蔽の厚さ', primary: true, visibleWhen: hasShield },
  {
    key: 'dose_year',
    kind: 'number',
    label: '守る対象の線量（1年あたり）',
    symbol: 'H',
    unit: yearDose,
    primary: true,
    description: '中性子とガンマ線の合計。熱交換器を評価するときはその分も含む',
    visibleWhen: isHuman,
  },
  {
    key: 'fluence',
    kind: 'number',
    label: '中性子のフルエンス（運転期間の合計）',
    symbol: '\\Phi_n',
    unit: unitDefs.fluence,
    primary: true,
    visibleWhen: isElectronics,
  },
  { key: 'gamma_dose', kind: 'number', label: 'ガンマ線の吸収線量（運転期間の合計）', symbol: 'D_\\gamma', unit: unitDefs.absorbed, primary: true, visibleWhen: isElectronics },
  { key: 'dose_ratio', kind: 'number', label: '基準に対する割合', unit: ratio, primary: true, description: '100% 以下なら基準を満たす' },
  { key: 'M_reactor', kind: 'number', label: '原子炉の質量', symbol: 'M_{reactor}', unit: mass, primary: true },
  { key: 'L_opt', kind: 'number', label: '最適な距離', symbol: 'L_{opt}', unit: meters, primary: true, visibleWhen: optimizing },
  { key: 'M_total_s', kind: 'number', label: '遮蔽・ブーム・ケーブルの合計', symbol: 'M_{total,s}', unit: mass, primary: true, visibleWhen: withBoom },

  // 線量
  { key: 'un_rate', kind: 'number', group: 'dose', label: '遮蔽なしの線量率（中性子＋ガンマ線）', unit: doseRate, visibleWhen: isHuman },
  { key: 'un_rate_n', kind: 'number', group: 'dose', label: '　うち中性子', unit: doseRate, visibleWhen: isHuman },
  { key: 'un_rate_g', kind: 'number', group: 'dose', label: '　うちガンマ線', unit: doseRate, visibleWhen: isHuman },
  { key: 'un_year', kind: 'number', group: 'dose', label: '遮蔽なしの線量（1年あたり）', unit: yearDose, visibleWhen: isHuman },
  { key: 'un_fluence', kind: 'number', group: 'dose', label: '遮蔽なしの中性子のフルエンス', unit: unitDefs.fluence, visibleWhen: isElectronics },
  { key: 'un_gamma', kind: 'number', group: 'dose', label: '遮蔽なしのガンマ線の吸収線量', unit: unitDefs.absorbed, visibleWhen: isElectronics },
  { key: 'sh_year_n', kind: 'number', group: 'dose', label: '遮蔽ありの線量：中性子（1年あたり）', unit: yearDose, visibleWhen: isHuman },
  { key: 'sh_year_g', kind: 'number', group: 'dose', label: '遮蔽ありの線量：ガンマ線（1年あたり）', unit: yearDose, visibleWhen: isHuman },
  { key: 'sh_rate', kind: 'number', group: 'dose', label: '遮蔽ありの線量率', unit: doseRate, visibleWhen: isHuman },
  { key: 'hx_year', kind: 'number', group: 'dose', label: '熱交換器からの線量（1年あたり）', unit: yearDose, visibleWhen: (i) => hxOn(i) && isHuman(i) },
  { key: 'L_eval', kind: 'number', group: 'dose', label: '評価した距離', unit: meters },

  // 遮蔽
  { key: 'mass_table', kind: 'table', group: 'shield', label: '遮蔽の質量の内訳', visibleWhen: hasShield },
  { key: 'R_out', kind: 'number', group: 'shield', label: '遮蔽の外側の半径（炉心の中心から）', unit: meters, visibleWhen: isLayers },
  { key: 'M_boom', kind: 'number', group: 'shield', label: 'ブームの質量', symbol: 'M_{boom}', unit: mass, visibleWhen: withBoom },
  { key: 'M_cable', kind: 'number', group: 'shield', label: 'ケーブルの質量', symbol: 'M_{cable}', unit: mass, visibleWhen: withBoom },
  { key: 'wall_path', kind: 'number', group: 'shield', label: '対象への直線が壁を通る長さ', unit: meters, visibleWhen: isWalled },
  { key: 'ground_path', kind: 'number', group: 'shield', label: '対象への直線が地盤を通る長さ', unit: meters, visibleWhen: isUnder },
  { key: 'direct_year', kind: 'number', group: 'shield', label: '地下の線量：直接線のみ（1年あたり）', unit: yearDose, visibleWhen: (i) => isUnder(i) && isHuman(i) },
  { key: 'cons_year', kind: 'number', group: 'shield', label: '地下の線量：保守的（1年あたり）', unit: yearDose, visibleWhen: (i) => isUnder(i) && isHuman(i) },
  { key: 'up_rate', kind: 'number', group: 'shield', label: '真上の評価点の線量率', unit: doseRate, visibleWhen: (i) => isSurface(i) && isHuman(i) },
  { key: 'V_exc', kind: 'number', group: 'shield', label: '掘り出すレゴリスの体積', unit: unitDefs.volume, visibleWhen: isUnder },
  { key: 'M_exc', kind: 'number', group: 'shield', label: '掘り出すレゴリスの質量', unit: mass, visibleWhen: isUnder },
  { key: 't_w', kind: 'number', group: 'shield', label: '壁の厚さ', unit: unitDefs.thickness, graphOnly: true, visibleWhen: isWalled },
  { key: 'depth', kind: 'number', group: 'shield', label: '炉心の中心の深さ', unit: meters, graphOnly: true, visibleWhen: isUnder },
  ...[0, 1, 2, 3].map(
    (r): OutputDef => ({
      key: `t_layer_${r}`,
      kind: 'number',
      label: `${r + 1}層目の厚さ`,
      unit: unitDefs.thickness,
      graphOnly: true,
      visibleWhen: (i) => isLayers(i) && solving(i) && r < rowsOf(i, 'layers').length && r >= rowsOf(i, 'layers').length - solveCount(i),
    }),
  ),

  // 炉心
  { key: 'V_core', kind: 'number', group: 'core', label: '炉心の体積', symbol: 'V_{core}', unit: liters },
  { key: 'D', kind: 'number', group: 'core', label: '炉心の直径', symbol: 'D', unit: unitDefs.thickness },
  { key: 'H', kind: 'number', group: 'core', label: '炉心の高さ', symbol: 'H', unit: unitDefs.thickness },
  { key: 'R0', kind: 'number', group: 'core', label: '遮蔽の内側の半径', symbol: 'R_0', unit: unitDefs.thickness, description: '同じ体積の球の半径＋反射体などの厚さ' },

  // 燃料
  { key: 'm_HM', kind: 'number', group: 'fuel', label: '炉心の重金属の質量', symbol: 'm_{HM}', unit: mass },
  { key: 'MWd', kind: 'number', group: 'fuel', label: '運転期間に出す熱', unit: fixedUnit('MWd') },
  { key: 'm_burn', kind: 'number', group: 'fuel', label: '核分裂する物質の消費（運転期間）', symbol: 'm_{burn}', unit: mass },
  { key: 'm_bred', kind: 'number', group: 'fuel', label: '親物質から新たにできる量', symbol: 'm_{bred}', unit: mass },
  { key: 'm_net', kind: 'number', group: 'fuel', label: '正味の消費', unit: mass },
  { key: 'Bu', kind: 'number', group: 'fuel', label: '平均の燃焼度', symbol: 'Bu', unit: unitDefs.burnup },
  {
    key: 't_life',
    kind: 'number',
    group: 'fuel',
    label: '燃料を替えずに運転できる期間（全出力の換算）',
    symbol: 't_{life}',
    unit: years,
    visibleWhen: (i) => Number(i.Bu_max) > 0,
  },

  // 放射線
  { key: 'fission_rate', kind: 'number', group: 'rad', label: '核分裂の回数', symbol: '\\dot F', unit: fixedUnit('回/s') },
  { key: 'S_n', kind: 'number', group: 'rad', label: '外に出る中性子', symbol: 'S_n', unit: fixedUnit('個/s') },
  { key: 'S_g', kind: 'number', group: 'rad', label: '外に出るガンマ線のエネルギー', symbol: 'S_{\\gamma E}', unit: unitDefs.power },
  { key: 'E_mean', kind: 'number', group: 'rad', label: '核分裂の中性子の平均のエネルギー', unit: fixedUnit('MeV') },
  { key: 'v_mean', kind: 'number', group: 'rad', label: '同・速さ', unit: unitDefs.velocity, description: '光速の約6.6%' },
  { key: 'v_thermal', kind: 'number', group: 'rad', label: '熱中性子（0.025 eV）の速さ', unit: unitDefs.velocity },
  { key: 'frac_above10', kind: 'number', group: 'rad', label: '10 MeV を超える中性子の割合', unit: ratio },
  {
    key: 'spectrum',
    kind: 'series',
    group: 'rad',
    label: '中性子のエネルギーの分布（ワットの分布）',
    unit: fixedUnit('1/MeV'),
    seriesX: { label: 'エネルギー', unit: fixedUnit('MeV') },
  },

  // 熱交換器
  { key: 'A_sat', kind: 'number', group: 'hx', label: '冷却材の放射能（飽和）', symbol: 'A_{sat}', unit: unitDefs.activity, visibleWhen: hxOn },
  { key: 'A_HX', kind: 'number', group: 'hx', label: '熱交換器の放射能', symbol: 'A_{HX}', unit: unitDefs.activity, visibleWhen: hxOn },
  { key: 'hx_un_rate', kind: 'number', group: 'hx', label: '熱交換器の遮蔽なしの線量率', unit: doseRate, visibleWhen: (i) => hxOn(i) && isHuman(i) },
  { key: 'hx_thickness_text', kind: 'text', group: 'hx', label: '熱交換器の遮蔽の厚さ', visibleWhen: hxOn },
  { key: 'M_hx_shield', kind: 'number', group: 'hx', label: '熱交換器の遮蔽の質量（球殻とした目安）', unit: mass, visibleWhen: hxOn },
  ...[0, 1, 2, 3].map(
    (r): OutputDef => ({
      key: `hx_t_${r}`,
      kind: 'number',
      label: `熱交換器の遮蔽の${r + 1}層目の厚さ`,
      unit: unitDefs.thickness,
      graphOnly: true,
      visibleWhen: (i) => hxOn(i) && solving(i) && r === rowsOf(i, 'hx_layers').length - 1,
    }),
  ),

  // 崩壊熱
  ...(
    [
      ['s1', '1 秒'],
      ['min1', '1 分'],
      ['h1', '1 時間'],
      ['d1', '1 日'],
      ['d30', '30 日'],
      ['y1', '1 年'],
    ] as const
  ).map(
    ([k, t]): OutputDef => ({
      key: `decay_${k}`,
      kind: 'number',
      group: 'decay',
      label: `停止後 ${t}`,
      unit: ratio,
      description: k === 's1' || k === 'y1' ? '近似式の精度が下がる範囲（数十%程度）' : undefined,
    }),
  ),
  {
    key: 'decay_series',
    kind: 'series',
    group: 'decay',
    label: '崩壊熱の時間変化（熱出力に対する割合）',
    unit: ratio,
    seriesX: { label: '停止後の時間', unit: fixedUnit('s'), scale: 'log' },
    seriesY: { scale: 'log' },
  },
]

/** 原子炉・遮蔽モジュール（仕様書1(新規) §3、§5、§6） */
export const reactorShield: SimDefinition = {
  id: 'reactor-shield',
  version: 1,
  collapsibleGroups: true,
  groups: [
    { id: 'scenario', label: '構成の例' },
    { id: 'op', label: '運転条件' },
    { id: 'core', label: '炉のクラスと燃料' },
    { id: 'coolant', label: '冷却材' },
    { id: 'hx', label: '熱交換器', parent: 'coolant', visibleWhen: hxOn },
    { id: 'target', label: '守る対象と基準' },
    { id: 'shield', label: '遮蔽' },
    { id: 'layers', label: '遮蔽の層', parent: 'shield', visibleWhen: isLayers },
    { id: 'surface', label: '地表の配置', parent: 'shield', visibleWhen: isSurface },
    { id: 'origin', label: '材料の調達', parent: 'shield', visibleWhen: hasShield },
    { id: 'boom', label: 'ブームとケーブル', visibleWhen: isShadow },
  ],
  outputGroups: [
    { id: 'dose', label: '線量' },
    { id: 'shield', label: '遮蔽', visibleWhen: hasShield },
    { id: 'core', label: '炉心' },
    { id: 'fuel', label: '燃料' },
    { id: 'rad', label: '放射線' },
    { id: 'hx', label: '熱交換器', visibleWhen: hxOn },
    { id: 'decay', label: '停止後の崩壊熱' },
  ],
  inputs: [scenario, ...baseInputs],
  outputs,
  defaultGraph: { x: 'L', y: 'M_shield' },
  messages: {
    'coolant-temp': '冷却材の温度の範囲を超えています（融点 {melt} K、沸点 {boil} K）',
    'coolant-outlet': '冷却材の出口温度の目安（{T} K）を超えています（構造材の腐食などに注意）',
    'fuel-life': '運転期間の途中で燃料の交換が必要です（燃料を替えずに運転できるのは {years} 年）',
    'no-layers': '遮蔽の層を1つ以上入れてください',
    'inside-shield': '守る対象が遮蔽の内側にあります。距離を大きくしてください',
    'cannot-meet': '遮蔽の厚さの上限でも基準を満たせません。距離を大きくするか、材料を変えてください',
    'no-hydrogen': '除去断面積による計算は、水素を含む材料の層があるときに成り立ちます。この構成では精度が下がります',
    'wall-low': '壁が低すぎて、守る対象への放射線を遮っていません。壁の高さを上げてください',
    'no-lid':
      '上方向は遮蔽されていません。着陸機や上空の宇宙機への線量に注意してください。地球や火星では、大気で散乱して回り込む放射線（スカイシャイン）が含まれていません',
    'sulfur-near-core': '硫黄は約390 K で溶けます。炉の熱で温度が上がる場所には使えません',
    'nasa-lifetime': 'NASA の生涯の上限（600 mSv）を、原子炉による被ばくだけで超えます',
    'combined-exceeds': '炉心と熱交換器からの線量を合わせると、基準を超えます。距離か遮蔽を見直してください',
    u233: '燃料にできるウラン232 の崩壊で、タリウム208 の強いガンマ線（2.614 MeV）が出ます。燃料の取り出し・再処理・加工の設備に重い遮蔽が必要です（本モジュールでは計算しません）',
    pbbi: 'ポロニウム210（アルファ線を出す毒性の強い物質）ができます。漏れたときの取り扱いに注意が必要です',
    lithium: 'トリチウムができます',
    lih: '水素化リチウムは約680 K 以下に保つ必要があります（熱の計算は含まれていません）',
    'reg-concrete-vacuum': '真空中では水が蒸発してしまうので、水とセメントのコンクリートは、与圧した空間（気密の建屋など）で少なくとも数日間かけて固める（養生する）必要があります（設計の強さになるまでは約4週間）',
    'dry-ground': '地盤が乾いていて水素をほとんど含まないので、除去断面積による中性子の計算の精度が下がります',
    'shield-only': '遮蔽材だけの質量です。容器、構造、冷却の分は含まれません',
    'hx-no-source': 'この冷却材は、ガンマ線を出す物質がほとんどできません',
  },
  compute(inputs: Inputs): ComputeResult {
    const p = toReactorInputs(inputs)
    const r = computeReactor(p)
    const outputs: Record<string, OutputValue> = {}
    const num = (k: string, v: number) => {
      if (Number.isFinite(v)) outputs[k] = { kind: 'number', value: v }
    }
    const o = r.outputs
    if (o) {
      const human = p.target === 'human'
      for (const k of ['V_core', 'D', 'H', 'R0', 'M_reactor', 'm_HM', 'fission_rate', 'm_burn', 'm_bred', 'm_net', 'MWd', 'Bu', 't_life', 'S_n', 'S_g', 'E_mean', 'v_mean', 'v_thermal', 'frac_above10', 'R_out', 'M_shield', 'M_import', 'M_local', 't_w', 'wall_path', 'ground_path', 'up_rate', 'V_exc', 'M_exc', 'M_boom', 'M_cable', 'M_total_s', 'A_sat', 'A_HX', 'M_hx_shield', 'L_eval'] as const) {
        num(k, o[k])
      }
      if (p.shield_mode === 'surface' && p.layout === 'under') num('depth', o.depth)
      if (Number.isFinite(o.L_opt)) {
        num('L_opt', o.L_opt)
        num('L', o.L_opt)
      } else if (p.shield_mode === 'omni' && p.L_surface) num('L', o.L_eval)
      o.thickness.forEach((t, i) => num(`t_layer_${i}`, t))
      o.hx_thickness.forEach((t, i) => num(`hx_t_${i}`, t))
      // 線量
      const c = o.combined
      num('dose_ratio', c.ratio)
      if (human) {
        num('dose_year', c.year)
        num('un_rate', o.unshielded_rate.H_n + o.unshielded_rate.D_g_human)
        num('un_rate_n', o.unshielded_rate.H_n)
        num('un_rate_g', o.unshielded_rate.D_g_human)
        num('un_year', o.unshielded.year)
        num('sh_year_n', o.shielded.year_n)
        num('sh_year_g', o.shielded.year_g)
        num('sh_rate', o.shielded_rate.H_n + o.shielded_rate.D_g_human)
        if (o.hx_eval) num('hx_year', o.hx_eval.year)
        if (o.direct) num('direct_year', o.direct.year)
        if (o.conservative) num('cons_year', o.conservative.year)
        num('hx_un_rate', o.hx_unshielded_rate)
      } else {
        num('fluence', c.fluence)
        num('gamma_dose', c.gamma)
        num('un_fluence', o.unshielded.fluence)
        num('un_gamma', o.unshielded.gamma)
      }
      // 厚さの文字
      const cm = (t: number) => `${(t * 100).toPrecision(4).replace(/\.?0+$/, '')} cm`
      if (p.shield_mode === 'shadow' || p.shield_mode === 'omni') {
        outputs.thickness_text = { kind: 'text', value: p.layers.map((l, i) => `${MATERIALS[l.material].label} ${cm(o.thickness[i])}`).join(' ＋ ') }
      } else if (p.shield_mode === 'surface') {
        const m = (t: number) => `${t.toPrecision(4).replace(/\.?0+$/, '')} m`
        outputs.thickness_text = {
          kind: 'text',
          value:
            p.layout === 'under'
              ? `埋め戻し ${m(o.t_top)}（炉心の中心の深さ ${m(o.depth)}）`
              : `壁 ${m(o.t_w)}${o.t_top > 0 ? `、ふた ${m(o.t_top)}` : ''}`,
        }
      }
      if (p.hx_eval) {
        outputs.hx_thickness_text = { kind: 'text', value: p.hx_layers.map((l, i) => `${MATERIALS[l.material].label} ${cm(o.hx_thickness[i])}`).join(' ＋ ') }
      }
      // 質量の内訳
      const rows: (string | number)[][] = o.massRows.map((m) => [m.label, m.mass, m.origin === 'local' ? '現地' : '地球から'])
      rows.push(['合計', o.M_shield, ''])
      outputs.mass_table = { kind: 'table', columns: ['材料・成分', '質量 [kg]', '調達'], rows }
      // 崩壊熱
      for (const [k, v] of Object.entries(o.decay_points)) num(`decay_${k}`, v)
      outputs.decay_series = { kind: 'series', x: o.decay.t, y: o.decay.frac }
      outputs.spectrum = { kind: 'series', x: o.spectrum.E, y: o.spectrum.chi }
    }
    return { outputs, warnings: r.warnings, errors: r.errors }
  },
}

function layersOf(v: unknown): Layer[] {
  if (!Array.isArray(v)) return []
  return v.map((row: TableRow) => ({
    material: (String(row.material) in MATERIALS ? String(row.material) : 'concrete') as MaterialId,
    t: typeof row.t === 'number' && Number.isFinite(row.t) ? row.t : 0,
  }))
}

export function toReactorInputs(i: Inputs): ReactorInputs {
  const num = (k: string) => Number(i[k])
  const origin = Object.fromEntries((Object.keys(COMPONENTS) as ComponentId[]).map((c) => [c, String(i[`origin_${c}`]) as Origin])) as Record<ComponentId, Origin>
  return {
    Q: num('Q'),
    T_op: num('T_op'),
    f_op: num('f_op'),
    q: num('q'),
    V_min: num('V_min'),
    HD: num('HD'),
    t_ref: num('t_ref'),
    rho_HM: num('rho_HM'),
    fuel: String(i.fuel) as FuelId,
    nu: num('nu'),
    alpha_c: num('alpha_c'),
    CR: num('CR'),
    Bu_max: num('Bu_max'),
    f_n: num('f_n'),
    f_g: num('f_g'),
    coolant: String(i.coolant) as CoolantId,
    T_hot: num('T_hot'),
    alpha_r: num('alpha_r'),
    f_act: num('f_act'),
    hx_eval: Boolean(i.hx_eval),
    f_HX: num('f_HX'),
    t_tr: num('t_tr'),
    L_HX: num('L_HX'),
    hx_layers: layersOf(i.hx_layers),
    target: i.target_type === 'electronics' ? 'electronics' : 'human',
    astronaut: i.criteria === 'astronaut',
    H_lim: num('H_lim'),
    t_occ: num('t_occ'),
    Phi_lim: num('Phi_lim'),
    D_lim: num('D_lim'),
    L: num('L'),
    L_surface: Boolean(i.L_surface),
    h_t: num('h_t'),
    R_obj: num('R_obj'),
    shield_mode: String(i.shield_mode) as ShieldMode,
    solve: Boolean(i.solve),
    layers: layersOf(i.layers),
    solve_count: Number(i.solve_count) === 1 ? 1 : 2,
    layout: String(i.layout) as Layout,
    h_base: num('h_base'),
    depth: num('depth'),
    r_w: num('r_w'),
    H_w: num('H_w'),
    t_w: num('t_w'),
    wall_mat: String(i.wall_mat) as SurfaceMaterialId,
    t_top: num('t_top'),
    lid_mat: String(i.lid_mat) as SurfaceMaterialId,
    cav_gap: num('cav_gap'),
    ground_rho: num('ground_rho'),
    ground_w: num('ground_w'),
    basis: i.basis === 'direct' ? 'direct' : 'conservative',
    L_up: num('L_up'),
    origin,
    boom: Boolean(i.boom),
    optimize_L: Boolean(i.optimize_L),
    lambda_b: num('lambda_b'),
    P_e: num('P_e'),
    V_tr: num('V_tr'),
    f_loss: num('f_loss'),
    conductor: i.conductor === 'copper' ? 'copper' : 'aluminum',
  }
}
