import type { SimDefinition } from './types.ts'

/**
 * モジュールの定義を、使うときに読み込む（モジュールごとに別のファイルに分ける）。
 * 画面と Worker の両方で使う。実装済みのモジュールと一致することはテストで確かめる。
 */
export const simLoaders: Readonly<Record<string, () => Promise<SimDefinition>>> = {
  'solar-beaming': () => import('./solar-beaming/definition.ts').then((m) => m.solarBeaming),
  'laser-beaming': () => import('./laser-beaming/definition.ts').then((m) => m.laserBeaming),
  sunshade: () => import('./sunshade/definition.ts').then((m) => m.sunshade),
  'power-thermal': () => import('./power-thermal/definition.ts').then((m) => m.powerThermal),
}

const cache = new Map<string, Promise<SimDefinition>>()

/** 定義を読み込む（一度読んだものは使い回す）。未実装の ID では null */
export function loadDefinition(id: string): Promise<SimDefinition> | null {
  const load = simLoaders[id]
  if (!load) return null
  let p = cache.get(id)
  if (!p) {
    p = load()
    cache.set(id, p)
  }
  return p
}
