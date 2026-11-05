import { AU, G0, GM_SUN, YEAR } from '../../core/physics/constants.ts'
import { fixedUnit, unitDefs, type UnitDef } from '../../core/physics/units.ts'
import type { ComputeResult, EnumParam, Inputs, NumberParam, OutputDef, OutputValue, ParamDef, SimDefinition } from '../types.ts'
import {
  computeSunshade,
  OPTICS_PRESETS,
  SIGMA_PRESETS,
  TARGET_PRESETS,
  type Operation,
  type PositionMode,
  type Propulsion,
  type Solve,
  type SunshadeInputs,
  type Transport,
} from './model.ts'

const DAY = 86_400
const G = 1e-3 // g/m² → kg/m²
const CUSTOM = 'custom'

// 表示単位
const km: UnitDef = { ...unitDefs.length, defaultId: 'km' }
const au: UnitDef = { ...unitDefs.length, defaultId: 'AU' }
const km2: UnitDef = { ...unitDefs.area, defaultId: 'km2' }
const days: UnitDef = { ...unitDefs.durationLong, defaultId: 'day' }
const years: UnitDef = { ...unitDefs.durationLong, defaultId: 'year' }
const kms: UnitDef = { ...unitDefs.velocity, defaultId: 'km/s' }
const kW: UnitDef = { ...unitDefs.power, defaultId: 'kW' }
const mass = unitDefs.mass
const ratio = unitDefs.fraction
const times = fixedUnit('倍')

// 表示の条件
const isBuild = (i: Inputs) => i.operation === 'build'
const isStandby = (i: Inputs) => i.operation === 'standby'
const isCarrier = (i: Inputs) => isBuild(i) && i.transport === 'carrier'
const isSelf = (i: Inputs) => isBuild(i) && i.transport === 'self'
const hasSail = (i: Inputs) => i.propulsion !== 'ep'
const hasEp = (i: Inputs) => i.propulsion !== 'sail'
const isPowerSail = (i: Inputs) => i.propulsion === 'power_sail'
/** シェード自身が電気推進を積む（輸送機で運ぶ場合は積まない） */
const shadeEp = (i: Inputs) => hasEp(i) && !isCarrier(i)
const isPerf = (i: Inputs) => isStandby(i) && i.solve === 'perf'
const byRatio = (i: Inputs) => isPerf(i) && Boolean(i.by_ratio)

/** 地球の公転軌道から対象天体の公転軌道へ、小さな推力でゆっくり移る Δv（エーデルバウムの近似） */
const orbitDv = (a_p: number) => Math.abs(Math.sqrt(GM_SUN / AU) - Math.sqrt(GM_SUN / a_p))

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

// ---------------------------------------------------------------------------
// 入力（§3）

const baseInputs: ParamDef[] = [
  // §3.1 対象天体
  {
    kind: 'enum',
    key: 'target',
    group: 'target',
    label: '対象天体',
    description: '日射を減らしたい天体。選ぶと半径・公転軌道の半径・重力定数が入る（検証済み）。公転軌道は円とする',
    options: [
      { value: 'earth', label: '地球' },
      { value: 'mars', label: '火星' },
      { value: 'venus', label: '金星' },
      { value: CUSTOM, label: 'カスタム' },
    ],
    default: 'earth',
    presets: (v, i) => {
      const t = TARGET_PRESETS[v as keyof typeof TARGET_PRESETS]
      if (!t) return {}
      return { ...t, ...(i.dv_preset === 'orbit' ? { dv_tr: orbitDv(t.a_p) } : {}) }
    },
    customValue: CUSTOM,
    customKeys: ['R_p', 'a_p', 'GM_p'],
  },
  {
    kind: 'number',
    key: 'R_p',
    group: 'target',
    label: '天体の半径',
    symbol: 'R_p',
    description: '大きいほど、同じ減光率に必要な膜の面積が増える（面積は半径の2乗に比例）',
    unit: km,
    default: TARGET_PRESETS.earth.R_p,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'a_p',
    group: 'target',
    label: '天体の公転軌道の半径（太陽からの距離）',
    symbol: 'a_p',
    description: '目安：金星 0.723、地球 1.0、火星 1.524 AU',
    unit: au,
    default: TARGET_PRESETS.earth.a_p,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'GM_p',
    group: 'target',
    label: '天体の重力定数',
    symbol: 'GM_p',
    description: '大きいほど天体の重力が強く、L1 が天体から遠くなる。地球は月の分を含めて 4.035×10¹⁴',
    unit: unitDefs.gravParam,
    default: TARGET_PRESETS.earth.GM_p,
    min: 0,
  },

  // §3.2 目標
  {
    kind: 'number',
    key: 'f_target',
    group: 'goal',
    label: '目標減光率（天体に届く日射の減少率）',
    symbol: 'f_{target}',
    description: '大きいほど必要な膜が増える。目安：二酸化炭素が2倍になったときの温暖化を打ち消すには、地球で約 1.8%',
    unit: ratio,
    default: 0.018,
    min: 0,
    minExclusive: true,
    max: 1,
    maxExclusive: true,
    rangeMessage: '0 より大きく 100% 未満で入力してください',
  },

  // §3.3 機能位置
  {
    kind: 'enum',
    key: 'position',
    group: 'position',
    label: '機能位置の決め方',
    description:
      'シェードは太陽と天体を結ぶ線の上に置く。L1：光圧がないときのつり合い点（光圧の分は電気推進で押し続ける）。光圧のつり合い点：推進なしで止まれる点（軽い膜ほど太陽側にずれる）。距離を指定：反射率の調整か電気推進で合わせる',
    options: [
      { value: 'l1', label: 'L1' },
      { value: 'balance', label: '光圧のつり合い点' },
      { value: 'rs', label: '太陽からの距離を指定' },
      { value: 'd', label: '天体からの距離を指定' },
    ],
    default: 'balance',
  },
  {
    kind: 'enum',
    key: 'rs_preset',
    group: 'position',
    label: '太陽からの距離の目安',
    description: '1.05 AU は、火星向けのシェードを地球の公転軌道の近くに置く場合（地球の重力が及ぶ範囲の約5倍外側）',
    options: [
      { value: '1.05', label: '1.05 AU' },
      { value: '1.3', label: '1.3 AU' },
      { value: CUSTOM, label: 'カスタム' },
    ],
    default: '1.05',
    presets: { '1.05': { r_s: 1.05 * AU }, '1.3': { r_s: 1.3 * AU } },
    customValue: CUSTOM,
    visibleWhen: (i) => i.position === 'rs',
  },
  {
    kind: 'number',
    key: 'r_s',
    group: 'position',
    label: '太陽からの距離',
    symbol: 'r_s',
    description: '天体の公転軌道より内側にする。天体から離れるほど影が広がり、必要な膜の面積が急に増え、より軽い膜が必要になる',
    unit: au,
    default: 1.05 * AU,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => i.position === 'rs',
  },
  {
    kind: 'number',
    key: 'd',
    group: 'position',
    label: '天体からの距離',
    symbol: 'd',
    description: '地球の L1 は約 150万 km。遠いほど影が広がり、必要な膜の面積が増える',
    unit: km,
    default: 1.5e9,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => i.position === 'd',
  },

  // §3.4 (a) シェード衛星
  {
    kind: 'number',
    key: 'A_unit',
    group: 'shade',
    label: '1基の膜の面積（展張時）',
    symbol: 'A_{unit}',
    description: '大きいほど機数が少なくて済む。Angel 2006 は直径 0.6 m（0.2827 m²）の小さな膜を約16兆基並べる構想',
    unit: unitDefs.area,
    default: Math.PI * 0.3 ** 2,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'enum',
    key: 'sigma_preset',
    group: 'shade',
    label: '面密度の目安',
    description: '選ぶと面密度が入る。「材料だけ」は膜の材料の値なので、構造や制御機器の分を本体の質量で加える',
    options: [
      { value: 'ikaros', label: 'IKAROS の膜（実績、70 g/m²）' },
      { value: 'polyimide', label: 'ポリイミド膜 7.5 µm（材料だけ、10.7 g/m²）' },
      { value: 'cruiser', label: 'Solar Cruiser の膜（材料だけ、3.8 g/m²）' },
      { value: 'angel', label: 'Angel 2006 の小型シェード（機体全体、4.2 g/m²）' },
      { value: 'okeanos', label: 'OKEANOS 構想（機体全体、800 g/m²）' },
      { value: 'future105', label: '将来技術：1.05 AU で機能（2.0 g/m²）※参考値' },
      { value: 'future13', label: '将来技術：1.3 AU で機能（3.5 g/m²）※参考値' },
      { value: CUSTOM, label: 'カスタム' },
    ],
    default: 'angel',
    presets: (v): Inputs => (SIGMA_PRESETS[v] === undefined ? {} : { sigma_film: SIGMA_PRESETS[v] }),
    customValue: CUSTOM,
  },
  {
    kind: 'number',
    key: 'sigma_film',
    group: 'shade',
    label: '膜と構造の面密度',
    symbol: '\\sigma_{film}',
    description: '小さいほど軽く、光圧で強く押される（太陽側に押し出される）。機能位置で止まれる上限は「面密度の上限」の出力を参照',
    unit: unitDefs.filmDensity,
    default: SIGMA_PRESETS.angel,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'm_bus',
    group: 'shade',
    label: '1基あたりの本体の質量（制御機器など）',
    symbol: 'm_{bus}',
    description: '膜の面密度に含まれない分。重いほど光圧の強さ β が下がる',
    unit: unitDefs.mass,
    default: 0,
    min: 0,
  },
  // §3.4 (b) 膜の光学特性
  {
    kind: 'enum',
    key: 'optics',
    group: 'optics',
    label: '膜の種類',
    description: '反射型：鏡のように反射する（光圧が最も強い）。吸収型：光を吸収する。屈折型：光を小さな角度で曲げて天体から外す（光圧が弱い。Angel 2006）',
    options: [
      { value: 'reflective', label: '反射型（アルミ蒸着膜）※参考値' },
      { value: 'absorptive', label: '吸収型（黒色の膜）※参考値' },
      { value: 'refractive', label: '屈折型（Angel 2006）' },
      { value: CUSTOM, label: 'カスタム' },
    ],
    default: 'refractive',
    presets: (v): Inputs => ({ ...OPTICS_PRESETS[v as keyof typeof OPTICS_PRESETS] }),
    customValue: CUSTOM,
  },
  fraction('R_s', '反射率（鏡のような反射）', OPTICS_PRESETS.refractive.R_s, {
    group: 'optics',
    symbol: 'R_s',
    description: '大きいほど光圧が強い（すべて反射すると、吸収の2倍の力）。帆の向きを変えて横向きの力を出せるのは反射する分だけ',
  }),
  fraction('A_s', '吸収率', OPTICS_PRESETS.refractive.A_s, { group: 'optics', symbol: 'A_s' }),
  fraction('T_s', 'そのまま素通しする割合', OPTICS_PRESETS.refractive.T_s, {
    group: 'optics',
    symbol: 'T_s',
    description: '大きいほど遮る光が減り、必要な膜の面積が増える。反射率・吸収率・素通しの残りは、曲げて天体から外す光（屈折型）',
  }),
  {
    kind: 'number',
    key: 'k_min',
    group: 'optics',
    label: '反射率を調整して下げられる、光圧係数の下限',
    symbol: 'k_{min}',
    description: '距離を指定したとき、光圧を弱めて合わせられる限界。小さいほど調整の幅が広い。反射型は反射率を 0 まで下げると 1（吸収と同じ）',
    unit: unitDefs.none,
    default: OPTICS_PRESETS.refractive.k_min,
    min: 0,
  },
  // §3.4 (c) ソーラー電力セイル
  fraction('f_cell', '膜のうち薄膜太陽電池で覆う割合', 0.001, {
    group: 'cell',
    symbol: 'f_{cell}',
    description: '増やすと電気推進の電力が増えるが、面密度が増えて光圧の強さ β が下がる。1.0〜1.3 AU で機能させるなら 0.1% 程度が限界',
  }),
  {
    kind: 'number',
    key: 'sigma_cell',
    group: 'cell',
    label: '薄膜太陽電池の面密度',
    symbol: '\\sigma_{cell}',
    description: '小さいほど軽い（参考値。IKAROS の 25 µm 級で約 35 g/m²）',
    unit: unitDefs.filmDensity,
    default: 35 * G,
    min: 0,
  },
  fraction('eta_cell', '薄膜太陽電池の効率', 0.1, {
    group: 'cell',
    symbol: '\\eta_{cell}',
    description: '大きいほど電力が増える（参考値。アモルファスシリコンで 7〜10%）',
  }),

  // §3.5 推進
  {
    kind: 'enum',
    key: 'propulsion',
    group: 'prop',
    label: '推進方式',
    description:
      '太陽帆：光圧だけで動く（推進剤なし）。電気推進：専用の太陽電池で推進器を動かす。ソーラー電力セイル：膜の一部に貼った薄膜太陽電池の電力で電気推進を動かす（IKAROS、OKEANOS の方式）',
    options: [
      { value: 'sail', label: '太陽帆' },
      { value: 'ep', label: '電気推進' },
      { value: 'sail_ep', label: '太陽帆＋電気推進' },
      { value: 'power_sail', label: 'ソーラー電力セイル' },
    ],
    default: 'sail',
  },
  {
    kind: 'number',
    key: 'Isp',
    group: 'prop',
    label: '電気推進の比推力',
    symbol: 'I_{sp}',
    description: '大きいほど推進剤が少なくて済むが、同じ推力に多くの電力が要る。イオンエンジンで 2000〜4000 s。輸送機で運ぶときは輸送機の値',
    unit: fixedUnit('s'),
    default: 20_000 / G0,
    min: 0,
    minExclusive: true,
    visibleWhen: (i) => hasEp(i) || isCarrier(i),
  },
  fraction('eta_ep', '電気推進の効率（電力 → 噴射のエネルギー）', 0.6, {
    group: 'prop',
    symbol: '\\eta_{ep}',
    description: '大きいほど同じ推力に必要な電力が少ない。イオンエンジン、ホールスラスタで 50〜70%',
    min: 0,
    minExclusive: true,
    rangeMessage: '0 より大きく 100% 以下で入力してください',
    visibleWhen: (i) => hasEp(i) || isCarrier(i),
  }),
  {
    kind: 'number',
    key: 'alpha_ep',
    group: 'prop',
    label: '電気推進系の比質量（専用の太陽電池、推進器、電力制御）',
    symbol: '\\alpha_{ep}',
    description: '電力 1 kW あたりの質量。小さいほど軽い（参考値）',
    unit: unitDefs.perPower,
    default: 30e-3,
    min: 0,
    visibleWhen: (i) => (i.propulsion === 'ep' || i.propulsion === 'sail_ep') && !isCarrier(i),
  },
  {
    kind: 'number',
    key: 'alpha_thr',
    group: 'prop',
    label: '推進器と電力制御だけの比質量',
    symbol: '\\alpha_{thr}',
    description: 'ソーラー電力セイルの電力 1 kW あたりの質量（太陽電池は膜に含む）。小さいほど軽い（参考値）',
    unit: unitDefs.perPower,
    default: 5e-3,
    min: 0,
    visibleWhen: (i) => isPowerSail(i) && !isCarrier(i),
  },
  {
    kind: 'number',
    key: 'a_ep_des',
    group: 'prop',
    label: '電気推進の設計加速度',
    symbol: 'a_{ep,des}',
    description: '待機・応答で、電気推進の大きさを決める加速度。大きいほど早く動けるが、電気推進系が重くなる（参考値）',
    unit: unitDefs.acceleration,
    default: 1e-4,
    min: 0,
    visibleWhen: (i) => isStandby(i) && (i.propulsion === 'ep' || i.propulsion === 'sail_ep'),
  },
  {
    kind: 'boolean',
    key: 'steer_auto',
    group: 'prop',
    label: '帆の横向きの力の割合',
    description: '自動では、反射する分の膜を太陽に対して 35.3° 傾けたときの最大値（0.385 × 反射の割合）にする',
    default: true,
    labels: ['手で入力', '自動'],
    visibleWhen: (i) => hasSail(i) && !isCarrier(i),
  },
  {
    kind: 'number',
    key: 'eta_steer',
    group: 'prop',
    label: '帆の横向きの力の割合',
    symbol: '\\eta_{steer}',
    description: '帆の向きを変えて得られる、太陽方向と直角な力の割合。大きいほど速く移動できる。吸収型・屈折型の膜では 0',
    unit: unitDefs.none,
    default: 0,
    min: 0,
    max: 0.385,
    visibleWhen: (i) => hasSail(i) && !isCarrier(i),
    role: (i) => (i.steer_auto ? 'output' : 'input'),
  },

  // §3.6 運用の形
  {
    kind: 'enum',
    key: 'operation',
    group: 'operation',
    label: '運用の形',
    description: '建設展開：配備位置へ運び、一定のペースで配備していく。待機・応答：即応群（膜を広げて待機）と追加群（膜を畳んで待機）が、要請を受けて機能位置に移動する',
    options: [
      { value: 'build', label: '建設展開' },
      { value: 'standby', label: '待機・応答' },
    ],
    default: 'build',
  },

  // §3.7 建設展開
  {
    kind: 'enum',
    key: 'transport',
    group: 'build',
    label: '運び方',
    description: '輸送機：電気推進の輸送機でまとめて運ぶ（帆は畳み、輸送機は使い捨て）。自力：各機が自分の推進で移動する',
    options: [
      { value: 'self', label: '各機が自力で移動' },
      { value: 'carrier', label: '輸送機でまとめて運ぶ' },
    ],
    default: 'carrier',
  },
  {
    kind: 'enum',
    key: 'dv_preset',
    group: 'build',
    label: '出発点 → 機能位置',
    description: '選ぶと Δv が入る。地上から地球の重力圏を出るまでの打ち上げは含めない',
    options: [
      { value: 'c3', label: '地球の重力圏を出た位置 → 地球の近く（1 km/s）' },
      { value: 'orbit', label: '地球の公転軌道 → 対象天体の公転軌道 ※参考値' },
      { value: CUSTOM, label: 'カスタム' },
    ],
    default: 'c3',
    presets: (v, i): Inputs => (v === 'c3' ? { dv_tr: 1000 } : v === 'orbit' ? { dv_tr: orbitDv(Number(i.a_p)) } : {}),
    customValue: CUSTOM,
  },
  {
    kind: 'number',
    key: 'dv_tr',
    group: 'build',
    label: '出発点から機能位置までの Δv',
    symbol: '\\Delta v_{tr}',
    description: '大きいほど推進剤と推進系が重くなる。地球の公転軌道から火星の軌道へは約 5.7 km/s',
    unit: kms,
    default: 1000,
    min: 0,
  },
  {
    kind: 'number',
    key: 't_tr',
    group: 'build',
    label: '1基が出発してから着くまでの時間',
    symbol: 't_{tr}',
    description: '短いほど大きな推力が要る',
    unit: years,
    default: YEAR,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'T_deploy',
    group: 'build',
    label: '展開の期間（最初の出発から最後の到着まで）',
    symbol: 'T_{deploy}',
    unit: years,
    default: 10 * YEAR,
    min: 0,
    minExclusive: true,
  },
  {
    kind: 'number',
    key: 'T_keep',
    group: 'build',
    label: '運用（維持）の期間',
    symbol: 'T_{keep}',
    description: '長いほど、位置を保つための推進剤が増える（電気推進を持つ場合）',
    unit: years,
    default: 10 * YEAR,
    min: 0,
  },
  {
    kind: 'number',
    key: 'dv_sk',
    group: 'build',
    label: '位置を保つための1年あたりの Δv',
    symbol: '\\Delta v_{sk}',
    description: 'L1 付近は不安定で、軌道を修正し続ける必要がある（参考値。L1 付近の探査機で年に数 m/s）',
    unit: fixedUnit('m/s/年'),
    default: 4,
    min: 0,
    visibleWhen: (i) => isSelf(i) && hasEp(i),
  },
  {
    kind: 'number',
    key: 'mu_c',
    group: 'build',
    label: '輸送機の乾燥質量 ÷ 運ぶシェードの質量',
    symbol: '\\mu_c',
    description: '小さいほど輸送機が軽い（Angel 2006：シェード 1000 kg に構造など 1000 kg で 1.0）',
    unit: unitDefs.none,
    default: 1,
    min: 0,
    visibleWhen: isCarrier,
  },

  // §3.8 待機・応答
  {
    kind: 'enum',
    key: 'solve',
    group: 'sb_solve',
    label: '計算の向き',
    description: '目標から構成を出す：目標の日数と遮光率から、即応群と追加群の機数を決める。構成から性能を出す：機数から、遮光率の時間変化を出す',
    options: [
      { value: 'goal', label: '目標から構成を出す' },
      { value: 'perf', label: '構成から性能を出す' },
    ],
    default: 'goal',
  },
  {
    kind: 'number',
    key: 't1',
    group: 'sb_goal',
    label: '第1目標の日数',
    symbol: 't_1',
    unit: days,
    default: 30 * DAY,
    min: 0,
    minExclusive: true,
  },
  fraction('F1', '第1目標の遮光率（目標減光率に対する達成率）', 0.3, {
    group: 'sb_goal',
    symbol: 'F_1',
    description: '要請から第1目標の日数までに働いているシェードの割合。即応群だけで満たす',
  }),
  {
    kind: 'number',
    key: 't2',
    group: 'sb_goal',
    label: '第2目標の日数',
    symbol: 't_2',
    unit: days,
    default: 180 * DAY,
    min: 0,
    minExclusive: true,
  },
  fraction('F2', '第2目標の遮光率', 0.8, { group: 'sb_goal', symbol: 'F_2' }),
  {
    kind: 'number',
    key: 't_rap_goal',
    group: 'sb_goal',
    label: '即応群の応答時間の目標',
    symbol: 't_{rap,goal}',
    description: '超えると警告を出す',
    unit: days,
    default: 7 * DAY,
    min: 0,
  },
  {
    kind: 'boolean',
    key: 'by_ratio',
    group: 'sb_config',
    label: '構成の入力のしかた',
    default: false,
    labels: ['機数で入力', '総機数と比率で入力'],
    visibleWhen: isPerf,
  },
  {
    kind: 'number',
    key: 'N_rap',
    group: 'sb_config',
    label: '即応群の機数',
    symbol: 'N_{rap}',
    description: '膜を広げて、機能位置の横で待機する機体。数日で働き始める',
    unit: unitDefs.count,
    default: 1e9,
    min: 0,
    integer: true,
    role: (i) => (isPerf(i) && !i.by_ratio ? 'input' : 'output'),
  },
  {
    kind: 'number',
    key: 'N_res',
    group: 'sb_config',
    label: '追加群の機数',
    symbol: 'N_{res}',
    description: '膜を畳んで太陽周回軌道に分散して待機する機体。着くまでに数か月かかる',
    unit: unitDefs.count,
    default: 5e9,
    min: 0,
    integer: true,
    role: (i) => (isPerf(i) && !i.by_ratio ? 'input' : 'output'),
  },
  {
    kind: 'number',
    key: 'N_total',
    group: 'sb_config',
    label: '総機数',
    unit: unitDefs.count,
    default: 6e9,
    min: 0,
    integer: true,
    visibleWhen: byRatio,
  },
  fraction('rap_ratio', '即応群の割合', 1 / 6, { group: 'sb_config', visibleWhen: byRatio }),
  fraction('m_gap', '即応群の待機位置の余裕（天体の直径に対する割合）', 0.1, {
    group: 'sb_cond',
    symbol: 'm_{gap}',
    description: '即応群の影が天体にかからないように離しておく余裕。大きいほど応答が遅い（参考値）',
  }),
  {
    kind: 'boolean',
    key: 'park_same',
    group: 'sb_cond',
    label: '追加群の待機軌道の半径',
    description: '機能位置と同じ太陽からの距離にするのが基本。違う距離にすると、到着が大きく遅れる',
    default: true,
    labels: ['指定する', '機能位置と同じ'],
  },
  {
    kind: 'number',
    key: 'r_park',
    group: 'sb_cond',
    label: '追加群が待機する太陽周回軌道の半径',
    symbol: 'r_{park}',
    unit: au,
    default: 1.05 * AU,
    min: 0,
    minExclusive: true,
    role: (i) => (i.park_same ? 'output' : 'input'),
  },
  {
    kind: 'number',
    key: 't_unf',
    group: 'sb_cond',
    label: '追加群の膜を展張するのにかかる時間',
    symbol: 't_{unf}',
    unit: days,
    default: 1 * DAY,
    min: 0,
  },
  {
    kind: 'number',
    key: 'lambda_mm',
    group: 'sb_cond',
    label: '展張中の膜が微小隕石などで失われる割合',
    symbol: '\\lambda_{mm}',
    description: '根拠のある値がないので、初期値は 0（未設定）。大きいほど補充の機数が増える',
    unit: unitDefs.yearlyLoss,
    default: 0,
    min: 0,
  },
  {
    kind: 'number',
    key: 'T_sim',
    group: 'sb_cond',
    label: '時系列を出す期間',
    symbol: 'T_{sim}',
    unit: days,
    default: 365 * DAY,
    min: 0,
    minExclusive: true,
  },
]

// ---------------------------------------------------------------------------
// シナリオ（§3.9）

const defaultsOf = (params: readonly ParamDef[]): Inputs =>
  Object.fromEntries(params.map((p) => [p.key, p.kind === 'table' ? [] : p.default]))

/** 新しいカードはこの値で始まる（各入力の初期値と同じ） */
const EARTH_L1 = defaultsOf(baseInputs)

function scenarioPreset(id: string): Inputs {
  if (id === 'earth_l1') return { ...EARTH_L1 }
  if (id === 'mars_rapid') {
    return {
      ...EARTH_L1,
      target: 'mars',
      ...TARGET_PRESETS.mars,
      f_target: 0.01,
      position: 'rs',
      rs_preset: '1.05',
      r_s: 1.05 * AU,
      optics: 'reflective',
      ...OPTICS_PRESETS.reflective,
      A_unit: 1e6,
      sigma_preset: 'future105',
      sigma_film: SIGMA_PRESETS.future105,
      propulsion: 'sail',
      operation: 'standby',
      solve: 'goal',
      park_same: true,
    }
  }
  return {}
}

const scenario: EnumParam = {
  kind: 'enum',
  key: 'scenario',
  group: 'scenario',
  label: 'シナリオ',
  description: '選ぶと、条件がまとめて入る。値を変えると「自由に設定」の表示になる',
  options: [
    { value: 'earth_l1', label: '地球 L1 の標準（Angel 2006 に近い）' },
    { value: 'mars_rapid', label: '火星向けの即応（1.05 AU）※参考値' },
    { value: CUSTOM, label: '（自由に設定）' },
  ],
  default: 'earth_l1',
  presets: (v) => scenarioPreset(v),
  customValue: CUSTOM,
}

// ---------------------------------------------------------------------------
// 出力（§5）

const reachLabel = { t_F1: '第1目標の遮光率の達成時刻', t_F2: '第2目標の遮光率の達成時刻', t_F100: '100% の達成時刻' }

const outputs: OutputDef[] = [
  { key: 'A_req', kind: 'number', label: '必要な膜の総面積', symbol: 'A_{req}', unit: km2, primary: true },
  { key: 'N_req', kind: 'number', label: '必要な機数', symbol: 'N_{req}', unit: unitDefs.count, primary: true },
  {
    key: 'M_depart',
    kind: 'number',
    label: '総質量（出発時）',
    symbol: 'M_{depart}',
    unit: mass,
    primary: true,
    description: '推進剤と輸送機を含む',
    visibleWhen: isBuild,
  },
  { key: 'M_station', kind: 'number', label: '総質量（機能位置）', symbol: 'M_{station}', unit: mass, primary: true, visibleWhen: isBuild },
  {
    key: 'M_total',
    kind: 'number',
    label: '総質量',
    symbol: 'M_{total}',
    unit: mass,
    primary: true,
    description: '即応群（横移動の推進剤を含む）と追加群（減速の推進剤を含む）の合計',
    visibleWhen: isStandby,
  },
  { key: 'd', kind: 'number', label: '機能位置（天体からの距離）', symbol: 'd', unit: km, primary: true },
  { key: 'r_s', kind: 'number', label: '機能位置（太陽からの距離）', symbol: 'r_s', unit: au, primary: true },
  { key: 't_rap', kind: 'number', label: '即応群の応答時間', symbol: 't_{rap}', unit: days, primary: true, visibleWhen: isStandby },
  { key: 't_min', kind: 'number', label: '追加群の最も早い到着', symbol: 't_{min}', unit: days, primary: true, visibleWhen: isStandby },
  { key: 'N_rap', kind: 'number', label: '即応群の機数', symbol: 'N_{rap}', unit: unitDefs.count, primary: true, visibleWhen: isStandby },
  { key: 'N_res', kind: 'number', label: '追加群の機数', symbol: 'N_{res}', unit: unitDefs.count, primary: true, visibleWhen: isStandby },
  { key: 'F_t1', kind: 'number', label: '第1目標の日数での遮光率', symbol: 'F(t_1)', unit: ratio, primary: true, visibleWhen: isStandby },
  { key: 'F_t2', kind: 'number', label: '第2目標の日数での遮光率', symbol: 'F(t_2)', unit: ratio, primary: true, visibleWhen: isStandby },

  // 時間変化
  {
    key: 'series_build',
    kind: 'series',
    group: 'series',
    label: '減光率の時間変化',
    symbol: 'f(t)',
    unit: ratio,
    seriesX: { label: '最初の出発からの時間', unit: years },
    visibleWhen: isBuild,
  },
  {
    key: 'series_standby',
    kind: 'series',
    group: 'series',
    label: '減光率の時間変化',
    symbol: 'f(t)',
    unit: ratio,
    seriesX: { label: '要請からの時間', unit: days },
    visibleWhen: isStandby,
  },

  // 機能位置と光圧
  {
    key: 'beta_u',
    kind: 'number',
    group: 'place',
    label: 'シェードの光圧の強さ',
    symbol: '\\beta_u',
    unit: unitDefs.none,
    description: '光圧による加速度 ÷ 太陽の重力。大きいほど太陽と反対向きに強く押される',
  },
  { key: 'beta_req', kind: 'number', group: 'place', label: 'この位置で止まるのに必要な光圧の強さ', symbol: '\\beta_{req}', unit: unitDefs.none },
  {
    key: 'sigma_max',
    kind: 'number',
    group: 'place',
    label: '面密度の上限（光圧だけで止まれる）',
    symbol: '\\sigma_{max}',
    unit: unitDefs.filmDensity,
    description: '機体全体の面密度がこれ以下なら、推進なしでこの位置に止まれる',
  },
  { key: 'sigma_tot', kind: 'number', group: 'place', label: '機体全体の面密度', symbol: '\\sigma_{tot}', unit: unitDefs.filmDensity },
  { key: 'k', kind: 'number', group: 'place', label: '光圧係数', symbol: 'k', unit: unitDefs.none, description: 'すべて反射すると 2、すべて吸収すると 1' },
  {
    key: 'k_eff',
    kind: 'number',
    group: 'place',
    label: '調整後の光圧係数',
    symbol: 'k_{eff}',
    unit: unitDefs.none,
    description: '反射率を下げて光圧を弱め、この位置に合わせたときの値',
    visibleWhen: (i) => i.position === 'rs' || i.position === 'd',
  },
  {
    key: 'a_hold',
    kind: 'number',
    group: 'place',
    label: '電気推進で押し続ける加速度',
    symbol: 'a_{hold}',
    unit: unitDefs.acceleration,
    visibleWhen: (i) => isSelf(i) && hasEp(i),
  },
  { key: 'd_L1', kind: 'number', group: 'place', label: '参考：L1 の天体からの距離', symbol: 'd_{L1}', unit: km },

  // 遮光
  { key: 'rho', kind: 'number', group: 'geom', label: '天体の位置での影（半影）の半径', symbol: '\\rho', unit: km },
  {
    key: 'eta_geom',
    kind: 'number',
    group: 'geom',
    label: '遮った光のうち天体に当たる割合',
    symbol: '\\eta_{geom}',
    unit: ratio,
    description: '影が天体より大きく広がると下がり、その分だけ膜が多く要る',
  },
  { key: 'area_vs_L1', kind: 'number', group: 'geom', label: 'L1 に置いた場合との面積の比', unit: times },
  { key: 'b', kind: 'number', group: 'geom', label: '膜が光を遮る割合', symbol: 'b', unit: ratio },

  // 1基
  { key: 'm_dry', kind: 'number', group: 'unit', label: '1基の乾燥質量（推進剤を除く）', symbol: 'm_{dry}', unit: mass },
  { key: 'M_ep', kind: 'number', group: 'unit', label: '1基の電気推進系の質量', symbol: 'M_{ep}', unit: mass, visibleWhen: shadeEp },
  {
    key: 'P_ep',
    kind: 'number',
    group: 'unit',
    label: '電気推進の電力（1基あたり）',
    symbol: 'P_{ep}',
    unit: kW,
    description: '輸送機で運ぶときは、シェード1基分の輸送機の電力',
    visibleWhen: (i) => hasEp(i) || isCarrier(i),
  },

  // 建設展開
  { key: 'a_sail', kind: 'number', group: 'build', label: '移動中の帆の加速度', symbol: 'a_{sail}', unit: unitDefs.acceleration, visibleWhen: (i) => isSelf(i) && hasSail(i) },
  { key: 'dv_sail', kind: 'number', group: 'build', label: 'Δv の内訳：帆', symbol: '\\Delta v_{sail}', unit: kms, visibleWhen: isSelf },
  { key: 'dv_ep', kind: 'number', group: 'build', label: 'Δv の内訳：電気推進', symbol: '\\Delta v_{ep}', unit: kms },
  { key: 'dv_keep', kind: 'number', group: 'build', label: '維持に必要な Δv', symbol: '\\Delta v_{keep}', unit: kms, visibleWhen: (i) => isSelf(i) && hasEp(i) },
  { key: 'F_ep', kind: 'number', group: 'build', label: '電気推進の推力（1基あたり）', symbol: 'F_{ep}', unit: unitDefs.force, visibleWhen: (i) => hasEp(i) || isCarrier(i) },
  { key: 'm_prop', kind: 'number', group: 'build', label: '推進剤（1基あたり）', symbol: 'm_{prop}', unit: mass },
  { key: 'm0', kind: 'number', group: 'build', label: '出発時の質量（1基あたり）', symbol: 'm_0', unit: mass, description: '輸送機で運ぶときは、輸送機の分を含む' },
  { key: 'prop_fraction', kind: 'number', group: 'build', label: '推進剤の割合', unit: ratio },

  // 待機・応答
  { key: 's', kind: 'number', group: 'standby', label: '即応群の移動距離', symbol: 's', unit: km },
  { key: 'a_lat', kind: 'number', group: 'standby', label: '即応群の横向きの加速度', symbol: 'a_{lat}', unit: unitDefs.acceleration },
  { key: 'm_rap', kind: 'number', group: 'standby', label: '即応群1基の質量（推進剤を含む）', symbol: 'm_{rap}', unit: mass },
  { key: 'V', kind: 'number', group: 'standby', label: '追加群の待機軌道と機能位置の速度の差', symbol: 'V', unit: kms },
  { key: 'a_br_sail', kind: 'number', group: 'standby', label: '追加群の減速の加速度：帆', symbol: 'a_{br}', unit: unitDefs.acceleration, visibleWhen: hasSail },
  { key: 'a_br_ep', kind: 'number', group: 'standby', label: '追加群の減速の加速度：電気推進', symbol: 'a_{br}', unit: unitDefs.acceleration, visibleWhen: hasEp },
  { key: 'dv_ep_br', kind: 'number', group: 'standby', label: '追加群の減速の Δv（電気推進）', symbol: '\\Delta v_{ep,br}', unit: kms, visibleWhen: hasEp },
  { key: 'm0_res', kind: 'number', group: 'standby', label: '追加群1基の質量（推進剤を含む）', symbol: 'm_{0,res}', unit: mass },
  { key: 'res_ratio', kind: 'number', group: 'standby', label: '追加群の機数 ÷ 必要な機数', unit: times },
  { key: 'total_ratio', kind: 'number', group: 'standby', label: '全体の機数 ÷ 必要な機数', unit: times },
  { key: 'rap_share', kind: 'number', group: 'standby', label: '即応群の割合', unit: ratio },
  ...(Object.keys(reachLabel) as (keyof typeof reachLabel)[]).map(
    (key): OutputDef => ({ key, kind: 'number', group: 'standby', label: reachLabel[key], unit: days, noteKey: `${key}_note`, visibleWhen: isStandby }),
  ),
  { key: 'A_rap', kind: 'number', group: 'standby', label: '展張時の総面積：即応群', unit: km2 },
  { key: 'A_all', kind: 'number', group: 'standby', label: '展張時の総面積：全体', unit: km2 },
  {
    key: 'replenish',
    kind: 'number',
    group: 'standby',
    label: '劣化の補充の必要数（機能中）',
    unit: fixedUnit('基/年'),
    visibleWhen: (i) => Number(i.lambda_mm) > 0,
  },
  {
    key: 'replenish_rap',
    kind: 'number',
    group: 'standby',
    label: '劣化の補充の必要数（待機中の即応群）',
    unit: fixedUnit('基/年'),
    visibleWhen: (i) => Number(i.lambda_mm) > 0,
  },
]

/** サンシェード・展開軌道モジュール（仕様書3(検証版) §3、§5、§6） */
export const sunshade: SimDefinition = {
  id: 'sunshade',
  version: 1,
  collapsibleGroups: true,
  groups: [
    { id: 'scenario', label: 'シナリオ' },
    { id: 'target', label: '対象天体' },
    { id: 'goal', label: '目標' },
    { id: 'position', label: '機能位置' },
    { id: 'shade', label: 'シェード衛星（1基）' },
    { id: 'optics', label: '膜の光学特性', parent: 'shade' },
    { id: 'cell', label: 'ソーラー電力セイル', parent: 'shade', visibleWhen: isPowerSail },
    { id: 'prop', label: '推進' },
    { id: 'operation', label: '運用の形' },
    { id: 'build', label: '建設展開', visibleWhen: isBuild },
    { id: 'standby', label: '待機・応答', visibleWhen: isStandby },
    { id: 'sb_solve', label: '計算の向き', parent: 'standby' },
    { id: 'sb_goal', label: '目標', parent: 'standby' },
    { id: 'sb_config', label: '構成', parent: 'standby' },
    { id: 'sb_cond', label: '即応群・追加群の条件', parent: 'standby' },
  ],
  outputGroups: [
    { id: 'series', label: '時間変化' },
    { id: 'place', label: '機能位置と光圧' },
    { id: 'geom', label: '遮光' },
    { id: 'unit', label: '1基の質量と推進' },
    { id: 'build', label: '建設展開', visibleWhen: isBuild },
    { id: 'standby', label: '待機・応答', visibleWhen: isStandby },
  ],
  inputs: [scenario, ...baseInputs],
  outputs,
  defaultGraph: { x: 'sigma_film', y: 'A_req' },
  messages: {
    'optics-sum': '反射率、吸収率、素通しの割合の合計は 100% 以下にしてください',
    'deploy-range': '展開の期間は、1基の移動時間より長くしてください',
    'goal-order': '第1目標の遮光率は、第2目標以下にしてください',
    'rs-range': '太陽からの距離は、天体の公転軌道の半径より小さくしてください',
    'd-range': '天体からの距離は、天体の公転軌道の半径より小さくしてください',
    'no-balance': '光圧が強すぎて、太陽と天体の間で止まれる点がありません。面密度を上げるか、距離を指定してください',
    'too-heavy': 'シェードが重すぎます。この位置で止まるには、機体全体の面密度を {sigma} g/m² 以下にしてください',
    'keff-below-min': '光圧が強すぎて、反射率の調整では合わせられません',
    'carrier-hold': '輸送機で運んだシェードは推進器を持たないため、この位置には留まれません',
    'l1-needs-ep': 'L1 に留まるには、光圧の分を電気推進で押し続ける必要があります。建設展開で、電気推進を持つ方式で各機が自力で移動する設定にしてください',
    'sail-too-slow': '帆の力が足りません。最短の移動時間は {days} 日です',
    'ep-too-weak': '膜の太陽電池の電力では、必要な推力が出せません。太陽電池で覆う割合を増やすか、移動時間を延ばしてください',
    'no-convergence': '必要な推力・Δv が大きすぎて、機体が成り立ちません',
    'no-lateral': '横に移動する力がありません（帆の横向きの力の割合が 0 で、電気推進もありません）',
    'rap-too-slow': '即応群が第1目標の日数までに着きません（応答時間 {days} 日）',
    'res-too-slow': '追加群が第2目標の日数までに着きません（最も早い到着 {days} 日）',
    'near-orbit': '{planet}の軌道の近くです。{planet}が近くを通るたびに、シェードの位置が重力で乱されます',
    'shades-other': '{planet}が群れの後ろ（太陽と反対側）を通るとき、{planet}に届く日射も一時的に約 {pct}% 減ります',
    'park-mismatch': '追加群の待機軌道と機能位置の距離が違います。太陽からの距離を変える分の Δv は含まれていません（到着はさらに遅れます）',
    'rap-goal': '即応群の応答時間が目標（{days} 日）を超えています',
    'beyond-tech': '現在の技術（実績・構想）より軽い膜を前提にしています',
    'goal-not-met': '目標の遮光率に届いていません',
    'mm-unset': '微小隕石による膜の劣化は含まれていません',
  },
  compute(inputs: Inputs): ComputeResult {
    const r = computeSunshade(toSunshadeInputs(inputs))
    const outputs: Record<string, OutputValue> = {}
    const o = r.outputs
    if (o) {
      for (const [k, v] of Object.entries(o)) {
        // 達成しない時刻（NaN）や、L1 での面密度の上限（β_req = 0）は出さない
        if (typeof v === 'number' && Number.isFinite(v)) outputs[k] = { kind: 'number', value: v }
      }
      for (const key of Object.keys(reachLabel)) {
        outputs[`${key}_note`] = { kind: 'text', value: Number.isFinite(o[key as keyof typeof reachLabel]) ? '' : '到達しない' }
      }
      const f = Number(inputs.f_target)
      const series: OutputValue = { kind: 'series', x: o.series.t, y: o.series.F.map((F) => f * F) }
      outputs[inputs.operation === 'build' ? 'series_build' : 'series_standby'] = series
    }
    return { outputs, warnings: r.warnings, errors: r.errors }
  },
}

export function toSunshadeInputs(i: Inputs): SunshadeInputs {
  const num = (k: string) => Number(i[k])
  return {
    R_p: num('R_p'),
    a_p: num('a_p'),
    GM_p: num('GM_p'),
    f_target: num('f_target'),
    position: String(i.position) as PositionMode,
    r_s: num('r_s'),
    d: num('d'),
    A_unit: num('A_unit'),
    sigma_film: num('sigma_film'),
    m_bus: num('m_bus'),
    R_s: num('R_s'),
    A_s: num('A_s'),
    T_s: num('T_s'),
    k_min: num('k_min'),
    f_cell: num('f_cell'),
    sigma_cell: num('sigma_cell'),
    eta_cell: num('eta_cell'),
    propulsion: String(i.propulsion) as Propulsion,
    Isp: num('Isp'),
    eta_ep: num('eta_ep'),
    alpha_ep: num('alpha_ep'),
    alpha_thr: num('alpha_thr'),
    a_ep_des: num('a_ep_des'),
    steer_auto: Boolean(i.steer_auto),
    eta_steer: num('eta_steer'),
    operation: String(i.operation) as Operation,
    transport: String(i.transport) as Transport,
    dv_tr: num('dv_tr'),
    t_tr: num('t_tr'),
    T_deploy: num('T_deploy'),
    T_keep: num('T_keep'),
    dv_sk: num('dv_sk'),
    mu_c: num('mu_c'),
    solve: String(i.solve) as Solve,
    t1: num('t1'),
    F1: num('F1'),
    t2: num('t2'),
    F2: num('F2'),
    t_rap_goal: num('t_rap_goal'),
    by_ratio: Boolean(i.by_ratio),
    N_rap: num('N_rap'),
    N_res: num('N_res'),
    N_total: num('N_total'),
    rap_ratio: num('rap_ratio'),
    m_gap: num('m_gap'),
    park_same: Boolean(i.park_same),
    r_park: num('r_park'),
    t_unf: num('t_unf'),
    lambda_mm: num('lambda_mm'),
    T_sim: num('T_sim'),
  }
}
