import { unitDefs, type UnitDef } from '../../core/physics/units.ts'
import type { ComputeResult, EnumParam, Inputs, NumberParam, OutputDef, OutputValue, ParamDef, SimDefinition } from '../types.ts'
import {
  computePower,
  CONVERTER_PRESETS,
  LOCATION_PRESETS,
  REACTOR_PRESETS,
  TES_INSULATION_PRESETS,
  TES_MEDIUM_PRESETS,
  WATER_BUFFER,
  type BeamMode,
  type ConverterType,
  type Engine,
  type LocationId,
  type NightBuffer,
  type PayloadDesign,
  type PowerInputs,
  type RadiatorId,
  type ReactorClass,
  type ReactorMode,
  type SunSource,
  type TesCharge,
  type TesOrigin,
} from './model.ts'

const KW = 1e3
const MIN = 60
const DAY = 86_400
const CUSTOM = 'custom'

// 表示単位
const power: UnitDef = { ...unitDefs.power, defaultId: 'kW' }
const thermal: UnitDef = { ...unitDefs.thermalPower, defaultId: 'kWt' }
const hours: UnitDef = { ...unitDefs.duration, defaultId: 'h' }
const minutes: UnitDef = { ...unitDefs.duration, defaultId: 'min' }
const kWh: UnitDef = { ...unitDefs.energy, defaultId: 'kWh' }
const MJ: UnitDef = { ...unitDefs.energy, defaultId: 'MJ' }
const GJ: UnitDef = { ...unitDefs.energy, defaultId: 'GJ' }

// 表示の条件
const hasSun = (i: Inputs) => i.sun_source !== 'none'
const isPv = (i: Inputs) => i.sun_source === 'pv'
const isSolarThermal = (i: Inputs) => i.sun_source === 'solar_thermal'
const withReactor = (i: Inputs) => i.reactor !== 'none'
const withBeam = (i: Inputs) => i.beam !== 'none'
const isTes = (i: Inputs) => i.night_buffer === 'tes'
const isFurnace = (i: Inputs) => isTes(i) && i.tes_charge === 'solar_furnace'
const isHeater = (i: Inputs) => isTes(i) && i.tes_charge === 'heater'
const isAverage = (i: Inputs) => i.payload_design === 'average'
const hasEclipse = (i: Inputs) => Number(i.t_ecl) > 0
const directStore = (i: Inputs) => isTes(i) && i.reactor === 'fixed'

const fraction = (key: string, label: string, def: number, extra: Partial<NumberParam>): NumberParam => ({
  kind: 'number',
  key,
  label,
  unit: unitDefs.fraction,
  default: def,
  min: 0,
  minExclusive: true,
  max: 1,
  rangeMessage: '0 より大きく 100% 以下で入力してください',
  ...extra,
})

const temperature = (key: string, label: string, def: number, extra: Partial<NumberParam>): NumberParam => ({
  kind: 'number',
  key,
  label,
  unit: unitDefs.temperature,
  default: def,
  min: 0,
  minExclusive: true,
  ...extra,
})

// ---------------------------------------------------------------------------
// プリセット

const LOCATION_LABELS: Record<LocationId, string> = {
  deep_space: '深宇宙（1 AU、常に日照）',
  leo: '地球低軌道（高度400 km）※参考値',
  mars_leo: '火星低軌道（高度400 km）※参考値',
  lunar: '月面（赤道）※参考値',
  mars_surface: '火星表面（赤道付近）※参考値',
  titan: 'タイタン表面 ※参考値',
  earth: '地球表面（中緯度、晴天）※参考値',
}

function locationPreset(id: string): Inputs {
  const l = LOCATION_PRESETS[id as LocationId]
  if (!l) return {}
  const { T_env, ...rest } = l
  return T_env === undefined ? { ...rest } : { ...rest, T_env }
}

const CONVERTER_LABELS: Record<ConverterType, string> = {
  stirling: 'スターリング（ヘリウム）',
  brayton_hexe: 'ブレイトン（ヘリウム・キセノン、宇宙用）※参考値',
  brayton_sco2: 'ブレイトン（超臨界二酸化炭素）※参考値',
  brayton_he: 'ブレイトン（ヘリウム）※参考値',
  thermoelectric: '熱電変換',
  rankine: 'ランキン（蒸気）※参考値',
}

function converterPreset(suffix: string, type: string): Inputs {
  const c = CONVERTER_PRESETS[type as ConverterType]
  if (!c) return {}
  return { [`T_cold_${suffix}`]: c.T_cold, [`eta_mech_${suffix}`]: c.eta_mech, [`alpha_conv_${suffix}`]: c.alpha_conv }
}

const REACTOR_LABELS: Record<ReactorClass, string> = {
  kilopower: '宇宙用超小型炉（Kilopower 級、4〜43 kWt）※参考値',
  sp100: '宇宙用小型炉（SP-100 級、約2.4 MWt）※参考値',
  naval: '艦船用炉（約150 MWt）※参考値',
  smr: '小型モジュール炉（数百 MWt）※参考値',
  large: '大型発電炉（PWR、3000〜4500 MWt）※参考値',
  htgr: '高温ガス炉（数十〜数百 MWt）※参考値',
  sfr: 'ナトリウム冷却高速炉 ※参考値',
  lfr: '鉛冷却高速炉 ※参考値',
}

function reactorPreset(cls: string): Inputs {
  const r = REACTOR_PRESETS[cls as ReactorClass]
  if (!r) return {}
  return { T_hot_r: r.T_hot, alpha_r: r.alpha_r, alpha_s: r.alpha_s, converter_r: r.converter, ...converterPreset('r', r.converter) }
}

function tesMediumPreset(id: string): Inputs {
  const m = TES_MEDIUM_PRESETS[id as keyof typeof TES_MEDIUM_PRESETS]
  if (!m) return {}
  return { c_tes: m.c, rho_tes: m.rho, L_tes: m.L, T_max: m.T_max, T_min: m.T_min, T_lim: m.T_lim, tes_origin: m.origin }
}

function insulationPreset(id: string): Inputs {
  const v = TES_INSULATION_PRESETS[id as keyof typeof TES_INSULATION_PRESETS]
  return v === undefined ? {} : { lambda_tes: v / DAY }
}

const converterOptions = [
  ...(Object.keys(CONVERTER_LABELS) as ConverterType[]).map((value) => ({ value, label: CONVERTER_LABELS[value] })),
  { value: CUSTOM, label: 'カスタム' },
]

/** 熱機関（§3.7）。添字 k は r（原子炉用）、s（太陽熱用）、tes（蓄熱体用） */
function engineParams(suffix: string, group: string, initial: ConverterType, hotSide: string): ParamDef[] {
  const c = CONVERTER_PRESETS[initial]
  const params: ParamDef[] = [
    {
      kind: 'enum',
      key: `converter_${suffix}`,
      group,
      label: '変換方式',
      description: '熱を電気に変える方式。選ぶと、効率係数・低温側の温度・比質量に目安の値が入る',
      options: converterOptions,
      default: initial,
      presets: (v) => converterPreset(suffix, v),
      customValue: CUSTOM,
    },
    temperature(`T_cold_${suffix}`, '低温側の温度（＝この熱機関用ラジエータの温度）', c.T_cold, {
      symbol: `T_{cold,${suffix}}`,
      description: `${hotSide}との差が大きいほど効率は上がる。ただし低くするとラジエータが急に大きくなる（放熱は温度の4乗で効く）`,
    }),
    fraction(`eta_mech_${suffix}`, '機関効率係数（実際の効率 ÷ カルノー効率）', c.eta_mech, {
      symbol: `\\eta_{mech,${suffix}}`,
      description: '理論上の上限（カルノー効率）のうち、実際に出せる割合。大きいほど同じ熱から多くの電気が出る',
    }),
    {
      kind: 'number',
      key: `alpha_conv_${suffix}`,
      group,
      label: '変換系の比質量',
      symbol: `\\alpha_{conv,${suffix}}`,
      description: '電気出力 1 kW あたりの、変換器・熱輸送・構造・電力制御の質量。小さいほど軽い',
      unit: unitDefs.perElectricPower,
      default: c.alpha_conv,
      min: 0,
    },
  ]
  return params.map((p) => ({ ...p, group }))
}

// ---------------------------------------------------------------------------
// 入力（§3）

const baseInputs: ParamDef[] = [
  // §3.1 環境・配備位置
  {
    kind: 'enum',
    key: 'location',
    group: 'env',
    label: '配備位置',
    description: '選ぶと、日射・日照の周期・日陰の時間・シンク温度・大気の値が入る。日照と日陰の時間は検証済み、シンク温度と火星・タイタン・地球表面の値は参考値',
    options: [...(Object.keys(LOCATION_LABELS) as LocationId[]).map((value) => ({ value, label: LOCATION_LABELS[value] })), { value: CUSTOM, label: 'カスタム' }],
    default: 'leo',
    presets: (v) => locationPreset(v),
    customValue: CUSTOM,
  },
  {
    kind: 'number',
    key: 'I_sun',
    group: 'env',
    label: '日照中の日射（発電面に届く太陽光）',
    symbol: 'I_\\odot',
    description: '大きいほど太陽電池や集光鏡が小さくて済む。目安：地球・月の付近で 1361、火星表面の平均で約 230、タイタン表面で約 1',
    unit: unitDefs.irradiance,
    default: 1361,
    min: 0,
  },
  {
    kind: 'number',
    key: 'T_cyc',
    group: 'env',
    label: '日照の周期（軌道周期、天体の1日）',
    symbol: 'T_{cyc}',
    description: '日照と日陰をくり返す周期。目安：地球低軌道 約93分、月面 29.5日',
    unit: hours,
    default: LOCATION_PRESETS.leo.T_cyc,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 't_ecl',
    group: 'env',
    label: '日陰の時間（1周期のうち）',
    symbol: 't_{ecl}',
    description: '長いほど、日陰をしのぐ蓄電池や蓄熱体が大きくなる。0 なら常に日照。月面の夜は約15日',
    unit: hours,
    default: LOCATION_PRESETS.leo.t_ecl,
    min: 0,
  },
  temperature('T_sink', '実効シンク温度（日照中）', LOCATION_PRESETS.leo.T_sink, {
    group: 'env',
    symbol: 'T_{sink}',
    description: 'ラジエータから見た周りの「空」の温度（太陽光、天体の照り返しと赤外線をまとめたもの）。高いほど熱を捨てにくい。深宇宙で約 4 K、月面の昼で約 300 K',
    min: 0,
    minExclusive: false,
  }),
  temperature('T_sink_ecl', '実効シンク温度（日陰中）', LOCATION_PRESETS.leo.T_sink_ecl, {
    group: 'env',
    symbol: 'T_{sink,ecl}',
    description: '日陰中だけ動く熱機関（蓄熱体用）と、日陰中の原子炉用ラジエータに使う。月面の夜は約 100 K',
    min: 0,
    minExclusive: false,
  }),
  {
    kind: 'number',
    key: 'h_c',
    group: 'env',
    label: '対流熱伝達率',
    symbol: 'h_c',
    description: '大気が熱を運び去る強さ。大きいほどラジエータが小さくて済む。真空は 0。目安：火星の自然対流 1〜3、火星でファンを回すと 5〜15、地球・タイタン 10〜50',
    unit: unitDefs.heatTransfer,
    default: 0,
    min: 0,
  },
  temperature('T_env', '大気温度', 288, {
    group: 'env',
    symbol: 'T_{env}',
    description: '対流で熱を渡す相手の温度。低いほど熱を捨てやすい。目安：火星 約210 K、タイタン 約94 K、地球 約288 K',
    min: 0,
    minExclusive: false,
    visibleWhen: (i) => Number(i.h_c) > 0,
  }),

  // §3.2 負荷
  {
    kind: 'number',
    key: 'P_peak',
    group: 'load',
    label: 'ピーク電力',
    symbol: 'P_{peak}',
    unit: power,
    default: 20 * KW,
    min: 0,
  },
  {
    kind: 'number',
    key: 't_peak',
    group: 'load',
    label: 'ピークの時間（1サイクルあたり）',
    symbol: 't_{peak}',
    unit: minutes,
    default: 10 * MIN,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'P_idle',
    group: 'load',
    label: '待機電力',
    symbol: 'P_{idle}',
    description: 'ピーク電力と同じにすると、一定の負荷になる',
    unit: power,
    default: 5 * KW,
    min: 0,
  },
  {
    kind: 'number',
    key: 't_idle',
    group: 'load',
    label: '待機の時間（1サイクルあたり）',
    symbol: 't_{idle}',
    unit: minutes,
    default: 50 * MIN,
    min: 0,
  },
  {
    kind: 'boolean',
    key: 'Q_pl_same',
    group: 'load',
    label: 'ミッション機器の排熱',
    description: '機器が使った電力は、最後はすべて熱になる。レーザのように電力の一部が光として外に出る機器では「手で入力」にする',
    default: true,
    labels: ['手で入力', '電力と同じ'],
  },
  {
    kind: 'number',
    key: 'Q_pl_peak',
    group: 'load',
    label: 'ミッション機器の排熱（ピーク時）',
    symbol: 'Q_{pl,peak}',
    unit: power,
    default: 20 * KW,
    min: 0,
    role: (i) => (i.Q_pl_same ? 'output' : 'input'),
  },
  {
    kind: 'number',
    key: 'Q_pl_idle',
    group: 'load',
    label: 'ミッション機器の排熱（待機時）',
    symbol: 'Q_{pl,idle}',
    unit: power,
    default: 5 * KW,
    min: 0,
    role: (i) => (i.Q_pl_same ? 'output' : 'input'),
  },
  temperature('T_payload', 'ミッション機器用ラジエータの温度', 300, {
    group: 'load',
    symbol: 'T_{payload}',
    description: '高いほどラジエータが小さくて済む（機器をどこまで熱くしてよいかで決まる）。シンク温度より低いと熱を捨てられない',
  }),
  {
    kind: 'enum',
    key: 'payload_design',
    group: 'load',
    label: 'ミッション機器の排熱の設計基準',
    description: 'ピーク：ラジエータでピーク時の排熱をそのまま捨てる。平均：ラジエータは平均の排熱に合わせ、捨てきれない熱は排熱バッファにためて待機中に捨てる',
    options: [
      { value: 'peak', label: 'ピークで設計' },
      { value: 'average', label: '平均で設計（排熱バッファあり）' },
    ],
    default: 'peak',
  },

  // §3.3 排熱バッファ
  {
    kind: 'enum',
    key: 'buf_medium',
    group: 'buf',
    label: '蓄熱材の種類',
    description: '越夜用の蓄熱体とは別の、ミッション機器の排熱の一時的な置き場',
    options: [
      { value: 'water', label: '水（H2O）' },
      { value: CUSTOM, label: 'カスタム' },
    ],
    default: 'water',
    presets: { water: { ...WATER_BUFFER } },
    customValue: CUSTOM,
  },
  {
    kind: 'number',
    key: 'c_buf',
    group: 'buf',
    label: '比熱',
    symbol: 'c_{buf}',
    description: '大きいほど同じ質量で多くの熱をためられる',
    unit: unitDefs.specificHeat,
    default: WATER_BUFFER.c_buf,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'dT_buf',
    group: 'buf',
    label: '蓄熱材の温度の変化幅',
    symbol: '\\Delta T_{buf}',
    description: 'ためる前と後の温度差。大きいほど蓄熱材が少なくて済むが、機器の温度も大きく変わる',
    unit: unitDefs.tempDiff,
    default: WATER_BUFFER.dT_buf,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'L_buf',
    group: 'buf',
    label: '融解熱',
    symbol: 'L_{buf}',
    description: '固体と液体の変化を使う場合。水を液体のまま使うなら 0、氷が融ける熱を使うなら 334 kJ/kg',
    unit: unitDefs.latentHeat,
    default: WATER_BUFFER.L_buf,
    min: 0,
  },
  {
    kind: 'number',
    key: 'rho_buf',
    group: 'buf',
    label: '密度',
    symbol: '\\rho_{buf}',
    unit: unitDefs.density,
    default: WATER_BUFFER.rho_buf,
    min: 0,
    minExclusive: true,
  },

  // §3.5 電源の構成
  {
    kind: 'enum',
    key: 'sun_source',
    group: 'config',
    label: '日照中の電源',
    description: 'ほかの電源で足りない分と、日陰に備えてためる分をまかなう大きさを自動で決める',
    options: [
      { value: 'none', label: 'なし' },
      { value: 'pv', label: '太陽電池' },
      { value: 'solar_thermal', label: '太陽熱＋熱機関' },
    ],
    default: 'pv',
  },
  {
    kind: 'enum',
    key: 'reactor',
    group: 'config',
    label: '原子炉',
    description: '「自動で決める」は、日照中の電源が「なし」のときだけ選べる（原子炉と外部電源だけで日陰中もまかなう大きさにする）',
    options: [
      { value: 'none', label: '使わない' },
      { value: 'auto', label: '熱出力を自動で決める', disabledWhen: hasSun },
      { value: 'fixed', label: '熱出力を指定する' },
    ],
    default: 'none',
  },
  {
    kind: 'enum',
    key: 'beam',
    group: 'config',
    label: '外部電源',
    description:
      'この設備の外から受け取る（買う）電力。自分の発電設備の大きさや質量には含めない。例：衛星からレーザや太陽光で送られてくる光を受光パネルで変えた電力、基地の電力網から引く電力。「常時」は日陰中も受け取れる場合（日陰にならない場所から送るなど）',
    options: [
      { value: 'none', label: '使わない' },
      { value: 'always', label: '常時' },
      { value: 'sun_only', label: '日照中のみ' },
    ],
    default: 'none',
  },
  {
    kind: 'enum',
    key: 'night_buffer',
    group: 'config',
    label: '日陰中のバッファ',
    description: '日陰の間の電力をどうためるか。蓄熱体は、日照中に熱をためて日陰中に熱機関で発電する（往復の効率は低いが、蓄熱材を現地で集められれば地球から運ぶ質量が大きく減る）。日陰がない場所では使わない',
    options: [
      { value: 'battery', label: '蓄電池' },
      { value: 'tes', label: '蓄熱体' },
    ],
    default: 'battery',
  },

  // §3.6 (a) 太陽電池
  fraction('eta_pv', '変換効率', 0.3, {
    group: 'pv',
    symbol: '\\eta_{pv}',
    description: '大きいほど太陽電池が小さくて済む。宇宙用の3接合セルで約 30%（運用開始時）',
  }),
  fraction('f_deg', '劣化・損失係数', 0.85, {
    group: 'pv',
    symbol: 'f_{deg}',
    description: '劣化、ちりの付着、配線の損失などで残る割合（参考値）。100% が損失なし。小さいほど太陽電池を大きくする必要がある',
  }),
  {
    kind: 'number',
    key: 'rho_pv',
    group: 'pv',
    label: '面密度（構造を含む）',
    symbol: '\\rho_{pv}',
    description: '小さいほど軽い。硬いパネルで 2〜3、巻き取り式の柔らかいパネルで約 1（参考値）',
    unit: unitDefs.arealDensity,
    default: 2,
    min: 0,
  },

  // §3.6 (c) 太陽熱
  fraction('eta_conc', '集光効率（鏡の反射率 × 受熱器の吸収効率）', 0.85, {
    group: 'solar',
    symbol: '\\eta_{conc}',
    description: '大きいほど集光鏡が小さくて済む（参考値）',
  }),
  {
    kind: 'number',
    key: 'rho_conc',
    group: 'solar',
    label: '集光鏡の面密度',
    symbol: '\\rho_{conc}',
    description: '小さいほど軽い（参考値）',
    unit: unitDefs.arealDensity,
    default: 2,
    min: 0,
  },
  temperature('T_hot_s', '高温側の温度', 1100, {
    group: 'solar',
    symbol: 'T_{hot,s}',
    description: '集光した熱で熱機関を動かすときの入口の温度。高いほど効率が上がる（参考値）',
    visibleWhen: isSolarThermal,
  }),
  ...engineParams('s', 'eng_s', 'brayton_hexe', '高温側の温度'),

  // §3.6 (b) 原子炉
  {
    kind: 'enum',
    key: 'reactor_class',
    group: 'reactor',
    label: '炉のクラス',
    description: '選ぶと、高温側の温度・比質量・原子炉用の変換方式が入る。遮蔽の比質量は Kilopower と SP-100 が検証済み、ほかは参考値か未設定',
    options: [...(Object.keys(REACTOR_LABELS) as ReactorClass[]).map((value) => ({ value, label: REACTOR_LABELS[value] })), { value: CUSTOM, label: 'カスタム' }],
    default: 'kilopower',
    presets: (v) => reactorPreset(v),
    customValue: CUSTOM,
    customKeys: ['T_hot_r', 'alpha_r', 'alpha_s', 'converter_r'],
  },
  {
    kind: 'number',
    key: 'Q_r',
    group: 'reactor',
    label: '熱出力',
    symbol: 'Q_r',
    description: '原子炉が出す熱。このうち熱機関の効率の分が電気になり、残りはラジエータで捨てる。大きくすると、日陰に備える蓄電池や蓄熱体が小さくなる',
    unit: thermal,
    default: 40 * KW,
    min: 0,
    role: (i) => (i.reactor === 'auto' ? 'output' : 'input'),
  },
  temperature('T_hot_r', '高温側の温度（熱機関の入口）', REACTOR_PRESETS.kilopower.T_hot, {
    group: 'reactor',
    symbol: 'T_{hot,r}',
    description: '高いほど効率が上がる。軽水炉で約 560 K（蒸気の温度）、Kilopower で 1073 K',
  }),
  {
    kind: 'number',
    key: 'alpha_r',
    group: 'reactor',
    label: '原子炉の比質量',
    symbol: '\\alpha_r',
    description: '熱出力 1 kW あたりの、炉心・反射体・制御機構・圧力容器などの質量。小さいほど軽い。0 は未設定（質量を 0 として計算する）',
    unit: unitDefs.perThermalPower,
    default: REACTOR_PRESETS.kilopower.alpha_r,
    min: 0,
  },
  {
    kind: 'boolean',
    key: 'shield_include',
    group: 'reactor',
    label: '遮蔽の質量',
    description: '詳しい遮蔽の計算は「原子炉・遮蔽」で行う。ここではプリセットの比質量で見積もる',
    default: true,
    labels: ['含めない', '含める'],
  },
  {
    kind: 'number',
    key: 'alpha_s',
    group: 'reactor',
    label: '遮蔽の比質量',
    symbol: '\\alpha_s',
    description: '熱出力 1 kW あたりの遮蔽の質量。小さいほど軽い。0 は未設定',
    unit: unitDefs.perThermalPower,
    default: REACTOR_PRESETS.kilopower.alpha_s,
    min: 0,
    visibleWhen: (i) => Boolean(i.shield_include),
  },
  {
    kind: 'number',
    key: 'f_store',
    group: 'reactor',
    label: '日照中に熱を蓄熱体へ直接送る割合',
    symbol: 'f_{store}',
    description: '原子炉は一定の出力で動かす。日照中は太陽で足りる分だけ、熱を発電に使わず蓄熱体にため、日陰中の発電に回す。0% は送らない、100% は日照中の熱をすべて送る',
    unit: unitDefs.fraction,
    default: 0,
    min: 0,
    max: 1,
    rangeMessage: '0〜100% で入力してください',
    visibleWhen: directStore,
  },
  ...engineParams('r', 'eng_r', 'stirling', '原子炉の高温側の温度'),

  // §3.6 (d) 外部電源（受電）
  {
    kind: 'number',
    key: 'P_beam',
    group: 'beam',
    label: '外部電源から受け取る電力（直流に変えたあと）',
    symbol: 'P_{beam}',
    description: '外から受け取る電力。太陽光集光・送光やレーザ発振・送電と組み合わせるときは、そちらの結果から求めた受け取る電力を入れる。受け取る設備（受光パネルなど）の面積と質量は、ここには含めない',
    unit: power,
    default: 0,
    min: 0,
  },

  // §3.4 蓄電池
  {
    kind: 'number',
    key: 'e_bat',
    group: 'bat',
    label: '重量エネルギー密度（システム全体）',
    symbol: 'e_{bat}',
    description: '大きいほど蓄電池が軽い。リチウムイオン電池のシステム全体で 100〜200 Wh/kg',
    unit: unitDefs.batteryEnergy,
    default: 150 * 3600,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'v_bat',
    group: 'bat',
    label: '体積エネルギー密度（システム全体）',
    symbol: 'v_{bat}',
    description: '大きいほど蓄電池が小さい（参考値）',
    unit: unitDefs.batteryDensity,
    default: 250 * 3.6e6,
    min: 0,
    minExclusive: true,
  },
  fraction('eta_bat', '充放電効率（往復）', 0.9, {
    group: 'bat',
    symbol: '\\eta_{bat}',
    description: 'ためた電力のうち取り出せる割合。大きいほど充電に使う電力が少なくて済む',
  }),
  fraction('DoD', '放電深度', 0.8, {
    group: 'bat',
    symbol: 'DoD',
    description: '容量のうち、1回に使ってよい割合。大きいほど蓄電池が小さくて済むが、電池の寿命は縮む。地球低軌道のように1日に何度も充放電するなら 20〜40% に抑えるのが普通',
  }),

  // §3.8 越夜用の蓄熱体
  {
    kind: 'enum',
    key: 'tes_medium',
    group: 'tes_medium',
    label: '蓄熱材の種類',
    description: '選ぶと、比熱・密度・温度・調達先が入る。レゴリスは参考値、太陽塩は地上の太陽熱発電所の値（検証済み）',
    options: [
      { value: 'regolith', label: 'レゴリス（焼結、月面）※参考値' },
      { value: 'solar_salt', label: '太陽塩（硝酸ナトリウム60%・硝酸カリウム40%）' },
      { value: CUSTOM, label: 'カスタム' },
    ],
    default: 'regolith',
    presets: (v) => tesMediumPreset(v),
    customValue: CUSTOM,
    customKeys: ['c_tes', 'rho_tes', 'L_tes', 'T_max', 'T_min', 'T_lim'],
  },
  {
    kind: 'number',
    key: 'c_tes',
    group: 'tes_medium',
    label: '比熱',
    symbol: 'c_{tes}',
    description: '大きいほど同じ質量で多くの熱をためられる',
    unit: unitDefs.specificHeat,
    default: TES_MEDIUM_PRESETS.regolith.c,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'rho_tes',
    group: 'tes_medium',
    label: '密度',
    symbol: '\\rho_{tes}',
    description: '大きいほど蓄熱材の容積が小さい',
    unit: unitDefs.density,
    default: TES_MEDIUM_PRESETS.regolith.rho,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'L_tes',
    group: 'tes_medium',
    label: '融解熱',
    symbol: 'L_{tes}',
    description: '固体と液体の変化を使う場合。融ける熱の分だけ多くためられる。使わないなら 0',
    unit: unitDefs.latentHeat,
    default: 0,
    min: 0,
  },
  temperature('T_melt', '融解の温度', 900, {
    group: 'tes_medium',
    symbol: 'T_{melt}',
    description: '最低温度と最高温度の間にする',
    visibleWhen: (i) => Number(i.L_tes) > 0,
  }),
  temperature('T_max', 'ためたときの温度（最高）', TES_MEDIUM_PRESETS.regolith.T_max, {
    group: 'tes_medium',
    symbol: 'T_{max}',
    description: '高いほど効率が上がり、蓄熱材も太陽電池も小さくなる。原子炉から直接ためるときは、原子炉の出口温度より低くする',
  }),
  temperature('T_min', '使い切ったときの温度（最低）', TES_MEDIUM_PRESETS.regolith.T_min, {
    group: 'tes_medium',
    symbol: 'T_{min}',
    description: '低いほど多くの熱を取り出せるが、使い切る直前の効率が下がる。蓄熱体用の熱機関の低温側の温度より高くする',
  }),
  temperature('T_lim', '蓄熱材の使用上限温度', TES_MEDIUM_PRESETS.regolith.T_lim, {
    group: 'tes_medium',
    symbol: 'T_{lim}',
    description: 'これを超えると焼結・融解・分解などが起こる（警告に使う）',
  }),
  {
    kind: 'enum',
    key: 'tes_origin',
    group: 'tes_medium',
    label: '蓄熱材の調達',
    description: '現地調達なら、蓄熱材は地球から運ぶ質量に含めない',
    options: [
      { value: 'local', label: '現地調達' },
      { value: 'earth', label: '地球から輸送' },
    ],
    default: 'local',
  },
  {
    kind: 'enum',
    key: 'tes_charge',
    group: 'tes_charge',
    label: '熱の入れ方（原子炉から直接送る分の残り）',
    description: '電気ヒータ：日照中の電源や外部電源の電力で加熱する。太陽炉：集光鏡で直接加熱する',
    options: [
      { value: 'heater', label: '電気ヒータ' },
      { value: 'solar_furnace', label: '太陽炉' },
    ],
    default: 'heater',
  },
  fraction('eta_heat', '電気ヒータの効率', 0.98, {
    group: 'tes_charge',
    symbol: '\\eta_{heat}',
    description: '電力のうち蓄熱体に入る熱の割合（参考値。抵抗加熱・誘導加熱で 95〜99%）',
    visibleWhen: isHeater,
  }),
  {
    kind: 'number',
    key: 'alpha_heat',
    group: 'tes_charge',
    label: '電気ヒータの比質量（電力制御を含む）',
    symbol: '\\alpha_{heat}',
    description: '電力 1 kW あたりの質量。小さいほど軽い（参考値）',
    unit: unitDefs.perElectricPower,
    default: 1e-3,
    min: 0,
    visibleWhen: isHeater,
  },
  {
    kind: 'number',
    key: 'dT_hx',
    group: 'tes_charge',
    label: '原子炉から直接送るときの熱交換の温度差',
    symbol: '\\Delta T_{hx}',
    description: '蓄熱体は、原子炉の出口温度からこの差を引いた温度までしか熱くできない（参考値）',
    unit: unitDefs.tempDiff,
    default: 50,
    min: 0,
    visibleWhen: directStore,
  },
  {
    kind: 'enum',
    key: 'tes_insulation',
    group: 'tes_loss',
    label: '断熱の条件',
    description: '選ぶと 1日あたりの損失率が入る（参考値）。蓄熱体が大きいほど、表面積の割合が小さくなり損失率は下がる',
    options: [
      { value: 'ideal', label: '損失なし（理想、比較用）' },
      { value: 'large_tank', label: '大型の高断熱タンク（数万 t 級）※参考値' },
      { value: 'lunar_buried', label: '月面に埋設（100 t 級）※参考値' },
      { value: 'simple', label: '簡易な断熱（小型）※参考値' },
      { value: CUSTOM, label: 'カスタム' },
    ],
    default: 'lunar_buried',
    presets: (v) => insulationPreset(v),
    customValue: CUSTOM,
  },
  {
    kind: 'number',
    key: 'lambda_tes',
    group: 'tes_loss',
    label: '1日あたりの損失率',
    symbol: '\\lambda_{tes}',
    description: 'ためた熱のうち1日で失う割合。小さいほど断熱がよく、蓄熱材が少なくて済む',
    unit: unitDefs.lossRate,
    default: 0.01 / DAY,
    min: 0,
  },
  {
    kind: 'number',
    key: 'alpha_hx',
    group: 'tes_loss',
    label: '熱交換器・断熱・容器の比質量',
    symbol: '\\alpha_{hx}',
    description: '取り出す熱の最大値 1 kW あたりの質量。公開された実例が少ないため初期値は 0（未設定）',
    unit: unitDefs.perThermalPower,
    default: 0,
    min: 0,
  },
  ...engineParams('tes', 'eng_tes', 'brayton_hexe', '蓄熱体の温度'),

  // §3.9 ラジエータ
  {
    kind: 'number',
    key: 'eps',
    group: 'rad',
    label: '放射率',
    symbol: '\\epsilon',
    description: '大きいほど放射で熱を捨てやすい（1 が理想的な黒体）。ラジエータの塗装で 0.85〜0.95',
    unit: unitDefs.none,
    default: 0.9,
    min: 0,
    minExclusive: true,
    max: 1,
  },
  {
    kind: 'number',
    key: 'rho_rad',
    group: 'rad',
    label: '面密度（パネルの片面の面積あたり）',
    symbol: '\\rho_{rad}',
    description: '小さいほど軽い。国際宇宙ステーションの世代で約 10、先進的な設計で 3〜5（参考値）',
    unit: unitDefs.arealDensity,
    default: 5,
    min: 0,
  },
  {
    kind: 'boolean',
    key: 'two_sided',
    group: 'rad',
    label: '放熱面の数',
    description: '展開型のパネルは両面から、機体に貼り付けたものは片面から放熱する。両面なら面積が半分で済む',
    default: true,
    labels: ['片面', '両面'],
  },
  fraction('eta_fin', 'フィン効率', 0.9, {
    group: 'rad',
    symbol: '\\eta_{fin}',
    description: 'パネルの温度むらによる放熱の低下。100% はパネル全体が同じ温度（参考値）',
  }),
]

// ---------------------------------------------------------------------------
// 構成の例（仕様書 §3.10）

const defaultsOf = (params: readonly ParamDef[]): Inputs =>
  Object.fromEntries(params.map((p) => [p.key, p.kind === 'table' ? [] : p.default]))

/** 構成の例。選ぶと、仕様書のテストケースの条件がまとめて入る */
function scenarioPreset(id: string): Inputs {
  if (id !== 't12') return {}
  return {
    ...defaultsOf(baseInputs),
    location: 'lunar',
    ...locationPreset('lunar'),
    sun_source: 'pv',
    reactor: 'fixed',
    Q_r: 40 * KW,
    reactor_class: 'kilopower',
    ...reactorPreset('kilopower'),
    shield_include: true,
    beam: 'none',
    night_buffer: 'battery',
    P_peak: 20 * KW,
    P_idle: 20 * KW,
    Q_pl_same: false,
    Q_pl_peak: 0,
    Q_pl_idle: 0,
    payload_design: 'peak',
  }
}

const scenario: EnumParam = {
  kind: 'enum',
  key: 'scenario',
  group: 'scenario',
  label: '構成の例',
  description: '選ぶと、比較の起点になる構成の条件がまとめて入る。値を変えると「自由に設定」の表示になる',
  options: [
    { value: CUSTOM, label: '（自由に設定）' },
    { value: 't12', label: '月面：太陽電池＋原子炉（Kilopower 級、40 kWt）＋蓄電池 ※参考値' },
  ],
  default: CUSTOM,
  presets: (v) => scenarioPreset(v),
  customValue: CUSTOM,
}

// ---------------------------------------------------------------------------
// 出力（§5）

const RADIATORS: { id: RadiatorId; label: string; visible?: (i: Inputs) => boolean }[] = [
  { id: 'r', label: '原子炉用', visible: withReactor },
  { id: 's', label: '太陽熱用', visible: isSolarThermal },
  { id: 'tes', label: '蓄熱体用', visible: isTes },
  { id: 'pl', label: 'ミッション機器用' },
]

const MASS_ITEMS: { key: string; label: string; visible?: (i: Inputs) => boolean }[] = [
  { key: 'M_pv', label: '太陽電池', visible: isPv },
  { key: 'M_conc', label: '集光鏡（発電用）', visible: isSolarThermal },
  { key: 'M_reactor', label: '原子炉', visible: withReactor },
  { key: 'M_shield', label: '遮蔽', visible: withReactor },
  { key: 'M_conv_r', label: '変換系（原子炉用）', visible: withReactor },
  { key: 'M_conv_s', label: '変換系（太陽熱用）', visible: isSolarThermal },
  { key: 'M_conv_tes', label: '変換系（蓄熱体用）', visible: isTes },
  { key: 'M_heat', label: '電気ヒータ', visible: isHeater },
  { key: 'M_hx', label: '熱交換器・断熱・容器', visible: isTes },
  { key: 'M_sf', label: '集光鏡（太陽炉）', visible: isFurnace },
  { key: 'M_bat', label: '蓄電池' },
  { key: 'M_buf', label: '排熱バッファ', visible: isAverage },
  { key: 'M_rad', label: 'ラジエータ' },
  { key: 'M_tes', label: '蓄熱材', visible: isTes },
]

const mass = unitDefs.mass
const ratio = unitDefs.fraction

const outputs: OutputDef[] = [
  { key: 'M_total', kind: 'number', label: 'システム総質量', symbol: 'M_{total}', unit: mass, primary: true },
  { key: 'M_launch', kind: 'number', label: '地球から運ぶ質量', symbol: 'M_{launch}', unit: mass, primary: true },
  {
    key: 'P_gen',
    kind: 'number',
    label: '日照中の電源の必要発電量',
    symbol: 'P_{gen}',
    unit: power,
    primary: true,
    visibleWhen: hasSun,
  },
  { key: 'A_rad', kind: 'number', label: 'ラジエータ総面積', symbol: 'A_{rad}', unit: unitDefs.area, primary: true, description: 'パネルの片面の面積の合計' },

  // 負荷
  { key: 'P_avg', kind: 'number', group: 'load', label: '平均負荷', symbol: 'P_{avg}', unit: power },
  {
    key: 'P_base',
    kind: 'number',
    group: 'load',
    label: '負荷を平らにした電力',
    symbol: 'P_{base}',
    unit: power,
    description: '電源がこの一定の電力を出せば、ピークの不足は蓄電池から出し、待機中の余りで充電してまかなえる',
  },
  { key: 'Q_pl', kind: 'number', group: 'load', label: 'ミッション機器用ラジエータの設計排熱', symbol: 'Q_{pl}', unit: power },
  {
    key: 'E_ecl',
    kind: 'number',
    group: 'load',
    label: '日陰の間に負荷が使う電力量',
    symbol: 'E_{ecl}',
    unit: kWh,
    description: '日陰が負荷のピークの始まりと重なる、最悪の場合',
    visibleWhen: hasEclipse,
  },

  // 電源
  { key: 'P_r', kind: 'number', group: 'source', label: '原子炉の発電量', symbol: 'P_r', unit: power, visibleWhen: withReactor },
  { key: 'eta_r', kind: 'number', group: 'source', label: '原子炉用の熱機関の効率', symbol: '\\eta_r', unit: ratio, visibleWhen: withReactor },
  { key: 'carnot_r', kind: 'number', group: 'source', label: '同・カルノー効率（理論上の上限）', symbol: '1-T_{cold,r}/T_{hot,r}', unit: ratio, visibleWhen: withReactor },
  { key: 'A_pv', kind: 'number', group: 'source', label: '太陽電池の面積', symbol: 'A_{pv}', unit: unitDefs.area, visibleWhen: isPv },
  { key: 'Q_s', kind: 'number', group: 'source', label: '太陽熱用の熱機関の熱入力', symbol: 'Q_s', unit: thermal, visibleWhen: isSolarThermal },
  { key: 'eta_s', kind: 'number', group: 'source', label: '太陽熱用の熱機関の効率', symbol: '\\eta_s', unit: ratio, visibleWhen: isSolarThermal },
  { key: 'carnot_s', kind: 'number', group: 'source', label: '同・カルノー効率（理論上の上限）', symbol: '1-T_{cold,s}/T_{hot,s}', unit: ratio, visibleWhen: isSolarThermal },
  { key: 'A_conc', kind: 'number', group: 'source', label: '発電用の集光鏡の面積', symbol: 'A_{conc}', unit: unitDefs.area, visibleWhen: isSolarThermal },
  {
    key: 'P_c_sun',
    kind: 'number',
    group: 'source',
    label: '一定の電源の電力（日照中）',
    symbol: 'P_{c,sun}',
    unit: power,
    description: '原子炉と外部電源の合計。日照中に蓄熱体へ直接送る熱の分は除く',
    visibleWhen: (i) => withReactor(i) || withBeam(i),
  },
  {
    key: 'P_c_ecl',
    kind: 'number',
    group: 'source',
    label: '一定の電源の電力（日陰中）',
    symbol: 'P_{c,ecl}',
    unit: power,
    visibleWhen: (i) => (withReactor(i) || withBeam(i)) && hasEclipse(i),
  },
  {
    key: 'P_chg',
    kind: 'number',
    group: 'source',
    label: '日照中の充電・加熱の電力',
    symbol: 'P_{chg}',
    unit: power,
    description: '日陰に備えて、蓄電池の充電か蓄熱体の電気ヒータに使う電力',
    visibleWhen: hasEclipse,
  },
  {
    key: 'P_surplus',
    kind: 'number',
    group: 'source',
    label: '日照中の余りの電力',
    unit: power,
    description: 'ほかの電源だけで日照中の電力が足り、余る分',
  },

  // 蓄電池
  { key: 'C_bat', kind: 'number', group: 'bat', label: '蓄電池容量', symbol: 'C_{bat}', unit: kWh },
  {
    key: 'E_bn',
    kind: 'number',
    group: 'bat',
    label: '日陰中に蓄電池から出す電力量',
    symbol: 'E_{bn}',
    unit: kWh,
    visibleWhen: (i) => hasEclipse(i) && !isTes(i),
  },
  { key: 'E_shave', kind: 'number', group: 'bat', label: 'ピークを補う電力量', symbol: 'E_{shave}', unit: kWh },
  { key: 'M_bat', kind: 'number', group: 'bat', label: '蓄電池の質量', symbol: 'M_{bat}', unit: mass },
  { key: 'V_bat', kind: 'number', group: 'bat', label: '蓄電池の容積', symbol: 'V_{bat}', unit: unitDefs.volume },

  // 蓄熱体
  { key: 'P_tes', kind: 'number', group: 'tes', label: '蓄熱体用の熱機関の発電量（日陰中）', symbol: 'P_{tes}', unit: power },
  {
    key: 'eta_tes_avg',
    kind: 'number',
    group: 'tes',
    label: '蓄熱体用の熱機関の平均効率',
    symbol: '\\bar\\eta_{tes}',
    unit: ratio,
    description: '蓄熱体の温度が下がっていく間の平均',
  },
  { key: 'eta_tes_min', kind: 'number', group: 'tes', label: '同・最低効率（使い切る直前）', symbol: '\\eta_{tes}(T_{min})', unit: ratio },
  {
    key: 'eta_ret',
    kind: 'number',
    group: 'tes',
    label: '蓄熱の保持率',
    symbol: '\\eta_{ret}',
    unit: ratio,
    description: 'ためた熱のうち、使うまでに失われずに残る割合',
  },
  {
    key: 'eta_rt',
    kind: 'number',
    group: 'tes',
    label: '電気 → 熱 → 電気の往復効率',
    symbol: '\\eta_{rt}',
    unit: ratio,
    description: '蓄電池（約 90%）と比べるための値',
    visibleWhen: isHeater,
  },
  { key: 'E_tes', kind: 'number', group: 'tes', label: '蓄熱量', symbol: 'E_{tes}', unit: GJ },
  { key: 'M_tes', kind: 'number', group: 'tes', label: '蓄熱材の質量', symbol: 'M_{tes}', unit: mass },
  { key: 'V_tes', kind: 'number', group: 'tes', label: '蓄熱材の容積', symbol: 'V_{tes}', unit: unitDefs.volume },
  { key: 'E_dir', kind: 'number', group: 'tes', label: '原子炉から直接送る熱', symbol: 'E_{dir}', unit: GJ, visibleWhen: directStore },
  { key: 'Q_sf', kind: 'number', group: 'tes', label: '太陽炉の熱', symbol: 'Q_{sf}', unit: thermal, visibleWhen: isFurnace },
  { key: 'A_sf', kind: 'number', group: 'tes', label: '太陽炉の集光鏡の面積', symbol: 'A_{sf}', unit: unitDefs.area, visibleWhen: isFurnace },
  { key: 'Q_tes_max', kind: 'number', group: 'tes', label: '取り出す熱の最大値', symbol: 'Q_{tes,max}', unit: thermal },

  // 排熱バッファ
  { key: 'E_buf', kind: 'number', group: 'buf', label: '排熱バッファの蓄熱量', symbol: 'E_{buf}', unit: MJ },
  { key: 'M_buf', kind: 'number', group: 'buf', label: '排熱バッファの質量', symbol: 'M_{buf}', unit: mass },
  { key: 'V_buf', kind: 'number', group: 'buf', label: '排熱バッファの容積', symbol: 'V_{buf}', unit: unitDefs.volume },

  // ラジエータ
  ...RADIATORS.flatMap(({ id, label, visible }): OutputDef[] => [
    {
      key: `A_rad_${id}`,
      kind: 'number',
      group: 'rad',
      label: `${label}の面積`,
      symbol: `A_{rad,${id}}`,
      unit: unitDefs.area,
      visibleWhen: visible,
      noteKey: `A_rad_${id}_by`,
    },
    {
      key: `q_rad_${id}`,
      kind: 'number',
      group: 'rad',
      label: '　1 m² あたりの放熱：放射',
      symbol: `q_{rad}`,
      unit: unitDefs.irradiance,
      visibleWhen: visible,
    },
    {
      key: `q_conv_${id}`,
      kind: 'number',
      group: 'rad',
      label: '　1 m² あたりの放熱：対流',
      symbol: `q_{conv}`,
      unit: unitDefs.irradiance,
      visibleWhen: visible,
    },
  ]),
  { key: 'M_rad', kind: 'number', group: 'rad', label: 'ラジエータの質量', symbol: 'M_{rad}', unit: mass },

  // 質量の内訳
  { key: 'mass_table', kind: 'table', group: 'mass', label: '質量の内訳' },
  {
    key: 'M_local',
    kind: 'number',
    group: 'mass',
    label: '現地で調達する質量',
    symbol: 'M_{local}',
    unit: mass,
    visibleWhen: (i) => isTes(i) && i.tes_origin === 'local',
  },
  // 出力欄に出している質量（蓄電池、蓄熱材、排熱バッファ、ラジエータ）は除く
  ...MASS_ITEMS.filter(({ key }) => !['M_bat', 'M_tes', 'M_buf', 'M_rad'].includes(key)).map(
    ({ key, label, visible }): OutputDef => ({
      key,
      kind: 'number',
      group: 'mass',
      label: `質量：${label}`,
      unit: mass,
      graphOnly: true,
      visibleWhen: visible,
    }),
  ),
]

/** 電源・排熱モジュール（仕様書3(検証版) §3、§5、§6） */
export const powerThermal: SimDefinition = {
  id: 'power-thermal',
  version: 1,
  collapsibleGroups: true,
  groups: [
    { id: 'scenario', label: '構成の例' },
    { id: 'env', label: '環境・配備位置' },
    { id: 'load', label: '負荷' },
    { id: 'buf', label: '排熱バッファ', parent: 'load', visibleWhen: isAverage },
    { id: 'config', label: '電源の構成' },
    { id: 'pv', label: '太陽電池', visibleWhen: isPv },
    { id: 'solar', label: '太陽熱（集光鏡）', visibleWhen: (i) => isSolarThermal(i) || isFurnace(i) },
    { id: 'eng_s', label: '熱機関（太陽熱用）', parent: 'solar', visibleWhen: isSolarThermal },
    { id: 'reactor', label: '原子炉', visibleWhen: withReactor },
    { id: 'eng_r', label: '熱機関（原子炉用）', parent: 'reactor' },
    { id: 'beam', label: '外部電源', visibleWhen: withBeam },
    { id: 'bat', label: '蓄電池' },
    { id: 'tes', label: '越夜用の蓄熱体', visibleWhen: isTes },
    { id: 'tes_medium', label: '蓄熱材', parent: 'tes' },
    { id: 'tes_charge', label: '熱の入れ方', parent: 'tes' },
    { id: 'tes_loss', label: '熱損失・容器', parent: 'tes' },
    { id: 'eng_tes', label: '熱機関（蓄熱体用）', parent: 'tes' },
    { id: 'rad', label: 'ラジエータ' },
  ],
  outputGroups: [
    { id: 'load', label: '負荷' },
    { id: 'source', label: '電源' },
    { id: 'bat', label: '蓄電池' },
    { id: 'tes', label: '蓄熱体', visibleWhen: isTes },
    { id: 'buf', label: '排熱バッファ', visibleWhen: isAverage },
    { id: 'rad', label: 'ラジエータ' },
    { id: 'mass', label: '質量の内訳' },
  ],
  inputs: [scenario, ...baseInputs],
  outputs,
  defaultGraph: { x: 'e_bat', y: 'M_total' },
  messages: {
    'ecl-range': '日陰の時間は、日照の周期より短くしてください',
    'idle-above-peak': '待機電力はピーク電力以下にしてください',
    'no-source': '電源を1つ以上選んでください',
    'auto-needs-no-sun': '熱出力の自動決定は、日照中の電源が「なし」のときだけ使えます。熱出力を指定してください',
    'no-sun': '日照がないため、太陽光では発電・加熱できません',
    'cold-above-hot': '低温側の温度は、高温側の温度より低くしてください',
    'tmax-below-tmin': '最高温度は、最低温度より高くしてください',
    'tmin-below-cold': '蓄熱体の最低温度は、蓄熱体用の熱機関の低温側の温度より高くしてください',
    'tmax-above-reactor': '原子炉の熱で直接ためる場合、最高温度は原子炉の出口温度から熱交換の温度差を引いた値以下にしてください',
    'melt-range': '融解の温度は、最低温度と最高温度の間にしてください',
    insufficient: '日照中の電力が足りません。日照中の電源を選ぶか、原子炉の熱出力や外部電源の電力を増やしてください',
    'cannot-reject': 'この温度では、環境へ熱を捨てられません（ヒートポンプなどの能動冷却が必要です）',
    'reverse-flux': '放射（または対流）では、ラジエータが逆に熱を受け取っています',
    'weak-sun': '日射が非常に弱いため、太陽電池が非常に大きくなります',
    'water-phase': '1気圧では水が液体でいられない温度です（凍結するか沸騰します）。加圧や別の蓄熱材を検討してください',
    'above-tlim': '蓄熱材の使用上限温度を超えています（焼結・融解・分解などが起こります）',
    surplus: '日照中は、ほかの電源だけで電力が余ります（「日照中の余りの電力」を参照）',
    'direct-surplus': '原子炉から直接送る熱が、必要な蓄熱量より多くなっています（余りは捨てる計算です）。送る割合を下げられます',
    'tes-unneeded': '日陰中に蓄熱体から発電する必要はありません',
    'hx-unset': '熱交換器・断熱・容器の質量は含まれていません（比質量が未設定です）',
    'below-co2-critical': '低温側の温度が二酸化炭素の臨界温度（304.13 K）より低く、超臨界の状態で圧縮できません',
    'alpha-s-unset': 'このクラスの遮蔽の比質量は未設定です。遮蔽の厚さと質量は、原子炉・遮蔽モジュールで計算できます',
    'alpha-r-unset': 'このクラスの原子炉の比質量は未設定です。値を入力しない場合、原子炉の質量は0として計算します',
    'dod-cycles': '充放電の回数が多い場合、電池の寿命のため放電深度を下げるのが普通です',
  },
  compute(inputs: Inputs): ComputeResult {
    const r = computePower(toPowerInputs(inputs))
    const outputs: Record<string, OutputValue> = {}
    const num = (k: string, v: number) => (outputs[k] = { kind: 'number', value: v })
    const o = r.outputs
    if (o) {
      for (const [k, v] of Object.entries(o)) if (typeof v === 'number') num(k, v)
      for (const m of o.masses) num(m.key, m.mass)
      for (const { id } of RADIATORS) {
        const rad = o.radiators[id]
        num(`A_rad_${id}`, rad?.A ?? 0)
        num(`q_rad_${id}`, rad?.q_rad ?? 0)
        num(`q_conv_${id}`, rad?.q_conv ?? 0)
        outputs[`A_rad_${id}_by`] = {
          kind: 'text',
          value: !rad ? '捨てる熱なし' : rad.by === 'sun' ? '日照中で決まる' : '日陰中で決まる',
        }
      }
      const rows: (string | number)[][] = o.masses.filter((m) => m.mass > 0).map((m) => [m.label, m.mass, m.origin === 'local' ? '現地' : '地球から'])
      rows.push(['地球から運ぶ質量', o.M_launch, ''])
      if (o.M_local > 0) rows.push(['現地で調達する質量', o.M_local, ''])
      outputs.mass_table = { kind: 'table', columns: ['要素', '質量 [kg]', '調達'], rows }
    }
    return { outputs, warnings: r.warnings, errors: r.errors }
  },
}

function engineOf(i: Inputs, suffix: string): Engine {
  return {
    converter: String(i[`converter_${suffix}`]),
    T_cold: Number(i[`T_cold_${suffix}`]),
    eta_mech: Number(i[`eta_mech_${suffix}`]),
    alpha_conv: Number(i[`alpha_conv_${suffix}`]),
  }
}

export function toPowerInputs(i: Inputs): PowerInputs {
  const num = (k: string) => Number(i[k])
  return {
    I_sun: num('I_sun'),
    T_cyc: num('T_cyc'),
    t_ecl: num('t_ecl'),
    T_sink: num('T_sink'),
    T_sink_ecl: num('T_sink_ecl'),
    T_env: num('T_env'),
    h_c: num('h_c'),
    P_peak: num('P_peak'),
    t_peak: num('t_peak'),
    P_idle: num('P_idle'),
    t_idle: num('t_idle'),
    Q_pl_same: Boolean(i.Q_pl_same),
    Q_pl_peak: num('Q_pl_peak'),
    Q_pl_idle: num('Q_pl_idle'),
    T_payload: num('T_payload'),
    payload_design: String(i.payload_design) as PayloadDesign,
    buf_medium: String(i.buf_medium),
    c_buf: num('c_buf'),
    dT_buf: num('dT_buf'),
    L_buf: num('L_buf'),
    rho_buf: num('rho_buf'),
    e_bat: num('e_bat'),
    v_bat: num('v_bat'),
    eta_bat: num('eta_bat'),
    DoD: num('DoD'),
    sun_source: String(i.sun_source) as SunSource,
    reactor: String(i.reactor) as ReactorMode,
    beam: String(i.beam) as BeamMode,
    night_buffer: String(i.night_buffer) as NightBuffer,
    eta_pv: num('eta_pv'),
    f_deg: num('f_deg'),
    rho_pv: num('rho_pv'),
    reactor_class: String(i.reactor_class),
    Q_r: num('Q_r'),
    T_hot_r: num('T_hot_r'),
    alpha_r: num('alpha_r'),
    shield_include: Boolean(i.shield_include),
    alpha_s: num('alpha_s'),
    f_store: num('f_store'),
    eta_conc: num('eta_conc'),
    rho_conc: num('rho_conc'),
    T_hot_s: num('T_hot_s'),
    P_beam: num('P_beam'),
    eng_r: engineOf(i, 'r'),
    eng_s: engineOf(i, 's'),
    eng_tes: engineOf(i, 'tes'),
    c_tes: num('c_tes'),
    rho_tes: num('rho_tes'),
    L_tes: num('L_tes'),
    T_melt: num('T_melt'),
    T_max: num('T_max'),
    T_min: num('T_min'),
    T_lim: num('T_lim'),
    tes_origin: String(i.tes_origin) as TesOrigin,
    tes_charge: String(i.tes_charge) as TesCharge,
    eta_heat: num('eta_heat'),
    alpha_heat: num('alpha_heat'),
    dT_hx: num('dT_hx'),
    lambda_tes: num('lambda_tes'),
    alpha_hx: num('alpha_hx'),
    eps: num('eps'),
    rho_rad: num('rho_rad'),
    n_side: i.two_sided ? 2 : 1,
    eta_fin: num('eta_fin'),
  }
}
