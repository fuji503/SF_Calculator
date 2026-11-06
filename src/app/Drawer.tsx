import { useEffect, useRef, type ReactNode } from 'react'
import { SimIcon } from '../components/SimIcon.tsx'
import { t } from '../i18n/ja.ts'
import { simModules } from '../sims/registry.ts'
import { routeHref, sameRoute, type Route } from './route.ts'

interface Props {
  open: boolean
  current: Route
  onClose: () => void
}

/** 左から開くメニュー（WebApp仕様書 §4.2） */
export function Drawer({ open, current, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <nav
        className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-slate-900 shadow-xl transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label={t.app.name}
        inert={!open}
      >
        <div className="flex h-12 items-center justify-between border-b border-slate-800 px-4 md:h-14">
          <span className="font-semibold text-white">{t.app.name}</span>
          <button
            ref={closeRef}
            type="button"
            className="flex size-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label={t.menu.close}
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto py-2 text-sm">
          <MenuItem route={{ name: 'top' }} current={current} onSelect={onClose}>
            {t.menu.top}
          </MenuItem>
          <li className="px-4 pb-1 pt-4 text-xs font-medium text-slate-500">{t.menu.sims}</li>
          {simModules.map((m) => (
            <MenuItem key={m.id} route={{ name: 'sim', id: m.id }} current={current} onSelect={onClose} indent>
              <SimIcon kind={m.icon} className="size-4 shrink-0" />
              {m.name}
            </MenuItem>
          ))}
          <li className="my-2 border-t border-slate-800" />
          <MenuItem route={{ name: 'howTo' }} current={current} onSelect={onClose}>
            {t.menu.howTo}
          </MenuItem>
          <MenuItem route={{ name: 'changelog' }} current={current} onSelect={onClose}>
            {t.menu.changelog}
          </MenuItem>
          <MenuItem route={{ name: 'license' }} current={current} onSelect={onClose}>
            {t.menu.license}
          </MenuItem>
        </ul>
      </nav>
    </div>
  )
}

interface MenuItemProps {
  route: Route
  current: Route
  onSelect: () => void
  indent?: boolean
  children: ReactNode
}

function MenuItem({ route, current, onSelect, indent = false, children }: MenuItemProps) {
  const active = sameRoute(route, current)
  return (
    <li>
      <a
        href={routeHref(route)}
        className={`flex items-center gap-2 py-2 pr-4 ${indent ? 'pl-6' : 'pl-4'} ${
          active
            ? 'border-l-2 border-sky-400 bg-sky-400/10 font-medium text-sky-200'
            : 'border-l-2 border-transparent text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
        aria-current={active ? 'page' : undefined}
        onClick={onSelect}
      >
        {children}
      </a>
    </li>
  )
}
