import { isVisible, messageText } from '../../core/evaluate.ts'
import { formatNumber } from '../../core/physics/format.ts'
import { findUnit, fromInternal } from '../../core/physics/units.ts'
import type { Card } from '../../core/storage.ts'
import { t } from '../../i18n/ja.ts'
import type { ComputeResult, OutputDef, SimDefinition } from '../../sims/types.ts'
import { GroupSection } from './GroupSection.tsx'
import { SeriesChart } from './SeriesChart.tsx'
import { UnitSelect } from './NumberInput.tsx'
import { ParamLabel } from './ParamLabel.tsx'

interface Props {
  def: SimDefinition
  card: Card
  result: ComputeResult | null
  pending: boolean
  onUnit: (key: string, unitId: string) => void
  /** まとまりの開け閉め（collapsibleGroups のとき） */
  onToggleGroup: (id: string) => void
}

/** 出力のまとまりの開閉状態は、入力のまとまりと同じ所に、この接頭辞を付けて保存する */
export const OUTPUT_GROUP_PREFIX = 'out:'

/** 出力欄：値、単位、警告（⚠）、エラー（✖） */
export function OutputPanel({ def, card, result, pending, onUnit, onToggleGroup }: Props) {
  const failed = !result || result.errors.length > 0
  const shown = def.outputs.filter((o) => !o.graphOnly && isVisible(o, card.inputs))
  const primary = shown.filter((o) => o.primary)
  const others = shown.filter((o) => !o.primary)
  const groups = def.outputGroups ?? []
  const ungrouped = others.filter((o) => !o.group || !groups.some((g) => g.id === o.group))
  const row = (o: OutputDef) => <OutputRow key={o.key} o={o} card={card} result={failed ? null : result} onUnit={onUnit} />

  return (
    <div className="space-y-3">
      <div className="flex h-4 items-center justify-end">
        {pending && <span className="animate-pulse text-xs text-sky-300">{t.card.computing}</span>}
      </div>

      {result && result.errors.length > 0 && (
        <ul className="space-y-1">
          {result.errors.map((m, i) => (
            <li key={i} className="rounded-md bg-rose-500/10 px-2 py-1 text-sm text-rose-300">
              ✖ {messageText(def, m)}
            </li>
          ))}
        </ul>
      )}

      <dl className={`space-y-2 ${failed ? 'opacity-50' : ''}`}>
        {primary.map((o) => (
          <OutputRow key={o.key} o={o} card={card} result={failed ? null : result} onUnit={onUnit} large />
        ))}
      </dl>
      {ungrouped.length > 0 && (
        <dl className={`space-y-1 border-t border-slate-800 pt-2 ${failed ? 'opacity-50' : ''}`}>{ungrouped.map(row)}</dl>
      )}
      {groups.map((g) => {
        const items = others.filter((o) => o.group === g.id)
        if (items.length === 0 || !(g.visibleWhen?.(card.inputs) ?? true)) return null
        const id = OUTPUT_GROUP_PREFIX + g.id
        return (
          <GroupSection key={g.id} title={g.label} open={!card.ui.closed.includes(id)} onToggle={() => onToggleGroup(id)}>
            <dl className={`space-y-1 ${failed ? 'opacity-50' : ''}`}>{items.map(row)}</dl>
          </GroupSection>
        )
      })}

      {result && result.warnings.length > 0 && (
        <ul className="space-y-1">
          {result.warnings.map((m, i) => (
            <li
              key={i}
              className={`rounded-md px-2 py-1 text-sm ${m.level === 'info' ? 'bg-sky-500/10 text-sky-200' : 'bg-amber-500/10 text-amber-200'}`}
            >
              {m.level === 'info' ? 'ℹ' : '⚠'} {messageText(def, m)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OutputRow({
  o,
  card,
  result,
  onUnit,
  large = false,
}: {
  o: OutputDef
  card: Card
  result: ComputeResult | null
  onUnit: Props['onUnit']
  large?: boolean
}) {
  const v = result?.outputs[o.key]
  if (o.kind === 'series') {
    return (
      <div>
        <dt>
          <ParamLabel label={o.label} symbol={o.symbol} description={o.description} />
        </dt>
        <dd className="mt-1">
          {v?.kind === 'series' ? <SeriesChart o={o} card={card} value={v} onUnit={onUnit} /> : <span className="text-sm text-slate-500">—</span>}
        </dd>
      </div>
    )
  }
  if (o.kind === 'table') {
    return (
      <div>
        <dt>
          <ParamLabel label={o.label} symbol={o.symbol} description={o.description} />
        </dt>
        <dd>
          <OutputValueText o={o} card={card} value={v} large={false} />
        </dd>
      </div>
    )
  }
  const note = o.noteKey ? result?.outputs[o.noteKey] : undefined
  return (
    <div className="flex items-center justify-between gap-x-3">
      <dt className="min-w-0 flex-1">
        <ParamLabel label={o.label} symbol={o.symbol} description={o.description} />
        {note?.kind === 'text' && note.value && <span className="block text-xs text-slate-500">{note.value}</span>}
      </dt>
      <dd className="flex shrink-0 items-center gap-1">
        <OutputValueText o={o} card={card} value={v} large={large} />
        {o.unit && o.kind === 'number' && (
          <UnitSelect unit={o.unit} unitId={card.outputUnits[o.key]} onChange={(id) => onUnit(o.key, id)} ariaLabel={`${o.label}の単位`} />
        )}
      </dd>
    </div>
  )
}

function OutputValueText({ o, card, value, large }: { o: OutputDef; card: Card; value: ComputeResult['outputs'][string] | undefined; large: boolean }) {
  const cls = `font-mono ${large ? 'text-lg font-semibold text-slate-50' : 'text-sm text-slate-200'}`
  if (!value) return <span className={cls}>—</span>
  switch (value.kind) {
    case 'number': {
      const u = o.unit ? findUnit(o.unit, card.outputUnits[o.key]) : undefined
      return <span className={cls}>{formatNumber(u ? fromInternal(value.value, u) : value.value)}</span>
    }
    case 'text':
      return <span className="text-sm text-slate-200">{value.value}</span>
    case 'table':
      return (
        <table className="mt-1 w-full text-xs">
          <colgroup>
            {value.columns.map((c, i) => (
              <col key={c} className={i === 0 ? '' : 'w-24'} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {value.columns.map((c) => (
                <th key={c} className="px-1 py-0.5 text-left font-medium text-slate-400 [&:not(:first-child)]:text-right">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-800">
                {r.map((cell, j) => (
                  <td key={j} className={`px-1 py-0.5 text-slate-200 ${typeof cell === 'number' ? 'text-right font-mono' : j > 0 ? 'text-right' : ''}`}>
                    {typeof cell === 'number' ? formatNumber(cell) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'series':
      return <span className="text-xs text-slate-400">（グラフで表示）</span>
  }
}

/** 折りたたみ時に、タイトル行の下に出す主要な出力のサマリー */
export function PrimarySummary({ def, card, result }: { def: SimDefinition; card: Card; result: ComputeResult | null }) {
  if (!result) return null
  if (result.errors.length > 0) return <p className="text-sm text-rose-300">✖ {messageText(def, result.errors[0])}</p>
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {def.outputs
        .filter((o) => o.primary && isVisible(o, card.inputs))
        .map((o) => {
          const v = result.outputs[o.key]
          if (v?.kind !== 'number') return null
          const u = o.unit ? findUnit(o.unit, card.outputUnits[o.key]) : undefined
          return (
            <span key={o.key} className="text-slate-400">
              {o.label} <span className="font-mono text-slate-100">{formatNumber(u ? fromInternal(v.value, u) : v.value)}</span>{' '}
              {u?.label}
            </span>
          )
        })}
      {result.warnings.length > 0 && <span className="text-amber-300">⚠ {result.warnings.length}</span>}
    </p>
  )
}
