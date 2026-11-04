import { useState } from 'react'
import { CardList } from '../components/card/CardList.tsx'
import { parseImport, timestamp, toExportFile } from '../core/storage.ts'
import { useCards } from '../hooks/useCards.ts'
import { simDefinitions } from '../sims/definitions.ts'
import { t } from '../i18n/ja.ts'
import type { SimDefinition } from '../sims/types.ts'
import { downloadText, pickTextFile } from '../utils/download.ts'

/**
 * シム画面のカードの一覧と、画面全体の操作（JSON読込、全件保存、全削除）。
 * グラフや数式のライブラリが大きいので、シム画面を開いたときに読み込む。
 */
export default function SimCards({ moduleId }: { moduleId: string }) {
  return <Cards def={simDefinitions[moduleId]} />
}

function Cards({ def }: { def: SimDefinition }) {
  const { cards, update, add, duplicate, remove, move, prepend, clear } = useCards(def)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const importJson = async () => {
    const text = await pickTextFile()
    if (text === null) return
    const r = parseImport(def, text)
    if (r.ok) {
      prepend(r.cards)
      setNotice({ kind: 'ok', text: t.sim.imported(r.cards.length) })
    } else {
      setNotice({ kind: 'error', text: r.error })
    }
  }

  const saveAll = () => {
    downloadText(`${def.id}_all_${timestamp()}.json`, JSON.stringify(toExportFile(def, cards), null, 2))
  }

  const btn = 'rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white'

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={add} className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
          ＋ {t.sim.add}
        </button>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => void importJson()} className={btn}>
            {t.sim.importJson}
          </button>
          <button type="button" onClick={saveAll} className={btn}>
            {t.sim.saveAll}
          </button>
          <button
            type="button"
            onClick={() => window.confirm(t.sim.confirmClear) && clear()}
            className="rounded-md border border-rose-500/40 px-3 py-1.5 text-sm text-rose-300 hover:bg-rose-500/10"
          >
            {t.sim.clearAll}
          </button>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`flex items-start justify-between gap-2 rounded-md px-3 py-2 text-sm ${
            notice.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-200' : 'bg-rose-500/10 text-rose-200'
          }`}
        >
          {notice.text}
          <button type="button" aria-label={t.sim.dismiss} onClick={() => setNotice(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      <CardList def={def} cards={cards} update={update} duplicate={duplicate} remove={remove} move={move} />
    </>
  )
}
