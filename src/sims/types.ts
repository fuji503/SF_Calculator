import type { UnitDef } from '../core/physics/units.ts'

/** モジュールの登録情報（メニューとトップ画面に使う） */
export interface SimModuleMeta {
  /** URL と JSON で使う ID（例：'solar-beaming'） */
  id: string
  /** 表示名 */
  name: string
  /** トップ画面とシム画面に出す短い説明 */
  summary: string
  /** アイコンの種類 */
  icon: SimIconKind
  /** 現行の仕様書（docs/ 内のファイル名） */
  specFile: string
}

export type SimIconKind = 'mirror' | 'laser' | 'shade' | 'power' | 'reactor'

// ---------------------------------------------------------------------------
// 入力（WebApp仕様書 §7.1）

export type CellValue = number | string | boolean
export type TableRow = Record<string, CellValue>
export type InputValue = CellValue | TableRow[]
/** 入力値。数値は内部単位（SI）で持つ */
export type Inputs = Record<string, InputValue>

interface ParamBase {
  key: string
  /** 表示名 */
  label: string
  /** 記号（例：'d_sun'）。KaTeX の書式 */
  symbol?: string
  /** 名前にマウスを乗せたときの短い説明 */
  description?: string
  /** 入力欄のまとまり（SimDefinition.groups の id） */
  group?: string
  /** false を返すと表示しない */
  visibleWhen?: (inputs: Inputs) => boolean
}

export interface NumberParam extends ParamBase {
  kind: 'number'
  unit: UnitDef
  default: number
  min?: number
  max?: number
  /** true なら min ちょうどは範囲外（> min） */
  minExclusive?: boolean
  /** true なら max ちょうどは範囲外（< max） */
  maxExclusive?: boolean
  integer?: boolean
  /** 範囲外のときのメッセージ。省略時は範囲から作る */
  rangeMessage?: string
  /** 省略時は常に入力。'output' を返すと、計算結果を表示する読み取り専用の欄になる */
  role?: (inputs: Inputs) => 'input' | 'output'
}

export interface EnumOption {
  value: string
  label: string
}

export interface EnumParam extends ParamBase {
  kind: 'enum'
  options: readonly EnumOption[]
  default: string
  /** その選択肢を選んだときに一括で入れる値 */
  presets?: Record<string, Inputs>
}

export interface BooleanParam extends ParamBase {
  kind: 'boolean'
  default: boolean
  /** [false のとき, true のとき] の表示 */
  labels?: readonly [string, string]
}

export interface TableColumn {
  key: string
  label: string
  kind: 'number' | 'enum' | 'boolean'
  unit?: UnitDef
  options?: readonly EnumOption[]
  min?: number
  max?: number
}

export interface TableParam extends ParamBase {
  kind: 'table'
  columns: readonly TableColumn[]
  minRows: number
  maxRows: number
  defaultRows: readonly TableRow[]
}

export type ParamDef = NumberParam | EnumParam | BooleanParam | TableParam

export interface ParamGroup {
  id: string
  label: string
}

// ---------------------------------------------------------------------------
// 出力

export type OutputValue =
  | { kind: 'number'; value: number }
  | { kind: 'text'; value: string }
  | { kind: 'table'; columns: string[]; rows: (number | string)[][] }
  | { kind: 'series'; x: number[]; y: number[] }

export interface OutputDef {
  key: string
  label: string
  symbol?: string
  kind: OutputValue['kind']
  unit?: UnitDef
  /** 主要な出力（大きめに表示し、折りたたみ時のサマリーにも出す） */
  primary?: boolean
  description?: string
}

/** 計算のメッセージ。文言はモジュールの messages から code で引く */
export interface Message {
  code: string
  /** 関係する入力・出力のキー */
  keys?: string[]
  /** 警告のうち、注意を促すだけのもの */
  level?: 'info'
}

export interface ComputeResult {
  /** 出力になったパラメータも同じキーで入れる */
  outputs: Record<string, OutputValue>
  /** 警告（計算は続ける） */
  warnings: Message[]
  /** エラー（出力は無効） */
  errors: Message[]
}

// ---------------------------------------------------------------------------
// モジュール定義

export interface SimDefinition {
  id: string
  /** JSON の互換性のためのバージョン */
  version: number
  groups: readonly ParamGroup[]
  inputs: readonly ParamDef[]
  outputs: readonly OutputDef[]
  /** メッセージの code → 文言 */
  messages: Record<string, string>
  /** 新しいカードのグラフの軸（入力のキー、出力のキー） */
  defaultGraph: { x: string; y: string }
  /** 純粋関数。入力は範囲チェック済みとは限らない */
  compute: (inputs: Inputs) => ComputeResult
  /** 古いバージョンの JSON の入力を変換する */
  migrate?: (inputs: Inputs, fromVersion: number) => Inputs
}
