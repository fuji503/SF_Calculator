import { t } from '../i18n/ja.ts'
import { routeHref } from './route.ts'

interface Props {
  onOpenMenu: () => void
}

/** 上部に固定するヘッダ（WebApp仕様書 §4.1） */
export function Header({ onOpenMenu }: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-slate-800 bg-slate-950/90 px-2 backdrop-blur md:h-14 md:px-4">
      <button
        type="button"
        className="flex size-10 items-center justify-center rounded-md text-slate-300 hover:bg-slate-800 hover:text-white"
        aria-label={t.menu.open}
        onClick={onOpenMenu}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
        </svg>
      </button>
      <a href={routeHref({ name: 'top' })} className="flex items-baseline gap-2 font-semibold text-white">
        <span className="text-base md:text-lg">{t.app.name}</span>
        <span className="text-xs font-normal text-slate-400">v{__APP_VERSION__}</span>
      </a>
    </header>
  )
}
