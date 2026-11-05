import { describe, expect, it } from 'vitest'
import { logTicks, niceDomain, niceTicks } from './axis.ts'

describe('niceDomain', () => {
  it('対数は10の累乗で囲む', () => {
    expect(niceDomain([0.2, 30, null], 'log')).toEqual([0.1, 100])
    expect(niceDomain([10, 10], 'log')).toEqual([10, 100])
  })
  it('線形は5%の余白', () => {
    expect(niceDomain([0, 100], 'linear')).toEqual([-5, 105])
    expect(niceDomain([null], 'linear')).toBeUndefined()
  })
})

describe('logTicks', () => {
  it('10の累乗', () => {
    expect(logTicks([1, 1000])).toEqual([1, 10, 100, 1000])
  })
  it('1桁しかないときは 2 と 5 も入れる', () => {
    expect(logTicks([10, 100])).toEqual([10, 20, 50, 100])
  })
})

describe('niceTicks', () => {
  it('1・2・5 × 10ⁿ 刻みで範囲を含む', () => {
    expect(niceTicks(0, 365)).toEqual([0, 100, 200, 300, 400])
    expect(niceTicks(0, 0.01)).toEqual([0, 0.002, 0.004, 0.006, 0.008, 0.01])
    expect(niceTicks(0, 20)).toEqual([0, 5, 10, 15, 20])
  })

  it('幅がないときも目盛りを返す', () => {
    expect(niceTicks(1, 1)).toEqual([1, 2])
  })
})
