import { lazy, type ComponentType } from 'react'
import type { DiagramProps } from './types.ts'

/** 出力欄に出す図（モジュールごと。図を出すモジュールだけ登録する）。画面でだけ読み込む */
export const simDiagrams: Readonly<Record<string, ComponentType<DiagramProps>>> = {
  crater: lazy(() => import('./crater/diagram.tsx')),
}
