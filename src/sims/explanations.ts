import { lazy, type ComponentType } from 'react'

/**
 * 各シミュレータの「パラメータや計算の解説」。数式のライブラリを含むので、解説を開いたときに読み込む。
 * 登録されているモジュールとそろっていることはテストで確かめる
 */
export const simExplanations: Readonly<Record<string, ComponentType>> = {
  'solar-beaming': lazy(() => import('./solar-beaming/explanation.tsx')),
  'laser-beaming': lazy(() => import('./laser-beaming/explanation.tsx')),
  sunshade: lazy(() => import('./sunshade/explanation.tsx')),
  'power-thermal': lazy(() => import('./power-thermal/explanation.tsx')),
  'reactor-shield': lazy(() => import('./reactor-shield/explanation.tsx')),
  crater: lazy(() => import('./crater/explanation.tsx')),
}
