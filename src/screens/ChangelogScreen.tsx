import { changelog, futurePlans } from '../data/changelog.ts'
import { t } from '../i18n/ja.ts'

/** 更新履歴画面（WebApp仕様書 §4.5） */
export function ChangelogScreen() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-white md:text-2xl">{t.changelog.title}</h1>
      <section className="space-y-2 rounded-lg border border-slate-700 px-4 py-3">
        <h2 className="text-lg font-semibold text-white">{t.changelog.futureTitle}</h2>
        <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-slate-300">
          {futurePlans.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </section>
      <ol className="space-y-6">
        {changelog.map((entry) => (
          <li key={entry.version} className="space-y-2">
            <h2 className="flex items-baseline gap-3">
              <span className="text-lg font-semibold text-white">v{entry.version}</span>
              <time dateTime={entry.date} className="text-sm text-slate-400">
                {entry.date}
              </time>
            </h2>
            <ul className="list-disc space-y-1 pl-6 text-sm leading-relaxed text-slate-300">
              {entry.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
