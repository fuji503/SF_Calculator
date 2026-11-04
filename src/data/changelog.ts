/** 更新履歴（WebApp仕様書 §4.5）。新しい版を先頭に書く */
export interface ChangelogEntry {
  version: string
  /** YYYY-MM-DD */
  date: string
  changes: string[]
}

export const changelog: readonly ChangelogEntry[] = [
  {
    version: '0.1.0',
    date: '2026-11-04',
    changes: [
      'アプリの外枠を作成（ヘッダ、メニュー、トップ、使い方、更新履歴）。',
      '5つのシミュレータ（太陽光集光・送電、レーザ発振・送電、サンシェード・展開軌道、電源・排熱、原子炉・遮蔽）の画面を用意。計算機能は今後のバージョンで追加します。',
    ],
  },
]
