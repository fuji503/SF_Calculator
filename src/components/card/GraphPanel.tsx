import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { THEME_COLORS, useTheme } from '../../app/theme.ts'
import { formatNumber } from '../../core/physics/format.ts'
import { findUnit, fromInternal } from '../../core/physics/units.ts'
import type { Card } from '../../core/storage.ts'
import {
  defaultXRange,
  graphRangeProblem,
  MAX_POINTS,
  MIN_POINTS,
  xCandidates,
  yCandidates,
  type AxisScale,
  type GraphSettings,
  type SweepResult,
} from '../../core/sweep.ts'
import { t } from '../../i18n/ja.ts'
import type { ComputeResult, SimDefinition } from '../../sims/types.ts'
import { logTicks, niceDomain } from './axis.ts'
import { NumberInput } from './NumberInput.tsx'

interface Props {
  def: SimDefinition
  card: Card
  result: ComputeResult | null
  sweep: SweepResult | null
  pending: boolean
  onGraph: (fn: (g: GraphSettings) => GraphSettings) => void
}

/** グラフ欄（WebApp仕様書 §4.7）。X軸の入力だけを動かした計算の結果を描く */
export function GraphPanel({ def, card, result, sweep, pending, onGraph }: Props) {
  const c = THEME_COLORS[useTheme().resolved]
  const g = card.graph
  const xs = xCandidates(def, card.inputs)
  const ys = yCandidates(def, card.inputs)
  const xParam = xs.find((p) => p.key === g.x)
  const yKey = g.y[0]
  const yDef = ys.find((o) => o.key === yKey)
  const xUnit = xParam ? findUnit(xParam.unit, card.inputUnits[g.x]) : undefined
  // Y軸が「出力になった入力」なら入力欄の表示単位、ふつうの出力なら出力欄の表示単位を使う
  const yUnitIds = yDef && 'default' in yDef ? card.inputUnits : card.outputUnits
  const yUnit = yDef?.unit ? findUnit(yDef.unit, yUnitIds[yKey]) : undefined

  const problem = !xParam ? t.graph.xUnavailable : graphRangeProblem(g)

  // 表示単位に直した点の列。対数軸では 0 以下の点を描かない
  const yv = sweep?.y[yKey] ?? []
  const data =
    sweep && xUnit
      ? sweep.x.map((x, i) => {
          const y = yv[i]
          const yy = y === null || y === undefined ? null : yUnit ? fromInternal(y, yUnit) : y
          return { x: fromInternal(x, xUnit), y: yy !== null && g.yScale === 'log' && yy <= 0 ? null : yy }
        })
      : []

  const yDomain = niceDomain(data.map((d) => d.y), g.yScale)
  const xDomain: [number, number] | undefined = xUnit ? [fromInternal(g.xMin, xUnit), fromInternal(g.xMax, xUnit)] : undefined

  // 今の入力値に当たる点
  const cur = (() => {
    if (!xUnit || !result || result.errors.length > 0) return null
    const x = Number(card.inputs[g.x])
    const out = result.outputs[yKey]
    if (!Number.isFinite(x) || out?.kind !== 'number') return null
    const y = yUnit ? fromInternal(out.value, yUnit) : out.value
    if (g.yScale === 'log' && y <= 0) return null
    if (x < g.xMin || x > g.xMax) return null
    return { x: fromInternal(x, xUnit), y }
  })()

  const selectCls = 'rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200'

  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
        <span className="pt-1 text-slate-400">{t.graph.xAxis}</span>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={t.graph.xAxis}
            value={xParam ? g.x : ''}
            onChange={(e) => {
              const p = xs.find((q) => q.key === e.target.value)
              if (p) onGraph((gg) => ({ ...gg, x: p.key, ...defaultXRange(p, card.inputs[p.key]) }))
            }}
            className={selectCls}
          >
            {!xParam && <option value="">—</option>}
            {xs.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {xParam && (
            <span className="flex items-center gap-1">
              <NumberInput
                value={g.xMin}
                unit={xParam.unit}
                unitId={card.inputUnits[g.x]}
                onChange={(v) => onGraph((gg) => ({ ...gg, xMin: v }))}
                invalid={Boolean(problem)}
                ariaLabel={t.graph.xMin}
                className="w-24"
              />
              〜
              <NumberInput
                value={g.xMax}
                unit={xParam.unit}
                unitId={card.inputUnits[g.x]}
                onChange={(v) => onGraph((gg) => ({ ...gg, xMax: v }))}
                invalid={Boolean(problem)}
                ariaLabel={t.graph.xMax}
                className="w-24"
              />
              <span className="text-slate-400">{xUnit?.label}</span>
            </span>
          )}
          <ScaleSelect value={g.xScale} onChange={(s) => onGraph((gg) => ({ ...gg, xScale: s }))} label={t.graph.xScale} />
          <label className="flex items-center gap-1 text-slate-400">
            {t.graph.points}
            <PointsInput value={g.points} onChange={(n) => onGraph((gg) => ({ ...gg, points: n }))} />
          </label>
        </div>

        <span className="pt-1 text-slate-400">{t.graph.yAxis}</span>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label={t.graph.yAxis} value={yKey} onChange={(e) => onGraph((gg) => ({ ...gg, y: [e.target.value] }))} className={selectCls}>
            {ys.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-slate-400">{yUnit?.label}</span>
          <ScaleSelect value={g.yScale} onChange={(s) => onGraph((gg) => ({ ...gg, yScale: s }))} label={t.graph.yScale} />
        </div>
      </div>

      <div className="relative h-[220px] md:h-[320px]">
        {problem ? (
          <p className="flex h-full items-center justify-center text-sm text-rose-300">{problem}</p>
        ) : data.length > 0 && data.some((d) => d.y !== null) ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
              <CartesianGrid stroke={c.grid} />
              <XAxis
                dataKey="x"
                type="number"
                scale={g.xScale === 'log' ? 'log' : 'linear'}
                domain={xDomain}
                allowDataOverflow
                ticks={g.xScale === 'log' && xDomain ? logTicks(xDomain) : undefined}
                tickFormatter={tick}
                stroke={c.axis}
                fontSize={11}
                label={{ value: axisLabel(xParam?.label, xUnit?.label), position: 'insideBottom', offset: -12, fill: c.label, fontSize: 11 }}
              />
              <YAxis
                type="number"
                scale={g.yScale === 'log' ? 'log' : 'linear'}
                domain={yDomain}
                allowDataOverflow
                ticks={g.yScale === 'log' && yDomain ? logTicks(yDomain) : undefined}
                tickFormatter={tick}
                stroke={c.axis}
                fontSize={11}
                width={64}
              />
              <Tooltip
                isAnimationActive={false}
                contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, fontSize: 12 }}
                labelFormatter={(x) => `${xParam?.label} = ${formatNumber(Number(x))} ${xUnit?.label ?? ''}`}
                formatter={(y) => [`${formatNumber(Number(y))} ${yUnit?.label ?? ''}`, yDef?.label ?? yKey]}
              />
              <Line dataKey="y" stroke={c.line} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
              {cur && <ReferenceDot x={cur.x} y={cur.y} r={5} fill={c.dot} stroke={c.tooltipBg} strokeWidth={2} />}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          !pending && <p className="flex h-full items-center justify-center text-sm text-slate-500">{t.graph.noData}</p>
        )}
        {pending && <span className="absolute right-2 top-1 animate-pulse text-xs text-sky-300">{t.card.computing}</span>}
      </div>
    </div>
  )
}

function ScaleSelect({ value, onChange, label }: { value: AxisScale; onChange: (s: AxisScale) => void; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as AxisScale)}
      className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-200"
    >
      <option value="linear">{t.graph.linear}</option>
      <option value="log">{t.graph.log}</option>
    </select>
  )
}

function PointsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={MIN_POINTS}
      max={MAX_POINTS}
      value={value}
      onChange={(e) => {
        const n = Math.round(Number(e.target.value))
        if (Number.isFinite(n)) onChange(Math.min(MAX_POINTS, Math.max(MIN_POINTS, n)))
      }}
      className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-right font-mono text-sm text-slate-100"
    />
  )
}

const tick = (v: number) => formatNumber(v, 3)

function axisLabel(name: string | undefined, unit: string | undefined): string {
  return unit ? `${name ?? ''} [${unit}]` : (name ?? '')
}
