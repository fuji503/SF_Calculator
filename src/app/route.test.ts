import { describe, expect, it } from 'vitest'
import { parseRoute, routeHref, sameRoute, type Route } from './route.ts'

describe('parseRoute', () => {
  it('空のハッシュはトップ', () => {
    expect(parseRoute('')).toEqual({ name: 'top' })
    expect(parseRoute('#')).toEqual({ name: 'top' })
    expect(parseRoute('#/')).toEqual({ name: 'top' })
  })

  it('各画面を読み取る', () => {
    expect(parseRoute('#/sim/solar-beaming')).toEqual({ name: 'sim', id: 'solar-beaming' })
    expect(parseRoute('#/howto')).toEqual({ name: 'howTo' })
    expect(parseRoute('#/changelog/')).toEqual({ name: 'changelog' })
  })

  it('知らないパスは notFound', () => {
    expect(parseRoute('#/foo')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/sim')).toEqual({ name: 'notFound' })
    expect(parseRoute('#/sim/a/b')).toEqual({ name: 'notFound' })
  })
})

describe('routeHref', () => {
  it('parseRoute と往復できる', () => {
    const routes: Route[] = [
      { name: 'top' },
      { name: 'sim', id: 'reactor-shield' },
      { name: 'howTo' },
      { name: 'changelog' },
    ]
    for (const r of routes) expect(parseRoute(routeHref(r))).toEqual(r)
  })
})

describe('sameRoute', () => {
  it('シム画面は ID まで比べる', () => {
    expect(sameRoute({ name: 'sim', id: 'a' }, { name: 'sim', id: 'a' })).toBe(true)
    expect(sameRoute({ name: 'sim', id: 'a' }, { name: 'sim', id: 'b' })).toBe(false)
    expect(sameRoute({ name: 'top' }, { name: 'howTo' })).toBe(false)
  })
})
