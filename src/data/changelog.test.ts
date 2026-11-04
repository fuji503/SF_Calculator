import { describe, expect, it } from 'vitest'
import { changelog } from './changelog.ts'

/** '1.2.3' を比べられる数の配列にする */
function parseVersion(v: string): number[] {
  return v.split('.').map(Number)
}

function compareVersion(a: string, b: string): number {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

describe('changelog', () => {
  it('先頭が package.json の version と一致する', () => {
    expect(changelog[0].version).toBe(__APP_VERSION__)
  })

  it('新しい順に並んでいる', () => {
    for (let i = 1; i < changelog.length; i++) {
      expect(compareVersion(changelog[i - 1].version, changelog[i].version)).toBeGreaterThan(0)
      expect(changelog[i - 1].date >= changelog[i].date).toBe(true)
    }
  })

  it('日付の形式が YYYY-MM-DD', () => {
    for (const e of changelog) expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
