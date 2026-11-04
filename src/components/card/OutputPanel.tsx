import { isVisible, messageText } from '../../core/evaluate.ts'
import { formatNumber } from '../../core/physics/format.ts'
import { findUnit, fromInternal } from '../../core/physics/units.ts'
import type { Card } from '../../core/storage.ts'
import { t } from '../../i18n/ja.ts'
import type { ComputeResult, OutputDef, SimDefinition } from '../../sims/types.ts'
import { UnitSelect } from './NumberInput.tsx'
import { ParamLabel } from './ParamLabel.tsx'

interface Props {
  def: SimDefinition
  card: Card
  result: ComputeResult | null
  pending: boolean
  onUnit: (key: string, unitId: string) => void
}

/** 出力欄：値、単位、警告（⚠）、エラー（✖） */
export function OutputPanel({ def, card, result, pending, onUnit }: Props) {
  const failed = !result || result.errors.length > 0
  const shown = def.outputs.filter((o) => isVisible(o, card.inputs))
  const primary = shown.filter((o) => o.primary)
  const others = shown.filter((o) => !o.primary)

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
      <dl className={`space-y-1 border-t border-slate-800 pt-2 ${failed ? 'opacity-50' : ''}`}>
        {others.map((o) => (
          <OutputRow key={o.key} o={o} card={card} result={failed ? null : result} onUnit={onUnit} />
        ))}
      </dl>

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
  return (
    <div className="flex items-center justify-between gap-x-3">
      <dt className="min-w-0 flex-1">
        <ParamLabel label={o.label} symbol={o.symbol} description={o.description} />
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
  const cls = `font-mono ${large ? 'text-lg font-semibold text-white' : 'text-sm text-slate-200'}`
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
          <thead>
            <tr>
              {value.columns.map((c) => (
                <th key={c} className="px-1 text-left font-medium text-slate-400">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {value.rows.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td key={j} className="px-1 font-mono text-slate-200">
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
