import { describe, expect, it } from 'vitest'
import { AU } from './constants.ts'
import { findUnit, fromInternal, toInternal, U, unitDefs, type UnitDef } from './units.ts'

describe('units', () => {
  it('内部単位との往復', () => {
    expect(toInternal(1000, U.km)).toBe(1e6)
    expect(fromInternal(1e6, U.km)).toBe(1000)
    expect(toInternal(1, U.au)).toBe(AU)
    expect(toInternal(180, U.deg)).toBeCloseTo(Math.PI, 15)
    expect(toInternal(100, U.urad)).toBeCloseTo(1e-4, 18)
  })

  it('温度はずれ（offset）も換算する', () => {
    expect(toInternal(0, U.degC)).toBe(273.15)
    expect(fromInternal(373.15, U.degC)).toBeCloseTo(100, 12)
  })

  it('各単位の先頭は内部単位', () => {
    for (const def of Object.values(unitDefs) as UnitDef[]) {
      expect(def.options[0].factor).toBe(1)
      expect(def.options[0].offset ?? 0).toBe(0)
    }
  })

  it('初期の表示単位を選ぶ', () => {
    expect(findUnit(unitDefs.lengthKm, undefined).id).toBe('km')
    expect(findUnit(unitDefs.lengthKm, 'AU').id).toBe('AU')
    expect(findUnit(unitDefs.lengthKm, 'nope').id).toBe('km')
  })
})
