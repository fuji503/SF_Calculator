import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { simExplanations } from './explanations.ts'
import { simModules } from './registry.ts'

const modules = {
  'solar-beaming': () => import('./solar-beaming/explanation.tsx'),
  'laser-beaming': () => import('./laser-beaming/explanation.tsx'),
  sunshade: () => import('./sunshade/explanation.tsx'),
  'power-thermal': () => import('./power-thermal/explanation.tsx'),
  'reactor-shield': () => import('./reactor-shield/explanation.tsx'),
  crater: () => import('./crater/explanation.tsx'),
}

describe('パラメータや計算の解説', () => {
  it('すべてのシミュレータに解説がある', () => {
    expect(Object.keys(simExplanations).sort()).toEqual(simModules.map((m) => m.id).sort())
    expect(Object.keys(modules).sort()).toEqual(simModules.map((m) => m.id).sort())
  })

  for (const [id, load] of Object.entries(modules)) {
    it(`${id}：数式がすべて表示できる`, async () => {
      const { default: Explanation } = await load()
      const html = renderToString(createElement(Explanation))
      expect(html).toContain('katex')
      // KaTeX が読めない式は katex-error のクラスで赤く出る
      expect(html).not.toContain('katex-error')
    })
  }
})
