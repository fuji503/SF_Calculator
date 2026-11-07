import { formatNumber } from '../../core/physics/format.ts'
import type { DiagramProps } from '../types.ts'
import { KT_TNT } from './data.ts'

/** 長さを、1000 m 以上なら km で書く */
function len(m: number): string {
  return Math.abs(m) >= 1000 ? `${formatNumber(m / 1000)} km` : `${formatNumber(m)} m`
}

/** 厚さ・高さは、1 m 未満なら cm で書く */
function thick(m: number): string {
  return Math.abs(m) < 1 ? `${formatNumber(m * 100)} cm` : len(m)
}

function energy(J: number): string {
  const kt = J / KT_TNT
  if (kt >= 1000) return `${formatNumber(kt / 1000)} Mt`
  if (kt >= 1) return `${formatNumber(kt)} kt`
  return `${formatNumber(kt * 1000)} t`
}

// 図の座標（値の比率は反映しない、模式図）
const W = 600
const GROUND = 130
const CX = 300
const RIM = 115
const RIM_H = 12
const BOTTOM = 182
const BURY = 255
/** お椀の2次ベジェ曲線の制御点（中央で BOTTOM になる） */
const CTRL = 2 * BOTTOM - (GROUND - RIM_H)
/** お椀の曲線の、x での高さ */
function bowlY(x: number): number {
  const t = (x - (CX - RIM)) / (2 * RIM)
  const y0 = GROUND - RIM_H
  return (1 - t) ** 2 * y0 + 2 * t * (1 - t) * CTRL + t ** 2 * y0
}
const DEPTH_X = CX + 45

/**
 * クレータの断面図（模式図）。数値は計算結果を書き込む。
 * 隕石は飛んでくる角度、核爆発は起爆の深さを、おおよその位置で描く
 */
export default function CraterDiagram({ inputs, outputs }: DiagramProps) {
  const num = (k: string) => {
    const v = outputs[k]
    return v?.kind === 'number' ? v.value : undefined
  }
  const impact = inputs.source !== 'nuclear'
  const D = num('D_rim') ?? 0
  const crater = D > 0
  const d = num('d_rim') ?? 0
  const h = num('h_rim') ?? 0
  const rBury = num('r_bury') ?? 0
  const tBury = Number(inputs.t_bury)
  const zBurst = num('z_burst')
  const airburst = impact && zBurst !== undefined && zBurst > 0 && !crater

  // 地面の形：縁が盛り上がり、外側へ噴出物が薄くなっていく
  const left = CX - RIM
  const right = CX + RIM
  const profile = crater
    ? `M0 ${GROUND} L${CX - BURY} ${GROUND} Q${left - 40} ${GROUND - 2} ${left} ${GROUND - RIM_H} Q${CX} ${CTRL} ${right} ${GROUND - RIM_H} Q${right + 40} ${GROUND - 2} ${CX + BURY} ${GROUND} L${W} ${GROUND}`
    : `M0 ${GROUND} L${W} ${GROUND}`
  const ground = `${profile} L${W} 260 L0 260 Z`
  const ejecta = (s: 1 | -1) => {
    const rim = CX + s * RIM
    const end = CX + s * BURY
    return `M${end} ${GROUND} Q${rim + s * 40} ${GROUND - 2} ${rim} ${GROUND - RIM_H} L${rim} ${GROUND} Z`
  }

  // 隕石の向き（水平からの角度）
  const theta = Number(inputs.theta)
  const th = Number.isFinite(theta) ? Math.min(Math.max(theta, 5 * (Math.PI / 180)), Math.PI / 2) : Math.PI / 4
  const L = 120
  const sx = CX - L * Math.cos(th)
  const sy = GROUND - 8 - L * Math.sin(th)
  const ex = CX - 26 * Math.cos(th)
  const ey = GROUND - 8 - 26 * Math.sin(th)

  // 核爆発の位置（深さは模式的に、クレータの深さとの比で置く）
  const zb = num('z_b') ?? Number(inputs.z_b)
  const burstY = !impact ? GROUND + (crater && d > 0 ? Math.min(1.4, zb / d) * (BOTTOM - GROUND) : Math.min(60, zb > 0 ? 40 : 0)) : 0

  const label = 'fill-slate-200 text-[12px]'
  const sub = 'fill-slate-400 text-[11px]'

  return (
    <figure className="rounded-md border border-slate-800 bg-slate-950/40 p-2">
      <svg viewBox={`0 0 ${W} 260`} className="h-auto w-full" role="img" aria-label="クレータの断面図（模式図）">
        <defs>
          <marker id="crater-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="fill-slate-400" />
          </marker>
          <marker id="crater-arrow-hot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0L10 5L0 10z" className="fill-amber-400" />
          </marker>
        </defs>

        {/* 地面、噴出物、元の地表 */}
        <path d={ground} className="fill-slate-700" />
        {crater && (
          <>
            <path d={ejecta(-1)} className="fill-amber-700/60" />
            <path d={ejecta(1)} className="fill-amber-700/60" />
          </>
        )}
        <path d={profile} fill="none" className="stroke-slate-300" strokeWidth={1.5} />
        {crater && <line x1={left - 10} y1={GROUND} x2={right + 10} y2={GROUND} className="stroke-slate-400" strokeDasharray="4 4" />}

        {crater && (
          <>
            {/* 直径 */}
            <line x1={left} y1={GROUND - RIM_H - 30} x2={right} y2={GROUND - RIM_H - 30} className="stroke-slate-400" markerStart="url(#crater-arrow)" markerEnd="url(#crater-arrow)" />
            <line x1={left} y1={GROUND - RIM_H - 36} x2={left} y2={GROUND - RIM_H - 4} className="stroke-slate-500" />
            <line x1={right} y1={GROUND - RIM_H - 36} x2={right} y2={GROUND - RIM_H - 4} className="stroke-slate-500" />
            <text x={CX + (impact ? 40 : 0)} y={GROUND - RIM_H - 36} textAnchor="middle" className={label}>
              直径 {len(D)}
            </text>

            {/* 深さ（縁から底まで） */}
            <line x1={left} y1={GROUND - RIM_H} x2={right} y2={GROUND - RIM_H} className="stroke-slate-600" strokeDasharray="2 3" />
            <line x1={DEPTH_X} y1={GROUND - RIM_H + 2} x2={DEPTH_X} y2={bowlY(DEPTH_X) - 2} className="stroke-slate-400" markerStart="url(#crater-arrow)" markerEnd="url(#crater-arrow)" />
            <text x={DEPTH_X + 6} y={(GROUND + bowlY(DEPTH_X)) / 2 + 2} className={label}>
              深さ {len(d)}
            </text>

            {/* 縁の高さ */}
            <text x={left - 6} y={GROUND - RIM_H - 6} textAnchor="end" className={sub}>
              縁の高さ {thick(h)}
            </text>

            {/* 埋まる範囲 */}
            <line x1={CX} y1={226} x2={CX + BURY} y2={226} className="stroke-amber-400" markerEnd="url(#crater-arrow)" />
            <line x1={CX + BURY} y1={GROUND} x2={CX + BURY} y2={232} className="stroke-amber-400" strokeDasharray="3 3" />
            <text x={CX + BURY - 4} y={244} textAnchor="end" className="fill-amber-200 text-[12px]">
              埋まる範囲 半径 {len(rBury)}（厚さ {thick(tBury)} 以上）
            </text>
            <text x={right + 22} y={GROUND - RIM_H - 6} className={sub}>
              積もる厚さ：縁で {thick(h)}
            </text>
          </>
        )}

        {impact && !airburst && (
          <>
            <line x1={sx} y1={sy} x2={ex} y2={ey} className="stroke-amber-400" strokeWidth={2} markerEnd="url(#crater-arrow-hot)" />
            <circle cx={sx} cy={sy} r={7} className="fill-amber-300" />
            <text x={Math.max(8, sx - 10)} y={Math.max(14, sy - 12)} className={label}>
              速さ {formatNumber(Number(inputs.v0) / 1000)} km/s・角度 {formatNumber(th / (Math.PI / 180))}°
            </text>
          </>
        )}
        {airburst && (
          <>
            <circle cx={CX} cy={40} r={14} className="fill-amber-300/70" />
            <text x={CX} y={80} textAnchor="middle" className={label}>
              高さ {len(zBurst!)} で空中爆発（クレータはできない）
            </text>
          </>
        )}

        {!impact && (
          <>
            <path
              d={`M${CX} ${burstY - 11}L${CX + 4} ${burstY - 4}L${CX + 11} ${burstY}L${CX + 4} ${burstY + 4}L${CX} ${burstY + 11}L${CX - 4} ${burstY + 4}L${CX - 11} ${burstY}L${CX - 4} ${burstY - 4}Z`}
              className="fill-amber-300"
            />
            <text x={CX - 18} y={burstY + 4} textAnchor="end" className={label}>
              起爆 深さ {len(zb)}・出力 {energy(Number(num('W') ?? inputs.W))}
            </text>
            {!crater && (
              <text x={CX} y={GROUND - 20} textAnchor="middle" className={label}>
                地下に閉じ込められ、地表にクレータはできない
              </text>
            )}
          </>
        )}
      </svg>
      <figcaption className="text-right text-[11px] text-slate-500">断面の模式図（大きさの比率は実際と違います）</figcaption>
    </figure>
  )
}
