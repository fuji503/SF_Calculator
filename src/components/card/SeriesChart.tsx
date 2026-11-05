import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber } from '../../core/physics/format.ts'
import { findUnit, fixedUnit, fromInternal } from '../../core/physics/units.ts'
import type { Card } from '../../core/storage.ts'
import type { OutputDef, OutputValue } from '../../sims/types.ts'
import { niceTicks } from './axis.ts'
import { UnitSelect } from './NumberInput.tsx'

interface Props {
  o: OutputDef
  card: Card
  value: Extract<OutputValue, { kind: 'series' }>
  onUnit: (key: string, unitId: string) => void
}

/** 出力欄の中の小さな時系列のグラフ（例：減光率の時間変化） */
export function SeriesChart({ o, card, value, onUnit }: Props) {
  const xDef = o.seriesX?.unit ?? fixedUnit('')
  const xUnit = findUnit(xDef, undefined)
  const yDef = o.unit ?? fixedUnit('')
  const yUnit = findUnit(yDef, card.outputUnits[o.key])
  const data = value.x.map((x, i) => ({ x: fromInternal(x, xUnit), y: fromInternal(value.y[i], yUnit) }))
  const xs = data.map((d) => d.x)
  const ys = data.map((d) => d.y)
  const xTicks = niceTicks(Math.min(...xs), Math.max(...xs))
  const yTicks = niceTicks(0, Math.max(...ys))
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
            <CartesianGrid stroke="#1e293b" />
            <XAxis
              dataKey="x"
              type="number"
              domain={[xTicks[0], xTicks.at(-1)!]}
              ticks={xTicks}
              tickFormatter={tick}
              stroke="#64748b"
              fontSize={10}
              label={{ value: `${o.seriesX?.label ?? ''} [${xUnit.label}]`, position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 10 }}
            />
            <YAxis type="number" domain={[yTicks[0], yTicks.at(-1)!]} ticks={yTicks} tickFormatter={tick} stroke="#64748b" fontSize={10} width={48} />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 12 }}
              labelFormatter={(x) => `${formatNumber(Number(x))} ${xUnit.label}`}
              formatter={(y) => [`${formatNumber(Number(y))} ${yUnit.label}`, o.label]}
            />
            <Line type="linear" dataKey="y" stroke="#38bdf8" dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

