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
} as const satisfies Record<string, UnitDef>
