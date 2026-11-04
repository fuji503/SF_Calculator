import { lazy, Suspense } from 'react'
import { Accordion } from '../components/Accordion.tsx'
import { SimIcon } from '../components/SimIcon.tsx'
import { t } from '../i18n/ja.ts'
import { implementedSims } from '../sims/implemented.ts'
import type { SimModuleMeta } from '../sims/types.ts'

const SimCards = lazy(() => import('./SimCards.tsx'))

const SPEC_BASE_URL = 'https://github.com/fuji503/SF_Calculator/blob/main/docs/'

interface Props {
  sim: SimModuleMeta
}

/** シム画面（WebApp仕様書 §4.6） */
export function SimScreen({ sim }: Props) {
  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-white md:text-2xl">
        <SimIcon kind={sim.icon} className="size-7 shrink-0 text-sky-300" />
        {sim.name}
      </h1>

      <Accordion title={t.sim.explanation}>
        <p>{sim.summary}</p>
        <p className="mt-2 text-slate-400">{t.sim.explanationPlaceholder}</p>
        <p className="mt-2">
          {t.sim.spec}：
          <a
            href={SPEC_BASE_URL + encodeURIComponent(sim.specFile)}
            target="_blank"
            rel="noreferrer"
            className="text-sky-300 underline hover:text-sky-200"
          >
            {sim.specFile}
          </a>
        </p>
      </Accordion>

      {implementedSims.has(sim.id) ? (
        <Suspense fallback={<p className="py-8 text-center text-sm text-slate-500">{t.sim.loading}</p>}>
          <SimCards moduleId={sim.id} />
        </Suspense>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-400">
          {t.sim.notReady}
        </p>
      )}
    </div>
  )
}
