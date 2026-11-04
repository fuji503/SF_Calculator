import { useCallback, useEffect, useRef, useState } from 'react'
import { duplicateCard, loadSession, newCard, saveSession, type Card } from '../core/storage.ts'
import type { SimDefinition } from '../sims/types.ts'

const SAVE_DELAY_MS = 300

/** カードが1枚もないときは、初期値のカードを1枚作る（WebApp仕様書 §4.6） */
function ensureOne(def: SimDefinition, cards: Card[]): Card[] {
  return cards.length > 0 ? cards : [newCard(def, [])]
}

/** シム画面のカードの一覧。変更は少し待ってから sessionStorage にまとめて書き込む */
export function useCards(def: SimDefinition) {
  const [cards, setCards] = useState<Card[]>(() => ensureOne(def, loadSession(def) ?? []))
  const latest = useRef(cards)
  useEffect(() => {
    latest.current = cards
  }, [cards])

  useEffect(() => {
    const timer = setTimeout(() => saveSession(def, cards), SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [def, cards])

  // 待っている間にページを閉じたり再読み込みしたりしても失わないように
  useEffect(() => {
    const flush = () => saveSession(def, latest.current)
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [def])

  const update = useCallback((id: string, fn: (c: Card) => Card) => {
    setCards((cs) => cs.map((c) => (c.id === id ? fn(c) : c)))
  }, [])

  const add = useCallback(() => setCards((cs) => [newCard(def, cs), ...cs]), [def])

  const duplicate = useCallback((id: string) => {
    setCards((cs) => {
      const i = cs.findIndex((c) => c.id === id)
      if (i < 0) return cs
      return [...cs.slice(0, i + 1), duplicateCard(cs[i]), ...cs.slice(i + 1)]
    })
  }, [])

  const remove = useCallback((id: string) => setCards((cs) => ensureOne(def, cs.filter((c) => c.id !== id))), [def])

  /** from 番目のカードを to 番目に動かす */
  const move = useCallback((from: number, to: number) => {
    setCards((cs) => {
      if (from === to || from < 0 || to < 0 || from >= cs.length || to >= cs.length) return cs
      const next = [...cs]
      const [c] = next.splice(from, 1)
      next.splice(to, 0, c)
      return next
    })
  }, [])

  /** 読み込んだカードを、ファイル内の順番のまま先頭に入れる（WebApp仕様書 §5.2） */
  const prepend = useCallback((added: Card[]) => setCards((cs) => [...added, ...cs]), [])

  const clear = useCallback(() => setCards([newCard(def, [])]), [def])

  return { cards, update, add, duplicate, remove, move, prepend, clear }
}
