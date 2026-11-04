import type { ReactNode } from 'react'
import type { SimIconKind } from '../sims/types.ts'

interface Props {
  kind: SimIconKind
  className?: string
}

/** モジュールのアイコン（線画の SVG。色は currentColor） */
export function SimIcon({ kind, className = 'size-6' }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {ICON_PATHS[kind]}
    </svg>
  )
}

const ICON_PATHS: Record<SimIconKind, ReactNode> = {
  // 太陽と、光を反射する鏡
  mirror: (
    <>
      <circle cx="5.5" cy="5.5" r="2.5" />
      <path d="M8.5 8.5 14 14M14 14l6-3M12 20l8-6" />
    </>
  ),
  // 発振器と、まっすぐ進むビーム
  laser: (
    <>
      <rect x="2.5" y="9" width="7" height="6" rx="1" />
      <path d="M9.5 12h12M17 9l3 3-3 3" />
    </>
  ),
  // 天体と、その手前の日よけ
  shade: (
    <>
      <circle cx="17" cy="12" r="4.5" />
      <path d="M8 5v14M2.5 8l3 0M2.5 12h3M2.5 16h3" />
    </>
  ),
  // 稲妻と、ラジエータのフィン
  power: (
    <>
      <path d="M11 2.5 5.5 13H10l-1 8.5L15 10h-4.5z" />
      <path d="M18 6v12M21 6v12" />
    </>
  ),
  // 炉心と、それを囲む遮蔽
  reactor: (
    <>
      <circle cx="12" cy="12" r="2.5" />
      <circle cx="12" cy="12" r="6" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
    </>
  ),
}
