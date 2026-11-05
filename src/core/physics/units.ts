import { AU } from './constants.ts'

/**
 * 表示単位（WebApp仕様書 §5.4）。
 * 内部の値 = 表示の値 × factor + offset。
 */
export interface UnitOption {
  id: string
  label: string
  factor: number
  offset?: number
}

/** パラメータの単位。options の先頭が内部単位（factor = 1） */
export interface UnitDef {
  options: readonly UnitOption[]
  /** 初期の表示単位の id。省略時は options[0] */
  defaultId?: string
}

export function toInternal(value: number, unit: UnitOption): number {
  return value * unit.factor + (unit.offset ?? 0)
}

export function fromInternal(value: number, unit: UnitOption): number {
  return (value - (unit.offset ?? 0)) / unit.factor
}

/** id から表示単位を探す。見つからないときは初期の表示単位 */
export function findUnit(def: UnitDef, id: string | undefined): UnitOption {
  return (
    def.options.find((u) => u.id === id) ??
    def.options.find((u) => u.id === def.defaultId) ??
    def.options[0]
  )
}

const DEG = Math.PI / 180
const DAY = 86_400
const YEAR = 365.25 * DAY

/** 単位の選択肢の部品。内部単位を先頭に置く */
export const U = {
  m: { id: 'm', label: 'm', factor: 1 },
  km: { id: 'km', label: 'km', factor: 1e3 },
  au: { id: 'AU', label: 'AU', factor: AU },
  um: { id: 'um', label: 'µm', factor: 1e-6 },
  nm: { id: 'nm', label: 'nm', factor: 1e-9 },
  rad: { id: 'rad', label: 'rad', factor: 1 },
  mrad: { id: 'mrad', label: 'mrad', factor: 1e-3 },
  urad: { id: 'urad', label: 'µrad', factor: 1e-6 },
  nrad: { id: 'nrad', label: 'nrad', factor: 1e-9 },
  arcsec: { id: 'arcsec', label: '秒角', factor: Math.PI / (180 * 3600) },
  deg: { id: 'deg', label: '°', factor: DEG },
  s: { id: 's', label: 's', factor: 1 },
  ms: { id: 'ms', label: 'ms', factor: 1e-3 },
  min: { id: 'min', label: '分', factor: 60 },
  h: { id: 'h', label: '時間', factor: 3600 },
  day: { id: 'day', label: '日', factor: DAY },
  week: { id: 'week', label: '週', factor: 7 * DAY },
  month: { id: 'month', label: '月', factor: YEAR / 12 },
  year: { id: 'year', label: '年', factor: YEAR },
  K: { id: 'K', label: 'K', factor: 1 },
  degC: { id: 'degC', label: '℃', factor: 1, offset: 273.15 },
  m2: { id: 'm2', label: 'm²', factor: 1 },
  kgm2: { id: 'kg/m2', label: 'kg/m²', factor: 1 },
  km2: { id: 'km2', label: 'km²', factor: 1e6 },
  kg: { id: 'kg', label: 'kg', factor: 1 },
  t: { id: 't', label: 't', factor: 1e3 },
  W: { id: 'W', label: 'W', factor: 1 },
  kW: { id: 'kW', label: 'kW', factor: 1e3 },
  MW: { id: 'MW', label: 'MW', factor: 1e6 },
  GW: { id: 'GW', label: 'GW', factor: 1e9 },
  TW: { id: 'TW', label: 'TW', factor: 1e12 },
  Wm2: { id: 'W/m2', label: 'W/m²', factor: 1 },
  ratio: { id: 'ratio', label: '', factor: 1 },
  percent: { id: '%', label: '%', factor: 0.01 },
  Jkg: { id: 'J/kg', label: 'J/kg', factor: 1 },
  MJkg: { id: 'MJ/kg', label: 'MJ/kg', factor: 1e6 },
  kgs: { id: 'kg/s', label: 'kg/s', factor: 1 },
  kgh: { id: 'kg/h', label: 'kg/h', factor: 1 / 3600 },
  kWm2: { id: 'kW/m2', label: 'kW/m²', factor: 1e3 },
  Wt: { id: 'Wt', label: 'Wt', factor: 1 },
  kWt: { id: 'kWt', label: 'kWt', factor: 1e3 },
  MWt: { id: 'MWt', label: 'MWt', factor: 1e6 },
  GWt: { id: 'GWt', label: 'GWt', factor: 1e9 },
  J: { id: 'J', label: 'J', factor: 1 },
  MJ: { id: 'MJ', label: 'MJ', factor: 1e6 },
  GJ: { id: 'GJ', label: 'GJ', factor: 1e9 },
  Wh: { id: 'Wh', label: 'Wh', factor: 3600 },
  kWh: { id: 'kWh', label: 'kWh', factor: 3.6e6 },
  MWh: { id: 'MWh', label: 'MWh', factor: 3.6e9 },
  m3: { id: 'm3', label: 'm³', factor: 1 },
  L: { id: 'L', label: 'L', factor: 1e-3 },
  JkgK: { id: 'J/(kg K)', label: 'J/(kg·K)', factor: 1 },
  kJkgK: { id: 'kJ/(kg K)', label: 'kJ/(kg·K)', factor: 1e3 },
  kJkg: { id: 'kJ/kg', label: 'kJ/kg', factor: 1e3 },
  Whkg: { id: 'Wh/kg', label: 'Wh/kg', factor: 3600 },
  Jm3: { id: 'J/m3', label: 'J/m³', factor: 1 },
  WhL: { id: 'Wh/L', label: 'Wh/L', factor: 3.6e6 },
  kgW: { id: 'kg/W', label: 'kg/W', factor: 1 },
  kgkWt: { id: 'kg/kWt', label: 'kg/kWt', factor: 1e-3 },
  kgkWe: { id: 'kg/kWe', label: 'kg/kWe', factor: 1e-3 },
  perS: { id: '1/s', label: '1/s', factor: 1 },
  pctDay: { id: '%/day', label: '%/日', factor: 0.01 / DAY },
  pctYear: { id: '%/year', label: '%/年', factor: 0.01 / YEAR },
  gm2: { id: 'g/m2', label: 'g/m²', factor: 1e-3 },
  mps: { id: 'm/s', label: 'm/s', factor: 1 },
  kms: { id: 'km/s', label: 'km/s', factor: 1e3 },
  kgkW: { id: 'kg/kW', label: 'kg/kW', factor: 1e-3 },
} as const satisfies Record<string, UnitOption>

/** 単位を1つだけ持つ（選べない）パラメータ用 */
export function fixedUnit(label: string): UnitDef {
  return { options: [{ id: label || '-', label, factor: 1 }] }
}

export const unitDefs = {
  none: fixedUnit(''),
  length: { options: [U.m, U.km, U.au] },
  lengthKm: { options: [U.m, U.km, U.au], defaultId: 'km' },
  angleDeg: { options: [U.rad, U.mrad, U.urad, U.deg], defaultId: 'deg' },
  angleSmall: { options: [U.rad, U.mrad, U.urad, U.deg], defaultId: 'urad' },
  angleTiny: { options: [U.rad, U.urad, U.nrad, U.arcsec], defaultId: 'urad' },
  wavelength: { options: [U.m, U.um, U.nm], defaultId: 'um' },
  lightTime: { options: [U.s, U.ms, U.min, U.h] },
  fraction: { options: [U.ratio, U.percent], defaultId: '%' },
  specificEnergy: { options: [U.Jkg, U.MJkg], defaultId: 'MJ/kg' },
  massFlow: { options: [U.kgs, U.kgh] },
  area: { options: [U.m2, U.km2] },
  power: { options: [U.W, U.kW, U.MW, U.GW, U.TW] },
  irradiance: { options: [U.Wm2, U.kWm2] },
  temperature: { options: [U.K, U.degC] },
  /** 温度差（℃に切り替えるとずれが入るので K だけ） */
  tempDiff: fixedUnit('K'),
  duration: { options: [U.s, U.min, U.h, U.day] },
  mass: { options: [U.kg, U.t] },
  energy: { options: [U.J, U.MJ, U.GJ, U.Wh, U.kWh, U.MWh] },
  volume: { options: [U.m3, U.L] },
  thermalPower: { options: [U.Wt, U.kWt, U.MWt, U.GWt] },
  specificHeat: { options: [U.JkgK, U.kJkgK], defaultId: 'kJ/(kg K)' },
  latentHeat: { options: [U.Jkg, U.kJkg], defaultId: 'kJ/kg' },
  batteryEnergy: { options: [U.Jkg, U.Whkg], defaultId: 'Wh/kg' },
  batteryDensity: { options: [U.Jm3, U.WhL], defaultId: 'Wh/L' },
  perThermalPower: { options: [U.kgW, U.kgkWt], defaultId: 'kg/kWt' },
  perElectricPower: { options: [U.kgW, U.kgkWe], defaultId: 'kg/kWe' },
  lossRate: { options: [U.perS, U.pctDay], defaultId: '%/day' },
  heatTransfer: fixedUnit('W/(m²·K)'),
  density: fixedUnit('kg/m³'),
  arealDensity: fixedUnit('kg/m²'),
  /** 膜のような軽いものの面密度 */
  filmDensity: { options: [U.kgm2, U.gm2], defaultId: 'g/m2' },
  durationLong: { options: [U.s, U.day, U.month, U.year] },
  velocity: { options: [U.mps, U.kms] },
  acceleration: fixedUnit('m/s²'),
  force: fixedUnit('N'),
  perPower: { options: [U.kgW, U.kgkW], defaultId: 'kg/kW' },
  yearlyLoss: { options: [U.perS, U.pctYear], defaultId: '%/year' },
  count: fixedUnit('基'),
  gravParam: fixedUnit('m³/s²'),
} as const satisfies Record<string, UnitDef>
