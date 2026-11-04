import { useId } from 'react'
import { isVisible, paramRole } from '../../core/evaluate.ts'
import { formatNumber } from '../../core/physics/format.ts'
import { findUnit, fromInternal } from '../../core/physics/units.ts'
import type { Card } from '../../core/storage.ts'
import { t } from '../../i18n/ja.ts'
import type { BooleanParam, ComputeResult, EnumParam, Inputs, NumberParam, ParamDef, SimDefinition } from '../../sims/types.ts'
import { NumberInput, UnitSelect } from './NumberInput.tsx'
import { ParamLabel } from './ParamLabel.tsx'

interface Props {
  def: SimDefinition
  card: Card
  result: ComputeResult | null
  /** 入力欄ごとの不正な理由 */
  invalid: Record<string, string>
  onInputs: (fn: (inputs: Inputs) => Inputs) => void
  onUnit: (key: string, unitId: string) => void
}

/** 入力欄（WebApp仕様書 §4.7 入力・出力欄） */
export function InputPanel({ def, card, result, invalid, onInputs, onUnit }: Props) {
  const visible = def.inputs.filter((p) => isVisible(p, card.inputs))
  return (
    <div className="space-y-4">
      {def.groups.map((g) => {
        const params = visible.filter((p) => p.group === g.id)
        if (params.length === 0) return null
        return (
          <fieldset key={g.id} className="space-y-2">
            <legend className="mb-1 text-xs font-medium tracking-wide text-slate-500">{g.label}</legend>
            {params.map((p) => (
              <ParamRow key={p.key} p={p} {...{ card, result, invalid, onInputs, onUnit }} />
            ))}
          </fieldset>
        )
      })}
      {visible
        .filter((p) => !p.group)
        .map((p) => (
          <ParamRow key={p.key} p={p} {...{ card, result, invalid, onInputs, onUnit }} />
        ))}
    </div>
  )
}

type RowProps = Omit<Props, 'def'> & { p: ParamDef }

function ParamRow({ p, card, result, invalid, onInputs, onUnit }: RowProps) {
  const id = useId()
  const reason = invalid[p.key]
  let control
  switch (p.kind) {
    case 'number':
      control =
        paramRole(p, card.inputs) === 'output' ? (
          <AutoValue p={p} card={card} result={result} onUnit={onUnit} />
        ) : (
          <div className="flex items-center gap-1">
            <NumberInput
              id={id}
              value={Number(card.inputs[p.key])}
              unit={p.unit}
              unitId={card.inputUnits[p.key]}
              invalid={Boolean(reason)}
              onChange={(v) => onInputs((i) => ({ ...i, [p.key]: v }))}
              className="w-28 sm:w-32"
            />
            <UnitSelect unit={p.unit} unitId={card.inputUnits[p.key]} onChange={(u) => onUnit(p.key, u)} ariaLabel={`${p.label}の単位`} />
          </div>
        )
      break
    case 'enum':
      control = <EnumSelect id={id} p={p} value={String(card.inputs[p.key])} onInputs={onInputs} />
      break
    case 'boolean':
      control = <Toggle p={p} value={Boolean(card.inputs[p.key])} onInputs={onInputs} />
      break
    case 'table':
      // 表の入力は、使うモジュール（原子炉・遮蔽など）を実装するときに作る
      control = <span className="text-xs text-slate-500">（表の入力は未対応）</span>
      break
  }

  const wide = p.kind === 'enum'
  return (
    <div>
      <div className={`flex gap-x-3 gap-y-1 ${wide ? 'flex-col' : 'items-center justify-between'}`}>
        <div className="min-w-0 flex-1">
          <ParamLabel label={p.label} symbol={p.symbol} description={p.description} htmlFor={id} />
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {reason && <p className="mt-1 text-right text-xs text-rose-400">{reason}</p>}
    </div>
  )
}

/** 出力になった入力欄：計算結果を「自動」の印付きで読み取り専用で出す */
function AutoValue({ p, card, result, onUnit }: { p: NumberParam; card: Card; result: ComputeResult | null; onUnit: Props['onUnit'] }) {
  const out = result?.outputs[p.key]
  const u = findUnit(p.unit, card.inputUnits[p.key])
  const text = out?.kind === 'number' && result?.errors.length === 0 ? formatNumber(fromInternal(out.value, u)) : '—'
  return (
    <div className="flex items-center gap-1">
      <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">{t.card.auto}</span>
      <span className="w-[6.6rem] rounded-md border border-dashed border-slate-700 px-2 py-1 text-right font-mono text-sm text-slate-300">
        {text}
      </span>
      <UnitSelect unit={p.unit} unitId={card.inputUnits[p.key]} onChange={(id) => onUnit(p.key, id)} ariaLabel={`${p.label}の単位`} />
    </div>
  )
}

function EnumSelect({ id, p, value, onInputs }: { id: string; p: EnumParam; value: string; onInputs: Props['onInputs'] }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => {
        const v = e.target.value
        // 選んだ選択肢のプリセット値も一緒に入れる。その後も手で上書きできる
        onInputs((i) => ({ ...i, ...(p.presets?.[v] ?? {}), [p.key]: v }))
      }}
      className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-200"
    >
      {p.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Toggle({ p, value, onInputs }: { p: BooleanParam; value: boolean; onInputs: Props['onInputs'] }) {
  const [off, on] = p.labels ?? ['いいえ', 'はい']
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-slate-700 text-sm" role="radiogroup" aria-label={p.label}>
      {[false, true].map((v) => (
        <button
          key={String(v)}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onInputs((i) => ({ ...i, [p.key]: v }))}
          className={`px-2.5 py-1 ${value === v ? 'bg-sky-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
        >
          {v ? on : off}
        </button>
      ))}
    </div>
  )
}
