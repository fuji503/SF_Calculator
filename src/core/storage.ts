/**
 * 計算結果カードのデータと、その保存・読込（WebApp仕様書 §5）。
 * - 画面のリロードでは残し、タブを閉じたら消える：sessionStorage
 * - 長期保存：JSON エクスポート
 */
import type { Inputs, SimDefinition, TableRow } from '../sims/types.ts'
import { defaultInputs } from './evaluate.ts'
import { MAX_POINTS, MIN_POINTS, defaultGraph, type AxisScale, type GraphSettings } from './sweep.ts'

export interface Card {
  id: string
  title: string
  /** 内部単位（SI）の入力値 */
  inputs: Inputs
  /** 入力の表示単位の id */
  inputUnits: Record<string, string>
  /** 出力の表示単位の id */
  outputUnits: Record<string, string>
  graph: GraphSettings
  /** closed：閉じている入力・出力のまとまりの id（初期状態はすべて開く） */
  ui: { ioOpen: boolean; graphOpen: boolean; closed: string[] }
}

export const APP_ID = 'sf-infra-simulator'
export const FORMAT_VERSION = 1

export interface ExportFile {
  app: typeof APP_ID
  formatVersion: number
  exportedAt: string
  moduleId: string
  moduleVersion: number
  cards: Omit<Card, 'id'>[]
}

export function newCardId(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`
}

/** 「計算 1」「計算 2」… の次の番号のタイトル */
export function nextTitle(cards: readonly Card[]): string {
  let max = 0
  for (const c of cards) {
    const m = /^計算 (\d+)$/.exec(c.title)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `計算 ${max + 1}`
}

export function newCard(def: SimDefinition, cards: readonly Card[]): Card {
  const inputs = defaultInputs(def)
  return {
    id: newCardId(),
    title: nextTitle(cards),
    inputs,
    inputUnits: {},
    outputUnits: {},
    graph: defaultGraph(def, inputs),
    ui: { ioOpen: true, graphOpen: true, closed: [] },
  }
}

export function duplicateCard(card: Card): Card {
  return {
    ...structuredClone(card),
    id: newCardId(),
    title: `${card.title}のコピー`,
  }
}

// ---------------------------------------------------------------------------
// 読み込んだデータを、今のモジュール定義に合う形に直す

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** 知らないパラメータは無視し、足りない・型の違うパラメータは初期値で補う（§5.2） */
export function normalizeInputs(def: SimDefinition, raw: unknown): Inputs {
  const src = isRecord(raw) ? raw : {}
  const inputs = defaultInputs(def)
  for (const p of def.inputs) {
    const v = src[p.key]
    switch (p.kind) {
      case 'number':
        // NaN は JSON では null になる。入力途中の不正な値は初期値に戻す
        if (typeof v === 'number' && Number.isFinite(v)) inputs[p.key] = v
        break
      case 'boolean':
        if (typeof v === 'boolean') inputs[p.key] = v
        break
      case 'enum':
        if (typeof v === 'string' && p.options.some((o) => o.value === v)) inputs[p.key] = v
        break
      case 'table':
        if (Array.isArray(v) && v.length >= p.minRows && v.length <= p.maxRows && v.every(isRecord)) {
          inputs[p.key] = v.map((row, i) => {
            const fallback = p.defaultRows[Math.min(i, p.defaultRows.length - 1)] ?? {}
            const out: TableRow = { ...fallback }
            for (const col of p.columns) {
              const cell = row[col.key]
              if (col.kind === 'number' ? typeof cell === 'number' && Number.isFinite(cell) : typeof cell === (col.kind === 'enum' ? 'string' : 'boolean'))
                out[col.key] = cell as TableRow[string]
            }
            return out
          })
        }
        break
    }
  }
  return inputs
}

function normalizeUnits(def: SimDefinition, raw: unknown, side: 'inputs' | 'outputs'): Record<string, string> {
  const src = isRecord(raw) ? raw : {}
  const out: Record<string, string> = {}
  const defs = side === 'inputs' ? def.inputs : def.outputs
  for (const p of defs) {
    const unit = 'unit' in p ? p.unit : undefined
    const id = src[p.key]
    if (unit && typeof id === 'string' && unit.options.some((u) => u.id === id)) out[p.key] = id
  }
  return out
}

const isScale = (v: unknown): v is AxisScale => v === 'linear' || v === 'log'

function normalizeGraph(def: SimDefinition, inputs: Inputs, raw: unknown): GraphSettings {
  const src = isRecord(raw) ? raw : {}
  const xKey = typeof src.x === 'string' && def.inputs.some((p) => p.key === src.x && p.kind === 'number') ? src.x : undefined
  const g = defaultGraph(def, inputs, xKey)
  if (xKey) {
    if (typeof src.xMin === 'number' && Number.isFinite(src.xMin)) g.xMin = src.xMin
    if (typeof src.xMax === 'number' && Number.isFinite(src.xMax)) g.xMax = src.xMax
    if (isScale(src.xScale)) g.xScale = src.xScale
  }
  if (typeof src.points === 'number' && Number.isFinite(src.points))
    g.points = Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(src.points)))
  const ys = (Array.isArray(src.y) ? src.y : [src.y]).filter(
    (k): k is string =>
      typeof k === 'string' && (def.outputs.some((o) => o.key === k) || def.inputs.some((p) => p.key === k)),
  )
  if (ys.length > 0) g.y = ys
  if (isScale(src.yScale)) g.yScale = src.yScale
  return g
}

export function normalizeCard(def: SimDefinition, raw: unknown, fallbackTitle: string): Card {
  const src = isRecord(raw) ? raw : {}
  const inputs = normalizeInputs(def, src.inputs)
  const ui = isRecord(src.ui) ? src.ui : {}
  return {
    id: newCardId(),
    title: typeof src.title === 'string' && src.title.trim() !== '' ? src.title : fallbackTitle,
    inputs,
    inputUnits: normalizeUnits(def, src.inputUnits, 'inputs'),
    outputUnits: normalizeUnits(def, src.outputUnits, 'outputs'),
    graph: normalizeGraph(def, inputs, src.graph),
    ui: {
      ioOpen: typeof ui.ioOpen === 'boolean' ? ui.ioOpen : true,
      graphOpen: typeof ui.graphOpen === 'boolean' ? ui.graphOpen : true,
      closed: Array.isArray(ui.closed) ? ui.closed.filter((x): x is string => typeof x === 'string') : [],
    },
  }
}

// ---------------------------------------------------------------------------
// JSON エクスポートとインポート

export function toExportFile(def: SimDefinition, cards: readonly Card[], now = new Date()): ExportFile {
  return {
    app: APP_ID,
    formatVersion: FORMAT_VERSION,
    exportedAt: now.toISOString(),
    moduleId: def.id,
    moduleVersion: def.version,
    cards: cards.map(({ id: _id, ...rest }) => rest),
  }
}

export type ImportResult = { ok: true; cards: Card[] } | { ok: false; error: string }

/** JSON の文字列からカードを読む。1枚分も全件分も同じ形式（§5.2） */
export function parseImport(def: SimDefinition, text: string): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'JSON として読めないファイルです' }
  }
  if (!isRecord(data) || data.app !== APP_ID || !Array.isArray(data.cards)) {
    return { ok: false, error: 'このアプリで保存したファイルではありません' }
  }
  if (typeof data.formatVersion !== 'number' || data.formatVersion > FORMAT_VERSION) {
    return { ok: false, error: '新しいバージョンのアプリで保存されたファイルです' }
  }
  if (data.moduleId !== def.id) {
    return { ok: false, error: `別のシミュレータ（${String(data.moduleId)}）のファイルです` }
  }
  const moduleVersion = typeof data.moduleVersion === 'number' ? data.moduleVersion : 1
  if (moduleVersion > def.version) {
    return { ok: false, error: '新しいバージョンのアプリで保存されたファイルです' }
  }
  const cards: Card[] = []
  for (const raw of data.cards) {
    let src = raw
    if (moduleVersion < def.version && def.migrate && isRecord(raw)) {
      src = { ...raw, inputs: def.migrate(isRecord(raw.inputs) ? (raw.inputs as Inputs) : {}, moduleVersion) }
    }
    cards.push(normalizeCard(def, src, `計算 ${cards.length + 1}`))
  }
  if (cards.length === 0) return { ok: false, error: 'ファイルにカードがありません' }
  return { ok: true, cards }
}

// ---------------------------------------------------------------------------
// sessionStorage

const storageKey = (moduleId: string) => `${APP_ID}:cards:${moduleId}`

export function loadSession(def: SimDefinition): Card[] | null {
  try {
    const text = sessionStorage.getItem(storageKey(def.id))
    if (!text) return null
    const r = parseImport(def, text)
    if (!r.ok) return null
    // 保存していた id を引き継ぐ（グラフの計算結果の対応づけのため）
    const data = JSON.parse(text) as { cards: { id?: unknown }[] }
    return r.cards.map((c, i) => {
      const id = data.cards[i]?.id
      return typeof id === 'string' ? { ...c, id } : c
    })
  } catch {
    return null
  }
}

export function saveSession(def: SimDefinition, cards: readonly Card[]): void {
  try {
    const file = { ...toExportFile(def, []), cards }
    sessionStorage.setItem(storageKey(def.id), JSON.stringify(file))
  } catch {
    // 容量超過やプライベートモードでは保存しない（JSON エクスポートは使える）
  }
}

// ---------------------------------------------------------------------------
// ファイル名

/** ファイル名に使えない文字を置き換える */
export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'card'
}

export function timestamp(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
}
