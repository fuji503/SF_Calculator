import { solarBeaming } from './solar-beaming/definition.ts'
import type { SimDefinition } from './types.ts'

/** 計算が実装済みのモジュール。ID → 定義 */
export const simDefinitions: Readonly<Record<string, SimDefinition>> = {
  [solarBeaming.id]: solarBeaming,
}
