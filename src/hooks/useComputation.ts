import { useEffect, useRef, useState } from 'react'
import { computeCard, computeSweep } from '../core/computeClient.ts'
import type { GraphSettings, SweepResult } from '../core/sweep.ts'
import type { ComputeResult, Inputs } from '../sims/types.ts'

/** 入力を変えてから計算するまでの待ち時間（WebApp仕様書 §9） */
export const DEBOUNCE_MS = 150

interface State<T> {
  value: T | null
  pending: boolean
}

/**
 * 入力が 150 ms 変わらなかったら計算する。古い依頼の結果が後から届いたら捨てる。
 * カードの結果とグラフは別々に依頼する（カードを先に依頼するので、先に表示される）。
 */
function useDebouncedCompute<T>(run: () => Promise<T>, deps: readonly unknown[], enabled = true): State<T> {
  const [state, setState] = useState<State<T>>({ value: null, pending: enabled })
  const latest = useRef(0)
  const runRef = useRef(run)
  useEffect(() => {
    runRef.current = run
  })

  useEffect(() => {
    if (!enabled) return
    const id = ++latest.current
    setState((s) => (s.pending ? s : { ...s, pending: true }))
    const timer = setTimeout(() => {
      void runRef.current().then((value) => {
        if (id === latest.current) setState({ value, pending: false })
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps])

  return state
}

export function useCardResult(moduleId: string, inputs: Inputs): State<ComputeResult> {
  return useDebouncedCompute(() => computeCard(moduleId, inputs), [moduleId, inputs])
}

export function useSweepResult(
  moduleId: string,
  inputs: Inputs,
  graph: GraphSettings,
  enabled: boolean,
): State<SweepResult | null> {
  return useDebouncedCompute(() => computeSweep(moduleId, inputs, graph), [moduleId, inputs, graph], enabled)
}
