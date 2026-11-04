import { describe, expect, it } from 'vitest'
import { solarBeaming } from '../sims/solar-beaming/definition.ts'
import { defaultInputs } from './evaluate.ts'
import { duplicateCard, newCard, nextTitle, parseImport, safeFileName, toExportFile, type Card } from './storage.ts'

describe('カードの作成', () => {
  it('タイトルは連番', () => {
    const a = newCard(solarBeaming, [])
    expect(a.title).toBe('計算 1')
    const b = newCard(solarBeaming, [a, { ...a, title: '計算 7' }, { ...a, title: '火星へ' }])
    expect(b.title).toBe('計算 8')
    expect(nextTitle([])).toBe('計算 1')
  })

  it('複製は中身をコピーし、元と共有しない', () => {
    const a = newCard(solarBeaming, [])
    const b = duplicateCard(a)
    expect(b.title).toBe('計算 1のコピー')
    expect(b.id).not.toBe(a.id)
    expect(b.inputs).toEqual(a.inputs)
    b.inputs.D = 1
    expect(a.inputs.D).toBe(100)
  })
})

describe('JSON の保存と読込', () => {
  const card = (): Card => {
    const c = newCard(solarBeaming, [])
    return { ...c, title: '火星L1から艦艇へ', inputs: { ...c.inputs, N: 42 }, inputUnits: { d: 'AU' } }
  }

  it('保存したものを読み込むと同じ内容になる（id は新しくする）', () => {
    const c = card()
    const text = JSON.stringify(toExportFile(solarBeaming, [c]))
    const r = parseImport(solarBeaming, text)
    if (!r.ok) throw new Error(r.error)
    expect(r.cards).toHaveLength(1)
    const { id, ...rest } = r.cards[0]
    const { id: oldId, ...orig } = c
    expect(id).not.toBe(oldId)
    expect(rest).toEqual(orig)
  })

  it('出力値は保存しない', () => {
    const file = toExportFile(solarBeaming, [card()])
    expect(Object.keys(file.cards[0])).not.toContain('outputs')
    expect(Object.keys(file.cards[0].inputs)).not.toContain('E_target')
  })

  it('知らないパラメータは無視し、足りない・型の違うものは初期値で補う', () => {
    const file = toExportFile(solarBeaming, [card()])
    const raw = file.cards[0] as unknown as { inputs: Record<string, unknown> }
    raw.inputs.unknown = 5
    delete raw.inputs.rho
    raw.inputs.D = 'abc'
    raw.inputs.atm_case = 'nowhere'
    const r = parseImport(solarBeaming, JSON.stringify(file))
    if (!r.ok) throw new Error(r.error)
    const def = defaultInputs(solarBeaming)
    expect(r.cards[0].inputs.unknown).toBeUndefined()
    expect(r.cards[0].inputs.rho).toBe(def.rho)
    expect(r.cards[0].inputs.D).toBe(def.D)
    expect(r.cards[0].inputs.atm_case).toBe('space')
    expect(r.cards[0].inputs.N).toBe(42)
  })

  it('NaN（入力途中の不正な値）は初期値に戻す', () => {
    const c = card()
    c.inputs.d = Number.NaN
    const r = parseImport(solarBeaming, JSON.stringify(toExportFile(solarBeaming, [c])))
    if (!r.ok) throw new Error(r.error)
    expect(r.cards[0].inputs.d).toBe(defaultInputs(solarBeaming).d)
  })

  it('知らない単位や軸は初期値に戻す', () => {
    const c = card()
    const file = toExportFile(solarBeaming, [c])
    const raw = file.cards[0] as unknown as Record<string, Record<string, unknown>>
    raw.inputUnits.d = 'parsec'
    raw.graph.x = 'nope'
    raw.graph.y = 'E_target'
    const r = parseImport(solarBeaming, JSON.stringify(file))
    if (!r.ok) throw new Error(r.error)
    expect(r.cards[0].inputUnits.d).toBeUndefined()
    expect(r.cards[0].graph.x).toBe('d')
    expect(r.cards[0].graph.y).toEqual(['E_target'])
  })

  it('別のモジュールや別のアプリのファイルはエラー', () => {
    const file = toExportFile(solarBeaming, [card()])
    expect(parseImport(solarBeaming, JSON.stringify({ ...file, moduleId: 'sunshade' })).ok).toBe(false)
    expect(parseImport(solarBeaming, JSON.stringify({ ...file, app: 'other' })).ok).toBe(false)
    expect(parseImport(solarBeaming, '{not json').ok).toBe(false)
    expect(parseImport(solarBeaming, JSON.stringify({ ...file, formatVersion: 99 })).ok).toBe(false)
  })

  it('全件分のファイルは順番を保つ', () => {
    const a = { ...card(), title: 'A' }
    const b = { ...card(), title: 'B' }
    const r = parseImport(solarBeaming, JSON.stringify(toExportFile(solarBeaming, [a, b])))
    if (!r.ok) throw new Error(r.error)
    expect(r.cards.map((c) => c.title)).toEqual(['A', 'B'])
  })
})

describe('safeFileName', () => {
  it('使えない文字を置き換える', () => {
    expect(safeFileName('火星 L1/艦艇:A')).toBe('火星_L1_艦艇_A')
    expect(safeFileName('')).toBe('card')
  })
})
