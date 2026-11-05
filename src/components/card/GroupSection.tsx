import { useId, type ReactNode } from 'react'

interface Props {
  title: string
  open: boolean
  onToggle: () => void
  /** 親のまとまりの中に入れるとき */
  nested?: boolean
  children: ReactNode
}

/** 入力・出力のまとまり。見出しを押すと開け閉めする */
export function GroupSection({ title, open, onToggle, nested = false, children }: Props) {
  const panelId = useId()
  return (
    <section className={nested ? 'border-l-2 border-slate-800 pl-3' : 'rounded-lg border border-slate-800 bg-slate-950/30'}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className={`flex w-full items-center gap-2 text-left font-medium hover:text-white ${
          nested ? 'py-1 text-xs text-slate-400' : 'rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800/50'
        }`}
      >
        <span className={`inline-block text-[10px] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
          ▶
        </span>
        {title}
      </button>
      {open && (
        <div id={panelId} className={nested ? 'space-y-2 pb-1 pt-1' : 'space-y-2 px-3 pb-3'}>
          {children}
        </div>
      )}
    </section>
  )
}
