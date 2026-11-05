import type { ReactNode } from 'react'
import { Tex, TexBlock } from '../Tex.tsx'

/** 解説の見出しつきのまとまり */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="border-l-2 border-sky-500 pl-2 text-sm font-semibold text-slate-100">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-slate-300">{children}</div>
    </section>
  )
}

/** 式と、その下の短い説明 */
export function Formula({ tex, children }: { tex: string; children?: ReactNode }) {
  return (
    <div className="rounded-md bg-slate-950/60 px-3 py-1">
      <TexBlock tex={tex} />
      {children && <div className="pb-1 text-xs text-slate-400">{children}</div>}
    </div>
  )
}

/** 文中の記号 */
export const M = ({ t }: { t: string }) => <Tex tex={t} />

/** 箇条書き */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}

/** 解説の全体 */
export function Explanation({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>
}
