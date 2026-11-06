import { useSyncExternalStore } from 'react'

/** 画面の色の設定。system は端末の設定に合わせる */
export type ThemeSetting = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** 設定の保存先（index.html の読み込み前のスクリプトも同じキーを読む） */
export const THEME_KEY = 'sf-theme'

const lightQuery = () => window.matchMedia('(prefers-color-scheme: light)')
const listeners = new Set<() => void>()

function readSetting(): ThemeSetting {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let setting: ThemeSetting = readSetting()

function resolve(s: ThemeSetting): ResolvedTheme {
  if (s !== 'system') return s
  return lightQuery().matches ? 'light' : 'dark'
}

/** html 要素の data-theme を書き換える（index.css の色の変数が切り替わる） */
function apply() {
  document.documentElement.dataset.theme = resolve(setting)
  for (const l of listeners) l()
}

export function setThemeSetting(s: ThemeSetting) {
  setting = s
  try {
    if (s === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, s)
  } catch {
    // 保存できなくても、この画面の中では切り替える
  }
  apply()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const q = lightQuery()
  q.addEventListener('change', apply)
  return () => {
    listeners.delete(listener)
    q.removeEventListener('change', apply)
  }
}

const snapshot = () => `${setting}:${resolve(setting)}`

/** 今の設定と、実際に使う色（ライト／ダーク） */
export function useTheme(): { setting: ThemeSetting; resolved: ResolvedTheme } {
  const [s, r] = useSyncExternalStore(subscribe, snapshot).split(':') as [ThemeSetting, ResolvedTheme]
  return { setting: s, resolved: r }
}

/** グラフと画像の保存で使う色（Tailwind の slate・sky・amber の値） */
export const THEME_COLORS: Record<
  ResolvedTheme,
  { cardBg: string; grid: string; axis: string; label: string; tooltipBg: string; tooltipBorder: string; line: string; dot: string }
> = {
  dark: {
    cardBg: '#0f172a',
    grid: '#1e293b',
    axis: '#64748b',
    label: '#94a3b8',
    tooltipBg: '#0f172a',
    tooltipBorder: '#334155',
    line: '#38bdf8',
    dot: '#fbbf24',
  },
  light: {
    cardBg: '#f1f5f9',
    grid: '#e2e8f0',
    axis: '#64748b',
    label: '#475569',
    tooltipBg: '#ffffff',
    tooltipBorder: '#cbd5e1',
    line: '#0284c7',
    dot: '#d97706',
  },
}
