import { fixedUnit, U, unitDefs, type UnitDef } from '../../core/physics/units.ts'
import type { ComputeResult, Inputs, OutputDef, OutputValue, ParamDef, SimDefinition } from '../types.ts'
import { ATMOSPHERES, COLONY_PRESETS, LOCATIONS, MATERIALS, SHIELD_DENSITY, TENSION_MATERIALS, type Shape, type ShieldMat, type SphereFloor } from './data.ts'
import { computeColony, G0, type Cap, type ColonyInputs, type HullMode, type Taper } from './model.ts'

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
const spokeShare = (i: Inputs) => !isDumbbell(i) && Number(i.f_s) > 0
const rowSpokes = (i: Inputs) => shapeIs('cylinder', 'sphere')(i) && spokeShare(i)
const tubeTies = (i: Inputs) => hasDecks(i) && Number(i.f_t) > 0
const capSupported = (i: Inputs) => isCyl(i) && i.cap !== 'hemi'
/** スポーク・テザー（放射状の部材）があるか */
const radial = (i: Inputs) => spokeShare(i) || isDumbbell(i)
/** スポークの材料を使う部材があるか */
const anyMember = (i: Inputs) => radial(i) || tubeTies(i) || capSupported(i)
/** 外壁を円形に保つ構造（§4.5）：円周・軸の方向の受け方 */
const hoopIs =
  (...m: HullMode[]) =>
  (i: Inputs) =>
    rowSpokes(i) && m.includes(String(i.hoop_mode) as HullMode)
const axIs =
  (...m: HullMode[]) =>
  (i: Inputs) =>
    rowSpokes(i) && m.includes(String(i.axial_mode) as HullMode)
const circ = (i: Inputs) => hoopIs('beam', 'susp', 'stay')(i) || axIs('beam', 'susp', 'stay')(i)
const cables = (i: Inputs) => hoopIs('susp', 'stay')(i) || axIs('susp', 'stay')(i)
const HULL_MODES: HullMode[] = ['membrane', 'beam', 'susp', 'stay']
/** スポーク・引っ張り材の材料（引っ張りだけに使う材料を含む） */
const SPOKE_MATERIALS = { ...MATERIALS, ...TENSION_MATERIALS }

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
const ht = MATERIALS.ht780

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
    presets: (v): Inputs => (MATERIALS[v] ? { sigma_u: MATERIALS[v].sigma_u, rho: MATERIALS[v].rho, E_h: MATERIALS[v].E } : {}),
    customValue: CUSTOM,
    customKeys: ['sigma_u', 'rho'],
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
    key: 'E_h',
    group: 'struct',
    label: '外壁の材料のヤング率',
    symbol: 'E',
    description: 'スポークの長さの調整量（殻とスポークの伸びの差）に使う。小さいほど殻が伸びやすい',
    unit: strength,
    default: al.E,
    min: 0,
    minExclusive: true,
    visibleWhen: rowSpokes,
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

  // §3.5 スポークと引っ張り材、§3.6 端のふた
  {
    kind: 'number',
    key: 'f_s',
    group: 'spoke',
    label: 'スポークが受ける割合',
    symbol: 'f_s',
    description:
      '0% は壁（床）だけ、100% はスポークだけ。シリンダ・球は外向きの荷重（シリンダは気圧も、球は床の荷重だけ）、トーラスは輪の遠心力のうち、スポークが受ける割合。大きいほど壁は薄くなり、作れる半径の上限が上がるが、スポークとリングが重くなる（気圧だけなら、全体の質量はあまり減らない）',
    unit: fraction,
    default: 0,
    min: 0,
    max: 1,
    visibleWhen: (i) => !isDumbbell(i),
  },
  {
    kind: 'number',
    key: 'N_th',
    group: 'spoke',
    label: '1列のスポークの本数',
    symbol: 'N_\\theta',
    description: '円周方向の本数。多いほど、スポークの間（スパン）が短くなり、リングや外壁を円形に保つ構造が軽く浅くなる',
    unit: fixedUnit('本'),
    default: 12,
    min: 3,
    integer: true,
    visibleWhen: rowSpokes,
  },
  {
    kind: 'number',
    key: 's_z',
    group: 'spoke',
    label: 'スポークの列の間隔',
    symbol: 's_z',
    description: '軸方向の列の間隔（長さを割り切れるように直す）。狭いほど、列の間で殻がふくらむ張力が小さく、殻が薄くなる（外壁を円形に保つ構造なら浅く軽くなる）が、列が増える',
    unit: length,
    default: 50,
    min: 0,
    minExclusive: true,
    visibleWhen: rowSpokes,
  },
  {
    kind: 'enum',
    key: 'hoop_mode',
    group: 'spoke',
    label: '円周の方向（スポークの間）の受け方',
    description:
      '膜：外壁とリングが引っ張りだけで受け、スポークの間で外へふくらむ（花びら状。床も凹凸になる）。ほかは外壁を円形に保つ。梁：列のリングを曲げに強い梁にする（外壁の材料。床の下に置く）。吊り橋型：スポークの点から次のスポークの点へケーブルを張り、外壁を吊る。斜張橋型（放射型）：スポークを外壁の手前で止め、その点から外壁へ放射状にケーブルを張る（塔はいらず、すべて引っ張りの材料）。どれも、ふくらみと同じくらいの深さの構造が外壁の内側に要る',
    options: [
      { value: 'membrane', label: '膜（ふくらむ）' },
      { value: 'beam', label: '梁' },
      { value: 'susp', label: '吊り橋型' },
      { value: 'stay', label: '斜張橋型（放射型）' },
    ],
    default: 'membrane',
    visibleWhen: rowSpokes,
  },
  {
    kind: 'enum',
    key: 'axial_mode',
    group: 'spoke',
    label: '軸の方向（スポークの列の間）の受け方',
    description: '選び方は円周の方向と同じ。膜では、外壁が列の間でソーセージ状にふくらむ。円形を保つ構造は、外壁の荷重を列まで運び、列から円周の方向の構造がスポークへ運ぶ',
    options: [
      { value: 'membrane', label: '膜（ふくらむ）' },
      { value: 'beam', label: '梁' },
      { value: 'susp', label: '吊り橋型' },
      { value: 'stay', label: '斜張橋型（放射型）' },
    ],
    default: 'membrane',
    visibleWhen: rowSpokes,
  },
  {
    kind: 'enum',
    key: 'place',
    group: 'spoke',
    label: 'ケーブルの置き場所',
    description:
      '居住空間の中：床は外壁の側のままで、ケーブルと節点は床の上の空間にある（スポークの近くは使いにくい）。床の下：床を構造の深さだけ持ち上げ、外壁が大きくなる（外壁・遮蔽・空気が増える）。梁は常に床の下に置く',
    options: [
      { value: 'A', label: '居住空間の中（床の上）' },
      { value: 'B', label: '床の下（床を持ち上げる）' },
    ],
    default: 'A',
    visibleWhen: cables,
  },
  {
    kind: 'boolean',
    key: 'depth_by_m',
    group: 'spoke',
    label: '構造の深さの決め方',
    description: '梁の高さ・ケーブルのたわみ・節点の深さ（外壁の内面から）を、スパン（スポークの間隔・列の間隔）に対する比で入れるか、m で入れるか',
    default: false,
    labels: ['スパンに対する比', 'm で入れる'],
    visibleWhen: circ,
  },
  {
    kind: 'number',
    key: 'k_th',
    group: 'spoke',
    label: '円周の方向の構造の深さ ÷ スパン',
    symbol: 'k_\\theta',
    description: 'スパンはスポークの間隔。深いほど軽いが、床の上（または下）の空間を多く使う。斜張橋型は約 0.29 で最も軽く、浅いと外壁を縮める力が大きくなる',
    unit: fixedUnit(''),
    default: 0.2,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => hoopIs('beam', 'susp', 'stay')(i) && !i.depth_by_m,
  },
  {
    kind: 'number',
    key: 'd_th',
    group: 'spoke',
    label: '円周の方向の構造の深さ',
    symbol: 'd_\\theta',
    description: '深いほど軽いが、床の上（または下）の空間を多く使う。斜張橋型はスポークの間隔の約 0.29 倍で最も軽い',
    unit: length,
    default: 20,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => hoopIs('beam', 'susp', 'stay')(i) && Boolean(i.depth_by_m),
  },
  {
    kind: 'number',
    key: 'k_z',
    group: 'spoke',
    label: '軸の方向の構造の深さ ÷ スパン',
    symbol: 'k_z',
    description: 'スパンは列の間隔。深いほど軽いが、空間を多く使う',
    unit: fixedUnit(''),
    default: 0.2,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => axIs('beam', 'susp', 'stay')(i) && !i.depth_by_m,
  },
  {
    kind: 'number',
    key: 'd_z',
    group: 'spoke',
    label: '軸の方向の構造の深さ',
    symbol: 'd_z',
    description: '深いほど軽いが、空間を多く使う。斜張橋型は列の間隔の約 0.29 倍で最も軽い',
    unit: length,
    default: 10,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => axIs('beam', 'susp', 'stay')(i) && Boolean(i.depth_by_m),
  },
  {
    kind: 'number',
    key: 'N_hub',
    group: 'spoke',
    label: 'ハブのスポークの本数',
    symbol: 'N_{hub}',
    description: 'スタンフォード・トーラスは6本。少ないと、スポークの間で管が曲げを受ける（曲げは評価しない）',
    unit: fixedUnit('本'),
    default: 6,
    min: 1,
    integer: true,
    visibleWhen: (i) => isTorus(i) && spokeShare(i),
  },
  {
    kind: 'number',
    key: 'n_teth',
    group: 'spoke',
    label: 'テザーの本数（片側）',
    symbol: 'n_{teth}',
    description: 'モジュール1つをつなぐ本数。テザーの太さは本数に反比例し、合計の質量はほぼ変わらない',
    unit: fixedUnit('本'),
    default: 4,
    min: 1,
    integer: true,
    visibleWhen: isDumbbell,
  },
  {
    kind: 'number',
    key: 'r_hub',
    group: 'spoke',
    label: 'ハブの半径',
    symbol: 'r_{hub}',
    description: 'スポーク・テザーの中心側の端と、中心の軸の半径',
    unit: length,
    default: 5,
    min: 0,
    visibleWhen: (i) => radial(i) || capSupported(i),
  },
  {
    kind: 'enum',
    key: 'taper',
    group: 'spoke',
    label: 'スポーク・テザーのテーパー',
    description:
      '中心側（ハブ側）の端ほど大きな力を受ける（外側の荷重に、途中の部分の遠心力が足される）。応力が一定：中心側ほど太くして、どこでも許容応力にする（最も軽い）。なし：太さが一定（中心側の端の応力で決まり、重い。速いと作れない）。直線：中心側と外側の太さの比を決めて、直線で細くする',
    options: [
      { value: 'const', label: '応力が一定' },
      { value: 'none', label: 'なし（太さが一定）' },
      { value: 'linear', label: '直線' },
    ],
    default: 'const',
    visibleWhen: radial,
  },
  {
    kind: 'number',
    key: 'k_tp',
    group: 'spoke',
    label: '中心側と外側の太さ（断面積）の比',
    symbol: 'k_{tp}',
    unit: fixedUnit(''),
    default: 1.2,
    min: 1,
    visibleWhen: (i) => radial(i) && i.taper === 'linear',
  },
  {
    kind: 'number',
    key: 'f_t',
    group: 'spoke',
    label: '管・モジュールの中の引っ張り材が受ける割合',
    symbol: 'f_t',
    description: '気圧のうち、管・モジュールの断面の中心から壁へ放射状に張る引っ張り材（柱やケーブル）が受ける割合。大きいほど壁が薄くなる',
    unit: fraction,
    default: 0,
    min: 0,
    max: 1,
    visibleWhen: hasDecks,
  },
  {
    kind: 'number',
    key: 'N_t',
    group: 'spoke',
    label: '1列の引っ張り材の本数',
    symbol: 'N_t',
    unit: fixedUnit('本'),
    default: 8,
    min: 1,
    integer: true,
    visibleWhen: tubeTies,
  },
  {
    kind: 'number',
    key: 's_t',
    group: 'spoke',
    label: '引っ張り材の列の間隔',
    symbol: 's_t',
    description: '管・モジュールの長さ方向の間隔。狭いほど、列の間で壁がふくらむ張力が小さい',
    unit: length,
    default: 10,
    min: 0,
    minExclusive: true,
    visibleWhen: tubeTies,
  },
  {
    kind: 'enum',
    key: 'cap',
    group: 'spoke',
    label: '端のふたの支え方',
    description:
      '半球の殻：支えを使わず、殻だけで気圧を受ける（構造が簡単）。中心の軸：ふたを平らに近い形にして、軸と外周の間でふくらませ、内側の気圧を軸が受ける（端の空間が増える）。中心の軸と同心の引っ張り材：ふたを同心の輪で区切り、各輪の気圧を軸方向の引っ張り材が受ける（ふたが薄くなる）',
    options: [
      { value: 'hemi', label: '半球の殻（支えなし）' },
      { value: 'spine', label: '中心の軸で支える' },
      { value: 'ties', label: '中心の軸と同心の引っ張り材で支える' },
    ],
    default: 'hemi',
    visibleWhen: isCyl,
  },
  {
    kind: 'number',
    key: 'n_tie',
    group: 'spoke',
    label: '同心の引っ張り材の輪の数',
    symbol: 'n_{tie}',
    description: '多いほどふたが薄くなるが、外側の引っ張り材ほど自分の遠心力でたるむ',
    unit: fixedUnit(''),
    default: 3,
    min: 1,
    integer: true,
    visibleWhen: (i) => isCyl(i) && i.cap === 'ties',
  },
  {
    kind: 'enum',
    key: 'mat_spoke',
    group: 'spoke',
    label: 'スポーク・引っ張り材の材料',
    description:
      'スポーク・テザー・引っ張り材・リング・中心の軸・ケーブルに使う。強さ ÷ 密度が大きいほど、自分の遠心力が小さく、細く軽くなる。鋼線や繊維は引っ張りだけに使う材料で、外壁の材料には出さない',
    options: [...Object.entries(SPOKE_MATERIALS).map(([value, m]) => ({ value, label: m.label })), { value: CUSTOM, label: 'カスタム' }],
    default: 'ht780',
    presets: (v): Inputs => (SPOKE_MATERIALS[v] ? { sigma_us: SPOKE_MATERIALS[v].sigma_u, rho_s: SPOKE_MATERIALS[v].rho, E_s: SPOKE_MATERIALS[v].E } : {}),
    customValue: CUSTOM,
    visibleWhen: anyMember,
  },
  { kind: 'number', key: 'sigma_us', group: 'spoke', label: 'スポークの材料の強さ', symbol: '\\sigma_{us}', unit: strength, default: ht.sigma_u, min: 0, minExclusive: true, visibleWhen: anyMember },
  { kind: 'number', key: 'rho_s', group: 'spoke', label: 'スポークの材料の密度', symbol: '\\rho_s', unit: unitDefs.density, default: ht.rho, min: 0, minExclusive: true, visibleWhen: anyMember },
  {
    kind: 'number',
    key: 'E_s',
    group: 'spoke',
    label: 'スポークの材料のヤング率',
    symbol: 'E_s',
    description: 'スポークの伸び（長さの調整量）に使う',
    unit: strength,
    default: ht.E,
    min: 0,
    minExclusive: true,
    visibleWhen: rowSpokes,
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
  { key: 'D_hull', kind: 'number', group: 'geom', label: '外壁の直径', unit: length, visibleWhen: shapeIs('cylinder', 'sphere') },
  {
    key: 'LD',
    kind: 'number',
    group: 'geom',
    label: '長さと直径の比（L/D）',
    unit: fixedUnit(''),
    visibleWhen: isCyl,
    description: '全長（半球のふたを含む）÷ 外壁の直径。細長いほど、回転の軸がずれやすい（正確な判定は、快適さの判定の慣性モーメントの比）',
  },
  { key: 'D_torus', kind: 'number', group: 'geom', label: '外径（管の外側の壁の直径）', unit: length, visibleWhen: isTorus },
  { key: 'D_tube', kind: 'number', group: 'geom', label: '管の直径', unit: length, visibleWhen: isTorus },
  { key: 'D_mod', kind: 'number', group: 'geom', label: 'モジュールの直径', unit: length, visibleWhen: isDumbbell },
  { key: 'D_rot', kind: 'number', group: 'geom', label: '回転の直径（2つのモジュールの中心の間）', unit: length, visibleWhen: isDumbbell },
  { key: 'r_outer', kind: 'number', group: 'geom', label: '外径（一番外の面の半径）', unit: length, description: '回転の中心から、一番外の面（外に置く遮蔽があればその外面）まで' },
  { key: 'D_outer', kind: 'number', group: 'geom', label: '外径（一番外の面の直径）', unit: length },
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
    description: '気圧、床に載るものと遮蔽（自転させるとき）の遠心力、壁自身の遠心力のうち、スポーク・引っ張り材が受ける分を除いた荷重を受ける薄い殻の厚さ。トーラスは管の壁、ダンベルはモジュールの壁',
  },
  { key: 'm_hull', kind: 'number', group: 'struct', label: '外壁の面密度', unit: areal },
  { key: 't_cap', kind: 'number', group: 'struct', label: '端のふたの厚さ', unit: thin, visibleWhen: isCyl },
  {
    key: 'member_table',
    kind: 'table',
    group: 'struct',
    label: 'スポーク・引っ張り材の一覧',
    description:
      '中心側は回転軸に近い方の端。直径は、中身の詰まった丸い断面（無垢の棒）とした値。数 mm〜数 cm ならワイヤー、それより太ければケーブルの束と考えてよい（ケーブルはすき間の分だけ太くなる：鋼線の束で約 1.1 倍、ワイヤーロープで約 1.3 倍。管にしても変わるので、断面積も出す）。細かく並ぶケーブル・梁は直径を出さず、本数はスパンの数、質量は合計。リングは列ごとの1本、引っ張り材は1本の値。引っ張り材・リング・中心の軸は太さが一定。スポークの列のリング：外壁の内側をスポークの列ごとに一周する輪。外壁の荷重（面）を受け止めて、スポークがつながる点まで運ぶ（スポークの間では外にふくらむ円弧になり、張力で両側のスポークへ渡す。本数が多いほど細く軽くなる）',
    visibleWhen: anyMember,
  },
  { key: 'F_spoke', kind: 'number', group: 'struct', label: 'スポーク・テザー1本の外側の端の力', description: 'スポークは外壁・管、テザーはモジュールから受ける力（自分の遠心力は含めない）', unit: { options: [{ id: 'N', label: 'N', factor: 1 }, { id: 'MN', label: 'MN', factor: 1e6 }], defaultId: 'MN' }, visibleWhen: radial },
  { key: 'n_rows', kind: 'number', group: 'struct', label: 'スポークの列の数', unit: fixedUnit('列'), decimals: 0, visibleWhen: rowSpokes },
  { key: 's_zr', kind: 'number', group: 'struct', label: 'スポークの列の実際の間隔', unit: length, visibleWhen: rowSpokes },
  { key: 'bulge_th', kind: 'number', group: 'struct', label: 'スポークの間のふくらみの深さ（膜）', unit: length, visibleWhen: hoopIs('membrane'), description: '外壁が、スポークの間で 90° の円弧にふくらむ（スポークの点で凹む）深さ。スポークの間隔の 0.207 倍。床を外壁に敷くと床も凹凸になる' },
  { key: 'bulge_z', kind: 'number', group: 'struct', label: '列の間のふくらみの深さ（膜）', unit: length, visibleWhen: axIs('membrane'), description: '外壁が、列の間でふくらむ深さ。列の間隔の 0.207 倍' },
  { key: 'd_th', kind: 'number', group: 'struct', label: '円周の方向の構造の深さ', unit: length, visibleWhen: hoopIs('beam', 'susp', 'stay'), description: '梁の高さ・ケーブルのたわみ・節点の深さ（外壁の内面から。自転させる遮蔽の厚さは含めない）。この高さの分、床の上（または下）の空間を使う' },
  { key: 'd_z', kind: 'number', group: 'struct', label: '軸の方向の構造の深さ', unit: length, visibleWhen: axIs('beam', 'susp', 'stay') },
  { key: 'lift', kind: 'number', group: 'struct', label: '床を持ち上げた高さ', unit: length, visibleWhen: circ, description: '床の下に置く構造（梁、または床の下に置いたケーブル）の分、外壁を床から離す高さ' },
  { key: 't_zbeam', kind: 'number', group: 'struct', label: '軸の方向の梁の平均の厚さ', unit: thin, visibleWhen: axIs('beam'), description: '幅 1 m あたりの梁の断面積。外壁にならす（外壁に足す）と考えたときの厚さ' },
  { key: 'C_th', kind: 'number', group: 'struct', label: '斜張橋型が外壁を縮める力（円周、列あたり）', unit: { options: [{ id: 'N', label: 'N', factor: 1 }, { id: 'MN', label: 'MN', factor: 1e6 }], defaultId: 'MN' }, visibleWhen: hoopIs('stay'), description: 'ケーブルが外壁を節点の側へも引くので、外壁は円周方向に縮められる。浅いほど大きい' },
  { key: 'T_th', kind: 'number', group: 'struct', label: '打ち消す外壁の張力（円周、列あたり）', unit: { options: [{ id: 'N', label: 'N', factor: 1 }, { id: 'MN', label: 'MN', factor: 1e6 }], defaultId: 'MN' }, visibleWhen: hoopIs('stay'), description: '外壁が気圧でもともと持つ張力。縮める力がこれを超える分は、外壁の材料の圧縮のリングで受ける' },
  { key: 'C_z', kind: 'number', group: 'struct', label: '斜張橋型が外壁を縮める力（軸、幅 1 m あたり）', unit: { options: [{ id: 'N/m', label: 'N/m', factor: 1 }, { id: 'MN/m', label: 'MN/m', factor: 1e6 }], defaultId: 'MN/m' }, visibleWhen: axIs('stay') },
  { key: 'T_z', kind: 'number', group: 'struct', label: '打ち消す外壁の張力（軸、幅 1 m あたり）', unit: { options: [{ id: 'N/m', label: 'N/m', factor: 1 }, { id: 'MN/m', label: 'MN/m', factor: 1e6 }], defaultId: 'MN/m' }, visibleWhen: axIs('stay'), description: '超える分は外壁を厚くして受ける' },
  {
    key: 'dl_spoke',
    kind: 'number',
    group: 'struct',
    label: 'スポークの長さの調整量',
    unit: thin,
    visibleWhen: rowSpokes,
    description:
      '殻の半径の伸びからスポークの伸びを引いた値。決めた割合で荷重を分け合うには、スポークをこの分だけ短く作って、初めに張力をかけておく（負なら長く作る）。実際の分担は、伸びやすさと初めの張力で決まる',
  },
  { key: 'tie_sag', kind: 'number', group: 'struct', label: '同心の引っ張り材のたるみ（支点の間隔に対する比）', unit: fraction, visibleWhen: (i) => isCyl(i) && i.cap === 'ties', description: '自分の遠心力で外にたわむ。支点はスポークの列（なければ両端）。5% を超えると警告' },
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
    { id: 'spoke', label: 'スポーク・引っ張り材・端のふた' },
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
    'cap-limit': '端のふたの外周の速さ {v} m/s が、外壁の材料で作れる上限 {vmax} m/s を超えていて、ふたを作れません（ふたはスポークで支えないので、自分の重さの遠心力をそのまま受ける）。半径を小さくするか、強さ ÷ 密度の大きい材料にしてください',
    'spoke-limit': 'スポーク・テザーの外側の端の速さ {v} m/s では、太さが一定のスポークは自分の遠心力に耐えられません。テーパーを「応力が一定」にするか、強さ ÷ 密度の大きい材料にしてください',
    'ring-limit': 'リングの速さ {v} m/s が、スポークの材料で作れる上限を超えています。強さ ÷ 密度の大きい材料にしてください',
    'hub-out': 'ハブの半径が、スポーク・軸を付ける面（外壁、管の内側の壁、モジュールの上の壁）以上です。ハブを小さくしてください',
    'tie-sag': '同心の引っ張り材が、自分の遠心力で支点の間隔の {k}% たるみます。スポークの列を増やす（支点を増やす）か、輪の数を減らすか、強さ ÷ 密度の大きい材料にしてください',
    'torus-bending': 'ハブのスポークの間で、管は曲げを受けます（この計算では評価しません）',
    leo500: '赤道上の低軌道 500 km では、遮蔽がなくても 20 mSv/年 を満たします（Globus & Strout）',
    'beam-limit': '外壁の速さ {v} m/s では、外壁の材料の梁は自分の遠心力に耐えられません。梁以外の受け方にするか、半径を小さくするか、強さ ÷ 密度の大きい材料にしてください',
    'stay-shallow':
      '斜張橋型の節点が浅すぎます。外壁は曲がっているので、スパンの端の外壁が節点より内側に来てしまいます。構造の深さを {d} m より深くするか、スポーク・列を増やしてスパンを短くしてください',
    'stay-compression':
      '斜張橋型のケーブルが外壁を円周方向に縮める力 {C} MN（列あたり）が、外壁の気圧の張力 {T} MN を超えます。超える分は外壁の材料の圧縮のリングで受けるとしました（座屈は評価しません）。構造を深くすると小さくなります',
    'stay-compression-z':
      '斜張橋型のケーブルが外壁を軸方向に縮める力 {C} MN/m が、外壁の張力 {T} MN/m を超えます。超える分は外壁を厚くして受けるとしました（座屈は評価しません）。構造を深くすると小さくなります',
    'beam-below': '梁は床の下に置きます（ケーブルの置き場所に関わらず、床を梁の高さだけ持ち上げます）',
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
      for (const k of ['n_rpm', 'omega', 'v', 'M_total', 'period', 'dg_dr', 'R_min_rpm', 'v_min_cor', 'L', 'R_c', 'w', 'R_s', 'g_edge', 'L_m', 'g_end', 'tilt', 'A_total', 'V_air', 'M_air', 'P_axis', 't_hull', 'm_hull', 't_cap', 'v_max', 'R_max', 'F_tether', 't_sh', 'M_rot', 'I', 'E_rot', 'L_ang', 'dose', 'F_spoke', 'n_rows', 's_zr', 'bulge_th', 'bulge_z', 'd_th', 'd_z', 'lift', 't_zbeam', 'C_th', 'T_th', 'C_z', 'T_z', 'dl_spoke', 'tie_sag', 'p_O2', 'f_O2', 'x_O2', 'p_N2', 'p_H2O', 'T_dew', 'M_mol', 'rho_air'] as const) {
        num(k, o[k])
      }
      num('sigma_sh', o.sigma_sh)
      num('M_shield', o.M_shield)
      num('r_outer', Math.max(...o.g_profile.r))
      num('D_outer', 2 * Math.max(...o.g_profile.r))
      num('LD', o.LD)
      if (shapeIs('cylinder', 'sphere')(i)) num('D_hull', 2 * o.R_hull)
      if (o.R_c !== undefined) {
        num('D_torus', 2 * (o.R_c + o.R_hull))
        num('D_tube', 2 * o.R_hull)
      }
      if (o.R_cm !== undefined) {
        num('D_mod', 2 * o.R_hull)
        num('D_rot', 2 * o.R_cm)
      }
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
      // 細かく並ぶケーブル・梁は断面積が NaN（直径を出さない）
      const dia = (A: number) => (Number.isFinite(A) ? Math.sqrt((4 * A) / Math.PI) : '—')
      outputs.member_table = {
        kind: 'table',
        columns: ['部材', '本数', '中心側の直径 [m]', '外側の直径 [m]', '1本の断面積（中心側）[m²]', '長さ [m]', '合計の質量 [t]'],
        rows: o.members.map((m) => [m.label, m.count, dia(m.A_root), dia(m.A_tip), Number.isFinite(m.A_root) ? m.A_root : '—', m.length, (m.mass * m.count) / 1000]),
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
    E_h: num('E_h'),
    sigma_us: num('sigma_us'),
    rho_s: num('rho_s'),
    E_s: num('E_s'),
    f_s: num('f_s'),
    N_th: num('N_th'),
    s_z: num('s_z'),
    hoop_mode: (HULL_MODES.includes(String(i.hoop_mode) as HullMode) ? String(i.hoop_mode) : 'membrane') as HullMode,
    axial_mode: (HULL_MODES.includes(String(i.axial_mode) as HullMode) ? String(i.axial_mode) : 'membrane') as HullMode,
    place: i.place === 'B' ? 'B' : 'A',
    depth_by_m: Boolean(i.depth_by_m),
    k_th: num('k_th'),
    k_z: num('k_z'),
    d_th: num('d_th'),
    d_z: num('d_z'),
    N_hub: num('N_hub'),
    n_teth: num('n_teth'),
    r_hub: num('r_hub'),
    taper: (['none', 'const', 'linear'].includes(String(i.taper)) ? String(i.taper) : 'const') as Taper,
    k_tp: num('k_tp'),
    f_t: num('f_t'),
    N_t: num('N_t'),
    s_t: num('s_t'),
    cap: (['hemi', 'spine', 'ties'].includes(String(i.cap)) ? String(i.cap) : 'hemi') as Cap,
    n_tie: num('n_tie'),
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
