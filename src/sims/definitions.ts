import { crater } from './crater/definition.ts'
import { laserBeaming } from './laser-beaming/definition.ts'
import { powerThermal } from './power-thermal/definition.ts'
import { reactorShield } from './reactor-shield/definition.ts'
import { solarBeaming } from './solar-beaming/definition.ts'
import { sunshade } from './sunshade/definition.ts'
import type { SimDefinition } from './types.ts'

/** 計算が実装済みのモジュール。ID → 定義 */
export const simDefinitions: Readonly<Record<string, SimDefinition>> = {
  [solarBeaming.id]: solarBeaming,
  [laserBeaming.id]: laserBeaming,
  [sunshade.id]: sunshade,
  [powerThermal.id]: powerThermal,
  [reactorShield.id]: reactorShield,
  [crater.id]: crater,
}
