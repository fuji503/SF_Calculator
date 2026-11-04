import { useState } from 'react'
import { formatInputValue, parseNumberInput } from '../../core/physics/format.ts'
import { findUnit, fromInternal, toInternal, type UnitDef } from '../../core/physics/units.ts'

interface NumberInputProps {
  id?: string
  /** 内部単位の値。NaN は入力途中の不正な値 */
  value: number
  unit: UnitDef
  unitId: string | undefined
  /** 読めない文字列のときは NaN を渡す */
  onChange: (internal: number) => void
  invalid?: boolean
  ariaLabel?: string
  className?: string
}

/**
 * 数値の入力欄。表示単位で書いた値を、内部単位に直して渡す。
 * 書きかけの文字列（1.5e など）は、そのまま残して赤枠にする。
 */
export function NumberInput({ id, value, unit, unitId, onChange, invalid, ariaLabel, className = '' }: NumberInputProps) {
  const u = findUnit(unit, unitId)
  const shown = (v: number) => (Number.isFinite(v) ? formatInputValue(fromInternal(v, u)) : '')
  const [text, setText] = useState(() => shown(value))
  const [synced, setSynced] = useState({ value, unitId: u.id })

  // 外から値や単位が変わったとき（単位の切り替え、プリセット、読み込み）は表示を直す。
  // 自分で打った値が戻ってきただけなら、打った文字列（1.50 など）をそのまま残す
  const sameValue = Object.is(synced.value, value)
  if (!sameValue || synced.unitId !== u.id) {
    setSynced({ value, unitId: u.id })
    const typed = parseNumberInput(text)
    const typedInternal = typed === null ? Number.NaN : toInternal(typed, u)
    if (synced.unitId !== u.id || (Number.isFinite(value) && typedInternal !== value)) setText(shown(value))
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const v = parseNumberInput(e.target.value)
        onChange(v === null ? Number.NaN : toInternal(v, u))
      }}
      className={`min-w-0 rounded-md border bg-slate-950 px-2 py-1 text-right font-mono text-sm text-slate-100 outline-none focus:ring-2 ${
        invalid ? 'border-rose-500 focus:ring-rose-500/40' : 'border-slate-700 focus:border-sky-500 focus:ring-sky-500/30'
      } ${className}`}
    />
  )
}

interface UnitSelectProps {
  unit: UnitDef
  unitId: string | undefined
  onChange: (id: string) => void
  ariaLabel?: string
}

/** 表示単位の選択。単位が1つだけのときは文字で出す */
export function UnitSelect({ unit, unitId, onChange, ariaLabel }: UnitSelectProps) {
  const u = findUnit(unit, unitId)
  if (unit.options.length <= 1) {
    return <span className="w-[4.75rem] shrink-0 text-sm text-slate-400">{u.label}</span>
  }
  return (
    <select
      aria-label={ariaLabel}
      value={u.id}
      onChange={(e) => onChange(e.target.value)}
      className="w-[4.75rem] shrink-0 rounded-md border border-slate-700 bg-slate-900 px-1 py-1 text-sm text-slate-200"
    >
      {unit.options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
