import katex from 'katex'
import 'katex/dist/katex.min.css'
import { useMemo } from 'react'

const cache = new Map<string, string>()

function render(tex: string, display = false): string {
  const key = (display ? 'D:' : 'I:') + tex
  let html = cache.get(key)
  if (html === undefined) {
    html = katex.renderToString(tex, { throwOnError: false, output: 'html', displayMode: display })
    cache.set(key, html)
  }
  return html
}

/** KaTeX で数式を1行で表示する（記号などの短い式） */
export function Tex({ tex, className }: { tex: string; className?: string }) {
  const html = useMemo(() => render(tex), [tex])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

/** 別の行に出す式（解説の数式） */
export function TexBlock({ tex }: { tex: string }) {
  const html = useMemo(() => render(tex, true), [tex])
  return <div className="overflow-x-auto py-1 text-slate-100" dangerouslySetInnerHTML={{ __html: html }} />
}
