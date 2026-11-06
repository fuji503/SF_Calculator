import { routeHref } from '../app/route.ts'
import { SimIcon } from '../components/SimIcon.tsx'
import { t } from '../i18n/ja.ts'
import { simModules } from '../sims/registry.ts'

/** トップ画面（WebApp仕様書 §4.3） */
export function TopScreen() {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold text-slate-50 md:text-3xl">{t.app.name}</h1>
        <p className="leading-relaxed text-slate-300">{t.top.lead}</p>
        <p className="leading-relaxed text-slate-400">{t.top.usage}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-200">{t.top.simsHeading}</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {simModules.map((m) => (
            <li key={m.id}>
              <a
                href={routeHref({ name: 'sim', id: m.id })}
                className="flex h-full flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-4 transition-colors hover:border-sky-500/60 hover:bg-slate-900"
              >
                <span className="flex items-center gap-2 font-semibold text-slate-50">
                  <SimIcon kind={m.icon} className="size-6 shrink-0 text-sky-300" />
                  {m.name}
                </span>
                <span className="text-sm leading-relaxed text-slate-400">{m.summary}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
