import { formatNumber } from '../../core/physics/format.ts'
import { findUnit, fromInternal } from '../../core/physics/units.ts'
import type { Card } from '../../core/storage.ts'
import { t } from '../../i18n/ja.ts'
import type { ComputeResult, Inputs, TableColumn, TableParam, TableRow } from '../../sims/types.ts'
import { NumberInput, UnitSelect } from './NumberInput.tsx'

interface Props {
  p: TableParam
  card: Card
  result: ComputeResult | null
  onInputs: (fn: (inputs: Inputs) => Inputs) => void
  onUnit: (key: string, unitId: string) => void
}

/** 表のセルの表示単位は「表のキー.列のキー」で保存する（storage.ts の normalizeUnits と同じ） */
const tableUnitKey = (table: string, col: string) => `${table}.${col}`

/**
 * 表の入力（例：遮蔽の層）。行の追加と削除ができる。
 * 計算で決まるセル（autoKey）は「自動」の印付きで計算結果を出す
 */
export function TableInput({ p, card, result, onInputs, onUnit }: Props) {
  const rows = Array.isArray(card.inputs[p.key]) ? (card.inputs[p.key] as TableRow[]) : []
  const setRows = (fn: (rows: TableRow[]) => TableRow[]) =>
    onInputs((i) => ({ ...i, [p.key]: fn(Array.isArray(i[p.key]) ? (i[p.key] as TableRow[]) : []) }))
  const setCell = (r: number, key: string, value: TableRow[string]) =>
    setRows((rs) => rs.map((row, i) => (i === r ? { ...row, [key]: value } : row)))
  const newRow = p.newRow ?? p.defaultRows[p.defaultRows.length - 1] ?? {}

  return (
    <div className="space-y-1.5">
      {rows.map((row, r) => (
        <div key={r} className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-950/40 px-2 py-1.5">
          <span className="w-5 shrink-0 text-xs text-slate-500">{r + 1}</span>
          {p.columns.map((col) => (
            <Cell key={col.key} p={p} col={col} row={row} r={r} count={rows.length} {...{ card, result, onUnit }} onChange={(v) => setCell(r, col.key, v)} />
          ))}
          {rows.length > p.minRows && (
            <button
              type="button"
              aria-label={t.card.removeRow(r + 1)}
              onClick={() => setRows((rs) => rs.filter((_, i) => i !== r))}
              className="ml-auto rounded px-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-300"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {rows.length < p.maxRows && (
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { ...newRow }])}
          className="rounded-md border border-dashed border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
        >
          ＋ {t.card.addRow(p.rowName ?? '行', p.maxRows)}
        </button>
      )}
    </div>
  )
}

function Cell({
  p,
  col,
  row,
  r,
  count,
  card,
  result,
  onUnit,
  onChange,
}: {
  p: TableParam
  col: TableColumn
  row: TableRow
  r: number
  count: number
  card: Card
  result: ComputeResult | null
  onUnit: Props['onUnit']
  onChange: (v: TableRow[string]) => void
}) {
  const label = `${r + 1}行目の${col.label}`
  if (col.kind === 'enum') {
    return (
      <select
        aria-label={label}
        value={String(row[col.key])}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200"
      >
        {(col.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  if (col.kind === 'boolean') {
    return (
      <label className="flex items-center gap-1 text-xs text-slate-300">
        <input type="checkbox" checked={Boolean(row[col.key])} onChange={(e) => onChange(e.target.checked)} />
        {col.label}
      </label>
    )
  }
  const unitKey = tableUnitKey(p.key, col.key)
  const unit = col.unit!
  const unitSelect = <UnitSelect unit={unit} unitId={card.inputUnits[unitKey]} onChange={(id) => onUnit(unitKey, id)} ariaLabel={`${col.label}の単位`} />
  const auto = col.autoKey?.(r, count, card.inputs)
  if (auto) {
    const out = result?.errors.length === 0 ? result.outputs[auto] : undefined
    const u = findUnit(unit, card.inputUnits[unitKey])
    return (
      <div className="flex shrink-0 items-center gap-1">
        <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">{t.card.auto}</span>
        <span className="w-20 rounded-md border border-dashed border-slate-700 px-2 py-1 text-right font-mono text-sm text-slate-300">
          {out?.kind === 'number' ? formatNumber(fromInternal(out.value, u)) : '—'}
        </span>
        {unitSelect}
      </div>
    )
  }
  const v = row[col.key]
  return (
    <div className="flex shrink-0 items-center gap-1">
      <NumberInput
        value={typeof v === 'number' ? v : Number.NaN}
        unit={unit}
        unitId={card.inputUnits[unitKey]}
        onChange={onChange}
        invalid={typeof v !== 'number' || !Number.isFinite(v) || (col.min !== undefined && v < col.min)}
        ariaLabel={label}
        className="w-[6.4rem]"
      />
      {unitSelect}
    </div>
  )
}
