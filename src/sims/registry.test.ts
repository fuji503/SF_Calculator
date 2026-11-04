import { describe, expect, it } from 'vitest'
import { findSimModule, simModules } from './registry.ts'

describe('simModules', () => {
  it('ID が重複しない', () => {
    const ids = simModules.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ID は URL に使える文字だけ', () => {
    for (const m of simModules) expect(m.id).toMatch(/^[a-z0-9-]+$/)
  })

  it('仕様書の5モジュールが登録されている', () => {
    expect(simModules.map((m) => m.id)).toEqual([
      'solar-beaming',
      'laser-beaming',
      'sunshade',
      'power-thermal',
      'reactor-shield',
    ])
  })

  it('ID で探せる', () => {
    expect(findSimModule('sunshade')?.name).toBe('サンシェード・展開軌道')
    expect(findSimModule('unknown')).toBeUndefined()
  })
})
