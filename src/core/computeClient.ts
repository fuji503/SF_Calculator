/**
 * Web Worker への計算の依頼。すべてのカードで1つの Worker を共有する。
 * 依頼ごとに番号を付け、返ってきた結果を番号で依頼元に戻す。
 */
import type { ComputeResult, Inputs } from '../sims/types.ts'
import type { ComputeRequest, ComputeResponse } from './computeTypes.ts'
import type { GraphSettings, SweepResult } from './sweep.ts'

let worker: Worker | null = null
let nextReqId = 1
const pending = new Map<number, (res: ComputeResponse) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<ComputeResponse>) => {
      const resolve = pending.get(e.data.reqId)
      pending.delete(e.data.reqId)
      resolve?.(e.data)
    }
    worker.onerror = () => {
      // Worker が止まったら、待っている依頼をすべて失敗にして、次の依頼で作り直す
      for (const [reqId, resolve] of pending) resolve({ reqId, kind: 'failed', error: 'worker error' })
      pending.clear()
      worker?.terminate()
      worker = null
    }
  }
  return worker
}

type RequestBody = ComputeRequest extends infer R ? (R extends ComputeRequest ? Omit<R, 'reqId'> : never) : never

function post(body: RequestBody): Promise<ComputeResponse> {
  const reqId = nextReqId++
  return new Promise((resolve) => {
    pending.set(reqId, resolve)
    getWorker().postMessage({ ...body, reqId } as ComputeRequest)
  })
}

export async function computeCard(moduleId: string, inputs: Inputs): Promise<ComputeResult> {
  const res = await post({ kind: 'card', moduleId, inputs })
  if (res.kind === 'card') return res.result
  return { outputs: {}, warnings: [], errors: [{ code: 'compute-failed' }] }
}

export async function computeSweep(moduleId: string, inputs: Inputs, graph: GraphSettings): Promise<SweepResult | null> {
  const res = await post({ kind: 'sweep', moduleId, inputs, graph })
  return res.kind === 'sweep' ? res.result : null
}
