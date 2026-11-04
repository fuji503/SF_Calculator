/**
 * モジュールの登録情報（WebApp仕様書 §7.1）。
 * 入出力の定義と計算関数は M3 以降で SimModule に追加する。
 */
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
