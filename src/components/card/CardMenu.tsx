import { useEffect, useRef, useState } from 'react'
import { t } from '../../i18n/ja.ts'

export interface MenuAction {
  label: string
  onSelect: () => void
  disabled?: boolean
  danger?: boolean
}

/** カードの ⋯ メニュー */
export function CardMenu({ actions }: { actions: MenuAction[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t.card.menu}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-8 items-center justify-center rounded-md text-lg text-slate-400 hover:bg-slate-800 hover:text-slate-50"
      >
        ⋯
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-md border border-slate-700 bg-slate-900 py-1 text-sm shadow-xl">
          {actions.map((a) => (
            <li key={a.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={a.disabled}
                onClick={() => {
                  setOpen(false)
                  a.onSelect()
                }}
                className={`w-full px-3 py-1.5 text-left disabled:opacity-40 ${
                  a.danger ? 'text-rose-300 hover:bg-rose-500/10' : 'text-slate-200 hover:bg-slate-800'
                }`}
              >
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
