import { fixedUnit, U, unitDefs, type UnitDef } from '../../core/physics/units.ts'
import type { ComputeResult, Inputs, OutputDef, OutputValue, ParamDef, SimDefinition } from '../types.ts'
import { ATMOSPHERES, COLONY_PRESETS, LOCATIONS, MATERIALS, SHIELD_DENSITY, type Shape, type ShieldMat, type SphereFloor } from './data.ts'
import { computeColony, G0, type ColonyInputs } from './model.ts'

const CUSTOM = 'custom'
const shapeIs =
  (...s: Shape[]) =>
  (i: Inputs) =>
    s.includes(String(i.shape) as Shape)
const isCyl = shapeIs('cylinder')
const isTorus = shapeIs('torus')
const isSphere = shapeIs('sphere')
const isDumbbell = shapeIs('dumbbell')
const hasDecks = shapeIs('torus', 'dumbbell')
const sphereLevels = (i: Inputs) => isSphere(i) && i.sphere_floor !== 'band'
const byTarget = (i: Inputs) => !i.shield_by
const nonRot = (i: Inputs) => !i.shield_rot && !isDumbbell(i)

const gravity: UnitDef = { options: [{ id: 'm/s2', label: 'm/s²', factor: 1 }, { id: 'G', label: 'G', factor: G0 }], defaultId: 'G' }
const rpm = fixedUnit('rpm')
const length = unitDefs.length
const area: UnitDef = { options: [U.m2, { id: 'ha', label: 'ha', factor: 1e4 }, U.km2] }
const areal: UnitDef = { options: [U.kgm2, { id: 't/m2', label: 't/m²', factor: 1e3 }], defaultId: 't/m2' }
const thin: UnitDef = { options: [U.m, U.cm, { id: 'mm', label: 'mm', factor: 1e-3 }], defaultId: 'mm' }
const pressure: UnitDef = { options: [U.Pa, U.kPa, { id: 'atm', label: 'atm', factor: 101_325 }], defaultId: 'kPa' }
const strength: UnitDef = { options: [U.Pa, U.MPa, U.GPa], defaultId: 'MPa' }
const massT: UnitDef = { ...unitDefs.mass, defaultId: 't' }
const fraction = unitDefs.fraction

const kal = COLONY_PRESETS.kalpana.values
const al = MATERIALS.al7075

const inputs: ParamDef[] = [
  // §9 構成の例、§3.1 形と基準の床
  {
    kind: 'enum',
    key: 'preset',
    group: 'shape',
    label: '構成の例',
    description: '選ぶと、文献の設計例に近い形・大きさ・大気・遮蔽が入る（床の構成などは推定を含むので、どれも参考値）',
    options: [...Object.entries(COLONY_PRESETS).map(([value, c]) => ({ value, label: c.label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'kalpana',
    presets: (v) => COLONY_PRESETS[v]?.values ?? {},
    customValue: CUSTOM,
    customKeys: ['shape', 'A_f', 'g_f', 'R_f'],
  },
  {
    kind: 'enum',
    key: 'shape',
    group: 'shape',
    label: '形',
    description:
      'トーラス：ドーナツ形の管の中の外側に床がある（スタンフォード・トーラス）。シリンダ：円筒の内側の面が床（オニールの島3号、カルパナ・ワン）。球：赤道の帯などが床（バナール球）。ダンベル：2つの居住モジュールをテザーでつないで回す',
    options: [
      { value: 'cylinder', label: 'シリンダ（円筒）' },
      { value: 'torus', label: 'トーラス（ドーナツ形）' },
      { value: 'sphere', label: '球' },
      { value: 'dumbbell', label: 'ダンベル' },
    ],
    default: 'cylinder',
  },
  {
    kind: 'number',
    key: 'A_f',
    group: 'shape',
    label: '基準の床の床面積',
    symbol: 'A_f',
    description:
      'ふだん人が暮らす床の面積。上の階や建物の床は含めない（球の段々の床・同心の床では、すべての段・層の合計）。大きいほど、シリンダは長く、トーラスは床の幅が広くなる',
    unit: area,
    default: Number(kal.A_f),
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'g_f',
    group: 'shape',
    label: '基準の床の重力',
    symbol: 'g_f',
    description: '基準の床で感じる重力。大きいほど、同じ半径で回転を速くする必要がある（月 0.17 G、火星 0.38 G）',
    unit: gravity,
    default: G0,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'R_f',
    group: 'shape',
    label: '基準の床の半径',
    symbol: 'R_f',
    description: '回転の中心軸から基準の床までの距離。大きいほど回転がゆっくりになり快適だが、床が速く動き、壁が厚くなる',
    unit: length,
    default: 250,
    min: 0,
    minExclusive: true,
  },

  // §3.2 形ごとの寸法
  {
    kind: 'number',
    key: 'f_land',
    group: 'dims',
    label: '陸の割合（円周のうち床にする割合）',
    symbol: 'f_{land}',
    description: '残りは窓の帯にできる（島3号は陸と窓が3本ずつで 50%）。小さいほど、同じ床面積でシリンダが長くなる',
    unit: fraction,
    default: 1,
    min: 0,
    max: 1,
    minExclusive: true,
    visibleWhen: isCyl,
  },
  {
    kind: 'number',
    key: 'a',
    group: 'dims',
    label: '管の半径',
    symbol: 'a',
    description: '管の断面の半径。床の幅は床面積から決まり、管の断面の外側の弦になる。大きいほど、床が管の底に近づき、上の階を多く重ねられる',
    unit: length,
    default: 65,
    min: 0,
    minExclusive: true,
    visibleWhen: isTorus,
  },
  {
    kind: 'number',
    key: 'a_m',
    group: 'dims',
    label: 'モジュールの半径',
    symbol: 'a_m',
    description: '居住モジュール（円筒、両端は半球）の断面の半径',
    unit: length,
    default: 10,
    min: 0,
    minExclusive: true,
    visibleWhen: isDumbbell,
  },
  {
    kind: 'number',
    key: 'w_m',
    group: 'dims',
    label: '基準の床の幅',
    symbol: 'w_m',
    description: 'モジュールの床の幅。モジュールの長さは床面積から決まる（狭いほど長くなり、床の端が傾く）',
    unit: length,
    default: 16,
    min: 0,
    minExclusive: true,
    visibleWhen: isDumbbell,
  },
  {
    kind: 'enum',
    key: 'sphere_floor',
    group: 'dims',
    label: '球の床の配置',
    description:
      '赤道の帯：球の内面の赤道付近を床にする（緯度が高いほど重力が弱く、床が傾く）。段々の床：赤道から上へ段を作り、各段を平らな床にする。同心の床：回転軸を中心とする円筒の床を何層も重ねる',
    options: [
      { value: 'band', label: '赤道の帯' },
      { value: 'terrace', label: '段々の床' },
      { value: 'concentric', label: '同心の床' },
    ],
    default: 'band',
    visibleWhen: isSphere,
  },
  {
    kind: 'number',
    key: 'g_min',
    group: 'dims',
    label: '床にする最も小さい重力',
    symbol: 'g_{min}',
    description:
      '基準の床の重力より小さくする。赤道の帯では、帯の端の重力の下限（球の内面は赤道から離れるほど重力が弱い。床面積が小さければ、帯はこれより狭くなる）。段々の床・同心の床では、一番上（内側）の段・層の重力',
    unit: gravity,
    default: 0.7 * G0,
    min: 0,
    minExclusive: true,
    visibleWhen: isSphere,
  },
  {
    kind: 'number',
    key: 'n_lv',
    group: 'dims',
    label: '段・層の数',
    symbol: 'n_{lv}',
    unit: fixedUnit(''),
    default: 5,
    min: 2,
    integer: true,
    visibleWhen: sphereLevels,
  },
  {
    kind: 'number',
    key: 'n_deck',
    group: 'dims',
    label: '上の階の数',
    symbol: 'n_{deck}',
    description: '基準の床の上に重ねる階（デッキ）。上の階ほど中心に近く、重力が弱い',
    unit: fixedUnit(''),
    default: 0,
    min: 0,
    integer: true,
    visibleWhen: hasDecks,
  },
  {
    kind: 'number',
    key: 'h_deck',
    group: 'dims',
    label: '階の高さ',
    symbol: 'h_{deck}',
    unit: length,
    default: 4,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => hasDecks(i) && Number(i.n_deck) > 0,
  },

  // §3.3 大気
  {
    kind: 'enum',
    key: 'atm',
    group: 'atm',
    label: '大気',
    description: '選ぶと、気圧と酸素の割合・分圧が入る。気圧が低いほど壁が薄くなる（酸素の割合を上げて、吸う酸素の量（分圧）を保つ）',
    options: [...Object.entries(ATMOSPHERES).map(([value, a]) => ({ value, label: a.label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'air',
    presets: (v): Inputs => (ATMOSPHERES[v] ? { P_f: ATMOSPHERES[v].P, f_O2: ATMOSPHERES[v].fO2, p_O2: ATMOSPHERES[v].pO2 } : {}),
    customValue: CUSTOM,
  },
  {
    kind: 'number',
    key: 'P_f',
    group: 'atm',
    label: '基準の床の気圧',
    symbol: 'P_f',
    description: '高いほど壁が厚くなる。気圧は中心ほどわずかに低く、床の下ほど高い（高さの表）',
    unit: pressure,
    default: 101_325,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'boolean',
    key: 'o2_by',
    group: 'atm',
    label: '酸素の決め方',
    description:
      '割合：気圧を下げると、吸う酸素の量（分圧）も下がる。分圧：気圧を変えても吸う酸素の量を保ち、割合は計算で決まる（気圧が低いほど割合が上がる）',
    default: false,
    labels: ['割合を入れる', '分圧を入れる'],
  },
  {
    kind: 'number',
    key: 'f_O2',
    group: 'atm',
    label: '酸素の割合（乾いた空気のうち、体積）',
    symbol: 'f_{O2}',
    description: '水蒸気を除いた空気のうちの酸素の割合（地球の空気は 20.95%）。残りは窒素とする。大きいほど燃えやすい',
    unit: fraction,
    default: 0.2095,
    min: 0,
    max: 1,
    role: (i) => (i.o2_by ? 'output' : 'input'),
  },
  {
    kind: 'number',
    key: 'p_O2',
    group: 'atm',
    label: '酸素分圧',
    symbol: 'p_{O2}',
    description: '吸う酸素の量を決める（地球の海面 21.2 kPa、標高 2500 m で約 15.6 kPa）。小さいほど息苦しく、高山病のようになる',
    unit: pressure,
    default: 21_230,
    min: 0,
    minExclusive: true,
    role: (i) => (i.o2_by ? 'input' : 'output'),
  },
  {
    kind: 'number',
    key: 'RH',
    group: 'atm',
    label: '相対湿度',
    symbol: 'RH',
    description:
      '水蒸気は空気より軽いので、空気の平均の分子量が少し小さくなる（構造への影響は小さい）。気圧のうち水蒸気の分だけ、酸素と窒素が減る。露点を出す（窓や冷たい壁の結露の目安）',
    unit: fraction,
    default: 0.5,
    min: 0,
    max: 1,
  },
  {
    kind: 'number',
    key: 'T_in',
    group: 'atm',
    label: '中の気温',
    symbol: 'T_{in}',
    unit: unitDefs.temperature,
    default: 295.15,
    min: 0,
    minExclusive: true,
  },

  // §3.4 構造材
  {
    kind: 'enum',
    key: 'mat_hull',
    group: 'struct',
    label: '外壁の材料',
    description: '選ぶと、強さと密度が入る。強さ ÷ 密度が大きいほど壁が軽く、大きなコロニーを作れる。繊維は、円周方向（と軸方向）に巻くとみなす',
    options: [...Object.entries(MATERIALS).map(([value, m]) => ({ value, label: m.label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'al7075',
    presets: (v): Inputs => (MATERIALS[v] ? { sigma_u: MATERIALS[v].sigma_u, rho: MATERIALS[v].rho } : {}),
    customValue: CUSTOM,
  },
  {
    kind: 'number',
    key: 'sigma_u',
    group: 'struct',
    label: '材料の強さ',
    symbol: '\\sigma_u',
    description: '金属は耐力（0.2% の変形が残る応力）、繊維は引張強さ。大きいほど壁が薄くなる',
    unit: strength,
    default: al.sigma_u,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'rho',
    group: 'struct',
    label: '材料の密度',
    symbol: '\\rho',
    description: '大きいほど、壁が自分の重さで受ける遠心力が増え、作れる半径の上限が小さくなる',
    unit: unitDefs.density,
    default: al.rho,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'SF',
    group: 'struct',
    label: '安全率',
    symbol: 'SF',
    description: '許容応力 = 強さ ÷ 安全率。大きいほど壁が厚くなる。繊維は、長期の荷重での伸び（クリープ）や傷に弱いので、金属より大きくとることが多い',
    unit: fixedUnit(''),
    default: 2,
    min: 1,
  },
  {
    kind: 'number',
    key: 'm_f',
    group: 'struct',
    label: '基準の床に載るものの面密度',
    symbol: 'm_f',
    description: '土・建物・床の構造などを合わせた、床1 m² あたりの質量。大きいほど遠心力の荷重が増え、壁が厚くなる（土 1 m で約 1.5 t/m²）',
    unit: areal,
    default: 1000,
    min: 0,
  },
  {
    kind: 'number',
    key: 'm_deck',
    group: 'struct',
    label: '上の階に載るものの面密度',
    symbol: 'm_{deck}',
    description: '上の階（球では基準の床以外の段・層）の床1 m² あたりの質量',
    unit: areal,
    default: 500,
    min: 0,
    visibleWhen: (i) => (hasDecks(i) && Number(i.n_deck) > 0) || sphereLevels(i),
  },

  // §3.8 放射線遮蔽と配置場所
  {
    kind: 'enum',
    key: 'loc',
    group: 'shield',
    label: '配置場所',
    description:
      '線量の表を選ぶ（Globus & Strout 2017 の OLTARIS の計算値）。自由空間は地球の磁場の外で、銀河宇宙線を厚い遮蔽で防ぐ必要がある。赤道上の低軌道は、地球と磁場に守られて遮蔽がずっと薄くてよい（表はポリエチレン、600 km は水も）',
    options: Object.entries(LOCATIONS).map(([value, l]) => ({ value, label: l.label })),
    default: 'free',
  },
  {
    kind: 'boolean',
    key: 'shield_rot',
    group: 'shield',
    label: '遮蔽',
    description:
      '自転させる：外壁の内側（床の下）に貼る。遠心力の荷重が増えて壁が厚くなる。自転させない：外壁の外に隙間をあけて置く。荷重はかからないが、外側にある分だけ面積が大きく、位置を保つ仕組みが要る（ダンベルは自転させる遮蔽だけ）',
    default: true,
    labels: ['自転させない（外に置く）', '自転させる（中に貼る）'],
  },
  {
    kind: 'enum',
    key: 'shield_mat',
    group: 'shield',
    label: '遮蔽材',
    description: '同じ面密度なら、水素の多いポリエチレンや水のほうが、月のレゴリスより線量を下げる。かさ密度は参考値',
    options: [
      { value: 'regolith', label: '月のレゴリス（1.5 t/m³）' },
      { value: 'water', label: '水（1.0 t/m³）' },
      { value: 'poly', label: 'ポリエチレン（0.95 t/m³）' },
      { value: CUSTOM, label: 'カスタム（面密度を入れる）' },
    ],
    default: 'regolith',
    presets: (v): Inputs => (v in SHIELD_DENSITY ? { rho_sh: SHIELD_DENSITY[v as ShieldMat] } : { shield_by: true }),
  },
  {
    kind: 'boolean',
    key: 'shield_by',
    group: 'shield',
    label: '遮蔽の決め方',
    default: false,
    labels: ['線量の目標から', '面密度を入れる'],
  },
  {
    kind: 'number',
    key: 'D_tgt',
    group: 'shield',
    label: '線量の目標',
    symbol: 'D_{tgt}',
    description: '年間の線量当量。初期値 20 mSv/年 は、一般の人が住む目安（Globus & Strout）。小さいほど遮蔽が厚くなる',
    unit: unitDefs.doseYear,
    default: 0.02,
    min: 0,
    minExclusive: true,
    visibleWhen: byTarget,
  },
  {
    kind: 'number',
    key: 'sigma_sh',
    group: 'shield',
    label: '遮蔽の面密度',
    symbol: '\\sigma_{sh}',
    description: '遮蔽1 m² あたりの質量。大きいほど線量が下がる（表の範囲なら線量を出す）',
    unit: areal,
    default: 10_000,
    min: 0,
    role: (i) => (byTarget(i) ? 'output' : 'input'),
  },
  {
    kind: 'number',
    key: 'rho_sh',
    group: 'shield',
    label: '遮蔽材のかさ密度',
    symbol: '\\rho_{sh}',
    description: '遮蔽の厚さ = 面密度 ÷ かさ密度。小さいほど厚くなる',
    unit: unitDefs.density,
    default: SHIELD_DENSITY.regolith,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'g_sh',
    group: 'shield',
    label: '遮蔽と外壁の隙間',
    symbol: 'g_{sh}',
    unit: length,
    default: 1,
    min: 0,
    visibleWhen: nonRot,
  },

  // §3.9 快適さの基準と高さの表
  {
    kind: 'number',
    key: 'n_max',
    group: 'comfort',
    label: '回転数の上限',
    symbol: 'n_{max}',
    description: '2 rpm は、ほとんどの人が平気な目安（Hall）。慎重な設計は 1 rpm（スタンフォード・トーラス）、慣れれば 4 rpm 程度まで平気とされる（Globus & Hall 2017）',
    unit: rpm,
    default: 2,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'v_rel',
    group: 'comfort',
    label: '中で動く速さ（コリオリの判定用）',
    symbol: 'v_{rel}',
    description: '回転の向きに動くと重く、逆に動くと軽く感じる。速く動くほど差が大きい（走る人 5 m/s、乗り物はもっと速い）',
    unit: unitDefs.velocity,
    default: 5,
    min: 0,
  },
  {
    kind: 'number',
    key: 'k_cor',
    group: 'comfort',
    label: 'コリオリの力の上限（重力に対する比）',
    symbol: 'k_{cor}',
    description: '初期値 25%（Globus & Hall 2017）。小さいほど、床の速さ（接線速度）を大きくする必要がある',
    unit: fraction,
    default: 0.25,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'h_p',
    group: 'comfort',
    label: '人の身長',
    symbol: 'h_p',
    unit: length,
    default: 2,
    min: 0,
  },
  {
    kind: 'number',
    key: 'k_grad',
    group: 'comfort',
    label: '頭と足の重力の差の上限',
    symbol: 'k_{grad}',
    description: '定まった基準はない（参考値）。半径が小さいほど、頭の重力が足より弱くなる',
    unit: fraction,
    default: 0.01,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'h_bld',
    group: 'comfort',
    label: '建物の高さ',
    symbol: 'h_{bld}',
    description: '高さの表に「建物の上」の重力・気圧と、そこから落とした物のずれを出す',
    unit: length,
    default: 100,
    min: 0,
  },
  {
    kind: 'number',
    key: 'r_core',
    group: 'comfort',
    label: '中心付近の設備の半径',
    symbol: 'r_{core}',
    description: '生命維持やタンクなどを置く、中心の軸の近く。高さの表に使う（シリンダ・球）',
    unit: length,
    default: 20,
    min: 0,
    visibleWhen: shapeIs('cylinder', 'sphere'),
  },
]

// ---------------------------------------------------------------------------
// 出力（§5）

const outputs: OutputDef[] = [
  { key: 'n_rpm', kind: 'number', label: '回転数', symbol: 'n', unit: rpm, primary: true, showOnError: true },
  { key: 'omega', kind: 'number', label: '角速度', symbol: '\\omega', unit: fixedUnit('rad/s'), primary: true, showOnError: true },
  { key: 'v', kind: 'number', label: '接線速度（基準の床の速さ）', symbol: 'v', unit: unitDefs.velocity, primary: true, showOnError: true },
  { key: 'M_total', kind: 'number', label: '全体の質量', unit: massT, primary: true },

  // 回転・重力・快適さ
  { key: 'period', kind: 'number', group: 'spin', showOnError: true, label: '周期（1回転の時間）', unit: unitDefs.duration },
  { key: 'dg_dr', kind: 'number', group: 'spin', label: '1 m あたりの重力の変化', symbol: 'dg/dr', unit: fixedUnit('m/s² per m'), description: '中心に1 m 近づくごとに弱くなる重力（= 角速度の2乗）' },
  {
    key: 'height_table',
    kind: 'table',
    group: 'spin',
    label: '高さの表（重力・気圧・接線速度・落とした物のずれ）',
    description:
      '空気も一緒に回るので、気圧は中心ほど低く、床の下ほど高い。落とした物は、まっすぐ飛んでいるだけだが、床が回るので、真下から回転と逆の向きにずれて落ちる。中心の軸に置いた物は落ちない。空気のない位置の気圧は「—」',
  },
  { key: 'g_profile', kind: 'series', group: 'spin', label: '重力の分布', unit: gravity, seriesX: { label: '中心からの距離', unit: length } },
  { key: 'P_profile', kind: 'series', group: 'spin', label: '気圧の分布（空気のある範囲）', unit: pressure, seriesX: { label: '中心からの距離', unit: length } },
  { key: 'comfort_table', kind: 'table', group: 'spin', label: '快適さの判定' },
  { key: 'R_min_rpm', kind: 'number', group: 'spin', label: '回転数の上限で決まる最小の半径', unit: length, description: 'この重力を回転数の上限以下で作るのに要る半径' },
  { key: 'v_min_cor', kind: 'number', group: 'spin', label: 'コリオリの上限で決まる最小の接線速度', unit: unitDefs.velocity },

  // 形と大きさ
  { key: 'L', kind: 'number', group: 'geom', label: '長さ（円筒の部分）', symbol: 'L', unit: length, visibleWhen: isCyl },
  { key: 'R_c', kind: 'number', group: 'geom', label: '管の中心の半径', symbol: 'R_c', unit: length, visibleWhen: isTorus },
  { key: 'w', kind: 'number', group: 'geom', label: '基準の床の幅', symbol: 'w', unit: length, visibleWhen: isTorus },
  { key: 'R_s', kind: 'number', group: 'geom', label: '球の半径（空気の入る内側）', symbol: 'R_s', unit: length, visibleWhen: isSphere },
  { key: 'g_edge', kind: 'number', group: 'geom', label: '帯の端の重力', unit: gravity, visibleWhen: (i) => isSphere(i) && i.sphere_floor === 'band' },
  { key: 'L_m', kind: 'number', group: 'geom', label: 'モジュールの長さ（円筒の部分）', symbol: 'L_m', unit: length, visibleWhen: isDumbbell },
  { key: 'g_end', kind: 'number', group: 'geom', label: '床の端の重力', unit: gravity, visibleWhen: isDumbbell, description: '床は平らなので、端ほど中心から遠く、重力が少し強い' },
  { key: 'tilt', kind: 'number', group: 'geom', label: '床の端の傾き', unit: unitDefs.angleDeg, visibleWhen: isDumbbell },
  { key: 'r_outer', kind: 'number', group: 'geom', label: '外径（一番外の面の半径）', unit: length, description: '回転の中心から、一番外の面（外に置く遮蔽があればその外面）まで' },
  { key: 'A_total', kind: 'number', group: 'geom', label: '床面積の合計', unit: area, description: '上の階・段・層を含む。居住計画（人数の見積もり）に使える' },
  { key: 'floor_table', kind: 'table', group: 'geom', label: '床の一覧', visibleWhen: (i) => sphereLevels(i) || (hasDecks(i) && Number(i.n_deck) > 0) },
  { key: 'V_air', kind: 'number', group: 'geom', label: '与圧された体積', unit: unitDefs.volumeLarge },
  { key: 'M_air', kind: 'number', group: 'geom', label: '空気の質量', unit: massT },
  { key: 'P_axis', kind: 'number', group: 'geom', label: '中心の軸の気圧', unit: pressure, visibleWhen: shapeIs('cylinder', 'sphere') },

  // 大気の組成
  { key: 'x_O2', kind: 'number', group: 'air', label: '酸素の割合（水蒸気を含む全体のうち）', unit: fraction, description: '燃えやすさの目安。NASA の探査用の大気は 34% を上限にしている' },
  { key: 'p_N2', kind: 'number', group: 'air', label: '窒素分圧', unit: pressure },
  { key: 'p_H2O', kind: 'number', group: 'air', label: '水蒸気圧', unit: pressure },
  { key: 'T_dew', kind: 'number', group: 'air', label: '露点', unit: unitDefs.temperature, description: 'これより冷たい窓や壁には結露する' },
  { key: 'M_mol', kind: 'number', group: 'air', label: '空気の平均の分子量', unit: fixedUnit('kg/mol') },
  { key: 'rho_air', kind: 'number', group: 'air', label: '空気の密度（基準の床）', unit: unitDefs.density },

  // 構造
  {
    key: 't_hull',
    kind: 'number',
    group: 'struct',
    label: '外壁の厚さ',
    symbol: 't',
    unit: thin,
    description: '気圧、床に載るものと遮蔽（自転させるとき）の遠心力、壁自身の遠心力を受ける薄い殻の厚さ（スポークなし）。トーラスは管の壁、ダンベルはモジュールの壁',
  },
  { key: 'm_hull', kind: 'number', group: 'struct', label: '外壁の面密度', unit: areal },
  { key: 't_cap', kind: 'number', group: 'struct', label: '端のふた（半球）の厚さ', unit: thin, visibleWhen: isCyl },
  {
    key: 'v_max',
    kind: 'number',
    group: 'struct',
    showOnError: true,
    label: '作れる接線速度の上限',
    unit: unitDefs.velocity,
    visibleWhen: (i) => !isDumbbell(i),
    description: 'この材料の殻が、自分の重さの遠心力だけで許容応力に達する速さ。床の速さがこれに近いほど壁が急に厚くなる',
  },
  { key: 'R_max', kind: 'number', group: 'struct', showOnError: true, label: 'この重力で作れる最大の半径', unit: unitDefs.lengthKm, visibleWhen: (i) => !isDumbbell(i), description: '殻の自分の重さだけで決まる上限。気圧と荷重があると、さらに小さい' },
  { key: 'F_tether', kind: 'number', group: 'struct', label: 'テザーの張力（モジュール1つの遠心力）', unit: { options: [{ id: 'N', label: 'N', factor: 1 }, { id: 'MN', label: 'MN', factor: 1e6 }], defaultId: 'MN' }, visibleWhen: isDumbbell },

  // 遮蔽
  { key: 't_sh', kind: 'number', group: 'shield', label: '遮蔽の厚さ', symbol: 't_{sh}', unit: length },
  { key: 'M_shield', kind: 'number', group: 'shield', label: '遮蔽の質量', unit: massT, description: 'クレータ造成の「掘られた土の質量」と比べられる' },
  { key: 'dose', kind: 'number', group: 'shield', label: '年間の線量（遮蔽の内側）', unit: unitDefs.doseYear, description: '構造材や窓からの漏れは数えない。表がない組み合わせは出さない' },

  // 質量と回転のエネルギー
  { key: 'mass_table', kind: 'table', group: 'mass', label: '質量の内訳' },
  { key: 'M_rot', kind: 'number', group: 'mass', label: '回るものの質量', unit: massT },
  { key: 'M_hull', kind: 'number', group: 'mass', label: '外壁の質量', unit: massT, graphOnly: true },
  { key: 'I', kind: 'number', group: 'mass', label: '回転の慣性モーメント', symbol: 'I', unit: fixedUnit('kg·m²') },
  { key: 'E_rot', kind: 'number', group: 'mass', label: '回転のエネルギー', unit: unitDefs.energy, description: '回し始めるのに要るエネルギー（最低限）' },
  { key: 'L_ang', kind: 'number', group: 'mass', label: '角運動量', unit: fixedUnit('kg·m²/s'), description: '大きいほど、コロニーの向きを変えにくい（ジャイロ効果）' },
]

/** スペースコロニー設計モジュール（仕様書1(新規) §3、§5、§6） */
export const spaceColony: SimDefinition = {
  id: 'space-colony',
  version: 1,
  groups: [
    { id: 'shape', label: '形と基準の床' },
    { id: 'dims', label: '形ごとの寸法' },
    { id: 'atm', label: '大気' },
    { id: 'struct', label: '構造材と床の荷重' },
    { id: 'shield', label: '放射線遮蔽と配置場所' },
    { id: 'comfort', label: '快適さの基準と高さの表' },
  ],
  collapsibleGroups: true,
  outputGroups: [
    { id: 'geom', label: '形と大きさ' },
    { id: 'struct', label: '構造' },
    { id: 'spin', label: '回転・重力・気圧・快適さ' },
    { id: 'air', label: '大気の組成' },
    { id: 'shield', label: '放射線遮蔽' },
    { id: 'mass', label: '質量と回転のエネルギー' },
  ],
  inputs,
  outputs,
  defaultGraph: { x: 'R_f', y: 't_hull' },
  messages: {
    range: '範囲内の値を入力してください',
    'no-table': 'この配置場所と遮蔽材の組み合わせには線量の表がありません。「面密度を入れる」にしてください',
    'shield-unreachable': '線量の表の範囲では、目標の線量に届きません',
    'dumbbell-shield': 'ダンベルでは、自転させない遮蔽は選べません',
    'hull-limit':
      '壁の速さ {v} m/s が、この材料・安全率で作れる上限 {vmax} m/s を超えていて、どれだけ厚くしても壁を作れません（壁が自分の重さの遠心力だけで許容応力に達する）。同じ重力なら、半径が大きいほど回転はゆっくりでも壁は速く動きます。この重力で作れる半径は {R} km までです（気圧と荷重があるとさらに小さい）。半径を小さくするか、強さ ÷ 密度の大きい材料にしてください',
    'tube-shield': '自転させる遮蔽の厚さ {t} m が、管・モジュールの半径以上で、中に空間が残りません。管・モジュールを太くするか、遮蔽を自転させない・薄くしてください',
    'torus-wide':
      '床の幅 {w} m が、管の内側の直径 {d} m 以上です。床は管の断面の弦なので、直径より広くできません（床の幅 = 床面積 ÷ 床の円周。自転させる遮蔽の分だけ内側が狭い）。管の半径を {a} m より大きくするか、床面積を {A} m² より小さくするか、基準の床の半径を大きくしてください',
    'dumbbell-wide': '床の幅 {w} m が、モジュールの内側の直径 {d} m 以上です（自転させる遮蔽の分だけ内側が狭い）。モジュールを太くするか、床の幅を狭くしてください',
    'torus-axis':
      '管の中心の半径 {Rc} m が、管の半径 {a} m 以下で、管が回転の中心軸に届いてしまいます。基準の床の半径を {R} m より大きくするか、管を細くしてください',
    'dumbbell-axis': 'モジュールが回転の中心軸に届いてしまいます。半径を大きくするか、モジュールを細くしてください',
    'sphere-area': '床面積が、床にできる範囲（重力が下限以上の帯）より大きいです。この半径と重力の下限で床にできるのは {A} m² までです。半径を大きくするか、重力の下限を下げてください',
    'sphere-gmin':
      '床にする最も小さい重力は、基準の床の重力より小さくしてください。球の内面は赤道（基準の床）から離れるほど回転軸に近づいて重力が弱くなるので、同じ値では帯の幅（段・層の範囲）が 0 になります',
    'sphere-small':
      'この半径・段・層の数・重力の下限では、床面積（すべての段・層の合計）は {A} m² 以上になります。一番上（内側）の段・層は半径 {r} m の円筒の床で、球の壁まで伸びるので、球が最も小さい（半径 = 基準の床の半径）ときでも長さ {L} m あるためです。床面積を増やすか、基準の床の半径を小さくするか、重力の下限を上げてください（一番上の段・層が外に寄り、短くなる）',
    'deck-out': '上の階が管・モジュールの天井に届いてしまいます。この階の高さでは、上の階は {n} 階までです。階の数か高さを減らすか、管・モジュールを太くしてください',
    tilt: '床の端の傾きが {deg}° あります（5° を超えると歩きにくい。参考値）',
    rpm: '回転数 {n} rpm が上限を超えています（めまいや乗り物酔いを起こしやすい）',
    coriolis: 'コリオリの力が重力の {k}% あり、上限を超えています（速く動くと、重さが大きく変わって感じる）',
    gradient: '頭と足の重力の差が {k}% あり、上限を超えています',
    stability: '回転軸まわりと横の軸まわりの慣性モーメントの比が {k} で、1.2 より小さいです。長すぎる円筒は、回転の軸がずれていきやすい（島3号のように2本を逆に回す組にするか、能動的に制御する）',
    humid: '水蒸気圧が気圧以上になります。湿度か気温を下げてください',
    'o2-high': '酸素が気圧（水蒸気を除く）より多くなります。酸素分圧を下げるか、気圧を上げてください',
    hypoxia: '酸素分圧が {p} kPa で、標高 2500 m の空気（約 15.6 kPa）より低いです。息苦しく、高山病のようになるおそれがあります',
    'o2-fire': '酸素の割合が {f}% あり、燃えやすくなります（NASA の探査用の大気は 34% を上限にしている。燃えにくい材料を選ぶ必要がある）',
    leo500: '赤道上の低軌道 500 km では、遮蔽がなくても 20 mSv/年 を満たします（Globus & Strout）',
  },
  compute(i: Inputs): ComputeResult {
    const r = computeColony(toColonyInputs(i))
    const outputs: Record<string, OutputValue> = {}
    const o = r.outputs
    const num = (k: string, v: number | undefined) => {
      if (v !== undefined && Number.isFinite(v)) outputs[k] = { kind: 'number', value: v }
    }
    // エラーのときも、回転と材料の上限は出す
    if (r.spin) for (const k of ['n_rpm', 'omega', 'v', 'period', 'v_max', 'R_max'] as const) num(k, r.spin[k])
    if (o) {
      for (const k of ['n_rpm', 'omega', 'v', 'M_total', 'period', 'dg_dr', 'R_min_rpm', 'v_min_cor', 'L', 'R_c', 'w', 'R_s', 'g_edge', 'L_m', 'g_end', 'tilt', 'A_total', 'V_air', 'M_air', 'P_axis', 't_hull', 'm_hull', 't_cap', 'v_max', 'R_max', 'F_tether', 't_sh', 'M_rot', 'I', 'E_rot', 'L_ang', 'dose', 'p_O2', 'f_O2', 'x_O2', 'p_N2', 'p_H2O', 'T_dew', 'M_mol', 'rho_air'] as const) {
        num(k, o[k])
      }
      num('sigma_sh', o.sigma_sh)
      num('M_shield', o.M_shield)
      num('r_outer', Math.max(...o.g_profile.r))
      num('M_hull', o.masses.filter((m) => m.label.includes('壁')).reduce((s, m) => s + m.mass, 0))
      const kPa = (P: number | undefined) => (P === undefined ? '—' : P / 1000)
      outputs.height_table = {
        kind: 'table',
        columns: ['位置', '中心からの距離 [m]', '重力 [G]', '気圧 [kPa]', '接線速度 [m/s]', '落とした物のずれ [m]'],
        rows: o.heights.map((h) => [h.label, h.r, h.g / G0, kPa(h.P), h.v, h.drift === undefined ? '—' : Number.isFinite(h.drift) ? h.drift : '落ちない']),
      }
      const ok = (b: boolean) => (b ? 'OK' : '超える')
      const rows: (string | number)[][] = [
        ['回転数 [rpm]', o.n_rpm, Number(i.n_max), ok(o.n_rpm <= Number(i.n_max))],
        ['コリオリの力（重力に対する比）[%]', o.coriolis * 100, Number(i.k_cor) * 100, ok(o.coriolis <= Number(i.k_cor))],
        ['頭と足の重力の差 [%]', o.grad * 100, Number(i.k_grad) * 100, ok(o.grad <= Number(i.k_grad))],
      ]
      if (o.I_ratio !== undefined) rows.push(['回転の安定（慣性モーメントの比）', o.I_ratio, 1.2, o.I_ratio >= 1.2 ? 'OK' : '小さい'])
      outputs.comfort_table = { kind: 'table', columns: ['判定', '値', '基準', '結果'], rows }
      outputs.floor_table = {
        kind: 'table',
        columns: ['床', '中心からの距離 [m]', '重力 [G]', '面積 [m²]'],
        rows: o.floors.map((f) => [f.label, f.r, (o.dg_dr * f.r) / G0, f.area]),
      }
      outputs.mass_table = {
        kind: 'table',
        columns: ['部分', '質量 [t]', '回転'],
        rows: [...o.masses.map((m) => [m.label, m.mass / 1000, m.rotating ? '回る' : '止まっている']), ['合計', o.M_total / 1000, '']],
      }
      outputs.g_profile = { kind: 'series', x: o.g_profile.r, y: o.g_profile.y }
      outputs.P_profile = { kind: 'series', x: o.P_profile.r, y: o.P_profile.y }
    }
    return { outputs, warnings: r.warnings, errors: r.errors }
  },
}

function toColonyInputs(i: Inputs): ColonyInputs {
  const num = (k: string) => Number(i[k])
  const mat = String(i.shield_mat)
  return {
    shape: String(i.shape) as Shape,
    A_f: num('A_f'),
    g_f: num('g_f'),
    R_f: num('R_f'),
    f_land: num('f_land'),
    a: num('a'),
    a_m: num('a_m'),
    w_m: num('w_m'),
    sphere_floor: String(i.sphere_floor) as SphereFloor,
    g_min: num('g_min'),
    n_lv: num('n_lv'),
    n_deck: num('n_deck'),
    h_deck: num('h_deck'),
    P_f: num('P_f'),
    f_O2: num('f_O2'),
    o2_by_pressure: Boolean(i.o2_by),
    p_O2: num('p_O2'),
    RH: num('RH'),
    T_in: num('T_in'),
    sigma_u: num('sigma_u'),
    rho: num('rho'),
    SF: num('SF'),
    m_f: num('m_f'),
    m_deck: num('m_deck'),
    loc: String(i.loc),
    shield_rot: Boolean(i.shield_rot),
    shield_mat: (mat in SHIELD_DENSITY ? mat : CUSTOM) as ShieldMat | 'custom',
    shield_by_areal: Boolean(i.shield_by),
    D_tgt: num('D_tgt'),
    sigma_sh: num('sigma_sh'),
    rho_sh: num('rho_sh'),
    g_sh: num('g_sh'),
    n_max: num('n_max'),
    v_rel: num('v_rel'),
    k_cor: num('k_cor'),
    h_p: num('h_p'),
    k_grad: num('k_grad'),
    h_bld: num('h_bld'),
    r_core: num('r_core'),
  }
}
