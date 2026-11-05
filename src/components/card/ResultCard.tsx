import { toPng } from 'html-to-image'
import { useMemo, useRef, type HTMLAttributes, type ReactNode } from 'react'
import { INVALID_INPUT, messageText, validateInputs } from '../../core/evaluate.ts'
import { safeFileName, timestamp, toExportFile, type Card } from '../../core/storage.ts'
import type { GraphSettings } from '../../core/sweep.ts'
import { useCardResult, useSweepResult } from '../../hooks/useComputation.ts'
import { t } from '../../i18n/ja.ts'
import type { Inputs, SimDefinition } from '../../sims/types.ts'
import { downloadText, downloadUrl } from '../../utils/download.ts'
import { CardMenu } from './CardMenu.tsx'
import { GraphPanel } from './GraphPanel.tsx'
import { InputPanel } from './InputPanel.tsx'
import { OutputPanel, PrimarySummary } from './OutputPanel.tsx'

interface Props {
  def: SimDefinition
  card: Card
  isFirst: boolean
  isLast: boolean
  onChange: (fn: (c: Card) => Card) => void
  onDuplicate: () => void
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
  /** ドラッグのつまみに付ける属性（dnd-kit） */
  handleProps?: HTMLAttributes<HTMLButtonElement>
  handleRef?: (el: HTMLButtonElement | null) => void
}

/** 計算結果カード（WebApp仕様書 §4.7） */
export function ResultCard({ def, card, isFirst, isLast, onChange, onDuplicate, onRemove, onMove, handleProps, handleRef }: Props) {
  const ref = useRef<HTMLElement>(null)
  const { value: result, pending } = useCardResult(def.id, card.inputs)
  const { value: sweep, pending: sweepPending } = useSweepResult(def.id, card.inputs, card.graph, card.ui.graphOpen)

  // 範囲外の入力欄と、モジュールが入力欄を指して返したエラー
  const invalid = useMemo(() => {
    const out = validateInputs(def, card.inputs)
    for (const m of result?.errors ?? []) {
      if (m.code === INVALID_INPUT) continue
      for (const k of m.keys ?? []) if (def.inputs.some((p) => p.key === k) && !out[k]) out[k] = messageText(def, m)
    }
    return out
  }, [def, card.inputs, result])

  const setInputs = (fn: (i: Inputs) => Inputs) => onChange((c) => ({ ...c, inputs: fn(c.inputs) }))
  const setGraph = (fn: (g: GraphSettings) => GraphSettings) => onChange((c) => ({ ...c, graph: fn(c.graph) }))
  const setUi = (k: 'ioOpen' | 'graphOpen') => onChange((c) => ({ ...c, ui: { ...c.ui, [k]: !c.ui[k] } }))
  const toggleGroup = (id: string) =>
    onChange((c) => {
      const closed = c.ui.closed.includes(id) ? c.ui.closed.filter((x) => x !== id) : [...c.ui.closed, id]
      return { ...c, ui: { ...c.ui, closed } }
    })

  const saveJson = () => {
    const file = toExportFile(def, [card])
    downloadText(`${def.id}_${safeFileName(card.title)}_${timestamp()}.json`, JSON.stringify(file, null, 2))
  }

  const saveImage = async () => {
    if (!ref.current) return
    // 画面に残す出力欄は、スクロールの枠を外して全体を画像に入れる
    const sticky = [...ref.current.querySelectorAll<HTMLElement>('[data-sticky-outputs]')]
    for (const el of sticky) el.style.cssText = 'position:static;max-height:none;overflow:visible'
    try {
      const url = await toPng(ref.current, {
        pixelRatio: 2,
        backgroundColor: '#0f172a',
        filter: (n) => !(n instanceof HTMLElement && n.dataset.exportExclude !== undefined),
      })
      downloadUrl(`${def.id}_${safeFileName(card.title)}_${timestamp()}.png`, url)
    } catch {
      window.alert(t.card.imageFailed)
    } finally {
      for (const el of sticky) el.style.cssText = ''
    }
  }

  return (
    <article ref={ref} className="rounded-xl border border-slate-800 bg-slate-900">
      <header className="flex items-center gap-1 border-b border-slate-800 px-2 py-2">
        <button
          ref={handleRef}
          type="button"
          aria-label={t.card.dragHandle}
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-slate-500 hover:bg-slate-800 hover:text-slate-200 active:cursor-grabbing"
          data-export-exclude
          {...handleProps}
        >
          ⠿
        </button>
        <input
          value={card.title}
          aria-label={t.card.title}
          onChange={(e) => onChange((c) => ({ ...c, title: e.target.value }))}
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-semibold text-white hover:border-slate-700 focus:border-sky-500 focus:outline-none"
        />
        <div className="flex items-center gap-1" data-export-exclude>
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-md border border-slate-700 px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {t.card.duplicate}
          </button>
          <CardMenu
            actions={[
              { label: t.card.saveJson, onSelect: saveJson },
              { label: t.card.saveImage, onSelect: () => void saveImage() },
              { label: t.card.moveUp, onSelect: () => onMove(-1), disabled: isFirst },
              { label: t.card.moveDown, onSelect: () => onMove(1), disabled: isLast },
              { label: t.card.remove, onSelect: () => window.confirm(t.card.confirmRemove(card.title)) && onRemove(), danger: true },
            ]}
          />
        </div>
      </header>

      {!card.ui.ioOpen && (
        <div className="border-b border-slate-800 px-4 py-2">
          <PrimarySummary def={def} card={card} result={result} />
        </div>
      )}

      <Section title={t.card.io} open={card.ui.ioOpen} onToggle={() => setUi('ioOpen')}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-200">{t.card.inputs}</h3>
            <InputPanel
              def={def}
              card={card}
              result={result}
              invalid={invalid}
              onInputs={setInputs}
              onUnit={(k, u) => onChange((c) => ({ ...c, inputUnits: { ...c.inputUnits, [k]: u } }))}
              onToggleGroup={toggleGroup}
            />
          </div>
          {/* 入力欄が長いモジュールでは、PCでスクロールしても出力欄を画面に残す */}
          <div
            data-sticky-outputs={def.collapsibleGroups || undefined}
            className={def.collapsibleGroups ? 'md:sticky md:top-16 md:max-h-[calc(100vh-5rem)] md:self-start md:overflow-y-auto md:pr-1' : ''}
          >
            <h3 className="mb-2 text-sm font-semibold text-slate-200">{t.card.outputs}</h3>
            <OutputPanel
              def={def}
              card={card}
              result={result}
              pending={pending}
              onUnit={(k, u) => onChange((c) => ({ ...c, outputUnits: { ...c.outputUnits, [k]: u } }))}
              onToggleGroup={toggleGroup}
            />
          </div>
        </div>
      </Section>

      <Section title={t.card.graph} open={card.ui.graphOpen} onToggle={() => setUi('graphOpen')} last>
        <GraphPanel def={def} card={card} result={result} sweep={sweep} pending={sweepPending} onGraph={setGraph} />
      </Section>
    </article>
  )
}

function Section({ title, open, onToggle, last = false, children }: { title: string; open: boolean; onToggle: () => void; last?: boolean; children: ReactNode }) {
  return (
    <section className={last ? '' : 'border-b border-slate-800'}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium text-slate-300 hover:bg-slate-800/50"
      >
        <span className={`inline-block text-xs transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
          ▶
        </span>
        {title}
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </section>
  )
}
