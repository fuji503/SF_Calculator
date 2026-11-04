import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

const cache = new Map<string, string>()

function render(tex: string): string {
  let html = cache.get(tex)
  if (html === undefined) {
    html = katex.renderToString(tex, { throwOnError: false, output: 'html' })
    cache.set(tex, html)
  }
  return html
}

/** KaTeX で数式を1行で表示する（記号などの短い式） */
export function Tex({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => render(tex), [tex])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
