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
  // お椀形の鏡：上から入る平行な光が、鏡で反射して上の1点（集光部）に集まる
  mirror: (
    <>
      <ellipse cx="12" cy="16.5" rx="9.5" ry="2.6" />
      <path d="M2.5 16.5Q12 24 21.5 16.5M5 2.5v14.7M19 2.5v14.7M8 17.3 10.8 8.4M16 17.3 13.2 8.4" />
      <circle cx="12" cy="6" r="2" />
      <path d="M12 1.5v1M8.6 3.2l.8.7M15.4 3.2l-.8.7" />
    </>
  ),
  // 懐中電灯と、まっすぐ進む細いビーム
  laser: (
    <>
      <rect x="2" y="9.5" width="8" height="5" rx="1" />
      <path d="M10 9.5 13 7.5v9L10 14.5M5 9.5V8.5h2v1M15.5 12h6.5" />
    </>
  ),
  // パラソル（日よけ）
  shade: (
    <>
      <path d="M2.5 10Q12 0.5 21.5 10Z" />
      <path d="M12 5.3 8.5 10M12 5.3 15.5 10M12 10v10.5M8.5 20.5h7" />
    </>
  ),
  // 稲妻と、ラジエータのフィン
  power: (
    <>
      <path d="M11 2.5 5.5 13H10l-1 8.5L15 10h-4.5z" />
      <path d="M18 6v12M21 6v12" />
    </>
  ),
  // 格納容器の建物と、中の原子力のマーク
  reactor: (
    <>
      <path d="M4 21V12a8 8 0 0 1 16 0v9M2 21h20" />
      <path
        fill="currentColor"
        stroke="none"
        d="M11.15 13.13L9.85 10.88A4.3 4.3 0 0 1 14.15 10.88L12.85 13.13A1.7 1.7 0 0 0 11.15 13.13ZM13.7 14.6L16.3 14.6A4.3 4.3 0 0 1 14.15 18.32L12.85 16.07A1.7 1.7 0 0 0 13.7 14.6ZM11.15 16.07L9.85 18.32A4.3 4.3 0 0 1 7.7 14.6L10.3 14.6A1.7 1.7 0 0 0 11.15 16.07Z"
      />
      <circle cx="12" cy="14.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  // 盛り上がった縁のあるクレータと、尾を引いて落ちてくる隕石
  crater: (
    <>
      <path d="M2 18.5h3.5l1.6-2.6q4.9 6.2 9.8 0l1.6 2.6H22" />
      <circle cx="12" cy="8" r="2" />
      <path d="M13.5 6.6 18 2.5M14.2 8.6l5-2.1M11.6 6.1l1.6-3.6" />
    </>
  ),
  // 横から見た円筒のコロニーと、回転の向きの矢印
  colony: (
    <>
      <ellipse cx="6" cy="12" rx="2.5" ry="6" />
      <path d="M6 6h12M6 18h12M18 6a2.5 6 0 0 1 0 12" />
      <path d="M10 9.5h6M10 14.5h6" />
      <path d="M3 3.5a5 2 0 0 1 6 0M8.2 2.6l.8.9-1.1.4" />
    </>
  ),
}
