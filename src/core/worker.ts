/**
 * 計算を画面とは別の処理で動かす Web Worker（WebApp仕様書 §9）。
 * 依頼は届いた順に処理する。古い依頼の結果を捨てるのは呼び出し側（hooks/useComputation.ts）。
 */
import { loadDefinition } from '../sims/loaders.ts'
import { evaluate } from './evaluate.ts'
import { runSweep } from './sweep.ts'
import type { ComputeRequest, ComputeResponse } from './computeTypes.ts'

// tsconfig は DOM の型を使うので、Worker 側で使うものだけを型に書く
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<ComputeRequest>) => void) | null
  postMessage: (res: ComputeResponse) => void
}

ctx.onmessage = async (e: MessageEvent<ComputeRequest>) => {
  const req = e.data
  // 定義は、そのモジュールの依頼が初めて来たときに読み込む
  const def = await loadDefinition(req.moduleId)?.catch(() => null)
  let res: ComputeResponse
  if (!def) {
    res = { reqId: req.reqId, kind: 'failed', error: `unknown module: ${req.moduleId}` }
  } else if (req.kind === 'card') {
    res = { reqId: req.reqId, kind: 'card', result: evaluate(def, req.inputs) }
  } else {
    res = { reqId: req.reqId, kind: 'sweep', result: runSweep(def, req.inputs, req.graph) }
  }
  ctx.postMessage(res)
}
