import { useEffect, useState } from 'react'
import { parseRoute, type Route } from './route.ts'

/** 現在の URL ハッシュから画面を決める。画面が変わったらページの先頭に戻す */
export function useHashRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
