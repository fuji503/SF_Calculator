/**
 * 計算が実装済みのモジュールの ID。
 * 定義（sims/definitions.ts）は計算の本体ごと遅れて読み込むので、画面の出し分けにはこちらを使う。
 * definitions.ts と一致することはテストで確かめる。
 */
export const implementedSims: ReadonlySet<string> = new Set(['solar-beaming', 'laser-beaming', 'sunshade', 'power-thermal', 'reactor-shield', 'crater', 'space-colony'])
