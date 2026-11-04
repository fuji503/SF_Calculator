import type { AxisScale } from '../../core/sweep.ts'

/** Y軸の範囲。対数は10の累乗に、線形は少し余白を足す */
export function niceDomain(values: (number | null)[], scale: AxisScale): [number, number] | undefined {
  const vs = values.filter((v): v is number => v !== null && Number.isFinite(v) && (scale === 'linear' || v > 0))
  if (vs.length === 0) return undefined
  let lo = Math.min(...vs)
  let hi = Math.max(...vs)
  if (scale === 'log') {
    lo = 10 ** Math.floor(Math.log10(lo))
    hi = 10 ** Math.ceil(Math.log10(hi))
    if (hi <= lo) hi = lo * 10
    return [lo, hi]
  }
  if (lo === hi) {
    const pad = Math.abs(lo) * 0.1 || 1
    return [lo - pad, hi + pad]
  }
  const pad = (hi - lo) * 0.05
  return [lo - pad, hi + pad]
}

/** 対数軸の目盛り。10の累乗。範囲が1桁しかないときは 2 と 5 も入れる */
export function logTicks([lo, hi]: [number, number]): number[] {
  const a = Math.floor(Math.log10(lo))
  const b = Math.ceil(Math.log10(hi))
  const steps = b - a
  const stride = Math.max(1, Math.ceil(steps / 8))
  const out: number[] = []
  for (let e = a; e <= b; e += stride) {
    for (const m of steps <= 1 ? [1, 2, 5] : [1]) {
      const v = m * 10 ** e
      if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v)
    }
  }
  return out
}

