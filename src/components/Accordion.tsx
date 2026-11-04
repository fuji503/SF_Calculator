import { useId, useState, type ReactNode } from 'react'

interface Props {
  title: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}

/** 見出しを押して開閉する欄 */
export function Accordion({ title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-200 hover:bg-slate-800/60"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
          ▶
        </span>
        {title}
      </button>
      {open && (
        <div id={panelId} className="border-t border-slate-800 px-4 py-3 text-sm leading-relaxed text-slate-300">
          {children}
        </div>
      )}
    </section>
  )
}
