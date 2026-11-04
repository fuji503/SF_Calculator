import type { ComputeResult, Inputs } from '../sims/types.ts'
import type { GraphSettings, SweepResult } from './sweep.ts'

export type ComputeRequest =
  | { reqId: number; kind: 'card'; moduleId: string; inputs: Inputs }
  | { reqId: number; kind: 'sweep'; moduleId: string; inputs: Inputs; graph: GraphSettings }

export type ComputeResponse =
  | { reqId: number; kind: 'card'; result: ComputeResult }
  | { reqId: number; kind: 'sweep'; result: SweepResult }
  | { reqId: number; kind: 'failed'; error: string }
