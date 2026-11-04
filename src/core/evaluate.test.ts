import { describe, expect, it } from 'vitest'
import { simDefinitions } from '../sims/definitions.ts'
import { simModules } from '../sims/registry.ts'
import { solarBeaming } from '../sims/solar-beaming/definition.ts'
import { checkNumber, commonMessages, defaultInputs, evaluate, isVisible, paramRole, validateInputs } from './evaluate.ts'

describe('モジュール定義の共通チェック', () => {
  for (const def of Object.values(simDefinitions)) {
    describe(def.id, () => {
      it('レジストリに登録されている', () => {
        expect(simModules.some((m) => m.id === def.id)).toBe(true)
      })

      it('入力と出力のキーが重複しない', () => {
        const inKeys = def.inputs.map((p) => p.key)
        const outKeys = def.outputs.map((o) => o.key)
        expect(new Set(inKeys).size).toBe(inKeys.length)
        expect(new Set(outKeys).size).toBe(outKeys.length)
      })

      it('初期値は範囲内で、エラーなく計算できる', () => {
        const inputs = defaultInputs(def)
        expect(validateInputs(def, inputs)).toEqual({})
        const r = evaluate(def, inputs)
        expect(r.errors).toEqual([])
        for (const o of def.outputs) if (isVisible(o, inputs)) expect(r.outputs[o.key]).toBeDefined()
      })

      it('出力になるパラメータは、計算結果に同じキーで入る', () => {
        const inputs = defaultInputs(def)
        const r = evaluate(def, inputs)
        for (const p of def.inputs) {
          if (isVisible(p, inputs) && paramRole(p, inputs) === 'output') expect(r.outputs[p.key]).toBeDefined()
        }
      })

      it('グループの指定が定義と合っている', () => {
        const groups = new Set(def.groups.map((g) => g.id))
        for (const p of def.inputs) if (p.group) expect(groups.has(p.group)).toBe(true)
      })
    })
  }
})

describe('checkNumber', () => {
  const N = solarBeaming.inputs.find((p) => p.key === 'N')!
  const D = solarBeaming.inputs.find((p) => p.key === 'D')!
  const theta = solarBeaming.inputs.find((p) => p.key === 'theta_i')!

  it('整数と範囲', () => {
    if (N.kind !== 'number' || D.kind !== 'number' || theta.kind !== 'number') throw new Error()
    expect(checkNumber(N, 1.5)).toBe('整数を入力してください')
    expect(checkNumber(N, 0)).not.toBeNull()
    expect(checkNumber(D, 0)).toBe('正の値を入力してください')
    expect(checkNumber(D, Number.NaN)).toBe('数値を入力してください')
    expect(checkNumber(theta, Math.PI / 2)).toBe('入射角が90°以上では光を反射できません')
    expect(checkNumber(theta, 0)).toBeNull()
  })
})

describe('evaluate', () => {
  it('不正な入力は計算せずにエラーにする', () => {
    const inputs = { ...defaultInputs(solarBeaming), D: -1 }
    const r = evaluate(solarBeaming, inputs)
    expect(r.errors).toEqual([{ code: 'invalid-input', keys: ['D'] }])
  })

  it('表示されていない入力はチェックしない', () => {
    // 宇宙→宇宙では天頂角の欄を出さないので、範囲外でも計算する
    const inputs = { ...defaultInputs(solarBeaming), atm_case: 'space', z_t: 2 }
    expect(evaluate(solarBeaming, inputs).errors).toEqual([])
  })

  it('出力になっている入力はチェックしない', () => {
    const inputs = { ...defaultInputs(solarBeaming), I_sun_auto: true, I_sun: -5 }
    expect(evaluate(solarBeaming, inputs).errors).toEqual([])
  })

  it('モジュールが返す code には文言がある', () => {
    const inputs = { ...defaultInputs(solarBeaming), atm_case: 'target_surface', tau: 5, z_t: 1.4, theta_i: 1, d: 50 }
    const r = evaluate(solarBeaming, inputs)
    for (const m of [...r.warnings, ...r.errors]) {
      expect(solarBeaming.messages[m.code] ?? commonMessages[m.code]).toBeDefined()
    }
    expect(r.warnings.length).toBeGreaterThanOrEqual(3)
  })
})

describe('implementedSims', () => {
  it('definitions.ts と一致する', async () => {
    const { implementedSims } = await import('../sims/implemented.ts')
    expect([...implementedSims].sort()).toEqual(Object.keys(simDefinitions).sort())
  })
})
