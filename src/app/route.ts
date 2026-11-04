/**
 * ハッシュルーティング（WebApp仕様書 §3）。
 * GitHub Pages で直リンクやリロードをしても 404 にならないよう、画面は URL の # 以降で表す。
 */
export type Route =
  | { name: 'top' }
  | { name: 'sim'; id: string }
  | { name: 'howTo' }
  | { name: 'changelog' }
  | { name: 'notFound' }

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '')
  if (path === '') return { name: 'top' }
  const parts = path.replace(/^\//, '').split('/')
  if (parts.length === 1 && parts[0] === 'howto') return { name: 'howTo' }
  if (parts.length === 1 && parts[0] === 'changelog') return { name: 'changelog' }
  if (parts.length === 2 && parts[0] === 'sim' && parts[1] !== '') {
    return { name: 'sim', id: decodeURIComponent(parts[1]) }
  }
  return { name: 'notFound' }
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'top':
      return '#/'
    case 'sim':
      return `#/sim/${encodeURIComponent(route.id)}`
    case 'howTo':
      return '#/howto'
    case 'changelog':
      return '#/changelog'
    case 'notFound':
      return '#/'
  }
}

export function sameRoute(a: Route, b: Route): boolean {
  if (a.name !== b.name) return false
  return a.name !== 'sim' || a.id === (b as { id: string }).id
}
