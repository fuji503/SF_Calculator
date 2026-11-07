import { formatNumber } from '../../core/physics/format.ts'
import { fixedUnit, U, unitDefs } from '../../core/physics/units.ts'
import type { ComputeResult, Inputs, OutputDef, OutputValue, ParamDef, SimDefinition, TableParam, TableRow } from '../types.ts'
import { BODIES, CLASSES, DEFAULT_GROUND, GROUNDS, IGNITION, IMPACTORS, KT_TNT, type BodyId, type GroundClass, type ImpactorId } from './data.ts'
import { computeCrater, type CraterInputs, type Source } from './model.ts'

const DEG = Math.PI / 180
const CUSTOM = 'custom'
const isImpact = (i: Inputs) => i.source !== 'nuclear'
const isNuclear = (i: Inputs) => i.source === 'nuclear'
const solving = (i: Inputs) => Boolean(i.solve)
const byDepth = (i: Inputs) => Boolean(i.goal_by_depth)
const isBody = (b: string) => (i: Inputs) => i.body === b
const hasAir = (i: Inputs) => Number(i.rho_a0) > 0 && Number(i.P0) > 0
const isEarth = isBody('earth')
const rowsOf = (i: Inputs, key: string) => (Array.isArray(i[key]) ? (i[key] as TableRow[]) : [])

const length = unitDefs.length
const mass = unitDefs.mass
const energy = unitDefs.tnt

/** 地盤のプリセットで入る値（区分の強さと飛来物の密度も入れる） */
function groundValues(body: BodyId, id: string): Inputs {
  const g = GROUNDS[body][id]
  if (!g) return {}
  const c = CLASSES[g.cls]
  return { ground_class: g.cls, rho_t: g.rho, Y: c.Y, t_reg: g.t_reg, rho_f: c.rho_f }
}

/** 天体ごとの地盤の選択欄（天体を選ぶと、その天体の地盤だけを出す） */
function groundParam(body: BodyId): ParamDef {
  return {
    kind: 'enum',
    key: `ground_${body}`,
    group: 'ground',
    label: '地盤の種類',
    description: '選ぶと、地盤の区分・密度・強さ・表層の厚さに目安の値が入る（どれも参考値）',
    options: [...Object.entries(GROUNDS[body]).map(([value, g]) => ({ value, label: g.label })), { value: CUSTOM, label: 'カスタム' }],
    default: DEFAULT_GROUND[body],
    presets: (v) => groundValues(body, v),
    customValue: CUSTOM,
    customKeys: ['ground_class', 'rho_t', 'Y', 't_reg'],
    visibleWhen: isBody(body),
  }
}

const fragTable: TableParam = {
  kind: 'table',
  key: 'frags',
  group: 'hazard',
  label: '飛来物の大きさ',
  description:
    '大きさごとに、石や岩が飛んでくる範囲と、個数の割合を出す。大きさで範囲が変わるのは大気のある天体（地球、火星）だけで、小さい石ほど空気の抵抗で手前に落ちる。大気のない月では、どの大きさも同じ範囲になる',
  columns: [{ key: 's', label: '直径', kind: 'number', unit: { options: [U.m, U.cm], defaultId: 'm' }, min: 0 }],
  minRows: 1,
  maxRows: 4,
  defaultRows: [{ s: 0.1 }, { s: 1 }],
  newRow: { s: 0.01 },
  rowName: '大きさ',
}

const m0 = BODIES.moon
const g0 = GROUNDS.moon[DEFAULT_GROUND.moon]
const c0 = CLASSES[g0.cls]

const inputs: ParamDef[] = [
  // §3.1 計算の種類と向き
  {
    kind: 'enum',
    key: 'source',
    group: 'kind',
    label: 'エネルギー源',
    description: '「隕石」は、衝突体（小惑星や人工物）を落としてクレータを作る。「核爆発」は、地上か地下で核爆発を起こしてクレータを作る',
    options: [
      { value: 'impact', label: '隕石' },
      { value: 'nuclear', label: '核爆発' },
    ],
    default: 'impact',
  },
  {
    kind: 'boolean',
    key: 'solve',
    group: 'kind',
    label: '計算の向き',
    description: '「目標のクレータから逆算する」では、隕石は衝突体の直径、核爆発は出力（直径が最大になる深さで起爆）を求める',
    default: false,
    labels: ['条件からクレータを出す', '目標のクレータから逆算する'],
  },
  {
    kind: 'boolean',
    key: 'goal_by_depth',
    group: 'kind',
    label: '逆算の目標',
    description: '目標にするクレータの大きさ。直径（縁から縁まで）か、深さ（縁から底まで）を選ぶ',
    default: false,
    labels: ['直径から', '深さから'],
    visibleWhen: solving,
  },
  {
    kind: 'number',
    key: 'D_goal',
    group: 'kind',
    label: '目標のクレータの直径（縁から縁まで）',
    symbol: 'D_{goal}',
    unit: length,
    default: 100,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => solving(i) && !byDepth(i),
  },
  {
    kind: 'number',
    key: 'd_goal',
    group: 'kind',
    label: '目標のクレータの深さ（縁から底まで）',
    symbol: 'd_{goal}',
    unit: length,
    default: 20,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => solving(i) && byDepth(i),
  },

  // §3.2 天体
  {
    kind: 'enum',
    key: 'body',
    group: 'body',
    label: '天体',
    description: '選ぶと、重力・大きさ・大気の値と、その天体の地盤、衝突の速さ（脱出速度を丸めた値）が入る',
    options: [...(Object.keys(BODIES) as BodyId[]).map((value) => ({ value, label: BODIES[value].label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'moon',
    presets: (v): Inputs => {
      const b = BODIES[v as BodyId]
      if (!b) return {}
      const id = DEFAULT_GROUND[v as BodyId]
      return { g: b.g, R_p: b.R_p, rho_a0: b.rho_a0, H: b.H, P0: b.P0, c0: b.c0, D_c: b.D_c, v0: b.v0, [`ground_${v}`]: id, ...groundValues(v as BodyId, id) }
    },
    customValue: CUSTOM,
    customKeys: ['g', 'R_p', 'rho_a0', 'H', 'P0', 'c0', 'D_c'],
  },
  {
    kind: 'number',
    key: 'g',
    group: 'body',
    label: '表面の重力加速度',
    symbol: 'g',
    description: '小さいほど、同じ衝突でクレータが大きくなり、噴出物が遠くまで飛ぶ。地球 9.81、火星 3.71、月 1.62 m/s²',
    unit: unitDefs.acceleration,
    default: m0.g,
    min: 0,
    minExclusive: true,
  },
  { kind: 'number', key: 'R_p', group: 'body', label: '天体の半径', symbol: 'R_p', unit: unitDefs.lengthKm, default: m0.R_p, min: 0, minExclusive: true },
  {
    kind: 'number',
    key: 'rho_a0',
    group: 'body',
    label: '地表の大気の密度',
    symbol: '\\rho_{a0}',
    description: '0 は大気なし（月）。地球は Collins 2005 に合わせて 1 kg/m³、火星は約 0.020 kg/m³',
    unit: unitDefs.density,
    default: m0.rho_a0,
    min: 0,
  },
  { kind: 'number', key: 'H', group: 'body', label: '大気のスケールハイト', symbol: 'H', unit: unitDefs.lengthKm, default: m0.H, min: 0, minExclusive: true, visibleWhen: hasAir },
  {
    kind: 'number',
    key: 'P0',
    group: 'body',
    label: '地表の気圧',
    symbol: 'P_0',
    description: '爆風の計算に使う。気圧が低いほど、同じ過圧の基準に届く範囲は狭い（火星は地球の約0.6%）',
    unit: unitDefs.pressure,
    default: m0.P0,
    min: 0,
  },
  { kind: 'number', key: 'c0', group: 'body', label: '地表の音速', symbol: 'c_0', unit: unitDefs.velocity, default: m0.c0, min: 0, minExclusive: true, visibleWhen: hasAir },
  {
    kind: 'number',
    key: 'D_c',
    group: 'body',
    label: '単純クレータから複雑クレータに変わる直径',
    symbol: 'D_c',
    description: 'これより大きいクレータは、中央丘や段々の壁ができ、浅く広くなる（この計算は単純クレータの式のまま。警告を出す）。地球 約3.2 km、火星 約7 km、月 約15 km',
    unit: length,
    default: m0.D_c,
    min: 0,
  },

  // §3.3 地盤
  groundParam('moon'),
  groundParam('mars'),
  groundParam('earth'),
  {
    kind: 'enum',
    key: 'ground_class',
    group: 'ground',
    label: '地盤の区分',
    description: 'クレータの大きさの式の定数の組（Holsapple）。砂やレゴリスのようにすき間の多い地盤と、岩や湿った土のようにすき間の少ない地盤で、クレータのでき方が違う',
    options: (Object.keys(CLASSES) as GroundClass[]).map((value) => ({ value, label: CLASSES[value].label })),
    default: g0.cls,
    presets: (v): Inputs => {
      const c = CLASSES[v as GroundClass]
      return c ? { Y: c.Y, rho_f: c.rho_f } : {}
    },
  },
  {
    kind: 'number',
    key: 'rho_t',
    group: 'ground',
    label: '地盤の密度',
    symbol: '\\rho_t',
    unit: unitDefs.density,
    default: g0.rho,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'Y',
    group: 'ground',
    label: '地盤の実効的な強さ',
    symbol: 'Y',
    description:
      'クレータの大きさの式に合わせた値で、岩の強さそのものではない。小さいクレータほど強さが効き、大きいクレータでは重力が効く。区分を選ぶと Holsapple の値が入る',
    unit: unitDefs.pressure,
    default: c0.Y,
    min: 0,
  },
  {
    kind: 'number',
    key: 't_reg',
    group: 'ground',
    label: '表層（レゴリスなど）の厚さ',
    symbol: 't_{reg}',
    description:
      '月の「海」（暗く見える低地。大昔の溶岩が固まった場所）のレゴリスは約4〜5 m、「高地」（明るく見える高い土地）は約10〜15 m。クレータの直径がこの約4倍を超えると、下の岩盤に届いて形が変わる（警告を出す）。0 は層なし',
    unit: length,
    default: g0.t_reg,
    min: 0,
  },

  // §3.4 隕石
  {
    kind: 'enum',
    key: 'impactor',
    group: 'impactor',
    label: '衝突体の材質',
    description: '選ぶと密度が入る。材質は、衝突の圧力と、衝突体が溶けるかどうかの判定にも使う。どれも球として計算する。コンクリートは、水分が熱で膨らむより先に衝撃で粉々になる（溶けるかどうかの判定は資料がないので出さない。解説を参照）',
    options: [...(Object.keys(IMPACTORS) as ImpactorId[]).map((value) => ({ value, label: IMPACTORS[value].label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'stony',
    presets: (v): Inputs => (IMPACTORS[v as ImpactorId] ? { delta: IMPACTORS[v as ImpactorId].delta } : {}),
    customValue: CUSTOM,
    customKeys: ['delta'],
    visibleWhen: isImpact,
  },
  { kind: 'number', key: 'delta', group: 'impactor', label: '衝突体の密度', symbol: '\\delta', unit: unitDefs.density, default: 3000, min: 0, minExclusive: true, visibleWhen: isImpact },
  { kind: 'boolean', key: 'by_mass', group: 'impactor', label: '大きさの入力', default: false, labels: ['直径', '質量'], visibleWhen: (i) => isImpact(i) && !solving(i) },
  {
    kind: 'number',
    key: 'L0',
    group: 'impactor',
    label: '衝突体の直径',
    symbol: 'L_0',
    description: '大きいほどクレータが大きくなる。地球と火星では、小さい石質の隕石は空中で砕けて爆発し、クレータができないことがある',
    unit: length,
    default: 10,
    min: 0,
    minExclusive: true,
    visibleWhen: isImpact,
    role: (i) => (isImpact(i) && (Boolean(i.by_mass) || solving(i)) ? 'output' : 'input'),
  },
  {
    kind: 'number',
    key: 'm_i',
    group: 'impactor',
    label: '衝突体の質量',
    symbol: 'm_i',
    unit: mass,
    default: 1.571e6,
    min: 0,
    minExclusive: true,
    visibleWhen: isImpact,
    role: (i) => (isImpact(i) && !(Boolean(i.by_mass) && !solving(i)) ? 'output' : 'input'),
  },
  {
    kind: 'number',
    key: 'v0',
    group: 'impactor',
    label: '衝突の速さ（大気に入る前）',
    symbol: 'v_0',
    description:
      '速いほどクレータが大きくなる。宇宙から重力だけで落ちてくるものは、少なくとも天体の脱出速度（地球 11.2、火星 5.0、月 2.4 km/s）で当たる。それより遅いのは、地表や低い軌道から打ち出す場合',
    unit: { ...unitDefs.velocity, defaultId: 'km/s' },
    default: m0.v0,
    min: 0,
    minExclusive: true,
    visibleWhen: isImpact,
  },
  {
    kind: 'number',
    key: 'theta',
    group: 'impactor',
    label: '衝突の角度（水平から）',
    symbol: '\\theta',
    description: '90° は真上から。浅いほどクレータは小さくなる。約12°より浅いとクレータが楕円になり、約15°より浅いと衝突体の一部が跳ね返る。最も起こりやすいのは 45°',
    unit: unitDefs.angleDeg,
    default: 45 * DEG,
    min: 0,
    minExclusive: true,
    max: 90 * DEG,
    visibleWhen: isImpact,
  },

  // §3.5 核爆発
  {
    kind: 'number',
    key: 'W',
    group: 'nuclear',
    label: '出力（TNT 換算）',
    symbol: 'W',
    description: '大きいほどクレータが大きくなる（直径は出力の約 0.29 乗に比例）。目安 0.1 kt〜10 Mt',
    unit: unitDefs.tnt,
    default: KT_TNT,
    min: 0,
    minExclusive: true,
    visibleWhen: isNuclear,
    role: (i) => (isNuclear(i) && solving(i) ? 'output' : 'input'),
  },
  {
    kind: 'boolean',
    key: 'dob_optimal',
    group: 'nuclear',
    label: '起爆の深さの決め方',
    description: '「直径が最大になる深さ」では、同じ出力でクレータが最も大きくなる深さで起爆する（運河や港を掘る設計でよく使われた考え方）',
    default: true,
    labels: ['深さを指定', '直径が最大になる深さ'],
    visibleWhen: (i) => isNuclear(i) && !solving(i),
  },
  {
    kind: 'number',
    key: 'z_b',
    group: 'nuclear',
    label: '起爆の深さ（地表から下）',
    symbol: 'z_b',
    description: '0 は地表。浅いほど爆風と熱放射が強く、放射性物質が多く漏れ出す。深すぎると地下に閉じ込められ、地表にクレータはできない',
    unit: length,
    default: 0,
    min: 0,
    visibleWhen: isNuclear,
    role: (i) => (isNuclear(i) && (Boolean(i.dob_optimal) || solving(i)) ? 'output' : 'input'),
  },

  // §3.6 危険な範囲の基準
  {
    kind: 'number',
    key: 't_bury',
    group: 'hazard',
    label: '「埋まる」とする噴出物の厚さ',
    symbol: 't_{bury}',
    description: 'この厚さ以上の土砂が積もる範囲を「埋まる範囲」として出す。小さくするほど範囲は広い',
    unit: unitDefs.thickness,
    default: 0.1,
    min: 0,
    minExclusive: true,
  },
  fragTable,
  {
    kind: 'number',
    key: 'rho_f',
    group: 'hazard',
    label: '飛来物の密度',
    symbol: '\\rho_f',
    description: '大気の抵抗の計算に使う。重いほど遠くまで飛ぶ',
    unit: unitDefs.density,
    default: c0.rho_f,
    min: 0,
    minExclusive: true,
    visibleWhen: hasAir,
  },
  {
    kind: 'number',
    key: 'q',
    group: 'hazard',
    label: '飛来物の範囲に含めない噴出物の割合',
    symbol: 'q',
    description:
      '噴出物の質量のうち、これより速く遠くに飛ぶ分は「まれな飛来物」とみなして、飛来物の範囲に含めない。小さくするほど範囲は広い（いちばん遠くまで飛ぶものは別に出す）',
    unit: unitDefs.fraction,
    default: 1e-3,
    min: 0,
    minExclusive: true,
    max: 1,
    maxExclusive: true,
  },
  {
    kind: 'number',
    key: 'p1',
    group: 'hazard',
    label: '爆風の過圧の基準 1',
    symbol: 'p_1',
    description: '初期値 6.9 kPa は窓ガラスが割れる目安（Collins 2005 の表）',
    unit: { ...unitDefs.pressure, defaultId: 'kPa' },
    default: 6900,
    min: 0,
    minExclusive: true,
    visibleWhen: hasAir,
  },
  {
    kind: 'number',
    key: 'p2',
    group: 'hazard',
    label: '爆風の過圧の基準 2',
    symbol: 'p_2',
    description: '初期値 22.9 kPa は、木造の建物の内壁が倒れ、屋根が大きく壊れる目安（Collins 2005 の表）',
    unit: { ...unitDefs.pressure, defaultId: 'kPa' },
    default: 22_900,
    min: 0,
    minExclusive: true,
    visibleWhen: hasAir,
  },
  {
    kind: 'enum',
    key: 'ignition',
    group: 'hazard',
    label: '熱放射の基準',
    description: '地球だけで計算する。エネルギーが大きいほど熱がゆっくり届くので、同じ被害に必要な熱は多くなる（Collins 2005）',
    options: Object.entries(IGNITION).map(([value, x]) => ({ value, label: x.label })),
    default: 'burn3',
    visibleWhen: isEarth,
  },
]

// ---------------------------------------------------------------------------
// 出力（§5）

const fragOutputs = [0, 1, 2, 3].map(
  (r): OutputDef => ({
    key: `r_frag_${r}`,
    kind: 'number',
    label: `飛来物の範囲（${r + 1}行目の大きさ）`,
    unit: length,
    graphOnly: true,
    visibleWhen: (i) => r < rowsOf(i, 'frags').length,
  }),
)

const outputs: OutputDef[] = [
  { key: 'D_rim', kind: 'number', label: 'クレータの直径（縁から縁まで）', symbol: 'D_{rim}', unit: length, primary: true },
  { key: 'd_rim', kind: 'number', label: 'クレータの深さ（縁から底まで）', symbol: 'd_{rim}', unit: length, primary: true },
  { key: 'h_rim', kind: 'number', label: '縁の高さ（元の地表から）', symbol: 'h_{rim}', unit: length, primary: true },
  {
    key: 'r_bury',
    kind: 'number',
    label: '埋まる範囲（中心からの半径）',
    symbol: 'r_{bury}',
    description: '噴出物が「埋まる」とする厚さ以上積もる範囲。土砂のふくらみを含めないので、下限に近い値',
    unit: length,
    primary: true,
  },
  {
    key: 'hazard_table',
    kind: 'table',
    label: '飛来物の範囲（中心からの半径）と個数の割合（参考値）',
    description:
      '大きい岩も小さい石と同じ速さで飛び出しうるとして、範囲を広めに（安全側に）見積もる。個数の割合は、いちばん大きい行を1個としたときの、各大きさ以上の個数（月の岩の観測からの外挿。括弧は幅）',
  },
  ...fragOutputs,

  // 衝突・爆発
  { key: 'E', kind: 'number', group: 'event', label: 'エネルギー（地表での衝突、または核の出力）', symbol: 'E', unit: energy },
  { key: 'v_esc', kind: 'number', group: 'event', label: '天体の脱出速度', symbol: 'v_{esc}', unit: unitDefs.velocity },
  { key: 'regime', kind: 'text', group: 'event', label: 'クレータの大きさを決める要因', visibleWhen: isImpact },
  { key: 'z_star', kind: 'number', group: 'event', label: '大気中で壊れ始める高さ', symbol: 'z_*', unit: unitDefs.lengthKm, visibleWhen: (i) => isImpact(i) && hasAir(i) },
  { key: 'z_burst', kind: 'number', group: 'event', label: '空中爆発の高さ（負は地表に届く）', symbol: 'z_b', unit: unitDefs.lengthKm, visibleWhen: (i) => isImpact(i) && hasAir(i) },
  { key: 'v_i', kind: 'number', group: 'event', label: '地表での速さ', symbol: 'v_i', unit: unitDefs.velocity, visibleWhen: (i) => isImpact(i) && hasAir(i) },
  { key: 'L_ground', kind: 'number', group: 'event', label: '地表での破片の群れの直径', unit: length, visibleWhen: (i) => isImpact(i) && hasAir(i) },
  { key: 'P_peak', kind: 'number', group: 'event', label: '衝突の最大の圧力', symbol: 'P_{peak}', unit: { ...unitDefs.pressure, defaultId: 'GPa' }, visibleWhen: isImpact },
  { key: 'impactor_state', kind: 'text', group: 'event', label: '衝突体の状態', description: '破片の大きさと個数、跳ね返った破片の行方は計算しない（解説を参照）', visibleWhen: isImpact },
  { key: 'V_melt', kind: 'number', group: 'event', label: '溶けた岩の体積', symbol: 'V_m', unit: unitDefs.volumeLarge, visibleWhen: isImpact },
  { key: 'lam', kind: 'number', group: 'event', label: '換算深さ', symbol: '\\lambda', unit: fixedUnit('m/kt^(1/3.4)'), visibleWhen: isNuclear },
  { key: 'lam_opt', kind: 'number', group: 'event', label: '直径が最大になる換算深さ', symbol: '\\lambda_{opt}', unit: fixedUnit('m/kt^(1/3.4)'), visibleWhen: isNuclear },

  // クレータ
  { key: 'D_tc', kind: 'number', group: 'crater', label: '一時的なクレータの直径（元の地表で）', unit: length, visibleWhen: isImpact },
  { key: 'd_tc', kind: 'number', group: 'crater', label: '一時的なクレータの深さ（元の地表から）', unit: length, visibleWhen: isImpact },
  { key: 'V', kind: 'number', group: 'crater', label: '掘られた体積', symbol: 'V', unit: unitDefs.volumeLarge },
  { key: 'V_ej', kind: 'number', group: 'crater', label: '噴出物の体積', symbol: 'V_{ej}', unit: unitDefs.volumeLarge },
  {
    key: 'thickness',
    kind: 'series',
    group: 'crater',
    label: '噴出物が落ちて積もる厚さ（縁から外側）',
    description: 'クレータから飛び出した土砂が、周りに落ちて積もる厚さ。縁で最も厚く、中心からの距離の3乗に反比例して薄くなる',
    unit: { options: [U.m, U.cm], defaultId: 'm' },
    seriesX: { label: '中心からの距離', unit: length, scale: 'log' },
    seriesY: { scale: 'log' },
  },

  // 噴出物
  { key: 'v_ej_max', kind: 'number', group: 'ejecta', label: '最も速い噴出物の速さ', unit: unitDefs.velocity },
  { key: 'r_ej_max', kind: 'number', group: 'ejecta', label: '最も速い噴出物が届く距離', unit: unitDefs.lengthKm, noteKey: 'r_ej_max_note' },
  { key: 'M_orbit', kind: 'number', group: 'ejecta', label: '周回の速さを超える噴出物の質量', unit: mass, visibleWhen: (i) => !hasAir(i) },
  { key: 'M_escape', kind: 'number', group: 'ejecta', label: '脱出速度を超える噴出物の質量', unit: mass },

  // 地震・爆風・熱放射
  { key: 'M_seis', kind: 'number', group: 'effects', label: '地震のマグニチュード', symbol: 'M', unit: unitDefs.none, noteKey: 'M_seis_note' },
  { key: 'r_mmi_4', kind: 'number', group: 'effects', label: '震度 IV〜V 以上の範囲（改正メルカリ震度）', unit: unitDefs.lengthKm, visibleWhen: isEarth },
  { key: 'r_mmi_5', kind: 'number', group: 'effects', label: '震度 VI〜VII 以上の範囲', unit: unitDefs.lengthKm, visibleWhen: isEarth },
  { key: 'r_mmi_6', kind: 'number', group: 'effects', label: '震度 VII〜VIII 以上の範囲', unit: unitDefs.lengthKm, visibleWhen: isEarth },
  { key: 'r_p1', kind: 'number', group: 'effects', label: '爆風の範囲（基準 1）', unit: unitDefs.lengthKm, visibleWhen: hasAir },
  { key: 'r_p2', kind: 'number', group: 'effects', label: '爆風の範囲（基準 2）', unit: unitDefs.lengthKm, visibleWhen: hasAir },
  { key: 'r_thermal', kind: 'number', group: 'effects', label: '熱放射の範囲（基準）', unit: unitDefs.lengthKm, visibleWhen: isEarth },

  // 放射性物質
  {
    key: 'Fc',
    kind: 'number',
    group: 'radiation',
    label: '地上に漏れ出す放射性物質の割合',
    symbol: 'F_c',
    description: 'Plowshare 計画の実験からの目安（参考値）。風による長期的な広がり（フォールアウト）は計算しない',
    unit: unitDefs.fraction,
    visibleWhen: isNuclear,
  },
  {
    key: 'R_B',
    kind: 'number',
    group: 'radiation',
    label: 'ベースサージの半径（地を這う放射性のちりの雲）',
    symbol: 'R_B',
    unit: unitDefs.lengthKm,
    visibleWhen: (i) => isNuclear(i) && isEarth(i),
  },
]

/** クレータ造成モジュール（仕様書1(新規) §3、§5、§6） */
export const crater: SimDefinition = {
  id: 'crater',
  version: 1,
  groups: [
    { id: 'kind', label: '計算の種類' },
    { id: 'body', label: '天体' },
    { id: 'ground', label: '地盤' },
    { id: 'impactor', label: '隕石', visibleWhen: isImpact },
    { id: 'nuclear', label: '核爆発', visibleWhen: isNuclear },
    { id: 'hazard', label: '危険な範囲の基準' },
  ],
  collapsibleGroups: true,
  outputGroups: [
    { id: 'event', label: '衝突・爆発' },
    { id: 'crater', label: 'クレータと噴出物の量' },
    { id: 'ejecta', label: '速く飛ぶ噴出物' },
    { id: 'effects', label: '地震・爆風・熱放射' },
    { id: 'radiation', label: '放射性物質', visibleWhen: isNuclear },
  ],
  inputs,
  outputs,
  defaultGraph: { x: 'L0', y: 'D_rim' },
  graphPreset: (i) => {
    if (solving(i)) return isImpact(i) ? { x: 'v0', y: 'm_i' } : { x: byDepth(i) ? 'd_goal' : 'D_goal', y: 'W' }
    return isImpact(i) ? { x: 'L0', y: 'D_rim' } : { x: 'W', y: 'D_rim' }
  },
  messages: {
    range: '範囲内の値を入力してください',
    'no-solution': '目標のクレータを作れる条件が見つかりません（空中爆発になるか、範囲を超えています）',
    airburst: '隕石は高さ {z} km で砕けて空中で爆発し、クレータはできません。爆風の範囲だけを計算しています',
    'crater-field': '砕けた破片が広がって落ち、小さなクレータがいくつもできる（クレータ群）可能性があります',
    'below-escape': '宇宙から落とす場合、速さは脱出速度（{v} km/s）より遅くなりません。地表や低い軌道から打ち出す場合の値として計算しています',
    slow: '速さが遅く、計算の元になった実験の範囲を外れています',
    complex: '複雑クレータの大きさです。実際には浅く広いクレータになります（この計算は単純クレータの式のままです）',
    elliptical: '角度が浅いため、クレータは楕円になり、噴出物は前方に偏ります',
    ricochet: '衝突体の一部が跳ね返って、前方へ飛び出すことがあります',
    layered: 'クレータが表層の下の岩盤に届きます。底が平らなクレータや、段のある同心円状のクレータになることがあります（この計算は1種類の地盤のままです）',
    rampart: '噴出物が泥流のように地面を流れて広がるクレータ（ランパート・クレータ）になります。噴出物の範囲の計算は当てはまりません',
    'mars-polar': '南の極冠は、水の氷の上を厚さ数 m のドライアイスが覆っています。ドライアイスは水の氷として計算しています',
    'nuclear-offworld': '月・火星での核爆発のクレータは、地球の実験から重力の違いで外挿した参考値です',
    contained: 'この深さでは爆発が地下に閉じ込められ、地表にクレータはできません（地下に空洞ができ、地表が陥没することがあります）',
    'escape-ejecta': '噴出物の一部（約 {t} t）が天体の重力を振り切って出ていきます',
    'orbit-ejecta': '噴出物の一部が、天体を周回する宇宙機の高さまで届きます',
    fallout: '放射性降下物の、風による長期的な広がりは計算していません',
    'buried-blast': '地下の爆発の爆風と熱放射は、大きく弱まるため計算していません',
    'no-melt': '衝突が遅いため、溶けた岩はほとんどできません',
    'no-thermal': '大気がない・薄いため、地球と同じ火球はできません。熱放射は計算していません',
    approx: '結果は概算です。特に噴出物の範囲と月・火星の核爆発は、数十%〜2倍程度の不確かさがあります',
  },
  compute(i: Inputs): ComputeResult {
    const r = computeCrater(toCraterInputs(i))
    const outputs: Record<string, OutputValue> = {}
    const o = r.outputs
    if (o) {
      const num = (k: string, v: number | undefined) => {
        if (v !== undefined && Number.isFinite(v)) outputs[k] = { kind: 'number', value: v }
      }
      for (const k of ['E', 'v_esc', 'L0', 'm_i', 'W', 'z_b', 'z_star', 'z_burst', 'v_i', 'L_ground', 'D_rim', 'd_rim', 'h_rim', 'D_tc', 'd_tc', 'V', 'V_ej', 'P_peak', 'V_melt', 'lam', 'lam_opt', 'Fc', 'R_B', 'r_bury', 'v_ej_max', 'M_orbit', 'M_escape', 'M_seis', 'r_p1', 'r_p2', 'r_thermal'] as const) {
        num(k, o[k] as number | undefined)
      }
      if (o.r_ej_max !== undefined) {
        if (Number.isFinite(o.r_ej_max)) num('r_ej_max', o.r_ej_max)
        else outputs.r_ej_max_note = { kind: 'text', value: '天体から出ていく' }
      }
      if (o.regime) outputs.regime = { kind: 'text', value: o.regime === 'gravity' ? '重力（大きいクレータ）' : '地盤の強さ（小さいクレータ）' }
      if (o.impactor_state) outputs.impactor_state = { kind: 'text', value: o.impactor_state }
      outputs.M_seis_note = { kind: 'text', value: o.seis_kind === 'mb' ? '地下核実験の実体波マグニチュード（上限の目安）' : '衝突のエネルギーの 1/10000 が地震になるとした値' }
      o.r_mmi?.forEach((v, j) => num(`r_mmi_${j + 4}`, v))
      o.frags.forEach((f, j) => num(`r_frag_${j}`, f.range))
      const sMax = Math.max(...o.frags.map((f) => f.size))
      outputs.hazard_table = {
        kind: 'table',
        columns: ['大きさ', '範囲 [km]', `個数（${formatNumber(sMax)} m を1個）`],
        rows: o.frags.map((f) => [
          `${formatNumber(f.size)} m`,
          o.crater ? (Number.isFinite(f.range) ? f.range / 1000 : '天体から出ていく') : '—',
          f.size === sMax ? '1（基準）' : `${formatNumber(f.ratio[0])}（${formatNumber(f.ratio[1])}〜${formatNumber(f.ratio[2])}）`,
        ]),
      }
      if (o.thickness) outputs.thickness = { kind: 'series', x: o.thickness.r, y: o.thickness.t }
    }
    return { outputs, warnings: r.warnings, errors: r.errors }
  },
}

function toCraterInputs(i: Inputs): CraterInputs {
  const num = (k: string) => Number(i[k])
  const body = String(i.body)
  return {
    source: String(i.source) as Source,
    solve: Boolean(i.solve),
    goal_by_depth: Boolean(i.goal_by_depth),
    D_goal: num('D_goal'),
    d_goal: num('d_goal'),
    body,
    g: num('g'),
    R_p: num('R_p'),
    rho_a0: num('rho_a0'),
    H: num('H'),
    P0: num('P0'),
    c0: num('c0'),
    D_c: num('D_c'),
    ground: body in GROUNDS ? String(i[`ground_${body}`]) : CUSTOM,
    ground_class: String(i.ground_class) as GroundClass,
    rho_t: num('rho_t'),
    Y: num('Y'),
    t_reg: num('t_reg'),
    impactor: (String(i.impactor) in IMPACTORS ? String(i.impactor) : 'stony') as ImpactorId,
    delta: num('delta'),
    by_mass: Boolean(i.by_mass),
    L0: num('L0'),
    m_i: num('m_i'),
    v0: num('v0'),
    theta: num('theta'),
    W: num('W'),
    dob_optimal: Boolean(i.dob_optimal),
    z_b: num('z_b'),
    t_bury: num('t_bury'),
    frags: rowsOf(i, 'frags').map((r) => Number(r.s)),
    rho_f: num('rho_f'),
    q: num('q'),
    p1: num('p1'),
    p2: num('p2'),
    ignition: String(i.ignition),
  }
}
