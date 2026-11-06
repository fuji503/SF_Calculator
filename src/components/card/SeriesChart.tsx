import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { THEME_COLORS, useTheme } from '../../app/theme.ts'
import { formatNumber } from '../../core/physics/format.ts'
import { findUnit, fixedUnit, fromInternal } from '../../core/physics/units.ts'
import type { Card } from '../../core/storage.ts'
import type { OutputDef, OutputValue } from '../../sims/types.ts'
import { logTicks, niceTicks } from './axis.ts'
import { UnitSelect } from './NumberInput.tsx'

interface Props {
  o: OutputDef
  card: Card
  value: Extract<OutputValue, { kind: 'series' }>
  onUnit: (key: string, unitId: string) => void
}

/** 出力欄の中の小さな時系列のグラフ（例：減光率の時間変化） */
export function SeriesChart({ o, card, value, onUnit }: Props) {
  const c = THEME_COLORS[useTheme().resolved]
  const xDef = o.seriesX?.unit ?? fixedUnit('')
  const xUnit = findUnit(xDef, undefined)
  const yDef = o.unit ?? fixedUnit('')
  const yUnit = findUnit(yDef, card.outputUnits[o.key])
  const data = value.x.map((x, i) => ({ x: fromInternal(x, xUnit), y: fromInternal(value.y[i], yUnit) }))
  const xs = data.map((d) => d.x)
  const ys = data.map((d) => d.y)
  const xLog = o.seriesX?.scale === 'log'
  const yLog = o.seriesY?.scale === 'log'
  const pos = (v: number[]) => v.filter((x) => x > 0)
  // 対数の目盛りはデータの範囲の中の 10ⁿ だけなので、軸の範囲はデータの範囲にする
  const xRange: [number, number] = xLog ? [Math.min(...pos(xs)), Math.max(...pos(xs))] : [0, 0]
  const yRange: [number, number] = yLog ? [Math.min(...pos(ys)), Math.max(...pos(ys))] : [0, 0]
  const xTicks = xLog ? logTicks(xRange) : niceTicks(Math.min(...xs), Math.max(...xs))
  const yTicks = yLog ? logTicks(yRange) : niceTicks(0, Math.max(...ys))
  const xDomain = xLog ? xRange : [xTicks[0], xTicks.at(-1)!]
  const yDomain = yLog ? yRange : [yTicks[0], yTicks.at(-1)!]
  const tick = (v: number) => formatNumber(v)

  return (
    <div>
      <div className="mb-1 flex items-center justify-end gap-1 text-xs text-slate-400">
        縦軸の単位
        <UnitSelect unit={yDef} unitId={card.outputUnits[o.key]} onChange={(id) => onUnit(o.key, id)} ariaLabel={`${o.label}の単位`} />
      </div>
      <div className="h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 12, bottom: 16, left: 0 }}>
            <CartesianGrid stroke={c.grid} />
            <XAxis
              dataKey="x"
              type="number"
              scale={xLog ? 'log' : 'linear'}
              domain={xDomain}
              ticks={xTicks}
              allowDataOverflow
              tickFormatter={tick}
              stroke={c.axis}
              fontSize={10}
              label={{ value: `${o.seriesX?.label ?? ''} [${xUnit.label}]`, position: 'insideBottom', offset: -10, fill: c.label, fontSize: 10 }}
            />
            <YAxis type="number" scale={yLog ? 'log' : 'linear'} allowDataOverflow domain={yDomain} ticks={yTicks} tickFormatter={tick} stroke={c.axis} fontSize={10} width={48} />
            <Tooltip
              contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, fontSize: 12 }}
              labelFormatter={(x) => `${formatNumber(Number(x))} ${xUnit.label}`}
              formatter={(y) => [`${formatNumber(Number(y))} ${yUnit.label}`, o.label]}
            />
            <Line type="linear" dataKey="y" stroke={c.line} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

