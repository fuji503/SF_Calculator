import { routeHref } from '../app/route.ts'
import { t } from '../i18n/ja.ts'

export function NotFoundScreen() {
  return (
    <div className="space-y-4 py-12 text-center">
      <h1 className="text-xl font-bold text-slate-50">{t.notFound.title}</h1>
      <a href={routeHref({ name: 'top' })} className="text-sky-300 underline hover:text-sky-200">
        {t.notFound.back}
      </a>
    </div>
  )
}
